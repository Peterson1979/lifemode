import type { DataDomain, TopicDataBlock } from './core.ts';

/**
 * Article-level opt-in data request.
 * Allows an article to explicitly request a specific dataset when contextually relevant.
 */
export interface ArticleDataRequest {
  articleId: string;
  pillar: string;
  domain: DataDomain;
  params?: {
    location?: { city?: string; country?: string; latitude?: number; longitude?: number };
    currency?: { base?: string; targets?: string[] };
    ingredient?: { query: string; fdcId?: number | string };
    techRepo?: { owner: string; repo: string };
    knowledgeTopic?: { title: string };
    earthquakeFilter?: { minMagnitude?: number; limit?: number };
  };
}

/**
 * Result returned for an article data query.
 */
export interface ArticleDataResult<T = unknown> {
  articleId: string;
  domain: DataDomain;
  block: TopicDataBlock<T>;
  isApplicable: boolean;
}
