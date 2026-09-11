import type { IDiscoveryAdapter, DiscoveryAdapterOptions, RSSFeedsPayload } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal } from '../types.ts';
import { loadDiscoveryConfig, type ConfiguredRSSFeed } from '../config.ts';
import { parseXmlFeed } from '../parsers/xml-feed-parser.ts';

export interface RSSFeedsAdapterOptions extends DiscoveryAdapterOptions {
  fetchFn?: typeof fetch;
  feeds?: ConfiguredRSSFeed[];
}

/**
 * RSS & Trend Feeds Live Discovery Adapter.
 *
 * Performs real outbound HTTP requests to curated public RSS/Atom feeds
 * covering LifeMode editorial pillars (Tech, Life, Travel, Wellbeing, Money, Discover, Now).
 */
export class RSSFeedsDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'RSS_FEEDS' as const;
  readonly name = 'Curated RSS & Publication Feeds';

  private fetchFn: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.fetchFn = customFetch || globalThis.fetch.bind(globalThis);
  }

  async fetchSignals(options?: RSSFeedsAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig();
    const providerConfig = config.providers.rssFeeds;

    if (!providerConfig.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'RSS Feeds provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    const fetchImpl = options?.fetchFn || this.fetchFn;
    const feedsToFetch = options?.feeds || config.rssFeedsList;
    const timeoutMs = config.requestTimeoutMs || 8000;
    const limit = options?.limit ?? providerConfig.maxSignals ?? 50;
    const now = new Date();

    const signals: DiscoverySignal[] = [];
    const errors: string[] = [];
    let successfulFeeds = 0;

    // Filter by category if requested
    let targetFeeds = feedsToFetch;
    if (options?.categoryFilter && options.categoryFilter.length > 0) {
      targetFeeds = targetFeeds.filter((f) => options.categoryFilter?.includes(f.pillar));
    }

    // Execute feed requests with bounded timeout and per-feed error isolation
    const fetchPromises = targetFeeds.map(async (feed) => {
      try {
        let signal: AbortSignal | undefined;
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          signal = AbortSignal.timeout(timeoutMs);
        }

        const response = await fetchImpl(feed.url, {
          headers: {
            'User-Agent': 'LifeMode-Editorial-Bot/1.0 (+https://lifemode.life; editorial@lifemode.life)',
            Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          },
          signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const xmlText = await response.text();
        const parsed = parseXmlFeed(xmlText);

        if (parsed.items.length === 0) {
          return;
        }

        successfulFeeds++;
        const maxPerFeed = 5;
        const feedItems = parsed.items.slice(0, maxPerFeed);

        for (let i = 0; i < feedItems.length; i++) {
          const item = feedItems[i];
          if (!item.title || item.title.trim().length < 8) continue;

          let pubIso = now.toISOString();
          if (item.pubDate) {
            const parsedDate = new Date(item.pubDate);
            if (!isNaN(parsedDate.getTime())) {
              pubIso = parsedDate.toISOString();
            }
          }

          const combinedTags = [...(feed.categories || []), ...item.categories];
          const payload: RSSFeedsPayload = {
            feedUrl: feed.url,
            feedTitle: parsed.title || feed.name,
            itemTitle: item.title,
            itemLink: item.link || feed.url,
            publishedDate: pubIso,
            contentSnippet: item.description,
            categories: combinedTags,
          };

          const rawId = `${feed.id}-${i + 1}-${encodeURIComponent(item.title.slice(0, 20))}`;

          signals.push({
            source: 'RSS_FEEDS',
            sourceId: `rss-${rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}`,
            rawQuery: item.title,
            timestamp: pubIso,
            metrics: {
              growthRate: 80,
              searchVolume: 12000,
              relativeInterest: 80,
              isBreakout: false,
              visualPotentialScore:
                feed.pillar === 'discover' || feed.pillar === 'travel' ? 92 : 75,
            },
            geography: 'GLOBAL',
            language: 'en',
            category: feed.pillar,
            sourceUrl: item.link || feed.url,
            metadata: {
              rssPayload: payload,
              suggestedPillar: feed.pillar,
              curatedTags: combinedTags,
              feedName: feed.name,
              isLiveIngestion: true,
            },
          });
        }
      } catch (err: any) {
        errors.push(`${feed.name} (${feed.url}): ${err?.message || String(err)}`);
      }
    });

    await Promise.allSettled(fetchPromises);

    // If zero feeds succeeded and all failed
    if (signals.length === 0) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'PROVIDER_UNAVAILABLE',
        signals: [],
        error: `All live RSS feeds failed to fetch or returned empty items. Errors: [${errors.slice(0, 3).join('; ')}]`,
        fetchedAt: now.toISOString(),
      };
    }

    const boundedSignals = signals.slice(0, limit);

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals: boundedSignals,
      error: errors.length > 0 ? `Partial fetch: ${successfulFeeds}/${targetFeeds.length} feeds succeeded.` : undefined,
      fetchedAt: now.toISOString(),
    };
  }
}
