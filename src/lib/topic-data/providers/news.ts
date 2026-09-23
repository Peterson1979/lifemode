import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { NewsData, NewsItem } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface FreeNewsApiRawArticle {
  id?: string;
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
  published_at?: string;
  publishedAt?: string;
  crawled_at?: string;
  sitename?: string;
  host?: string;
  source?: {
    name?: string;
    id?: string;
  };
  country?: string;
  lang?: string;
  image?: string;
}

interface FreeNewsApiResponse {
  took_ms?: number;
  total?: number;
  size?: number;
  offset?: number;
  results?: FreeNewsApiRawArticle[];
}

/**
 * Data provider for real-time news aggregation via FreeNewsAPI.ai.
 *
 * Requirements & Content Licensing:
 * - Operates strictly as a current news discovery & reference index.
 * - Never republishes full article bodies (full_text parameter is omitted/false).
 * - Displays concise metadata: headline, publisher/source, publication time, short lead snippet, and canonical link.
 * - Always links back to the original publisher article.
 */
export class FreeNewsApiProvider extends BaseTopicDataProvider<NewsData> {
  readonly providerId = 'freenewsapi-news';
  readonly name = 'Free News API Global Index';
  readonly domain: DataDomain = 'news';
  readonly defaultPillar: PillarSlug = 'entertainment';

  readonly source: DataSource = {
    id: 'freenewsapi',
    name: 'Free News API & Publishers',
    url: 'https://freenewsapi.ai',
    attribution: 'Real-time news search powered by FreeNewsAPI.ai; articles remain copyright of original publishers',
    license: 'Open Access CC-NEWS',
    isOfficial: false,
  };

  protected getEndpointUrl(_options: ProviderRequestOptions): string {
    // Search latest English news from the last 24h, sorted by date (newest first)
    return 'https://freenewsapi.ai/v1/search?lang=en&date=24h&size=10&sort=date';
  }

  protected getRequestHeaders(options: ProviderRequestOptions): Record<string, string> {
    const headers = super.getRequestHeaders(options);
    headers['X-Agent'] = 'agent_name=LifeMode; purpose=topic_intelligence; contact=https://lifemode.life';
    return headers;
  }

  protected extractSourceUpdatedAt(raw: unknown): string | undefined {
    if (raw && typeof raw === 'object') {
      const payload = raw as any;
      const list = Array.isArray(payload.results) ? payload.results : Array.isArray(payload.articles) ? payload.articles : [];
      if (list[0]?.published_at || list[0]?.publishedAt) {
        return new Date(list[0].published_at || list[0].publishedAt).toISOString();
      }
    }
    return undefined;
  }

  protected validateAndNormalize(raw: unknown): NewsData {
    if (!raw || typeof raw !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'FreeNewsAPI payload is not an object');
    }

    const payload = raw as FreeNewsApiResponse & { articles?: FreeNewsApiRawArticle[] };
    const rawList: FreeNewsApiRawArticle[] | null = Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload.articles)
      ? payload.articles
      : null;

    if (!rawList) {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'FreeNewsAPI response missing results array');
    }

    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const items: NewsItem[] = [];

    const nowMs = Date.now();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // max 7 days old to ensure current relevance

    for (const article of rawList) {
      const url = (article.url || '').trim();
      const rawTitle = (article.title || '').trim();

      if (!url || !rawTitle) {
        continue;
      }

      // Deduplication check by canonical URL and normalized title
      const normalizedUrl = url.toLowerCase().replace(/\/+$/, '');
      const normalizedTitle = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (seenUrls.has(normalizedUrl) || seenTitles.has(normalizedTitle)) {
        continue;
      }
      seenUrls.add(normalizedUrl);
      seenTitles.add(normalizedTitle);

      // Extract publisher / site
      const publisher =
        (article.sitename || article.source?.name || article.host || '')
          .replace(/^www\./i, '')
          .trim() || 'News Publisher';

      // Parse publication time with fallback
      const pubDateStr = article.published_at || article.publishedAt || article.crawled_at;
      let publishedAtIso: string;
      if (pubDateStr) {
        const parsedMs = new Date(pubDateStr).getTime();
        if (!isNaN(parsedMs)) {
          // Skip articles that are unrealistically old for a "Now" news feed
          if (nowMs - parsedMs > maxAgeMs) {
            continue;
          }
          publishedAtIso = new Date(parsedMs).toISOString();
        } else {
          publishedAtIso = new Date().toISOString();
        }
      } else {
        publishedAtIso = new Date().toISOString();
      }

      // Clean snippet/description (legal compliance: brief excerpt only)
      const rawDescription = (article.description || '').trim();
      const cleanDescription = rawDescription
        .replace(/<[^>]*>/g, '') // strip any html tags
        .replace(/\s+/g, ' ')
        .slice(0, 240);

      items.push({
        id: article.id || `news-${items.length + 1}`,
        title: rawTitle,
        url,
        publisher,
        publishedAt: publishedAtIso,
        snippet: cleanDescription || undefined,
        language: article.lang,
        country: article.country,
        imageUrl: article.image,
      });

      // Present top 4 high-signal items in the UI
      if (items.length >= 4) {
        break;
      }
    }

    return {
      items,
      featuredItem: items[0],
      totalResults: payload.total || items.length,
    };
  }

  protected getTitle(_data: NewsData | null): string {
    return 'Latest Now';
  }

  protected getSubtitle(data: NewsData | null): string {
    if (data && data.items.length > 0) {
      return `Current global headlines and breaking developments from verified publishers`;
    }
    return 'Live news monitoring and reference stream';
  }
}
