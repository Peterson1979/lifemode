import type { PillarSlug } from '../../../config/site.ts';

/**
 * Supported data domains across the LifeMode Topic Data Layer.
 */
export type DataDomain =
  | 'news'
  | 'earthquakes'
  | 'weather'
  | 'fx'
  | 'economic'
  | 'nutrition'
  | 'tech_activity'
  | 'knowledge';

/**
 * Operational status of a data block.
 * - 'available': Fresh data successfully retrieved.
 * - 'stale_available': Cached data past fresh TTL, served within grace period with explicit stale indicator.
 * - 'unavailable': Data expired or provider failed with no cache fallback; non-breaking graceful state.
 * - 'error': Provider failed or malformed data detected without fallback.
 */
export type DataBlockStatus = 'available' | 'stale_available' | 'unavailable' | 'error';

/**
 * Freshness status classification.
 * - 'fresh': Fetched or verified within fresh TTL window.
 * - 'cached': Sourced from cache within fresh TTL window.
 * - 'stale': Past fresh TTL window, within grace period.
 * - 'expired': Past cache grace period; cannot be served as current.
 */
export type FreshnessStatus = 'fresh' | 'cached' | 'stale' | 'expired';

/**
 * Freshness metadata for transparent data age representation.
 */
export interface FreshnessMetadata {
  status: FreshnessStatus;
  fetchedAt: string; // ISO 8601 string
  sourceUpdatedAt?: string; // ISO 8601 string, only present if supplied by provider
  expiresAt: string; // ISO 8601 string
  ttlSeconds: number;
  ageSeconds: number;
  label: string; // Human-friendly description e.g. "Updated 12 min ago"
}

/**
 * Source provenance and attribution metadata.
 */
export interface DataSource {
  id: string;
  name: string;
  url?: string;
  attribution?: string;
  license?: string;
  isOfficial?: boolean;
}

/**
 * Error classifications for data layer operations.
 */
export type DataErrorCode =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'RATE_LIMITED'
  | 'MALFORMED_PAYLOAD'
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export interface DataFetchError {
  code: DataErrorCode;
  message: string;
  statusCode?: number;
  providerId: string;
  timestamp: string;
}

/**
 * Canonical normalized container for any data block in LifeMode.
 * UI components interact strictly with this structure, never provider-specific JSON.
 */
export interface TopicDataBlock<T = unknown> {
  id: string;
  pillar: PillarSlug;
  domain: DataDomain;
  title: string;
  subtitle?: string;
  status: DataBlockStatus;
  data: T | null;
  source: DataSource;
  freshness: FreshnessMetadata;
  error?: DataFetchError;
  metadata?: Record<string, unknown>;
}

/**
 * Options for configuring provider execution.
 */
export interface ProviderRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  customFetch?: typeof fetch;
  forceFresh?: boolean;
  apiKey?: string;
}

/**
 * Freshness window tier specification.
 */
export interface FreshnessTierConfig {
  freshTtlSeconds: number; // Duration during which data is considered 'fresh'
  graceTtlSeconds: number; // Additional duration during which data is served as 'stale'
}
