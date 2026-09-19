import type { TopicDataBlock, FreshnessStatus, DataBlockStatus } from '../types/core.ts';
import { DOMAIN_FRESHNESS_POLICIES, formatFreshnessLabel } from './policies.ts';

interface CacheEntry<T = unknown> {
  block: TopicDataBlock<T>;
  cachedAtMs: number;
  freshUntilMs: number;
  staleUntilMs: number;
}

export interface CacheLookupResult<T = unknown> {
  hit: boolean;
  isStale: boolean;
  isExpired: boolean;
  block: TopicDataBlock<T> | null;
}

/**
 * Memory and Edge-ready cache for LifeMode Topic Data Layer.
 * Implements strict multi-tier TTLs and explicit freshness marking.
 */
export class TopicDataCache {
  private store: Map<string, CacheEntry> = new Map();

  /**
   * Generates a cache key for a domain and optional discriminator.
   */
  public makeKey(domain: string, identifier: string = 'default'): string {
    return `${domain}:${identifier}`;
  }

  /**
   * Retrieves an item from the cache and computes real-time freshness.
   */
  public get<T = unknown>(key: string, nowMs: number = Date.now()): CacheLookupResult<T> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return { hit: false, isStale: false, isExpired: false, block: null };
    }

    const { block, freshUntilMs, staleUntilMs } = entry;
    const isFresh = nowMs <= freshUntilMs;
    const isStale = nowMs > freshUntilMs && nowMs <= staleUntilMs;
    const isExpired = nowMs > staleUntilMs;

    if (isExpired) {
      // Evict expired entry
      this.store.delete(key);
      return { hit: false, isStale: false, isExpired: true, block: null };
    }

    const freshnessStatus: FreshnessStatus = isFresh ? 'cached' : 'stale';
    const blockStatus: DataBlockStatus = isFresh ? 'available' : 'stale_available';
    const ageSeconds = Math.max(0, Math.floor((nowMs - new Date(block.freshness.fetchedAt).getTime()) / 1000));

    const updatedBlock: TopicDataBlock<T> = {
      ...block,
      status: blockStatus,
      freshness: {
        ...block.freshness,
        status: freshnessStatus,
        ageSeconds,
        label: formatFreshnessLabel(
          block.freshness.fetchedAt,
          freshnessStatus,
          block.freshness.sourceUpdatedAt,
          nowMs
        ),
      },
    };

    return {
      hit: true,
      isStale,
      isExpired: false,
      block: updatedBlock,
    };
  }

  /**
   * Sets an item in the cache with the domain's policy durations.
   */
  public set<T = unknown>(
    key: string,
    block: TopicDataBlock<T>,
    customFreshTtlSeconds?: number,
    nowMs: number = Date.now()
  ): TopicDataBlock<T> {
    const policy = DOMAIN_FRESHNESS_POLICIES[block.domain] || {
      freshTtlSeconds: 3600,
      graceTtlSeconds: 7200,
    };

    const freshTtl = customFreshTtlSeconds ?? policy.freshTtlSeconds;
    const freshUntilMs = nowMs + freshTtl * 1000;
    const staleUntilMs = freshUntilMs + policy.graceTtlSeconds * 1000;

    const expiresAtIso = new Date(freshUntilMs).toISOString();

    const normalizedBlock: TopicDataBlock<T> = {
      ...block,
      freshness: {
        ...block.freshness,
        expiresAt: expiresAtIso,
        ttlSeconds: freshTtl,
        ageSeconds: 0,
        status: 'fresh',
        label: formatFreshnessLabel(
          block.freshness.fetchedAt,
          'fresh',
          block.freshness.sourceUpdatedAt,
          nowMs
        ),
      },
    };

    this.store.set(key, {
      block: normalizedBlock as TopicDataBlock<unknown>,
      cachedAtMs: nowMs,
      freshUntilMs,
      staleUntilMs,
    });

    return normalizedBlock;
  }

  /**
   * Clear all cached data or a specific domain.
   */
  public clear(domainPrefix?: string): void {
    if (!domainPrefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(`${domainPrefix}:`)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Size of active entries in cache.
   */
  public size(): number {
    return this.store.size;
  }
}

// Global singleton cache instance for runtime reuse
export const globalTopicDataCache = new TopicDataCache();
