import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import type { EditorialSourceDefinition, SourceHealthRecord, SourceHealthSummary, SourceHealthStatus, HealthCheckOptions } from './types.ts';
import { SOURCE_REGISTRY } from './registry.ts';
import { parseXmlFeed } from '../discovery/parsers/xml-feed-parser.ts';

export const DEFAULT_HEALTH_STORAGE_DIR = resolve(process.cwd(), 'data/sources');
export const DEFAULT_HEALTH_STORAGE_PATH = join(DEFAULT_HEALTH_STORAGE_DIR, 'health.json');

/**
 * Loads persisted source health records from disk.
 */
export async function loadHealthRecords(
  filePath: string = DEFAULT_HEALTH_STORAGE_PATH
): Promise<Record<string, SourceHealthRecord>> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.records && typeof parsed.records === 'object') {
        return parsed.records as Record<string, SourceHealthRecord>;
      }
      return parsed as Record<string, SourceHealthRecord>;
    }
    return {};
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {};
    }
    return {};
  }
}

/**
 * Persists source health summary or records to disk.
 */
export async function saveHealthRecords(
  summaryOrRecords: SourceHealthSummary | Record<string, SourceHealthRecord>,
  filePath: string = DEFAULT_HEALTH_STORAGE_PATH
): Promise<void> {
  try {
    await mkdir(dirname(filePath), { recursive: true });
    const formatted = JSON.stringify(summaryOrRecords, null, 2);
    await writeFile(filePath, formatted, 'utf-8');
  } catch {
    // Non-critical persistence failure: health records operate in-memory if disk is unavailable
  }
}

/**
 * Executes a lightweight, bounded health check for an individual source.
 */
export async function checkSingleSourceHealth(
  source: EditorialSourceDefinition,
  previousRecord?: SourceHealthRecord,
  options: HealthCheckOptions = {}
): Promise<SourceHealthRecord> {
  const now = new Date().toISOString();
  const fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs || 5000;
  const degradedLatencyMs = options.degradedLatencyThresholdMs || 3000;
  const failureThreshold = options.maxConsecutiveFailuresForFailed || 2;

  // 1. Identify target endpoint (prefer feedUrl for publishers, otherwise url)
  const targetUrl = source.feedUrl || source.url;

  // If source has no direct URL endpoint (e.g. domain-only or credential-isolated signal), treat as statically healthy
  if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
    return {
      sourceId: source.id,
      checkedAt: now,
      status: 'healthy',
      latencyMs: 0,
      lastSuccessfulAt: previousRecord?.lastSuccessfulAt || now,
      consecutiveFailures: 0,
    };
  }

  const startTime = Date.now();

  try {
    let signal: AbortSignal | undefined;
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signal = AbortSignal.timeout(timeoutMs);
    }

    const isFeed = Boolean(source.feedUrl);
    const headers: Record<string, string> = {
      'User-Agent': 'LifeMode-HealthCheck/1.0 (+https://lifemode.life; editorial@lifemode.life)',
      Accept: isFeed
        ? 'application/rss+xml, application/xml, text/xml, */*'
        : 'text/html, application/xhtml+xml, */*',
    };

    const response = await fetchFn(targetUrl, {
      method: 'GET',
      headers,
      signal,
    });

    const latencyMs = Date.now() - startTime;
    const statusCode = response.status;
    const contentType = response.headers.get('content-type') || undefined;

    if (!response.ok) {
      const consecutiveFailures = (previousRecord?.consecutiveFailures || 0) + 1;
      const status: SourceHealthStatus = consecutiveFailures >= failureThreshold ? 'failed' : 'degraded';
      return {
        sourceId: source.id,
        checkedAt: now,
        status,
        latencyMs,
        statusCode,
        contentType,
        consecutiveFailures,
        errorType: 'HTTP_ERROR',
        errorMessage: `HTTP ${statusCode} ${response.statusText}`,
        lastSuccessfulAt: previousRecord?.lastSuccessfulAt,
      };
    }

    // If source is an RSS feed, validate that body contains parseable feed items
    if (isFeed) {
      const xmlBody = await response.text();
      if (!xmlBody || xmlBody.trim().length === 0) {
        const consecutiveFailures = (previousRecord?.consecutiveFailures || 0) + 1;
        const status: SourceHealthStatus = consecutiveFailures >= failureThreshold ? 'failed' : 'degraded';
        return {
          sourceId: source.id,
          checkedAt: now,
          status,
          latencyMs,
          statusCode,
          contentType,
          consecutiveFailures,
          errorType: 'PARSE_ERROR',
          errorMessage: 'Empty RSS feed response body',
          lastSuccessfulAt: previousRecord?.lastSuccessfulAt,
        };
      }

      const parsed = parseXmlFeed(xmlBody);
      if ((!parsed.items || parsed.items.length === 0) && !parsed.title) {
        const consecutiveFailures = (previousRecord?.consecutiveFailures || 0) + 1;
        const status: SourceHealthStatus = consecutiveFailures >= failureThreshold ? 'failed' : 'degraded';
        return {
          sourceId: source.id,
          checkedAt: now,
          status,
          latencyMs,
          statusCode,
          contentType,
          consecutiveFailures,
          errorType: 'PARSE_ERROR',
          errorMessage: 'Malformed XML or no channel items detected in feed',
          lastSuccessfulAt: previousRecord?.lastSuccessfulAt,
        };
      }
    }

    // Success response: classify healthy vs degraded based on latency
    const status: SourceHealthStatus = latencyMs > degradedLatencyMs ? 'degraded' : 'healthy';

    return {
      sourceId: source.id,
      checkedAt: now,
      status,
      latencyMs,
      statusCode,
      contentType,
      consecutiveFailures: 0,
      lastSuccessfulAt: now,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const isTimeout =
      error?.name === 'TimeoutError' ||
      error?.name === 'AbortError' ||
      (error?.message && error.message.toLowerCase().includes('timeout'));

    const consecutiveFailures = (previousRecord?.consecutiveFailures || 0) + 1;
    const status: SourceHealthStatus = consecutiveFailures >= failureThreshold ? 'failed' : 'degraded';

    return {
      sourceId: source.id,
      checkedAt: now,
      status,
      latencyMs,
      consecutiveFailures,
      errorType: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      errorMessage: error?.message || 'Upstream network fetch error',
      lastSuccessfulAt: previousRecord?.lastSuccessfulAt,
    };
  }
}

/**
 * Runs a batch health check across all or selected registry sources.
 */
export async function checkRegistryHealth(
  sources: EditorialSourceDefinition[] = SOURCE_REGISTRY.filter((s) => s.enabled),
  options: HealthCheckOptions = {}
): Promise<SourceHealthSummary> {
  const now = new Date().toISOString();
  const previousRecords = await loadHealthRecords(options.storagePath || DEFAULT_HEALTH_STORAGE_PATH);

  const checkPromises = sources.map(async (source) => {
    const prev = previousRecords[source.id];
    return checkSingleSourceHealth(source, prev, options);
  });

  const results = await Promise.all(checkPromises);

  const records: Record<string, SourceHealthRecord> = { ...previousRecords };
  let healthyCount = 0;
  let degradedCount = 0;
  let failedCount = 0;

  for (const record of results) {
    records[record.sourceId] = record;
    if (record.status === 'healthy') healthyCount++;
    else if (record.status === 'degraded') degradedCount++;
    else if (record.status === 'failed') failedCount++;
  }

  const summary: SourceHealthSummary = {
    totalSources: sources.length,
    healthyCount,
    degradedCount,
    failedCount,
    checkedAt: now,
    records,
  };

  if (options.saveToStorage !== false) {
    await saveHealthRecords(summary, options.storagePath || DEFAULT_HEALTH_STORAGE_PATH);
  }

  return summary;
}

/**
 * Returns a minor score modifier based on source health status.
 * Notice: The modifier scale (-15 to 0) is deliberately small so it NEVER
 * overrides the 25+ point base authority gap between tiers.
 */
export function getHealthPreferenceModifier(status?: SourceHealthStatus): number {
  switch (status) {
    case 'healthy':
      return 0; // Healthy baseline
    case 'degraded':
      return -5; // Slight penalty for high latency / transient issues
    case 'failed':
      return -15; // Penalty for unavailable endpoints
    default:
      return 0; // Unchecked / static sources get baseline
  }
}

/**
 * Sorts sources by authority and health status.
 */
export function sortSourcesByHealth(
  sources: EditorialSourceDefinition[],
  healthRecords?: Record<string, SourceHealthRecord>
): EditorialSourceDefinition[] {
  if (!healthRecords) return [...sources];

  return [...sources].sort((a, b) => {
    const aStatus = healthRecords[a.id]?.status || 'healthy';
    const bStatus = healthRecords[b.id]?.status || 'healthy';

    const aScore = aStatus === 'healthy' ? 3 : aStatus === 'degraded' ? 2 : 1;
    const bScore = bStatus === 'healthy' ? 3 : bStatus === 'degraded' ? 2 : 1;

    return bScore - aScore;
  });
}
