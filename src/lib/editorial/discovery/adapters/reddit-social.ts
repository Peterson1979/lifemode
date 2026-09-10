import type { IDiscoveryAdapter, DiscoveryAdapterOptions, RedditSocialPayload } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal } from '../types.ts';
import { loadDiscoveryConfig, type ConfiguredRedditCommunity } from '../config.ts';

export interface RedditSocialAdapterOptions extends DiscoveryAdapterOptions {
  fetchFn?: typeof fetch;
  communities?: ConfiguredRedditCommunity[];
}

/**
 * Reddit & Social Signal Live Discovery Adapter.
 *
 * Performs real outbound HTTP requests to public Reddit JSON endpoints
 * to discover high-velocity community discussions across LifeMode editorial pillars.
 */
export class RedditSocialDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'REDDIT_SOCIAL' as const;
  readonly name = 'Reddit Public Discussion Signals';

  private fetchFn: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.fetchFn = customFetch || globalThis.fetch.bind(globalThis);
  }

  async fetchSignals(options?: RedditSocialAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig();
    const providerConfig = config.providers.redditSocial;

    if (!providerConfig.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Reddit Social provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    const fetchImpl = options?.fetchFn || this.fetchFn;
    const communitiesToFetch = options?.communities || config.redditCommunities;
    const timeoutMs = config.requestTimeoutMs || 8000;
    const limit = options?.limit ?? providerConfig.maxSignals ?? 50;
    const now = new Date();

    const signals: DiscoverySignal[] = [];
    const errors: string[] = [];
    let successfulCommunities = 0;

    let targetCommunities = communitiesToFetch;
    if (options?.categoryFilter && options.categoryFilter.length > 0) {
      targetCommunities = targetCommunities.filter((c) => options.categoryFilter?.includes(c.pillar));
    }

    // Execute subreddit requests in parallel with individual error isolation
    const fetchPromises = targetCommunities.map(async (community) => {
      try {
        let signal: AbortSignal | undefined;
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          signal = AbortSignal.timeout(timeoutMs);
        }

        const sort = community.sort || 'top';
        const timeframe = community.timeframe || 'day';
        const url = `https://www.reddit.com/r/${community.subreddit}/${sort}.json?t=${timeframe}&limit=10`;

        const response = await fetchImpl(url, {
          headers: {
            'User-Agent': 'LifeMode-Editorial-Bot/1.0 (contact: editorial@lifemode.com; unauthenticated discovery)',
            Accept: 'application/json',
          },
          signal,
        });

        if (response.status === 429) {
          throw new Error('HTTP 429 Rate Limit encountered');
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const json: any = await response.json();
        const children = json?.data?.children;

        if (!Array.isArray(children) || children.length === 0) {
          return;
        }

        successfulCommunities++;
        const minScore = community.minScore ?? 15;

        for (const child of children) {
          const post = child?.data;
          if (!post || typeof post.title !== 'string') continue;

          // Filter out stickied, NSFW, deleted, or low engagement posts
          if (post.stickied || post.over_18 || post.ups < minScore) continue;
          if (post.title.trim().length < 10) continue;

          const createdDate = post.created_utc
            ? new Date(post.created_utc * 1000).toISOString()
            : now.toISOString();

          const payload: RedditSocialPayload = {
            subredditOrPlatform: `r/${post.subreddit || community.subreddit}`,
            threadTitle: post.title.trim(),
            upvotesOrEngagement: post.ups || 0,
            commentCount: post.num_comments || 0,
            sentiment: (post.ups > 200 || post.num_comments > 100) ? 'curious' : 'neutral',
          };

          const growthRate = Math.min(120, Math.round(50 + (post.ups / 20)));
          const relInterest = Math.min(100, Math.round((post.ups / 30)));

          signals.push({
            source: 'REDDIT_SOCIAL',
            sourceId: `reddit-${post.id || Math.random().toString(36).slice(2, 10)}`,
            rawQuery: post.title.trim(),
            timestamp: createdDate,
            metrics: {
              growthRate,
              searchVolume: (post.ups || 10) * 15,
              relativeInterest: relInterest,
              isBreakout: post.ups >= 300,
              visualPotentialScore:
                community.pillar === 'discover' || community.pillar === 'travel' ? 90 : 70,
            },
            geography: 'GLOBAL',
            language: 'en',
            category: community.pillar,
            sourceUrl: post.permalink
              ? `https://www.reddit.com${post.permalink}`
              : `https://www.reddit.com/r/${community.subreddit}`,
            metadata: {
              socialPayload: payload,
              suggestedPillar: community.pillar,
              curatedTags: [community.subreddit, community.pillar, 'discussion'],
              platform: 'reddit',
              isLiveIngestion: true,
            },
          });
        }
      } catch (err: any) {
        errors.push(`r/${community.subreddit}: ${err?.message || String(err)}`);
      }
    });

    await Promise.allSettled(fetchPromises);

    if (signals.length === 0) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'PROVIDER_UNAVAILABLE',
        signals: [],
        error: `All Reddit community fetches failed or were rate-limited. Errors: [${errors.slice(0, 3).join('; ')}]`,
        fetchedAt: now.toISOString(),
      };
    }

    const boundedSignals = signals.slice(0, limit);

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals: boundedSignals,
      error: errors.length > 0 ? `Partial fetch: ${successfulCommunities}/${targetCommunities.length} communities succeeded.` : undefined,
      fetchedAt: now.toISOString(),
    };
  }
}
