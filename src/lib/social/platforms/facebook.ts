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

export class FacebookPlatformAdapter implements ISocialPlatformAdapter {
  readonly platform = 'facebook' as const;
  readonly name = 'Facebook Platform Adapter';
  private customFetch?: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.customFetch = customFetch;
  }

  isConfigured(): boolean {
    const config = loadSocialConfig();
    return config.credentials.facebook.configured;
  }

  validate(pkg: SocialPlatformPackage): SocialValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pkg.caption || pkg.caption.trim().length === 0) {
      errors.push('Facebook post package missing caption.');
    }
    if (!pkg.mediaAsset) {
      errors.push('Facebook post package missing media asset.');
    } else if (!pkg.mediaAsset.url || !pkg.mediaAsset.url.startsWith('https://')) {
      errors.push('Facebook post package requires a valid public HTTPS image URL.');
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
    const link = options?.destinationUrl || content.destinationUrl || 'https://lifemode.com';
    const tagString = content.hashtags.slice(0, 6).join(' ');

    const bodyParagraph = content.extendedCaption || content.shortCaption;
    const formattedCaption = `${content.title}\n\n${bodyParagraph}\n\n${content.callToAction} 🔗 ${link}\n\n${tagString}`.trim();

    const contentHash = hashString(formattedCaption);
    const idempotencyKey = createIdempotencyKey(content.topicId, this.platform, contentHash);

    const payload = {
      caption: formattedCaption,
      url: asset.url,
      published: true,
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
    const { pageAccessToken, pageId } = config.credentials.facebook;

    if (options.dryRun) {
      return {
        platform: this.platform,
        status: 'DRY_RUN',
        postId: `dryrun-fb-${pkg.topicId}-${Date.now()}`,
        postUrl: `https://facebook.com/lifemode/posts/dryrun-${pkg.topicId}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }

    if (!this.isConfigured() || !pageAccessToken || !pageId) {
      return {
        platform: this.platform,
        status: 'NOT_CONFIGURED',
        error: 'Facebook credentials (FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID) not configured.',
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }

    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);

    try {
      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`;
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: pageAccessToken,
          caption: pkg.caption,
          url: pkg.mediaAsset.url,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Facebook API HTTP ${response.status}: ${errorText}`);
      }

      const data: any = await response.json();
      const postId = data.id || data.post_id;

      return {
        platform: this.platform,
        status: 'PUBLISHED',
        postId,
        postUrl: `https://facebook.com/${postId}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    } catch (err: any) {
      return {
        platform: this.platform,
        status: 'FAILED',
        error: `Facebook publish failed: ${err?.message || String(err)}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }
  }
}
