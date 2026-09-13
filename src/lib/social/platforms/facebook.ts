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

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export interface FacebookPageResolutionResult {
  valid: boolean;
  pageId?: string;
  pageName?: string;
  isPageToken: boolean;
  pageAccessToken?: string;
  error?: string;
}

/**
 * Resolves a valid Facebook Page Access Token from the supplied token and page ID.
 *
 * If the provided token is already a Page Access Token for target page, it is used directly.
 * If it is a System User or User Access Token, this exchanges it via Graph API (/{pageId}?fields=access_token
 * or /me/accounts) to obtain the dedicated Page Access Token required for publishing.
 */
export async function resolveFacebookPageAccessToken(
  pageId: string,
  rawToken: string,
  customFetch?: typeof fetch
): Promise<FacebookPageResolutionResult> {
  const fetchImpl = customFetch || globalThis.fetch.bind(globalThis);
  const token = (rawToken || '').trim();
  const resolvedPageId = (pageId || '').trim();

  if (!token || !resolvedPageId) {
    return {
      valid: false,
      isPageToken: false,
      error: 'Missing Facebook Access Token or Page ID.',
    };
  }

  try {
    // 1. Inspect the identity of the current token: /me?fields=id,name
    const meUrl = `${GRAPH_API_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const meRes = await fetchImpl(meUrl);
    const meData = (await meRes.json()) as { id?: string; name?: string; error?: { message: string; code: number } };

    // Case A: The token is already a Page Access Token matching resolvedPageId
    if (meRes.ok && meData.id === resolvedPageId) {
      return {
        valid: true,
        pageId: resolvedPageId,
        pageName: meData.name,
        isPageToken: true,
        pageAccessToken: token,
      };
    }

    // Case B: Query the page node directly with fields=id,name,access_token
    const pageUrl = `${GRAPH_API_BASE}/${resolvedPageId}?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`;
    const pageRes = await fetchImpl(pageUrl);
    const pageData = (await pageRes.json()) as {
      id?: string;
      name?: string;
      access_token?: string;
      error?: { message: string; code: number };
    };

    if (pageRes.ok && pageData.access_token) {
      return {
        valid: true,
        pageId: resolvedPageId,
        pageName: pageData.name,
        isPageToken: true,
        pageAccessToken: pageData.access_token,
      };
    }

    // Case C: Query /me/accounts for user's managed pages
    const accountsUrl = `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`;
    const accountsRes = await fetchImpl(accountsUrl);
    const accountsData = (await accountsRes.json()) as {
      data?: Array<{ id: string; name: string; access_token: string }>;
      error?: { message: string; code: number };
    };

    if (accountsRes.ok && Array.isArray(accountsData.data)) {
      const match = accountsData.data.find((acc) => acc.id === resolvedPageId);
      if (match && match.access_token) {
        return {
          valid: true,
          pageId: resolvedPageId,
          pageName: match.name,
          isPageToken: true,
          pageAccessToken: match.access_token,
        };
      }
    }

    // If page endpoint returned error or no access_token:
    const errCode = pageData?.error?.code || meData?.error?.code;
    let hint = '';
    if (errCode === 200 || !pageData?.access_token) {
      hint = ` Token is a User/System Token (identity: '${meData?.name || meData?.id || 'unknown'}') without direct Page Access Token for Page ID '${resolvedPageId}'. Ensure the token has 'pages_manage_posts' and 'pages_read_engagement' permissions, or configure Page Access Token directly.`;
    }

    return {
      valid: false,
      isPageToken: false,
      pageId: resolvedPageId,
      pageName: pageData?.name || meData?.name,
      error: `Facebook Page token resolution failed for Page '${resolvedPageId}': ${pageData?.error?.message || meData?.error?.message || 'Page Access Token not returned'}.${hint}`,
    };
  } catch (err: unknown) {
    return {
      valid: false,
      isPageToken: false,
      error: `Network error resolving Facebook Page credentials: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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
    const link = options?.destinationUrl || content.destinationUrl || 'https://lifemode.life';
    const tagString = content.hashtags.slice(0, 6).join(' ');

    const bodyParagraph = content.extendedCaption || content.shortCaption;
    const ctaText = content.callToAction || 'Read the complete guide on LifeMode';
    const formattedCaption = `${content.title}\n\n${bodyParagraph}\n\n${ctaText}: 🔗 ${link}\n\n${tagString}`.trim();

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
      // Resolve Page Access Token from supplied raw token
      const resolved = await resolveFacebookPageAccessToken(pageId, pageAccessToken, fetchImpl);
      if (!resolved.valid || !resolved.pageAccessToken) {
        return {
          platform: this.platform,
          status: 'FAILED',
          error: resolved.error || `Failed to resolve Facebook Page Access Token for Page '${pageId}'.`,
          publishedAt: now,
          idempotencyKey: pkg.idempotencyKey,
        };
      }

      const activeToken = resolved.pageAccessToken;
      const endpoint = `${GRAPH_API_BASE}/${pageId}/photos`;
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: activeToken,
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
