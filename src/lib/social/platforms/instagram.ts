import type { ISocialPlatformAdapter, PlatformPrepareOptions, PlatformPublishOptions } from './contracts.ts';
import type {
  GeneratedSocialContent,
  SocialVisualAsset,
  SocialPlatformPackage,
  SocialPlatformPublishResult,
} from '../types.ts';
import type { SocialValidationResult } from '../validation.ts';
import { loadSocialConfig } from '../config.ts';
import { createIdempotencyKey, hashString } from '../storage/repository.ts';

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';

export interface InstagramAdapterOptions {
  customFetch?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

export class InstagramPlatformAdapter implements ISocialPlatformAdapter {
  readonly platform = 'instagram' as const;
  readonly name = 'Instagram Platform Adapter';
  private customFetch?: typeof fetch;
  private pollIntervalMs: number;
  private maxPollAttempts: number;
  private sleepFn: (ms: number) => Promise<void>;

  constructor(
    customFetchOrOptions?: typeof fetch | InstagramAdapterOptions,
    options?: InstagramAdapterOptions
  ) {
    if (typeof customFetchOrOptions === 'function') {
      this.customFetch = customFetchOrOptions;
      this.pollIntervalMs = options?.pollIntervalMs ?? 2000;
      this.maxPollAttempts = options?.maxPollAttempts ?? 30;
      this.sleepFn = options?.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    } else if (typeof customFetchOrOptions === 'object' && customFetchOrOptions !== null) {
      this.customFetch = customFetchOrOptions.customFetch;
      this.pollIntervalMs = customFetchOrOptions.pollIntervalMs ?? 2000;
      this.maxPollAttempts = customFetchOrOptions.maxPollAttempts ?? 30;
      this.sleepFn = customFetchOrOptions.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    } else {
      this.customFetch = undefined;
      this.pollIntervalMs = 2000;
      this.maxPollAttempts = 30;
      this.sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  isConfigured(): boolean {
    const config = loadSocialConfig();
    return config.credentials.instagram.configured;
  }

  validate(pkg: SocialPlatformPackage): SocialValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pkg.caption || pkg.caption.trim().length === 0) {
      errors.push('Instagram post package missing caption.');
    }
    if (pkg.caption && pkg.caption.length > 2200) {
      errors.push(`Instagram caption exceeds 2200 character limit (${pkg.caption.length} chars).`);
    }
    if (!pkg.mediaAsset) {
      errors.push('Instagram post package missing visual media asset.');
    } else {
      if (pkg.mediaAsset.format !== '1080x1350' && pkg.mediaAsset.format !== '1080x1080') {
        errors.push(`Unsupported Instagram aspect ratio format: ${pkg.mediaAsset.format}`);
      }
      if (!pkg.mediaAsset.url || !pkg.mediaAsset.url.startsWith('https://')) {
        errors.push('Instagram post package requires a valid public HTTPS image URL.');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async prepare(
    content: GeneratedSocialContent,
    asset: SocialVisualAsset,
    options?: PlatformPrepareOptions
  ): Promise<SocialPlatformPackage> {
    const link = options?.destinationUrl || content.destinationUrl || 'https://lifemode.life';
    const tagString = content.hashtags.slice(0, 10).join(' ');

    const bodyParagraph = content.extendedCaption || content.shortCaption;
    const formattedCaption = `${content.title}\n\n${bodyParagraph}\n\n🔗 Read the full story via the link in our bio\n.\n.\n${tagString}`.trim();

    const contentHash = hashString(formattedCaption);
    const idempotencyKey = createIdempotencyKey(content.topicId, this.platform, contentHash);

    const payload = {
      caption: formattedCaption,
      image_url: asset.url,
    };

    return {
      platform: this.platform,
      topicId: content.topicId,
      contentHash,
      caption: formattedCaption,
      title: content.title,
      hashtags: content.hashtags,
      destinationUrl: link,
      mediaAsset: asset,
      preparedPayload: payload,
      idempotencyKey,
    };
  }

  private redactToken(text: string, token?: string): string {
    if (!token || !text) return text;
    return text.replaceAll(token, '[REDACTED]');
  }

  private async waitForContainerReady(
    creationId: string,
    accessToken: string,
    fetchImpl: typeof fetch
  ): Promise<void> {
    const statusEndpoint = `${GRAPH_API_BASE}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;

    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
      let statusRes: Response;
      try {
        statusRes = await fetchImpl(statusEndpoint);
      } catch (err: any) {
        throw new Error(
          this.redactToken(
            `Failed to query Instagram container status for ${creationId}: ${err?.message || String(err)}`,
            accessToken
          )
        );
      }

      if (!statusRes.ok) {
        const rawError = await statusRes.text();
        const safeError = this.redactToken(rawError, accessToken);
        throw new Error(`Instagram container status check failed HTTP ${statusRes.status}: ${safeError}`);
      }

      const statusData: any = await statusRes.json();
      const statusCode = statusData?.status_code;

      if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') {
        return;
      }

      if (statusCode === 'IN_PROGRESS') {
        if (attempt < this.maxPollAttempts) {
          await this.sleepFn(this.pollIntervalMs);
          continue;
        } else {
          throw new Error(
            `Instagram container ${creationId} processing timed out after ${this.maxPollAttempts} attempts (${(this.maxPollAttempts * this.pollIntervalMs) / 1000}s) with status IN_PROGRESS.`
          );
        }
      }

      if (statusCode === 'ERROR') {
        const errorDetails = statusData?.status || 'Unknown error processing media container';
        const safeDetails = this.redactToken(errorDetails, accessToken);
        throw new Error(`Instagram container ${creationId} failed processing with status ERROR: ${safeDetails}`);
      }

      if (statusCode === 'EXPIRED') {
        throw new Error(`Instagram container ${creationId} has EXPIRED.`);
      }

      throw new Error(`Instagram container ${creationId} returned unexpected status_code: ${statusCode || 'undefined'}`);
    }
  }

  async publish(
    pkg: SocialPlatformPackage,
    options: PlatformPublishOptions = {}
  ): Promise<SocialPlatformPublishResult> {
    const now = new Date().toISOString();
    const config = loadSocialConfig();
    const { accessToken, businessAccountId } = config.credentials.instagram;

    if (options.dryRun) {
      return {
        platform: this.platform,
        status: 'DRY_RUN',
        postId: `dryrun-ig-${pkg.topicId}-${Date.now()}`,
        postUrl: `https://instagram.com/p/dryrun-${pkg.topicId}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }

    if (!this.isConfigured() || !accessToken || !businessAccountId) {
      return {
        platform: this.platform,
        status: 'NOT_CONFIGURED',
        error: 'Instagram credentials (INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID) not configured.',
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }

    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);

    try {
      // Step 1: Create media container
      const containerEndpoint = `${GRAPH_API_BASE}/${businessAccountId}/media`;
      const containerRes = await fetchImpl(containerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          image_url: pkg.mediaAsset.url,
          caption: pkg.caption,
        }),
      });

      if (!containerRes.ok) {
        const errorText = await containerRes.text();
        const safeError = this.redactToken(errorText, accessToken);
        throw new Error(`Instagram container creation failed HTTP ${containerRes.status}: ${safeError}`);
      }

      const containerData: any = await containerRes.json();
      const creationId = containerData.id;

      if (!creationId) {
        throw new Error('No creation ID returned from Instagram media container endpoint.');
      }

      // Step 2: Poll container status until ready (FINISHED)
      await this.waitForContainerReady(creationId, accessToken, fetchImpl);

      // Step 3: Publish media container
      const publishEndpoint = `${GRAPH_API_BASE}/${businessAccountId}/media_publish`;
      const publishRes = await fetchImpl(publishEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          creation_id: creationId,
        }),
      });

      if (!publishRes.ok) {
        const errorText = await publishRes.text();
        const safeError = this.redactToken(errorText, accessToken);
        throw new Error(`Instagram container publish failed HTTP ${publishRes.status}: ${safeError}`);
      }

      const publishData: any = await publishRes.json();
      const postId = publishData.id;

      return {
        platform: this.platform,
        status: 'PUBLISHED',
        postId,
        postUrl: `https://instagram.com/p/${postId}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    } catch (err: any) {
      const rawMsg = err?.message || String(err);
      const safeMsg = this.redactToken(rawMsg, accessToken);
      return {
        platform: this.platform,
        status: 'FAILED',
        error: `Instagram publish failed: ${safeMsg}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }
  }
}
