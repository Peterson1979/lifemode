import type { AIProviderId } from './types.ts';

export interface ProviderUsageRecord {
  requests: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastRequestAt: string;
}

export interface DailyUsageSummary {
  dateUtc: string;
  totalTokens: number;
  totalRequests: number;
  totalFailures: number;
  byProvider: Record<AIProviderId, ProviderUsageRecord>;
}

export interface RecordUsageParams {
  provider: AIProviderId;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  success: boolean;
  dateUtc?: string;
}

/**
 * Common contract for tracking AI usage and token budgets.
 * Designed for in-memory V1 operation with seamless future migration to Redis/Upstash.
 */
export interface IUsageTracker {
  recordUsage(params: RecordUsageParams): void;
  getDailyUsage(dateUtc?: string): DailyUsageSummary;
  getProviderDailyTokens(provider: AIProviderId, dateUtc?: string): number;
  getTotalDailyTokens(dateUtc?: string): number;
  getProviderDailyRequests(provider: AIProviderId, dateUtc?: string): number;
  reset(): void;
}

/**
 * Returns today's date formatted as a standard UTC key: YYYY-MM-DD.
 */
export function getUtcDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * In-memory usage tracker implementation.
 */
export class InMemoryUsageTracker implements IUsageTracker {
  // Key format: `${dateUtc}:${provider}` -> ProviderUsageRecord
  private records: Map<string, ProviderUsageRecord> = new Map();

  private getCompositeKey(dateUtc: string, provider: AIProviderId): string {
    return `${dateUtc}:${provider}`;
  }

  recordUsage(params: RecordUsageParams): void {
    const dateUtc = params.dateUtc || getUtcDateKey();
    const key = this.getCompositeKey(dateUtc, params.provider);

    const existing = this.records.get(key) || {
      requests: 0,
      failures: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      lastRequestAt: new Date().toISOString(),
    };

    const updated: ProviderUsageRecord = {
      requests: existing.requests + 1,
      failures: existing.failures + (params.success ? 0 : 1),
      inputTokens: existing.inputTokens + Math.max(0, params.inputTokens),
      outputTokens: existing.outputTokens + Math.max(0, params.outputTokens),
      totalTokens: existing.totalTokens + Math.max(0, params.totalTokens),
      lastRequestAt: new Date().toISOString(),
    };

    this.records.set(key, updated);
  }

  getDailyUsage(dateUtc: string = getUtcDateKey()): DailyUsageSummary {
    const summary: DailyUsageSummary = {
      dateUtc,
      totalTokens: 0,
      totalRequests: 0,
      totalFailures: 0,
      byProvider: {},
    };

    for (const [key, record] of this.records.entries()) {
      if (key.startsWith(`${dateUtc}:`)) {
        const provider = key.slice(dateUtc.length + 1);
        summary.byProvider[provider] = { ...record };
        summary.totalTokens += record.totalTokens;
        summary.totalRequests += record.requests;
        summary.totalFailures += record.failures;
      }
    }

    return summary;
  }

  getProviderDailyTokens(provider: AIProviderId, dateUtc: string = getUtcDateKey()): number {
    const key = this.getCompositeKey(dateUtc, provider);
    return this.records.get(key)?.totalTokens || 0;
  }

  getTotalDailyTokens(dateUtc: string = getUtcDateKey()): number {
    return this.getDailyUsage(dateUtc).totalTokens;
  }

  getProviderDailyRequests(provider: AIProviderId, dateUtc: string = getUtcDateKey()): number {
    const key = this.getCompositeKey(dateUtc, provider);
    return this.records.get(key)?.requests || 0;
  }

  reset(): void {
    this.records.clear();
  }
}

/**
 * Singleton instance for process-wide usage tracking.
 */
export const defaultUsageTracker = new InMemoryUsageTracker();
