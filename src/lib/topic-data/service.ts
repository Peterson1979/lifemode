import type { PillarSlug } from '../../config/site.ts';
import type { TopicDataBlock, ProviderRequestOptions } from './types/core.ts';
import type { ArticleDataRequest, ArticleDataResult } from './types/articles.ts';
import {
  TopicDataProviderRegistry,
  globalTopicDataProviderRegistry,
} from './registry.ts';

export interface TopicDataServiceOptions {
  registry?: TopicDataProviderRegistry;
}

/**
 * Primary service for retrieving topic-level and article-level data.
 */
export class TopicDataService {
  private registry: TopicDataProviderRegistry;

  constructor(options: TopicDataServiceOptions = {}) {
    this.registry = options.registry || globalTopicDataProviderRegistry;
  }

  /**
   * Retrieves all data blocks configured for a specific LifeMode pillar.
   * Dispatches provider queries in parallel with complete failure isolation.
   */
  public async getTopicData(
    pillar: PillarSlug,
    options: ProviderRequestOptions = {}
  ): Promise<TopicDataBlock[]> {
    const providers = this.registry.getProvidersForPillar(pillar);
    if (providers.length === 0) {
      return [];
    }

    const settledResults = await Promise.allSettled(
      providers.map((provider) => provider.getDataBlock(options, pillar))
    );

    const blocks: TopicDataBlock[] = [];

    for (let i = 0; i < settledResults.length; i++) {
      const result = settledResults[i];
      const provider = providers[i];

      if (result.status === 'fulfilled') {
        // Tag block with current pillar context
        blocks.push({
          ...result.value,
          pillar,
        });
      } else {
        // Isolated fatal failure boundary (should rarely happen because provider handles errors internally)
        blocks.push({
          id: `block-${provider.domain}-${provider.providerId}-${pillar}`,
          pillar,
          domain: provider.domain,
          title: `Data for ${pillar}`,
          subtitle: 'Data temporarily unavailable',
          status: 'unavailable',
          data: null,
          source: provider.source,
          freshness: {
            status: 'expired',
            fetchedAt: new Date().toISOString(),
            expiresAt: new Date().toISOString(),
            ttlSeconds: 0,
            ageSeconds: 0,
            label: 'Data temporarily unavailable',
          },
          error: {
            code: 'UNKNOWN',
            message: result.reason instanceof Error ? result.reason.message : 'Execution failed',
            providerId: provider.providerId,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    return blocks;
  }

  /**
   * Explicit opt-in query for editorial articles.
   * Only returns data if the article explicitly requested it.
   */
  public async getArticleData(
    request: ArticleDataRequest,
    options: ProviderRequestOptions = {}
  ): Promise<ArticleDataResult> {
    const provider = this.registry.getProviderByDomain(request.domain);

    if (!provider) {
      return {
        articleId: request.articleId,
        domain: request.domain,
        block: {
          id: `article-${request.articleId}-${request.domain}`,
          pillar: (request.pillar as PillarSlug) || 'now',
          domain: request.domain,
          title: 'Requested Data Unavailable',
          status: 'unavailable',
          data: null,
          source: {
            id: 'unregistered',
            name: 'External Source',
          },
          freshness: {
            status: 'expired',
            fetchedAt: new Date().toISOString(),
            expiresAt: new Date().toISOString(),
            ttlSeconds: 0,
            ageSeconds: 0,
            label: 'Data temporarily unavailable',
          },
        },
        isApplicable: false,
      };
    }

    const block = await provider.getDataBlock(options, `article-${request.articleId}`);

    return {
      articleId: request.articleId,
      domain: request.domain,
      block,
      isApplicable: block.status === 'available' || block.status === 'stale_available',
    };
  }
}

export const globalTopicDataService = new TopicDataService();
