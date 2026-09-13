import type { PillarSlug } from '../types.ts';
import type { EvidenceSourceType, EvidenceReliability } from '../research/types.ts';

/**
 * The operational role of an editorial source.
 * - 'discovery': Source useful for detecting topics, signals, trends, discussions (not factual evidence).
 * - 'research': Source useful for authoritative factual grounding.
 * - 'both': Verified publisher/curated feed providing both discovery signals and secondary research context.
 */
export type SourceRole = 'discovery' | 'research' | 'both';

/**
 * Structured definition of a content or research source in LifeMode.
 */
export interface EditorialSourceDefinition {
  id: string;
  name: string;
  role: SourceRole;
  sourceType: EvidenceSourceType;
  reliability: EvidenceReliability;
  pillars: PillarSlug[];
  domains: string[]; // Domain identifiers, e.g. ['treasurydirect.gov'], ['huggingface.co']
  url?: string;
  feedUrl?: string;
  topics?: string[]; // Topic-matching keywords or subject areas
  description?: string;
  enabled: boolean;
  isDiscoveryOnly?: boolean; // True for community/trend signals that must NEVER be cited as factual evidence
}

/**
 * Curated topic evidence specification for high-authority domain patterns.
 */
export interface CuratedTopicEvidenceSpec {
  pillar: PillarSlug;
  keywords: string[];
  evidence: Array<{
    title: string;
    url: string;
    publisher: string;
    publishedAt?: string;
    claimSummary: string;
    sourceType: EvidenceSourceType;
    reliability: EvidenceReliability;
  }>;
}

/**
 * Health status classification for an operational source.
 * - 'healthy': Endpoint responding quickly (<3s) with valid structured content / status 200.
 * - 'degraded': High latency (>3s), transient single failure, or minor formatting issues.
 * - 'failed': Unreachable, timeout, HTTP 4xx/5xx, or consecutive parse failures.
 */
export type SourceHealthStatus = 'healthy' | 'degraded' | 'failed';

/**
 * Health and reliability telemetry record for a single source.
 */
export interface SourceHealthRecord {
  sourceId: string;
  checkedAt: string; // ISO 8601
  status: SourceHealthStatus;
  latencyMs: number;
  lastSuccessfulAt?: string;
  consecutiveFailures: number;
  statusCode?: number;
  errorType?: 'HTTP_ERROR' | 'TIMEOUT' | 'PARSE_ERROR' | 'NETWORK_ERROR' | 'INVALID_RESPONSE';
  errorMessage?: string;
  contentType?: string;
}

/**
 * Summary representation of an entire registry health check pass.
 */
export interface SourceHealthSummary {
  totalSources: number;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  checkedAt: string;
  records: Record<string, SourceHealthRecord>;
}

/**
 * Options for executing source health checks.
 */
export interface HealthCheckOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  degradedLatencyThresholdMs?: number;
  maxConsecutiveFailuresForFailed?: number;
  storagePath?: string;
  saveToStorage?: boolean;
}

