import type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel } from '../types.ts';

export type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel };

/**
 * Editorial lifecycle status of a stored article entity.
 */
export type ArticleLifecycleStatus =
  | 'DRAFT'
  | 'REVIEWED'
  | 'APPROVED'
  | 'STORED'
  | 'PUBLISHED'
  | 'ARCHIVED';

/**
 * Frontmatter metadata persisted in Markdown header.
 * Conforms 100% with the Astro content collection schema (`src/content.config.ts`).
 */
export interface StoredArticleFrontmatter {
  title: string;
  description: string;
  pubDate: string; // ISO 8601 or YYYY-MM-DD
  updatedDate?: string; // ISO 8601 or YYYY-MM-DD
  author: string;
  tags: string[];
  featured: boolean;
  draft: boolean;
  format: ArticleFormat;
  topicId?: string;
  audience?: string;
  primaryIntent: SearchIntent;
  secondaryIntent?: string;
  affiliateIntent: boolean;
  riskLevel: RiskLevel;
  sources: Array<{
    name: string;
    url: string;
  }>;
  image?: string;
  imageAlt?: string;
  imagePrompt?: string;
  imageSource?: string;
  readingTime?: string;
  version: number;
  lifecycleStatus: ArticleLifecycleStatus;
}

/**
 * Fully parsed stored article entity with frontmatter and body.
 */
export interface StoredArticle {
  identity: {
    topicId?: string;
    slug: string;
    pillar: PillarSlug;
  };
  pillar: PillarSlug;
  slug: string;
  frontmatter: StoredArticleFrontmatter;
  content: string; // Markdown body without frontmatter
  filePath: string;
}

/**
 * Input structure used to create or update an article in storage.
 */
export interface StoredArticleInput {
  pillar: PillarSlug;
  slug: string;
  content: string;
  frontmatter: Partial<StoredArticleFrontmatter> & {
    title: string;
    description: string;
  };
  topicId?: string;
}

/**
 * Operation status codes returned from content repository actions.
 */
export type StorageOperationStatus =
  | 'STORED'
  | 'UPDATED'
  | 'EXISTS'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'FAILED'
  | 'REMOVED';

/**
 * Structured result of a content repository operation.
 */
export interface StorageResult {
  status: StorageOperationStatus;
  articleId?: string; // e.g. `${pillar}/${slug}`
  path?: string;
  slug?: string;
  pillar?: PillarSlug;
  operation: 'create' | 'update' | 'remove' | 'get';
  timestamp: string; // ISO 8601
  version?: number;
  article?: StoredArticle;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Provider-independent repository interface for managing persisted articles.
 */
export interface IContentRepository {
  create(article: StoredArticleInput): Promise<StorageResult>;
  update(article: StoredArticleInput): Promise<StorageResult>;
  get(pillar: PillarSlug, slug: string): Promise<StoredArticle | null>;
  exists(pillar: PillarSlug, slug: string): Promise<boolean>;
  list(pillar?: PillarSlug): Promise<StoredArticle[]>;
  remove(pillar: PillarSlug, slug: string): Promise<StorageResult>;
}
