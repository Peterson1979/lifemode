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

export class PinterestPlatformAdapter implements ISocialPlatformAdapter {
  readonly platform = 'pinterest' as const;
  readonly name = 'Pinterest Platform Adapter';
  private customFetch?: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.customFetch = customFetch;
  }

  isConfigured(): boolean {
    const config = loadSocialConfig();
    return config.credentials.pinterest.configured;
  }

  validate(pkg: SocialPlatformPackage): SocialValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pkg.title || pkg.title.trim().length === 0) {
      errors.push('Pinterest pin package missing title.');
    }
    if (pkg.title && pkg.title.length > 100) {
      errors.push(`Pinterest pin title exceeds 100 character limit (${pkg.title.length} chars).`);
    }
    if (!pkg.caption || pkg.caption.trim().length === 0) {
      errors.push('Pinterest pin package missing description/caption.');
    }
    if (pkg.caption && pkg.caption.length > 800) {
      errors.push(`Pinterest pin description exceeds 800 character limit (${pkg.caption.length} chars).`);
    }
    if (!pkg.destinationUrl || !pkg.destinationUrl.startsWith('http')) {
      errors.push('Pinterest pin package missing valid destination URL.');
    }
    if (!pkg.mediaAsset) {
      errors.push('Pinterest pin package missing visual media asset.');
    } else if (!pkg.mediaAsset.url || !pkg.mediaAsset.url.startsWith('https://')) {
      errors.push('Pinterest pin package requires a valid public HTTPS image URL.');
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
    const tagString = content.hashtags.slice(0, 5).join(' ');

    // Truncate title to <= 100 characters for Pinterest API
    const pinTitle = content.title.length > 95 ? `${content.title.slice(0, 92)}...` : content.title;
    const pinDescription = `${content.shortCaption}\n\nExplore the complete guide on LifeMode.\n\n${tagString}`.slice(0, 500).trim();

    const contentHash = hashString(`${pinTitle}-${pinDescription}`);
    const idempotencyKey = createIdempotencyKey(content.topicId, this.platform, contentHash);

    const config = loadSocialConfig();
    const boardId = options?.boardId || config.credentials.pinterest.boardId;

    const payload = {
      title: pinTitle,
      description: pinDescription,
      link,
      board_id: boardId,
      media_source: {
        source_type: 'image_url',
        url: asset.url,
      },
    };

    return {
      platform: this.platform,
      topicId: content.topicId,
      contentHash,
      caption: pinDescription,
      title: pinTitle,
      hashtags: content.hashtags,
      destinationUrl: link,
      boardId,
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
    const { accessToken, boardId } = config.credentials.pinterest;

    if (options.dryRun) {
      return {
        platform: this.platform,
        status: 'DRY_RUN',
        postId: `dryrun-pin-${pkg.topicId}-${Date.now()}`,
        postUrl: `https://pinterest.com/pin/dryrun-${pkg.topicId}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }

    if (!this.isConfigured() || !accessToken || !boardId) {
      return {
        platform: this.platform,
        status: 'NOT_CONFIGURED',
        error: 'Pinterest credentials (PINTEREST_ACCESS_TOKEN and PINTEREST_BOARD_ID) not configured.',
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }

    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);

    try {
      const endpoint = 'https://api.pinterest.com/v5/pins';
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pkg.preparedPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinterest API HTTP ${response.status}: ${errorText}`);
      }

      const data: any = await response.json();
      const pinId = data.id;

      return {
        platform: this.platform,
        status: 'PUBLISHED',
        postId: pinId,
        postUrl: `https://pinterest.com/pin/${pinId}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    } catch (err: any) {
      return {
        platform: this.platform,
        status: 'FAILED',
        error: `Pinterest publish failed: ${err?.message || String(err)}`,
        publishedAt: now,
        idempotencyKey: pkg.idempotencyKey,
      };
    }
  }
}
