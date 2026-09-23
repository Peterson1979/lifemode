import type { PillarSlug } from '../../config/site.ts';
import type { DataDomain } from './types/core.ts';
import type { BaseTopicDataProvider } from './providers/base.ts';
import { FreeNewsApiProvider } from './providers/news.ts';
import { UsgsEarthquakeProvider } from './providers/earthquake.ts';
import { FrankfurterFxProvider } from './providers/fx.ts';
import { WeatherApiProvider } from './providers/weather.ts';
import { WorldBankEconomicProvider } from './providers/economic.ts';
import { UsdaFoodDataProvider } from './providers/food.ts';
import { GitHubTechActivityProvider } from './providers/tech.ts';
import { WikimediaKnowledgeProvider } from './providers/knowledge.ts';
import { TopicDataCache, globalTopicDataCache } from './cache/store.ts';

/**
 * Registry of all available data providers in LifeMode.
 */
export class TopicDataProviderRegistry {
  private providers: Map<string, BaseTopicDataProvider<any>> = new Map();
  private pillarMapping: Map<PillarSlug, BaseTopicDataProvider<any>[]> = new Map();
  private domainMapping: Map<DataDomain, BaseTopicDataProvider<any>> = new Map();

  constructor(cache: TopicDataCache = globalTopicDataCache) {
    const newsProvider = new FreeNewsApiProvider(cache);
    const earthquakeProvider = new UsgsEarthquakeProvider(cache);
    const fxProvider = new FrankfurterFxProvider(cache);
    const weatherProvider = new WeatherApiProvider(cache);
    const economicProvider = new WorldBankEconomicProvider(cache);
    const foodProvider = new UsdaFoodDataProvider(cache);
    const techProvider = new GitHubTechActivityProvider(cache);
    const knowledgeProvider = new WikimediaKnowledgeProvider(cache);

    const allProviders: BaseTopicDataProvider<any>[] = [
      newsProvider,
      earthquakeProvider,
      fxProvider,
      weatherProvider,
      economicProvider,
      foodProvider,
      techProvider,
      knowledgeProvider,
    ];

    for (const p of allProviders) {
      this.providers.set(p.providerId, p);
      this.domainMapping.set(p.domain, p);
    }

    // Explicit topic-to-provider mappings across all 7 LifeMode topics
    this.pillarMapping.set('money', [fxProvider, economicProvider]);
    this.pillarMapping.set('travel', [weatherProvider, earthquakeProvider, fxProvider]);
    this.pillarMapping.set('wellbeing', [foodProvider, economicProvider]);
    this.pillarMapping.set('food-drink', [foodProvider]);
    this.pillarMapping.set('tech-ai', [techProvider, newsProvider]);
    this.pillarMapping.set('entertainment', [knowledgeProvider, newsProvider]);
    this.pillarMapping.set('style', [knowledgeProvider, economicProvider]);
  }

  /**
   * Retrieves all providers mapped to a specific pillar.
   */
  public getProvidersForPillar(pillar: PillarSlug): BaseTopicDataProvider<any>[] {
    return this.pillarMapping.get(pillar) || [];
  }

  /**
   * Retrieves provider for a given domain.
   */
  public getProviderByDomain(domain: DataDomain): BaseTopicDataProvider<any> | undefined {
    return this.domainMapping.get(domain);
  }

  /**
   * Retrieves provider by ID.
   */
  public getProviderById(providerId: string): BaseTopicDataProvider<any> | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Retrieves all registered providers.
   */
  public getAllProviders(): BaseTopicDataProvider<any>[] {
    return Array.from(this.providers.values());
  }
}

export const globalTopicDataProviderRegistry = new TopicDataProviderRegistry();
