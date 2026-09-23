import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal } from '../types.ts';
import type { PillarSlug } from '../../types.ts';
import { FreeNewsApiProvider } from '../../../topic-data/providers/news.ts';
import { globalTopicDataCache } from '../../../topic-data/cache/store.ts';

/**
 * Classifies a news headline and description into one of the 7 authentic LifeMode editorial pillars.
 */
export function classifyNewsPillar(title: string, snippet: string = ''): PillarSlug {
  const text = `${title} ${snippet}`.toLowerCase();

  // Tech & AI
  if (
    /\b(ai|artificial intelligence|machine learning|llm|software|chip|semiconductor|app|robotics|hardware|quantum|cyber|coding|developer|cloud|algorithm)\b/.test(
      text
    )
  ) {
    return 'tech-ai';
  }

  // Food & Drink
  if (
    /\b(food|recipe|restaurant|chef|wine|dining|coffee|culinary|baking|olive oil|cocktail|fermentation|cooking|dietary|flavor|cuisine)\b/.test(
      text
    )
  ) {
    return 'food-drink';
  }

  // Travel
  if (
    /\b(travel|destination|hotel|resort|airline|flight|tourism|itinerary|train|stay|vacation|island|expedition|mountains|coast)\b/.test(
      text
    )
  ) {
    return 'travel';
  }

  // Money & Economy
  if (
    /\b(money|finance|investment|market|stock|inflation|economy|wealth|banking|fund|crypto|real estate|interest rate|tax|savings)\b/.test(
      text
    )
  ) {
    return 'money';
  }

  // Wellbeing & Health
  if (
    /\b(wellbeing|health|sleep|mental health|fitness|nutrition|longevity|wellness|exercise|mindfulness|meditation|cardio|recovery)\b/.test(
      text
    )
  ) {
    return 'wellbeing';
  }

  // Style & Beauty
  if (
    /\b(style|fashion|skincare|beauty|makeup|hair|fragrance|cosmetics|wardrobe|outfit|textiles|accessories|dermatology)\b/.test(
      text
    )
  ) {
    return 'style';
  }

  // Culture & Design
  if (
    /\b(culture|art|architecture|design|book|exhibition|cinema|film|museum|music|photography|theatre|heritage|literature|gallery)\b/.test(
      text
    )
  ) {
    return 'culture';
  }

  return 'culture';
}

/**
 * News API Discovery Adapter.
 *
 * Consumes FreeNewsApiProvider to discover real-time current news signals
 * and classifies them into authentic LifeMode editorial pillars.
 */
export class NewsApiDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'NEWS_API' as const;
  readonly name = 'Free News API Discovery Adapter';

  private provider: FreeNewsApiProvider;

  constructor(provider?: FreeNewsApiProvider) {
    this.provider = provider || new FreeNewsApiProvider(globalTopicDataCache);
  }

  async fetchSignals(options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const signals: DiscoverySignal[] = [];

    try {
      const dataBlock = await this.provider.getDataBlock();

      const newsData = dataBlock.data;
      if (!newsData || !Array.isArray(newsData.items)) {
        return {
          provider: this.name,
          sourceType: 'NEWS_API',
          status: 'AVAILABLE',
          signals: [],
          fetchedAt: new Date().toISOString(),
        };
      }

      for (let i = 0; i < newsData.items.length; i++) {
        const item = newsData.items[i];
        if (!item.title || item.title.trim().length < 8) continue;

        const assignedPillar = classifyNewsPillar(item.title, item.snippet || '');

        // Category filter check if present
        if (options?.categoryFilter && options.categoryFilter.length > 0) {
          if (!options.categoryFilter.includes(assignedPillar)) {
            continue;
          }
        }

        signals.push({
          source: 'NEWS_API',
          sourceId: this.name,
          rawQuery: item.title,
          category: assignedPillar,
          sourceUrl: item.url,
          publisherName: item.publisher,
          publishedAt: item.publishedAt,
          contentSnippet: item.snippet,
          timestamp: item.publishedAt || new Date().toISOString(),
          metadata: {
            sourceUrl: item.url,
            publisher: item.publisher,
            snippet: item.snippet,
            domain: 'news',
          },
        });

        if (options?.limit && signals.length >= options.limit) {
          break;
        }
      }

      return {
        provider: this.name,
        sourceType: 'NEWS_API',
        status: 'AVAILABLE',
        signals,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        provider: this.name,
        sourceType: 'NEWS_API',
        status: 'FAILED',
        signals: [],
        error: err?.message || 'Failed to fetch news discovery signals',
        fetchedAt: new Date().toISOString(),
      };
    }
  }
}
