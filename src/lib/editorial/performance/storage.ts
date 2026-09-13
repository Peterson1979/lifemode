import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { IPerformanceStore } from './contracts.ts';
import type { ArticlePerformanceRecord, PerformanceMetrics } from './types.ts';

export const DEFAULT_PERFORMANCE_STORAGE_PATH = resolve(process.cwd(), 'data/editorial/performance.json');

export interface FilesystemPerformanceStoreOptions {
  storagePath?: string;
}

/**
 * Filesystem-backed deterministic storage for published article performance records.
 */
export class FilesystemPerformanceStore implements IPerformanceStore {
  private readonly storagePath: string;

  constructor(options: FilesystemPerformanceStoreOptions = {}) {
    this.storagePath = options.storagePath || DEFAULT_PERFORMANCE_STORAGE_PATH;
  }

  getFilePath(): string {
    return this.storagePath;
  }

  /**
   * Loads all stored performance records. Returns empty array if file does not exist.
   */
  async loadRecords(): Promise<ArticlePerformanceRecord[]> {
    try {
      const raw = await readFile(this.storagePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as ArticlePerformanceRecord[];
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * Retrieves a single performance record by article slug.
   */
  async getRecordBySlug(slug: string): Promise<ArticlePerformanceRecord | null> {
    const records = await this.loadRecords();
    const found = records.find((r) => r.articleSlug === slug);
    return found ? { ...found } : null;
  }

  /**
   * Saves all performance records to disk with deterministic JSON formatting.
   */
  async saveRecords(records: ArticlePerformanceRecord[]): Promise<void> {
    await mkdir(dirname(this.storagePath), { recursive: true });

    // Deterministic sorting by articleSlug
    const sorted = [...records].sort((a, b) => a.articleSlug.localeCompare(b.articleSlug));
    const json = JSON.stringify(sorted, null, 2) + '\n';
    await writeFile(this.storagePath, json, 'utf-8');
  }

  /**
   * Inserts or updates an entire performance record.
   */
  async upsertRecord(record: ArticlePerformanceRecord): Promise<ArticlePerformanceRecord> {
    const records = await this.loadRecords();
    const index = records.findIndex((r) => r.articleSlug === record.articleSlug);

    const mergedRecord: ArticlePerformanceRecord = {
      ...record,
      measuredAt: record.measuredAt || new Date().toISOString(),
    };

    if (index === -1) {
      records.push(mergedRecord);
    } else {
      records[index] = {
        ...records[index],
        ...mergedRecord,
        metrics: {
          ...records[index].metrics,
          ...mergedRecord.metrics,
        },
      };
    }

    await this.saveRecords(records);
    return index === -1 ? mergedRecord : records[index];
  }

  /**
   * Updates only specific metrics for an existing article record.
   */
  async updateMetrics(
    slug: string,
    metrics: Partial<PerformanceMetrics>,
    measuredAt: string = new Date().toISOString()
  ): Promise<ArticlePerformanceRecord | null> {
    const records = await this.loadRecords();
    const index = records.findIndex((r) => r.articleSlug === slug);
    if (index === -1) {
      return null;
    }

    const existing = records[index];
    const updated: ArticlePerformanceRecord = {
      ...existing,
      metrics: {
        ...existing.metrics,
        ...metrics,
      },
      measuredAt,
    };

    records[index] = updated;
    await this.saveRecords(records);
    return updated;
  }
}
