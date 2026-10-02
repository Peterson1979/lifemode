import type { ISocialPlatformAdapter, PlatformPrepareOptions, PlatformPublishOptions } from './contracts.ts';
import type {
  GeneratedSocialContent,
  SocialVisualAsset,
  SocialPlatformPackage,
  SocialPlatformPublishResult,
  SocialMediaType,
} from '../types.ts';
import type { SocialValidationResult } from '../validation.ts';
import { loadSocialConfig, type SocialAutomationConfig } from '../config.ts';
import { createIdempotencyKey, hashString } from '../storage/repository.ts';

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';
const DEFAULT_THREADS_USER_ID = '28272717349017680';
const THREADS_MAX_TEXT_LENGTH = 500;

export interface ThreadsProfileResult {
  valid: boolean;
  userId?: string;
  username?: string;
  name?: string;
  profilePictureUrl?: string;
  biography?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Validates the Threads access token and retrieves profile metadata for the account
 * via GET https://graph.threads.net/v1.0/me without creating any posts or containers.
 */
export async function getThreadsUserProfile(
  accessToken: string,
  targetUserId?: string,
  customFetch?: typeof fetch
): Promise<ThreadsProfileResult> {
  const fetchImpl = customFetch || globalThis.fetch.bind(globalThis);
  const token = (accessToken || '').trim();

  if (!token) {
    return {
      valid: false,
      error: 'Missing Threads Access Token.',
    };
  }

  const endpoint = `${THREADS_API_BASE}/me?fields=id,username,name,threads_profile_picture_url,threads_biography&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetchImpl(endpoint);
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }

    if (!res.ok || data.error) {
      const rawErrMsg = data.error?.message || text || `HTTP ${res.status}`;
      const safeErrMsg = rawErrMsg.replaceAll(token, '[REDACTED]');
      return {
        valid: false,
        statusCode: res.status,
        error: `Threads API authentication failed: ${safeErrMsg}`,
      };
    }

    return {
      valid: true,
      userId: data.id,
      username: data.username,
      name: data.name,
      profilePictureUrl: data.threads_profile_picture_url,
      biography: data.threads_biography,
      statusCode: res.status,
    };
  } catch (err: any) {
    const rawMsg = err?.message || String(err);
    const safeMsg = rawMsg.replaceAll(token, '[REDACTED]');
    return {
      valid: false,
      error: `Network error verifying Threads credentials: ${safeMsg}`,
    };
  }
}

export interface ThreadsAdapterOptions {
  customFetch?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleepFn?: (ms: number) => Promise<void>;
  config?: Partial<SocialAutomationConfig>;
}

export class ThreadsPlatformAdapter implements ISocialPlatformAdapter {
  readonly platform = 'threads' as const;
  readonly name = 'Threads Platform Adapter';
  private customFetch?: typeof fetch;
  private pollIntervalMs: number;
  private maxPollAttempts: number;
  private sleepFn: (ms: number) => Promise<void>;
  private adapterConfig?: Partial<SocialAutomationConfig>;

  constructor(
    customFetchOrOptions?: typeof fetch | ThreadsAdapterOptions,
    options?: ThreadsAdapterOptions
  ) {
    if (typeof customFetchOrOptions === 'function') {
      this.customFetch = customFetchOrOptions;
      this.pollIntervalMs = options?.pollIntervalMs ?? 2000;
      this.maxPollAttempts = options?.maxPollAttempts ?? 30;
      this.sleepFn = options?.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
      this.adapterConfig = options?.config;
    } else if (typeof customFetchOrOptions === 'object' && customFetchOrOptions !== null) {
      this.customFetch = customFetchOrOptions.customFetch;
      this.pollIntervalMs = customFetchOrOptions.pollIntervalMs ?? 2000;
      this.maxPollAttempts = customFetchOrOptions.maxPollAttempts ?? 30;
      this.sleepFn = customFetchOrOptions.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
      this.adapterConfig = customFetchOrOptions.config;
    } else {
      this.customFetch = undefined;
      this.pollIntervalMs = 2000;
      this.maxPollAttempts = 30;
      this.sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      this.adapterConfig = undefined;
    }
  }

  isConfigured(configOverride?: Partial<SocialAutomationConfig>): boolean {
    const config = loadSocialConfig(configOverride || this.adapterConfig);
    return config.credentials.threads.configured;
  }

  async verifyCredentials(configOverride?: Partial<SocialAutomationConfig>): Promise<ThreadsProfileResult> {
    const config = loadSocialConfig(configOverride || this.adapterConfig);
    const { accessToken } = config.credentials.threads;
    const userId = config.credentials.threads.userId || DEFAULT_THREADS_USER_ID;
    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);

    if (!accessToken) {
      return {
        valid: false,
        error: 'Threads credentials (THREADS_ACCESS_TOKEN) not configured.',
      };
    }

    return getThreadsUserProfile(accessToken, userId, fetchImpl);
  }

  validate(pkg: SocialPlatformPackage): SocialValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pkg.caption || pkg.caption.trim().length === 0) {
      errors.push('Threads post package missing text/caption.');
    }
    if (pkg.caption && pkg.caption.length > THREADS_MAX_TEXT_LENGTH) {
      errors.push(`Threads text exceeds ${THREADS_MAX_TEXT_LENGTH} character limit (${pkg.caption.length} chars).`);
    }

    const mediaType = pkg.mediaType || (pkg.carouselItems && pkg.carouselItems.length > 0 ? 'carousel' : pkg.videoUrl ? 'video' : pkg.mediaAsset ? 'image' : 'text');

    if (mediaType === 'carousel') {
      const items = pkg.carouselItems || pkg.carouselAssets || [];
      if (items.length < 2) {
        errors.push(`Threads carousel requires at least 2 items, received ${items.length}.`);
      } else if (items.length > 10) {
        errors.push(`Threads carousel exceeds maximum 10 items limit, received ${items.length}.`);
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const url = (item as any).url || (item as any).videoUrl;
        if (!url || !url.startsWith('https://')) {
          errors.push(`Threads carousel item #${i + 1} requires a valid public HTTPS URL.`);
        }
      }
    } else if (mediaType === 'video') {
      const videoUrl = pkg.videoUrl || pkg.mediaAsset?.videoUrl || pkg.mediaAsset?.url;
      if (!videoUrl || !videoUrl.startsWith('https://')) {
        errors.push('Threads video post requires a valid public HTTPS video URL.');
      }
    } else if (mediaType === 'image') {
      if (!pkg.mediaAsset) {
        errors.push('Threads image post package missing visual media asset.');
      } else if (!pkg.mediaAsset.url || !pkg.mediaAsset.url.startsWith('https://')) {
        errors.push('Threads post package requires a valid public HTTPS image URL.');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Formats text for Threads, strictly respecting the 500 character limit.
   */
  private formatThreadsCaption(
    content: GeneratedSocialContent,
    destinationUrl: string
  ): string {
    const title = content.title.trim();
    const tagString = content.hashtags.slice(0, 4).join(' ');
    const link = destinationUrl || content.destinationUrl || 'https://lifemode.life';
    const cta = `🔗 ${link}`;

    const rawBody = (content.shortCaption || content.concept || '').trim();

    // Check budget
    const fixedLength = title.length + cta.length + tagString.length + 8; // newlines & spacing
    const availableForBody = THREADS_MAX_TEXT_LENGTH - fixedLength;

    let body = rawBody;
    if (availableForBody > 20 && body.length > availableForBody) {
      body = `${body.slice(0, availableForBody - 3)}...`;
    } else if (availableForBody <= 20) {
      body = '';
    }

    const parts = [title];
    if (body) parts.push(body);
    parts.push(cta);
    if (tagString) parts.push(tagString);

    let formatted = parts.join('\n\n').trim();
    if (formatted.length > THREADS_MAX_TEXT_LENGTH) {
      formatted = formatted.slice(0, THREADS_MAX_TEXT_LENGTH - 3) + '...';
    }

    return formatted;
  }

  async prepare(
    content: GeneratedSocialContent,
    asset?: SocialVisualAsset,
    options?: PlatformPrepareOptions & {
      carouselItems?: Array<{ url: string; mediaType?: 'image' | 'video'; altText?: string }>;
      carouselAssets?: SocialVisualAsset[];
      videoUrl?: string;
      mediaType?: SocialMediaType;
      sourceProject?: string;
    }
  ): Promise<SocialPlatformPackage> {
    const link = options?.destinationUrl || content.destinationUrl || 'https://lifemode.life';
    const formattedCaption = this.formatThreadsCaption(content, link);

    const contentHash = hashString(formattedCaption);
    const sourceProject = options?.sourceProject || content.sourceProject;
    const idempotencyKey = createIdempotencyKey(
      content.topicId,
      this.platform,
      contentHash,
      sourceProject
    );

    let mediaType: SocialMediaType = options?.mediaType || 'image';
    if (options?.carouselItems && options.carouselItems.length > 0) {
      mediaType = 'carousel';
    } else if (options?.carouselAssets && options.carouselAssets.length > 0) {
      mediaType = 'carousel';
    } else if (options?.videoUrl || asset?.mediaType === 'video' || asset?.videoUrl) {
      mediaType = 'video';
    } else if (!asset?.url) {
      mediaType = 'text';
    }

    const payload: Record<string, any> = {
      text: formattedCaption,
      media_type: mediaType.toUpperCase(),
    };

    if (mediaType === 'image' && asset?.url) {
      payload.image_url = asset.url;
    } else if (mediaType === 'video') {
      payload.video_url = options?.videoUrl || asset?.videoUrl || asset?.url;
    } else if (mediaType === 'carousel') {
      payload.items = options?.carouselItems || options?.carouselAssets || [];
    }

    return {
      platform: this.platform,
      topicId: content.topicId,
      contentHash,
      caption: formattedCaption,
      title: content.title,
      hashtags: content.hashtags,
      destinationUrl: link,
      mediaAsset: asset,
      carouselAssets: options?.carouselAssets,
      carouselItems: options?.carouselItems,
      videoUrl: options?.videoUrl || asset?.videoUrl,
      mediaType,
      sourceProject,
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
    const statusEndpoint = `${THREADS_API_BASE}/${creationId}?fields=status,error_message&access_token=${encodeURIComponent(accessToken)}`;

    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
      let statusRes: Response;
      try {
        statusRes = await fetchImpl(statusEndpoint);
      } catch (err: any) {
        throw new Error(
          this.redactToken(
            `Failed to query Threads container status for ${creationId}: ${err?.message || String(err)}`,
            accessToken
          )
        );
      }

      if (!statusRes.ok) {
        const rawError = await statusRes.text();
        const safeError = this.redactToken(rawError, accessToken);
        throw new Error(`Threads container status check failed HTTP ${statusRes.status}: ${safeError}`);
      }

      const statusData: any = await statusRes.json();
      const status = (statusData?.status || statusData?.status_code || '').toUpperCase();

      if (status === 'FINISHED' || status === 'PUBLISHED') {
        return;
      }

      if (status === 'IN_PROGRESS' || !status) {
        if (attempt < this.maxPollAttempts) {
          await this.sleepFn(this.pollIntervalMs);
          continue;
        } else {
          throw new Error(
            `Threads container ${creationId} processing timed out after ${this.maxPollAttempts} attempts (${(this.maxPollAttempts * this.pollIntervalMs) / 1000}s) with status IN_PROGRESS.`
          );
        }
      }

      if (status === 'ERROR') {
        const errorDetails = statusData?.error_message || statusData?.error || 'Unknown error processing media container';
        const safeDetails = this.redactToken(typeof errorDetails === 'object' ? JSON.stringify(errorDetails) : String(errorDetails), accessToken);
        throw new Error(`Threads container ${creationId} failed processing with status ERROR: ${safeDetails}`);
      }

      if (status === 'EXPIRED') {
        throw new Error(`Threads container ${creationId} has EXPIRED.`);
      }

      throw new Error(`Threads container ${creationId} returned unexpected status: ${status}`);
    }
  }

  async publish(
    pkg: SocialPlatformPackage,
    options: PlatformPublishOptions & { config?: Partial<SocialAutomationConfig> } = {}
  ): Promise<SocialPlatformPublishResult> {
    const now = new Date().toISOString();
    const config = loadSocialConfig(options.config || this.adapterConfig);
    const { accessToken } = config.credentials.threads;
    const userId = config.credentials.threads.userId || DEFAULT_THREADS_USER_ID;

    if (options.dryRun) {
      return {
        platform: this.platform,
        status: 'DRY_RUN',
        postId: `dryrun-threads-${pkg.topicId}-${Date.now()}`,
        postUrl: `https://www.threads.net/@lifemodehq/post/dryrun-${pkg.topicId}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }

    if (!this.isConfigured(options.config) || !accessToken || !userId) {
      return {
        platform: this.platform,
        status: 'NOT_CONFIGURED',
        error: 'Threads credentials (THREADS_ACCESS_TOKEN and THREADS_USER_ID) not configured.',
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }

    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);
    const mediaType = pkg.mediaType || (pkg.carouselItems && pkg.carouselItems.length > 0 ? 'carousel' : pkg.videoUrl ? 'video' : pkg.mediaAsset?.url ? 'image' : 'text');

    try {
      let creationId: string;

      if (mediaType === 'carousel') {
        // Step 1: Create individual item containers
        const rawItems = pkg.carouselItems || pkg.carouselAssets || [];
        const childContainerIds: string[] = [];

        for (const item of rawItems) {
          const itemUrl = (item as any).url || (item as any).videoUrl;
          const itemMediaType = (item as any).mediaType === 'video' || (item as any).videoUrl ? 'VIDEO' : 'IMAGE';

          const itemEndpoint = `${THREADS_API_BASE}/${userId}/threads`;
          const itemPayload: Record<string, any> = {
            access_token: accessToken,
            is_carousel_item: 'true',
            media_type: itemMediaType,
          };
          if (itemMediaType === 'VIDEO') {
            itemPayload.video_url = itemUrl;
          } else {
            itemPayload.image_url = itemUrl;
          }

          const itemRes = await fetchImpl(itemEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemPayload),
          });

          if (!itemRes.ok) {
            const errorText = await itemRes.text();
            const safeError = this.redactToken(errorText, accessToken);
            throw new Error(`Threads carousel item container creation failed HTTP ${itemRes.status}: ${safeError}`);
          }

          const itemData: any = await itemRes.json();
          const childId = itemData.id;
          if (!childId) {
            throw new Error('No creation ID returned from Threads carousel item container endpoint.');
          }

          // If item is video, wait for item container to be ready
          if (itemMediaType === 'VIDEO') {
            await this.waitForContainerReady(childId, accessToken, fetchImpl);
          }

          childContainerIds.push(childId);
        }

        // Step 2: Create parent carousel container
        const parentEndpoint = `${THREADS_API_BASE}/${userId}/threads`;
        const parentRes = await fetchImpl(parentEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            media_type: 'CAROUSEL',
            children: childContainerIds.join(','),
            text: pkg.caption,
          }),
        });

        if (!parentRes.ok) {
          const errorText = await parentRes.text();
          const safeError = this.redactToken(errorText, accessToken);
          throw new Error(`Threads carousel parent container creation failed HTTP ${parentRes.status}: ${safeError}`);
        }

        const parentData: any = await parentRes.json();
        creationId = parentData.id;
      } else if (mediaType === 'video') {
        const videoUrl = pkg.videoUrl || pkg.mediaAsset?.videoUrl || pkg.mediaAsset?.url;
        const containerEndpoint = `${THREADS_API_BASE}/${userId}/threads`;
        const containerRes = await fetchImpl(containerEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            media_type: 'VIDEO',
            video_url: videoUrl,
            text: pkg.caption,
          }),
        });

        if (!containerRes.ok) {
          const errorText = await containerRes.text();
          const safeError = this.redactToken(errorText, accessToken);
          throw new Error(`Threads video container creation failed HTTP ${containerRes.status}: ${safeError}`);
        }

        const containerData: any = await containerRes.json();
        creationId = containerData.id;
      } else if (mediaType === 'image') {
        const containerEndpoint = `${THREADS_API_BASE}/${userId}/threads`;
        const containerRes = await fetchImpl(containerEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            media_type: 'IMAGE',
            image_url: pkg.mediaAsset?.url,
            text: pkg.caption,
          }),
        });

        if (!containerRes.ok) {
          const errorText = await containerRes.text();
          const safeError = this.redactToken(errorText, accessToken);
          throw new Error(`Threads image container creation failed HTTP ${containerRes.status}: ${safeError}`);
        }

        const containerData: any = await containerRes.json();
        creationId = containerData.id;
      } else {
        // Text only
        const containerEndpoint = `${THREADS_API_BASE}/${userId}/threads`;
        const containerRes = await fetchImpl(containerEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            media_type: 'TEXT',
            text: pkg.caption,
          }),
        });

        if (!containerRes.ok) {
          const errorText = await containerRes.text();
          const safeError = this.redactToken(errorText, accessToken);
          throw new Error(`Threads text container creation failed HTTP ${containerRes.status}: ${safeError}`);
        }

        const containerData: any = await containerRes.json();
        creationId = containerData.id;
      }

      if (!creationId) {
        throw new Error('No creation ID returned from Threads media container endpoint.');
      }

      // Step 2: Poll container status until ready (FINISHED)
      await this.waitForContainerReady(creationId, accessToken, fetchImpl);

      // Step 3: Publish media container
      const publishEndpoint = `${THREADS_API_BASE}/${userId}/threads_publish`;
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
        throw new Error(`Threads container publish failed HTTP ${publishRes.status}: ${safeError}`);
      }

      const publishData: any = await publishRes.json();
      const postId = publishData.id;

      return {
        platform: this.platform,
        status: 'PUBLISHED',
        postId,
        postUrl: `https://www.threads.net/@lifemodehq/post/${postId}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    } catch (err: any) {
      const rawMsg = err?.message || String(err);
      const safeMsg = this.redactToken(rawMsg, accessToken);
      return {
        platform: this.platform,
        status: 'FAILED',
        error: `Threads publish failed: ${safeMsg}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }
  }
}
