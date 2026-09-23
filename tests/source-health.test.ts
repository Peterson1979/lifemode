import test from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import {
  checkSingleSourceHealth,
  checkRegistryHealth,
  loadHealthRecords,
  saveHealthRecords,
  getHealthPreferenceModifier,
  sortSourcesByHealth,
} from '../src/lib/editorial/sources/health.ts';
import { calculateEvidenceScore } from '../src/lib/editorial/research/providers/web.ts';
import type { EditorialSourceDefinition, SourceHealthRecord } from '../src/lib/editorial/sources/types.ts';
import type { EvidenceItem } from '../src/lib/editorial/research/types.ts';

const VALID_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Dezeen Architecture</title>
    <link>https://www.dezeen.com</link>
    <item>
      <title>Modern Sukiya Living in Kamakura</title>
      <link>https://www.dezeen.com/2026/02/10/sukiya-living/</link>
      <pubDate>Mon, 10 Feb 2026 09:00:00 GMT</pubDate>
      <description>Minimalist timber architecture.</description>
    </item>
  </channel>
</rss>`;

const MALFORMED_XML = `<html><body><h1>502 Bad Gateway</h1><p>Not an RSS feed</p></body></html>`;

const mockSource: EditorialSourceDefinition = {
  id: 'dezeen-test',
  name: 'Dezeen Architecture',
  role: 'both',
  sourceType: 'reputable_media',
  reliability: 'high',
  pillars: ['entertainment'],
  domains: ['dezeen.com'],
  feedUrl: 'https://www.dezeen.com/feed/',
  url: 'https://www.dezeen.com',
  enabled: true,
};

test('1. Successful RSS health check returns healthy status, measured latency, and sets lastSuccessfulAt', async () => {
  const mockFetch = async () =>
    new Response(VALID_RSS_XML, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml' },
    });

  const record = await checkSingleSourceHealth(mockSource, undefined, {
    fetchFn: mockFetch as typeof fetch,
    timeoutMs: 3000,
  });

  assert.equal(record.sourceId, 'dezeen-test');
  assert.equal(record.status, 'healthy');
  assert.equal(record.statusCode, 200);
  assert.equal(record.consecutiveFailures, 0);
  assert.ok(record.latencyMs >= 0);
  assert.ok(record.lastSuccessfulAt);
});

test('2. Failed/timeout source marks status as degraded initially and failed upon repeated failures', async () => {
  const timeoutFetch = async () => {
    const err: any = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  };

  // First failure: marks as degraded
  const firstRecord = await checkSingleSourceHealth(mockSource, undefined, {
    fetchFn: timeoutFetch as typeof fetch,
  });

  assert.equal(firstRecord.status, 'degraded');
  assert.equal(firstRecord.consecutiveFailures, 1);
  assert.equal(firstRecord.errorType, 'TIMEOUT');

  // Second failure: transitions to failed
  const secondRecord = await checkSingleSourceHealth(mockSource, firstRecord, {
    fetchFn: timeoutFetch as typeof fetch,
    maxConsecutiveFailuresForFailed: 2,
  });

  assert.equal(secondRecord.status, 'failed');
  assert.equal(secondRecord.consecutiveFailures, 2);
  assert.equal(secondRecord.errorType, 'TIMEOUT');
});

test('3. Malformed or empty RSS feed response is classified with PARSE_ERROR', async () => {
  const malformedFetch = async () =>
    new Response(MALFORMED_XML, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });

  const record = await checkSingleSourceHealth(mockSource, undefined, {
    fetchFn: malformedFetch as typeof fetch,
  });

  assert.equal(record.status, 'degraded');
  assert.equal(record.errorType, 'PARSE_ERROR');
  assert.ok(record.errorMessage?.includes('Malformed') || record.errorMessage?.includes('XML'));
});

test('4. Latency threshold classification marks high-latency endpoints as degraded', async () => {
  const slowFetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return new Response(VALID_RSS_XML, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml' },
    });
  };

  const record = await checkSingleSourceHealth(mockSource, undefined, {
    fetchFn: slowFetch as typeof fetch,
    degradedLatencyThresholdMs: 20, // Low threshold to force degraded
  });

  assert.equal(record.status, 'degraded');
  assert.equal(record.consecutiveFailures, 0);
});

test('5. Successful check after failure resets consecutiveFailures to 0 and preserves recovery', async () => {
  const failingRecord: SourceHealthRecord = {
    sourceId: 'dezeen-test',
    checkedAt: '2026-02-10T08:00:00.000Z',
    status: 'failed',
    latencyMs: 5000,
    consecutiveFailures: 4,
    lastSuccessfulAt: '2026-02-09T08:00:00.000Z',
    errorType: 'TIMEOUT',
  };

  const successFetch = async () =>
    new Response(VALID_RSS_XML, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml' },
    });

  const recovered = await checkSingleSourceHealth(mockSource, failingRecord, {
    fetchFn: successFetch as typeof fetch,
  });

  assert.equal(recovered.status, 'healthy');
  assert.equal(recovered.consecutiveFailures, 0);
  assert.ok(recovered.lastSuccessfulAt);
  assert.notEqual(recovered.lastSuccessfulAt, failingRecord.lastSuccessfulAt);
});

test('6. Health preference modifier rewards healthy sources over degraded and failed sources within same authority tier', () => {
  const healthyMod = getHealthPreferenceModifier('healthy');
  const degradedMod = getHealthPreferenceModifier('degraded');
  const failedMod = getHealthPreferenceModifier('failed');

  assert.ok(healthyMod > degradedMod, 'Healthy modifier must exceed degraded modifier');
  assert.ok(degradedMod > failedMod, 'Degraded modifier must exceed failed modifier');

  const itemMediaA: EvidenceItem = {
    title: 'Healthy Publisher Report',
    url: 'https://news-a.example.com/report',
    publisher: 'Publisher A',
    publishedAt: '2026-02-01T00:00:00.000Z',
    accessedAt: '2026-02-10T09:00:00.000Z',
    claimSummary: 'Verified reporting on market trends.',
    sourceType: 'reputable_media',
    reliability: 'high',
  };

  const itemMediaB: EvidenceItem = {
    title: 'Failed Publisher Report',
    url: 'https://news-b.example.com/report',
    publisher: 'Publisher B',
    publishedAt: '2026-02-01T00:00:00.000Z',
    accessedAt: '2026-02-10T09:00:00.000Z',
    claimSummary: 'Verified reporting on market trends.',
    sourceType: 'reputable_media',
    reliability: 'high',
  };

  const scoreHealthy = calculateEvidenceScore(itemMediaA, false, 'healthy');
  const scoreFailed = calculateEvidenceScore(itemMediaB, false, 'failed');

  assert.ok(scoreHealthy > scoreFailed, `Healthy score (${scoreHealthy}) must exceed failed score (${scoreFailed})`);
});

test('7. Authority classification strictly outranks health status (failed government outranks healthy media)', () => {
  const itemGov: EvidenceItem = {
    title: 'U.S. Treasury Guidance',
    url: 'https://treasurydirect.gov/marketable-securities',
    publisher: 'U.S. Department of the Treasury',
    publishedAt: '2026-01-01T00:00:00.000Z',
    accessedAt: '2026-02-10T09:00:00.000Z',
    claimSummary: 'Statutory treasury bill guidelines and auction mechanics.',
    sourceType: 'government',
    reliability: 'high',
  };

  const itemAcademic: EvidenceItem = {
    title: 'NCBI Circadian Study',
    url: 'https://ncbi.nlm.nih.gov/pmc/articles/12345',
    publisher: 'NCBI NIH',
    publishedAt: '2026-01-01T00:00:00.000Z',
    accessedAt: '2026-02-10T09:00:00.000Z',
    claimSummary: 'Peer-reviewed clinical mechanisms of circadian architecture.',
    sourceType: 'academic',
    reliability: 'high',
  };

  const itemMedia: EvidenceItem = {
    title: 'Healthy Media Overview',
    url: 'https://nytimes.com/tech-article',
    publisher: 'The New York Times',
    publishedAt: '2026-01-01T00:00:00.000Z',
    accessedAt: '2026-02-10T09:00:00.000Z',
    claimSummary: 'Journalistic overview with high completeness.',
    sourceType: 'reputable_media',
    reliability: 'high',
  };

  // Even if Government is failed and Media is healthy:
  const scoreFailedGov = calculateEvidenceScore(itemGov, false, 'failed');
  const scoreHealthyMedia = calculateEvidenceScore(itemMedia, false, 'healthy');
  const scoreFailedAcademic = calculateEvidenceScore(itemAcademic, false, 'failed');

  assert.ok(
    scoreFailedGov > scoreHealthyMedia,
    `Failed Gov score (${scoreFailedGov}) must still exceed Healthy Media score (${scoreHealthyMedia})`
  );
  assert.ok(
    scoreFailedAcademic > scoreHealthyMedia,
    `Failed Academic score (${scoreFailedAcademic}) must still exceed Healthy Media score (${scoreHealthyMedia})`
  );
});

test('8. Persistence correctly saves and restores health records across storage cycles', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-health-test-'));
  const storagePath = path.join(tmpDir, 'health.json');

  try {
    const records: Record<string, SourceHealthRecord> = {
      'treasurydirect': {
        sourceId: 'treasurydirect',
        checkedAt: '2026-02-10T09:00:00.000Z',
        status: 'healthy',
        latencyMs: 120,
        consecutiveFailures: 0,
        lastSuccessfulAt: '2026-02-10T09:00:00.000Z',
      },
      'failing-feed': {
        sourceId: 'failing-feed',
        checkedAt: '2026-02-10T09:00:00.000Z',
        status: 'failed',
        latencyMs: 5000,
        consecutiveFailures: 3,
        errorType: 'TIMEOUT',
      },
    };

    await saveHealthRecords(records, storagePath);
    const loaded = await loadHealthRecords(storagePath);

    assert.equal(Object.keys(loaded).length, 2);
    assert.equal(loaded['treasurydirect'].status, 'healthy');
    assert.equal(loaded['failing-feed'].status, 'failed');
    assert.equal(loaded['failing-feed'].consecutiveFailures, 3);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('9. sortSourcesByHealth orders sources accurately by operational reliability', () => {
  const sourceA: EditorialSourceDefinition = { ...mockSource, id: 'source-a', name: 'Source A' };
  const sourceB: EditorialSourceDefinition = { ...mockSource, id: 'source-b', name: 'Source B' };
  const sourceC: EditorialSourceDefinition = { ...mockSource, id: 'source-c', name: 'Source C' };

  const healthMap: Record<string, SourceHealthRecord> = {
    'source-a': { sourceId: 'source-a', checkedAt: '', status: 'failed', latencyMs: 0, consecutiveFailures: 3 },
    'source-b': { sourceId: 'source-b', checkedAt: '', status: 'healthy', latencyMs: 100, consecutiveFailures: 0 },
    'source-c': { sourceId: 'source-c', checkedAt: '', status: 'degraded', latencyMs: 3500, consecutiveFailures: 1 },
  };

  const sorted = sortSourcesByHealth([sourceA, sourceB, sourceC], healthMap);

  assert.equal(sorted[0].id, 'source-b', 'Healthy source must sort first');
  assert.equal(sorted[1].id, 'source-c', 'Degraded source must sort second');
  assert.equal(sorted[2].id, 'source-a', 'Failed source must sort last');
});

test('10. checkRegistryHealth aggregates multiple sources safely with error isolation', async () => {
  const mockFetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('fail')) {
      throw new Error('Connection refused');
    }
    return new Response(VALID_RSS_XML, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml' },
    });
  };

  const sources: EditorialSourceDefinition[] = [
    { ...mockSource, id: 'healthy-1', feedUrl: 'https://example.com/feed-1' },
    { ...mockSource, id: 'failing-1', feedUrl: 'https://example.com/fail-1' },
    { ...mockSource, id: 'healthy-2', feedUrl: 'https://example.com/feed-2' },
  ];

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-summary-test-'));
  const storagePath = path.join(tmpDir, 'health-summary.json');

  try {
    const summary = await checkRegistryHealth(sources, {
      fetchFn: mockFetch as typeof fetch,
      storagePath,
      saveToStorage: true,
    });

    assert.equal(summary.totalSources, 3);
    assert.equal(summary.healthyCount, 2);
    assert.equal(summary.degradedCount, 1);
    assert.equal(summary.failedCount, 0);

    const loaded = await loadHealthRecords(storagePath);
    assert.equal(Object.keys(loaded).length, 3);
    assert.equal(loaded['healthy-1'].status, 'healthy');
    assert.equal(loaded['failing-1'].status, 'degraded');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
