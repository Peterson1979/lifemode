import type { DataDomain, FreshnessTierConfig } from '../types/core.ts';

/**
 * Freshness and caching window configurations per data domain.
 * Durations are in seconds.
 */
export const DOMAIN_FRESHNESS_POLICIES: Record<DataDomain, FreshnessTierConfig> = {
  // Current / Live data
  earthquakes: {
    freshTtlSeconds: 10 * 60, // 10 minutes fresh
    graceTtlSeconds: 50 * 60, // 50 minutes stale grace (up to 1h total)
  },
  weather: {
    freshTtlSeconds: 30 * 60, // 30 minutes fresh
    graceTtlSeconds: 90 * 60, // 90 minutes stale grace (up to 2h total)
  },
  air_quality: {
    freshTtlSeconds: 30 * 60, // 30 minutes fresh
    graceTtlSeconds: 90 * 60, // 90 minutes stale grace (up to 2h total)
  },

  // Frequently updated reference data
  fx: {
    freshTtlSeconds: 4 * 3600, // 4 hours fresh
    graceTtlSeconds: 20 * 3600, // 20 hours stale grace (up to 24h total)
  },
  tech_activity: {
    freshTtlSeconds: 6 * 3600, // 6 hours fresh
    graceTtlSeconds: 42 * 3600, // 42 hours stale grace (up to 48h total)
  },

  // Stable reference data
  economic: {
    freshTtlSeconds: 7 * 24 * 3600, // 7 days fresh
    graceTtlSeconds: 23 * 24 * 3600, // 23 days stale grace (up to 30d total)
  },
  nutrition: {
    freshTtlSeconds: 7 * 24 * 3600, // 7 days fresh
    graceTtlSeconds: 23 * 24 * 3600, // 23 days stale grace (up to 30d total)
  },
  knowledge: {
    freshTtlSeconds: 3 * 24 * 3600, // 3 days fresh
    graceTtlSeconds: 11 * 24 * 3600, // 11 days stale grace (up to 14d total)
  },
};

/**
 * Formats a human-readable freshness label given timestamps and status.
 */
export function formatFreshnessLabel(
  fetchedAtIso: string,
  status: 'fresh' | 'cached' | 'stale' | 'expired',
  sourceUpdatedAtIso?: string,
  nowMs: number = Date.now()
): string {
  if (status === 'expired') {
    return 'Data temporarily unavailable';
  }

  const fetchedMs = new Date(fetchedAtIso).getTime();
  const diffSec = Math.max(0, Math.floor((nowMs - fetchedMs) / 1000));

  if (sourceUpdatedAtIso) {
    const sourceMs = new Date(sourceUpdatedAtIso).getTime();
    const sourceDiffMinutes = Math.floor((nowMs - sourceMs) / 60000);
    if (sourceDiffMinutes < 60) {
      const mins = Math.max(1, sourceDiffMinutes);
      return status === 'stale'
        ? `Source updated ${mins} min ago (cached)`
        : `Source updated ${mins} min ago`;
    }
  }

  if (diffSec < 60) {
    return status === 'stale' ? 'Updated just now · data may be outdated' : 'Updated just now';
  }

  const diffMinutes = Math.floor(diffSec / 60);
  if (diffMinutes < 60) {
    return status === 'stale'
      ? `Updated ${diffMinutes} min ago · data may be outdated`
      : `Updated ${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return status === 'stale'
      ? `Updated ${diffHours}h ago · data may be outdated`
      : `Updated ${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return status === 'stale'
    ? `Updated ${diffDays}d ago · archived reference`
    : `Updated ${diffDays}d ago`;
}
