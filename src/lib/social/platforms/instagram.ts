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

export class InstagramPlatformAdapter implements ISocialPlatformAdapter {
  readonly platform = 'instagram' as const;
  readonly name = 'Instagram Platform Adapter';
  private customFetch?: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.customFetch = customFetch;
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
    const formattedCaption = `${content.title}\n\n${bodyParagraph}\n\n🔗 ${content.callToAction} Link in bio / visit lifemode.life\n.\n.\n${tagString}`.trim();

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
      const containerEndpoint = `https://graph.facebook.com/v20.0/${businessAccountId}/media`;
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
        throw new Error(`Instagram container creation failed HTTP ${containerRes.status}: ${errorText}`);
      }

      const containerData: any = await containerRes.json();
      const creationId = containerData.id;

      if (!creationId) {
        throw new Error('No creation ID returned from Instagram media container endpoint.');
      }

      // Step 2: Publish media container
      const publishEndpoint = `https://graph.facebook.com/v20.0/${businessAccountId}/media_publish`;
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
        throw new Error(`Instagram container publish failed HTTP ${publishRes.status}: ${errorText}`);
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
      return {
        platform: this.platform,
        status: 'FAILED',
        error: `Instagram publish failed: ${err?.message || String(err)}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }
  }
}
