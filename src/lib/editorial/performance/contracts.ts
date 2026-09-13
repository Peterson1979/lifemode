import type {
  ArticlePerformanceRecord,
  PerformanceMetrics,
} from './types.ts';

/**
 * Interface for repository-backed storage of article performance records.
 */
export interface IPerformanceStore {
  /**
   * Retrieves all stored performance records.
   */
  loadRecords(): Promise<ArticlePerformanceRecord[]>;

  /**
   * Retrieves a single performance record by article slug.
   */
  getRecordBySlug(slug: string): Promise<ArticlePerformanceRecord | null>;

  /**
   * Persists or updates a complete performance record.
   */
  upsertRecord(record: ArticlePerformanceRecord): Promise<ArticlePerformanceRecord>;

  /**
   * Updates only specific metrics for an existing article record.
   * If the record does not exist, returns null.
   */
  updateMetrics(
    slug: string,
    metrics: Partial<PerformanceMetrics>,
    measuredAt?: string
  ): Promise<ArticlePerformanceRecord | null>;

  /**
   * Saves a full batch of performance records to storage.
   */
  saveRecords(records: ArticlePerformanceRecord[]): Promise<void>;
}

/**
 * Future-ready interface for performance providers (internal analytics, offline fixtures, etc.).
 * In V1, this interface performs no external network calls.
 */
export interface IPerformanceProvider {
  readonly providerId: string;

  /**
   * Fetches performance snapshot for a specific article.
   */
  fetchArticlePerformance(slug: string): Promise<ArticlePerformanceRecord | null>;

  /**
   * Fetches performance snapshots for a batch of articles.
   */
  fetchBatchPerformance(slugs: string[]): Promise<ArticlePerformanceRecord[]>;

  /**
   * Records or syncs performance data to the underlying store.
   */
  recordPerformance(record: ArticlePerformanceRecord): Promise<void>;
}
