import type { IDiscoveryAdapter, DiscoveryAdapterOptions, GoogleTrendsPayload } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal } from '../types.ts';
import type { PillarSlug, ActivePillarSlug } from '../../types.ts';
import { loadDiscoveryConfig } from '../config.ts';
import { parseXmlFeed } from '../parsers/xml-feed-parser.ts';
import { isMeaningfulEditorialTopic, normalizePillar } from '../../normalization.ts';

export interface GoogleTrendsAdapterOptions extends DiscoveryAdapterOptions {
  fetchFn?: typeof fetch;
  endpointUrl?: string;
  geo?: string;
}

/**
 * Classifies a trending search query into one of the 6 active LifeMode editorial pillars.
 * Returns null if the topic does not have a genuine LifeMode editorial home (e.g. gossip, sports, crime, news filler).
 */
export function classifyTrendingQueryPillar(query: string, description?: string): ActivePillarSlug | null {
  const qualityCheck = isMeaningfulEditorialTopic(query);
  if (!qualityCheck.isValid) {
    return null;
  }

  const text = `${query} ${description || ''}`.toLowerCase();

  // Tech & AI (AI software, prompt systems, consumer tech innovation, local LLMs)
  if (/\b(ai|artificial intelligence|claude|chatgpt|openai|gemini|nvidia|gpu|gpus|chip|chips|llm|llms|machine learning|prompt|prompts|software|app|apps|gadget|gadgets|hardware|cyber|robot|automation|tech workflow|smart home)\b/i.test(text)) {
    return 'tech-ai';
  }

  // Health (Longevity, metabolic health, sleep, recovery, fitness, nutrition science, biohacking)
  if (/\b(health|sleep|diet|nutrition|workout|fitness|longevity|metabolic|glucose|blood sugar|protein|circadian|recovery|sauna|cold plunge|vitality|biohack|fasting|cardio|zone 2|muscle|hydration)\b/i.test(text)) {
    return 'health';
  }

  // Wealth (Online income, side hustles, digital work, freelancing, personal finance, investing, money)
  if (/\b(side hustle|online income|freelancing|digital product|creator economy|remote work|ecommerce|selling online|passive income|personal finance|investing|invest|budget|saving|portfolio|treasury|yield|yields|rates|interest rates|cash flow|dividends|bonds)\b/i.test(text)) {
    return 'wealth';
  }

  // Home (Kitchen care, cooking, food storage, stain solving, cleaning, home maintenance, organization)
  if (/\b(kitchen|cooking|cookware|food storage|cast iron|stain|cleaning|laundry|maintenance|storage|organization|declutter|pantry|closet|appliance|sourdough|fermentation|recipe|recipes|baking|culinary|meal prep|fabric care)\b/i.test(text)) {
    return 'home';
  }

  // Life (Style, grooming, skincare, beauty, daily routines, travel, intentional living, aesthetics)
  if (/\b(style|fashion|wardrobe|capsule wardrobe|outfit|outfits|beauty|skincare|serum|sunscreen|haircare|grooming|fragrance|perfume|travel|destination|destinations|itinerary|itineraries|slow travel|hotel|hotels|flight|flights|journey|journeys|coastal|routine|morning routine|productivity|habit|habits)\b/i.test(text)) {
    return 'life';
  }

  // Tools (Interactive calculators, decision trees, cheat sheets, finders)
  if (/\b(calculator|finder|solver|cheat sheet|checklist|planner|selector|quiz|formula)\b/i.test(text)) {
    return 'tools';
  }

  // Do not default to arbitrary categories; reject unaligned trends
  return null;
}

/**
 * Parses approx traffic string (e.g. "500K+", "50,000+", "1M+") to a number.
 */
function parseApproxTraffic(trafficStr?: string): number {
  if (!trafficStr) return 20000;
  const cleaned = trafficStr.replace(/[^0-9kmKM+.]/g, '').toUpperCase();
  if (cleaned.includes('M')) {
    const num = parseFloat(cleaned.replace('M', '').replace('+', ''));
    return isNaN(num) ? 1000000 : Math.round(num * 1000000);
  }
  if (cleaned.includes('K')) {
    const num = parseFloat(cleaned.replace('K', '').replace('+', ''));
    return isNaN(num) ? 100000 : Math.round(num * 1000);
  }
  const num = parseInt(cleaned.replace('+', ''), 10);
  return isNaN(num) ? 20000 : num;
}

/**
 * Google Trends Live Discovery Adapter.
 *
 * Performs real outbound HTTP requests to the public Google Trends RSS endpoint
 * to discover rising and breakout search queries without requiring paid API credentials.
 */
export class GoogleTrendsDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'GOOGLE_TRENDS' as const;
  readonly name = 'Google Trends (Public RSS)';

  private fetchFn: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.fetchFn = customFetch || globalThis.fetch.bind(globalThis);
  }

  async fetchSignals(options?: GoogleTrendsAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig();
    const providerConfig = config.providers.googleTrends;

    if (!providerConfig.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Google Trends provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    const fetchImpl = options?.fetchFn || this.fetchFn;
    const geo = options?.geo || config.googleTrends.geo || 'US';
    const endpoint =
      options?.endpointUrl ||
      `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
    const timeoutMs = config.requestTimeoutMs || 8000;
    const limit = options?.limit ?? providerConfig.maxSignals ?? 50;
    const now = new Date();

    try {
      let signal: AbortSignal | undefined;
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        signal = AbortSignal.timeout(timeoutMs);
      }

      const response = await fetchImpl(endpoint, {
        headers: {
          'User-Agent': 'LifeMode-Editorial-Bot/1.0 (+https://lifemode.life; editorial@lifemode.life)',
          Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();
      const parsed = parseXmlFeed(xmlText);

      if (parsed.items.length === 0) {
        return {
          provider: this.name,
          sourceType: this.sourceType,
          status: 'PROVIDER_UNAVAILABLE',
          signals: [],
          error: `Google Trends RSS for geo '${geo}' returned 0 items.`,
          fetchedAt: now.toISOString(),
        };
      }

      const signals: DiscoverySignal[] = [];

      for (let i = 0; i < parsed.items.length; i++) {
        const item = parsed.items[i];
        if (!item.title || item.title.trim().length < 3) continue;

        const pillar = classifyTrendingQueryPillar(item.title, item.description);
        if (!pillar) continue;

        if (options?.categoryFilter && options.categoryFilter.length > 0) {
          if (!options.categoryFilter.includes(pillar)) continue;
        }

        let pubIso = now.toISOString();
        if (item.pubDate) {
          const parsedDate = new Date(item.pubDate);
          if (!isNaN(parsedDate.getTime())) {
            pubIso = parsedDate.toISOString();
          }
        }

        const searchVol = parseApproxTraffic(item.approxTraffic);
        const relInterest = Math.min(100, Math.max(70, Math.round(searchVol / 10000)));

        const payload: GoogleTrendsPayload = {
          query: item.title.trim(),
          relativeInterestScore: relInterest,
          isBreakout: searchVol >= 100000,
          relatedQueries: item.categories,
          geoRegion: geo,
        };

        const rawId = `gtrends-${geo}-${i + 1}-${encodeURIComponent(item.title.slice(0, 15))}`;

        signals.push({
          source: 'GOOGLE_TRENDS',
          sourceId: `gtrends-${rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}`,
          rawQuery: item.title.trim(),
          timestamp: pubIso,
          metrics: {
            growthRate: 95,
            searchVolume: searchVol,
            relativeInterest: relInterest,
            isBreakout: searchVol >= 100000,
            visualPotentialScore: (pillar === 'life' || pillar === 'home') ? 85 : 75,
          },
          geography: geo,
          language: 'en',
          category: pillar,
          sourceUrl: item.link || endpoint,
          metadata: {
            googleTrendsPayload: payload,
            suggestedPillar: pillar,
            curatedTags: [geo, pillar, 'trending', ...item.categories],
            isLiveIngestion: true,
          },
        });
      }

      const boundedSignals = signals.slice(0, limit);

      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'AVAILABLE',
        signals: boundedSignals,
        fetchedAt: now.toISOString(),
      };
    } catch (err: any) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'PROVIDER_UNAVAILABLE',
        signals: [],
        error: `Google Trends RSS fetch failed: ${err?.message || String(err)}`,
        fetchedAt: now.toISOString(),
      };
    }
  }
}
