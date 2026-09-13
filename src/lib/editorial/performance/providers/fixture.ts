import type { IPerformanceProvider } from '../contracts.ts';
import type { ArticlePerformanceRecord } from '../types.ts';

/**
 * Deterministic in-memory / fixture provider for tests and offline development.
 */
export class FixturePerformanceProvider implements IPerformanceProvider {
  readonly providerId = 'fixture';
  private records: Map<string, ArticlePerformanceRecord>;

  constructor(initialRecords: ArticlePerformanceRecord[] = []) {
    this.records = new Map(initialRecords.map((r) => [r.articleSlug, { ...r }]));
  }

  async fetchArticlePerformance(slug: string): Promise<ArticlePerformanceRecord | null> {
    const record = this.records.get(slug);
    return record ? { ...record } : null;
  }

  async fetchBatchPerformance(slugs: string[]): Promise<ArticlePerformanceRecord[]> {
    const results: ArticlePerformanceRecord[] = [];
    for (const slug of slugs) {
      const record = this.records.get(slug);
      if (record) {
        results.push({ ...record });
      }
    }
    return results;
  }

  async recordPerformance(record: ArticlePerformanceRecord): Promise<void> {
    this.records.set(record.articleSlug, { ...record });
  }

  /**
   * Helper to seed records directly into fixture provider.
   */
  setRecords(records: ArticlePerformanceRecord[]): void {
    this.records.clear();
    for (const record of records) {
      this.records.set(record.articleSlug, { ...record });
    }
  }
}
