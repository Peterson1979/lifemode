import { loadEditorialImageConfig, type EditorialImageCostGuardConfig } from './config.ts';

/**
 * Storage interface for image generation quota counters.
 */
export interface ICostGuardStore {
  get(key: string): Promise<number>;
  increment(key: string, amount?: number): Promise<number>;
  reset?(): Promise<void>;
}

/**
 * In-memory store for local testing, fallback, and development.
 */
export class InMemoryCostGuardStore implements ICostGuardStore {
  private counters = new Map<string, number>();

  async get(key: string): Promise<number> {
    return this.counters.get(key) || 0;
  }

  async increment(key: string, amount = 1): Promise<number> {
    const current = this.counters.get(key) || 0;
    const next = current + amount;
    this.counters.set(key, next);
    return next;
  }

  async reset(): Promise<void> {
    this.counters.clear();
  }
}

export interface CloudflareKVCostGuardOptions {
  accountId?: string;
  apiToken?: string;
  namespaceId?: string;
  customFetch?: typeof fetch;
}

/**
 * Cloudflare Workers KV storage adapter for production counters.
 * REST API:
 * GET/PUT https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key_name}
 */
export class CloudflareKVCostGuardStore implements ICostGuardStore {
  private accountId?: string;
  private apiToken?: string;
  private namespaceId?: string;
  private customFetch?: typeof fetch;
  private fallbackStore = new InMemoryCostGuardStore();

  constructor(options: CloudflareKVCostGuardOptions = {}) {
    const config = loadEditorialImageConfig();
    this.accountId = options.accountId || config.cloudflare.accountId;
    this.apiToken = options.apiToken || config.cloudflare.apiToken;
    this.namespaceId = options.namespaceId || config.costGuard.kvNamespaceId;
    this.customFetch = options.customFetch;
  }

  isConfigured(): boolean {
    return Boolean(this.accountId && this.apiToken && this.namespaceId);
  }

  async get(key: string): Promise<number> {
    if (!this.isConfigured()) {
      return this.fallbackStore.get(key);
    }

    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${this.namespaceId}/values/${encodeURIComponent(key)}`;

    try {
      const response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      });

      if (response.status === 404) {
        return 0;
      }

      if (!response.ok) {
        return this.fallbackStore.get(key);
      }

      const text = await response.text();
      const num = parseInt(text.trim(), 10);
      return isNaN(num) ? 0 : num;
    } catch {
      return this.fallbackStore.get(key);
    }
  }

  async increment(key: string, amount = 1): Promise<number> {
    if (!this.isConfigured()) {
      return this.fallbackStore.increment(key, amount);
    }

    const current = await this.get(key);
    const updated = current + amount;

    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${this.namespaceId}/values/${encodeURIComponent(key)}`;

    try {
      const response = await fetchImpl(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'text/plain',
        },
        body: String(updated),
      });

      if (!response.ok) {
        return this.fallbackStore.increment(key, amount);
      }

      return updated;
    } catch {
      return this.fallbackStore.increment(key, amount);
    }
  }

  async reset(): Promise<void> {
    await this.fallbackStore.reset();
  }
}

/**
 * Result of a Cost Guard evaluation.
 */
export interface CostGuardDecision {
  allowed: boolean;
  reason?: 'DAILY_LIMIT_EXCEEDED' | 'MONTHLY_LIMIT_EXCEEDED' | 'GUARD_DISABLED';
  dailyUsage: number;
  monthlyUsage: number;
  dailyLimit: number;
  monthlyLimit: number;
}

export interface EditorialImageCostGuardOptions {
  enabled?: boolean;
  dailyLimit?: number;
  monthlyLimit?: number;
  store?: ICostGuardStore;
  logger?: (message: string) => void;
}

/**
 * Computes standard LifeMode daily counter key in UTC (lifemode:image-count:YYYY-MM-DD).
 */
export function getDailyKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `lifemode:image-count:${y}-${m}-${d}`;
}

/**
 * Computes standard LifeMode monthly counter key in UTC (lifemode:image-count:YYYY-MM).
 */
export function getMonthlyKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `lifemode:image-count:${y}-${m}`;
}

/**
 * LifeMode Editorial Image Cost Guard V1.
 *
 * Protects against excessive or accidental AI image generation spending by
 * enforcing daily and monthly quotas before any provider call.
 */
export class EditorialImageCostGuard {
  readonly enabled: boolean;
  readonly dailyLimit: number;
  readonly monthlyLimit: number;
  private store: ICostGuardStore;

  constructor(options: EditorialImageCostGuardOptions = {}) {
    const config = loadEditorialImageConfig();
    this.enabled = options.enabled !== undefined ? options.enabled : config.costGuard.enabled;
    this.dailyLimit = options.dailyLimit !== undefined ? options.dailyLimit : config.costGuard.dailyLimit;
    this.monthlyLimit = options.monthlyLimit !== undefined ? options.monthlyLimit : config.costGuard.monthlyLimit;

    if (options.store) {
      this.store = options.store;
    } else if (config.costGuard.kvNamespaceId && config.cloudflare.accountId && config.cloudflare.apiToken) {
      this.store = new CloudflareKVCostGuardStore();
    } else {
      this.store = new InMemoryCostGuardStore();
    }
  }

  /**
   * Retrieves current daily usage for a given date (defaults to current UTC date).
   */
  async getDailyUsage(date: Date = new Date()): Promise<number> {
    const key = getDailyKey(date);
    return this.store.get(key);
  }

  /**
   * Retrieves current monthly usage for a given date (defaults to current UTC month).
   */
  async getMonthlyUsage(date: Date = new Date()): Promise<number> {
    const key = getMonthlyKey(date);
    return this.store.get(key);
  }

  /**
   * Evaluates whether an image generation request is permitted under configured quotas.
   */
  async canGenerateImage(date: Date = new Date()): Promise<CostGuardDecision> {
    const dailyUsage = await this.getDailyUsage(date);
    const monthlyUsage = await this.getMonthlyUsage(date);

    if (!this.enabled) {
      return {
        allowed: true,
        reason: 'GUARD_DISABLED',
        dailyUsage,
        monthlyUsage,
        dailyLimit: this.dailyLimit,
        monthlyLimit: this.monthlyLimit,
      };
    }

    if (dailyUsage >= this.dailyLimit) {
      return {
        allowed: false,
        reason: 'DAILY_LIMIT_EXCEEDED',
        dailyUsage,
        monthlyUsage,
        dailyLimit: this.dailyLimit,
        monthlyLimit: this.monthlyLimit,
      };
    }

    if (monthlyUsage >= this.monthlyLimit) {
      return {
        allowed: false,
        reason: 'MONTHLY_LIMIT_EXCEEDED',
        dailyUsage,
        monthlyUsage,
        dailyLimit: this.dailyLimit,
        monthlyLimit: this.monthlyLimit,
      };
    }

    return {
      allowed: true,
      dailyUsage,
      monthlyUsage,
      dailyLimit: this.dailyLimit,
      monthlyLimit: this.monthlyLimit,
    };
  }

  /**
   * Records a successful image generation, incrementing both daily and monthly counters.
   */
  async recordGeneration(
    date: Date = new Date(),
    amount = 1
  ): Promise<{ dailyUsage: number; monthlyUsage: number }> {
    const dailyKey = getDailyKey(date);
    const monthlyKey = getMonthlyKey(date);

    const [dailyUsage, monthlyUsage] = await Promise.all([
      this.store.increment(dailyKey, amount),
      this.store.increment(monthlyKey, amount),
    ]);

    return { dailyUsage, monthlyUsage };
  }
}
