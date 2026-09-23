import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  FilesystemPerformanceStore,
  calculatePerformanceScore,
  aggregateFeedbackSignals,
  evaluateTopicPerformanceFeedback,
  FixturePerformanceProvider,
  selectEditorialCandidates,
  type ArticlePerformanceRecord,
  type EditorialTopic,
  type PillarSlug,
} from '../src/lib/editorial/index.ts';

async function createTempStoragePath(name = 'perf-test-'): Promise<{
  storagePath: string;
  cleanup: () => Promise<void>;
}> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), name));
  const storagePath = path.join(tmpDir, 'data', 'editorial', 'performance.json');
  const cleanup = async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  };
  return { storagePath, cleanup };
}

function createDummyTopic(
  id: string,
  canonicalTopic: string,
  pillar: PillarSlug,
  totalScore: number,
  overrides: Partial<EditorialTopic> = {}
): EditorialTopic {
  return {
    id,
    canonicalTopic,
    slug: canonicalTopic.toLowerCase().replace(/\s+/g, '-'),
    pillar,
    sourceSignals: [],
    queryVariants: [canonicalTopic],
    scoring: {
      searchPotential: totalScore,
      pinterestPotential: totalScore,
      socialPotential: totalScore,
      lifeModeRelevance: totalScore,
      commercialPotential: totalScore,
      freshness: totalScore,
      competitionOpportunity: totalScore,
      originalityPotential: totalScore,
    },
    totalScore,
    priorityTier: totalScore >= 80 ? 'CANDIDATE' : totalScore >= 60 ? 'LOW_PRIORITY' : 'REJECT',
    opportunityType: 'ARTICLE',
    status: 'BRIEF_READY',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [pillar, 'editorial'],
    ...overrides,
  };
}

test('1. Empty performance store: Gracefully returns empty array on nonexistent file', async () => {
  const { storagePath, cleanup } = await createTempStoragePath();
  try {
    const store = new FilesystemPerformanceStore({ storagePath });
    const records = await store.loadRecords();
    assert.deepEqual(records, []);

    const single = await store.getRecordBySlug('nonexistent/article');
    assert.equal(single, null);
  } finally {
    await cleanup();
  }
});

test('2. Upsert & Read: Persists records and allows metric updates with deterministic serialization', async () => {
  const { storagePath, cleanup } = await createTempStoragePath();
  try {
    const store = new FilesystemPerformanceStore({ storagePath });

    const sampleRecord: ArticlePerformanceRecord = {
      articleSlug: 'travel/nordic-sauna-architecture',
      topicId: 'top-travel-101',
      pillar: 'travel',
      format: 'guide',
      publicationDate: '2026-09-01',
      primaryIntent: 'informational',
      metrics: {
        views: 1200,
        clicks: 85,
        ctr: 0.07,
        engagement: 82,
      },
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['travel', 'architecture', 'nordic'],
    };

    await store.upsertRecord(sampleRecord);

    const loaded = await store.getRecordBySlug('travel/nordic-sauna-architecture');
    assert.ok(loaded);
    assert.equal(loaded.pillar, 'travel');
    assert.equal(loaded.metrics.views, 1200);

    // Update metrics
    await store.updateMetrics('travel/nordic-sauna-architecture', {
      views: 1500,
      conversions: 12,
    });

    const updated = await store.getRecordBySlug('travel/nordic-sauna-architecture');
    assert.ok(updated);
    assert.equal(updated.metrics.views, 1500);
    assert.equal(updated.metrics.clicks, 85);
    assert.equal(updated.metrics.conversions, 12);
  } finally {
    await cleanup();
  }
});

test('3. Partial Metrics: Missing metrics are not treated as zero; score only weights present data', () => {
  // Only views metric present
  const viewsOnly = calculatePerformanceScore({ views: 1000 });
  assert.equal(viewsOnly.evaluatedDimensions.length, 1);
  assert.ok(viewsOnly.overallScore >= 70 && viewsOnly.overallScore <= 80);
  assert.ok(viewsOnly.confidence > 0 && viewsOnly.confidence < 0.5);

  // Missing conversion or affiliate data should NOT penalize the views score to 0
  const richData = calculatePerformanceScore({
    views: 1000,
    clicks: 50,
    ctr: 0.05,
    engagement: 80,
  });
  assert.equal(richData.evaluatedDimensions.length, 4);
  assert.ok(richData.overallScore >= 70 && richData.overallScore <= 85);
  assert.ok(richData.confidence >= 0.5);

  // Empty metrics returns neutral baseline
  const emptyMetrics = calculatePerformanceScore({});
  assert.equal(emptyMetrics.overallScore, 50);
  assert.equal(emptyMetrics.confidence, 0);
  assert.equal(emptyMetrics.evaluatedDimensions.length, 0);
});

test('4. Insufficient Sample Size: Categories with n < 3 produce INSUFFICIENT_DATA and zero modifier', () => {
  // Only 1 record in travel pillar (n = 1 < minSample 3)
  const records: ArticlePerformanceRecord[] = [
    {
      articleSlug: 'travel/isolated-viral-hit',
      topicId: 'top-1',
      pillar: 'travel',
      publicationDate: '2026-09-01',
      metrics: { views: 50000, conversions: 200 }, // huge viral spike
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['travel'],
    },
  ];

  const signals = aggregateFeedbackSignals(records, { minSampleSize: 3 });
  assert.equal(signals.byPillar.travel?.status, 'INSUFFICIENT_DATA');
  assert.equal(signals.byPillar.travel?.sampleSize, 1);

  // Evaluating a travel candidate must yield scoreAdjustment = 0 to prevent overfitting
  const topic = createDummyTopic('cand-travel', 'New Travel Opportunity', 'travel', 85);
  const feedback = evaluateTopicPerformanceFeedback(topic, signals);

  assert.equal(feedback.scoreAdjustment, 0);
  assert.equal(feedback.confidence, 0);
  assert.ok(feedback.reasons[0].includes('No significant historical performance feedback'));
});

test('5. Strong Positive Feedback: Categories with n >= 3 and high avg score boost topic ranking (+1 to +10)', () => {
  const records: ArticlePerformanceRecord[] = [
    {
      articleSlug: 'tech-ai/article-1',
      topicId: 'top-t1',
      pillar: 'tech-ai',
      primaryIntent: 'informational',
      publicationDate: '2026-09-01',
      metrics: { views: 3500, clicks: 180, engagement: 85 },
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['ai-tools'],
    },
    {
      articleSlug: 'tech-ai/article-2',
      topicId: 'top-t2',
      pillar: 'tech-ai',
      primaryIntent: 'informational',
      publicationDate: '2026-09-02',
      metrics: { views: 4200, clicks: 210, engagement: 88 },
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['ai-tools'],
    },
    {
      articleSlug: 'tech-ai/article-3',
      topicId: 'top-t3',
      pillar: 'tech-ai',
      primaryIntent: 'informational',
      publicationDate: '2026-09-03',
      metrics: { views: 3100, clicks: 160, engagement: 80 },
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['ai-tools'],
    },
  ];

  const signals = aggregateFeedbackSignals(records, { minSampleSize: 3 });
  assert.equal(signals.byPillar['tech-ai']?.status, 'HIGH_PERFORMING');
  assert.ok(signals.byPillar['tech-ai']!.averageScore >= 80);

  const topic = createDummyTopic('cand-ai-next', 'Autonomous Agent Architecture', 'tech-ai', 85, {
    primaryIntent: 'informational',
    tags: ['ai-tools'],
  });

  const feedback = evaluateTopicPerformanceFeedback(topic, signals);
  assert.ok(feedback.scoreAdjustment > 0);
  assert.ok(feedback.scoreAdjustment <= 10);
  assert.ok(feedback.reasons.some((r) => r.includes('high-performing')));
});

test('6. Negative Feedback: Categories with n >= 3 and low avg score modestly reduce ranking (-1 to -8)', () => {
  const records: ArticlePerformanceRecord[] = [
    {
      articleSlug: 'money/crypto-1',
      topicId: 'top-m1',
      pillar: 'money',
      primaryIntent: 'commercial',
      publicationDate: '2026-09-01',
      metrics: { views: 8, clicks: 0, engagement: 20 },
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['crypto'],
    },
    {
      articleSlug: 'money/crypto-2',
      topicId: 'top-m2',
      pillar: 'money',
      primaryIntent: 'commercial',
      publicationDate: '2026-09-02',
      metrics: { views: 12, clicks: 1, engagement: 25 },
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['crypto'],
    },
    {
      articleSlug: 'money/crypto-3',
      topicId: 'top-m3',
      pillar: 'money',
      primaryIntent: 'commercial',
      publicationDate: '2026-09-03',
      metrics: { views: 5, clicks: 0, engagement: 18 },
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['crypto'],
    },
  ];

  const signals = aggregateFeedbackSignals(records, { minSampleSize: 3 });
  assert.equal(signals.byPillar.money?.status, 'LOW_PERFORMING');
  assert.ok(signals.byPillar.money!.averageScore <= 45);

  const topic = createDummyTopic('cand-crypto-new', 'Speculative Token Staking', 'money', 82, {
    primaryIntent: 'commercial',
    tags: ['crypto'],
  });

  const feedback = evaluateTopicPerformanceFeedback(topic, signals);
  assert.ok(feedback.scoreAdjustment < 0);
  assert.ok(feedback.scoreAdjustment >= -8);
  assert.ok(feedback.reasons.some((r) => r.includes('under-performing')));
});

test('7. Bounded Feedback: Total score modifier strictly clamped between -8 and +10', () => {
  const extremePositiveSignals = aggregateFeedbackSignals(
    Array(10).fill(null).map((_, i) => ({
      articleSlug: `style/masterpiece-${i}`,
      topicId: `top-l${i}`,
      pillar: 'style',
      primaryIntent: 'inspirational',
      publicationDate: '2026-09-01',
      metrics: { views: 100000, clicks: 5000, conversions: 500, engagement: 100, affiliateClicks: 200 },
      measuredAt: '2026-09-10T12:00:00Z',
      tags: ['super-tag-1', 'super-tag-2'],
    }))
  );

  const testTopic = createDummyTopic('cand-style-extreme', 'Ultimate Morning Protocol', 'style', 90, {
    primaryIntent: 'inspirational',
    tags: ['super-tag-1', 'super-tag-2'],
  });

  const feedback = evaluateTopicPerformanceFeedback(testTopic, extremePositiveSignals);
  assert.equal(feedback.scoreAdjustment, 10); // Capped at +10
});

test('8. Selection Engine Integration: Performance feedback influences candidate ranking without bypassing quality gates', () => {
  const records: ArticlePerformanceRecord[] = [
    {
      articleSlug: 'tech-ai/good-1',
      topicId: 't1',
      pillar: 'tech-ai',
      publicationDate: '2026-09-01',
      metrics: { views: 4000, clicks: 150, engagement: 85 },
      measuredAt: '2026-09-10T12:00:00Z',
    },
    {
      articleSlug: 'tech-ai/good-2',
      topicId: 't2',
      pillar: 'tech-ai',
      publicationDate: '2026-09-02',
      metrics: { views: 4200, clicks: 170, engagement: 88 },
      measuredAt: '2026-09-10T12:00:00Z',
    },
    {
      articleSlug: 'tech-ai/good-3',
      topicId: 't3',
      pillar: 'tech-ai',
      publicationDate: '2026-09-03',
      metrics: { views: 3800, clicks: 160, engagement: 82 },
      measuredAt: '2026-09-10T12:00:00Z',
    },
    {
      articleSlug: 'travel/flop-1',
      topicId: 'tr1',
      pillar: 'travel',
      publicationDate: '2026-09-01',
      metrics: { views: 10, clicks: 0, engagement: 20 },
      measuredAt: '2026-09-10T12:00:00Z',
    },
    {
      articleSlug: 'travel/flop-2',
      topicId: 'tr2',
      pillar: 'travel',
      publicationDate: '2026-09-02',
      metrics: { views: 15, clicks: 0, engagement: 22 },
      measuredAt: '2026-09-10T12:00:00Z',
    },
    {
      articleSlug: 'travel/flop-3',
      topicId: 'tr3',
      pillar: 'travel',
      publicationDate: '2026-09-03',
      metrics: { views: 8, clicks: 0, engagement: 18 },
      measuredAt: '2026-09-10T12:00:00Z',
    },
  ];

  const feedbackSignals = aggregateFeedbackSignals(records);

  // Candidate A (tech-ai, raw score 84) -> boosts to ~88 with feedback
  const candA = createDummyTopic('cand-a', 'AI Prompt Engineering System', 'tech-ai', 84);
  // Candidate B (travel, raw score 86) -> dampens to ~82 with feedback
  const candB = createDummyTopic('cand-b', 'Crowded Resort Guide', 'travel', 86);

  // Without feedback, candB (86) outranks candA (84)
  const selectionWithoutFeedback = selectEditorialCandidates([candA, candB], {
    minScoreThreshold: 80,
    totalLimit: 1,
    enablePillarBalancing: false,
  });
  assert.equal(selectionWithoutFeedback.approved[0].id, 'cand-b');

  // With feedback, candA (84 + 4 = 88) outranks candB (86 - 4 = 82)
  const selectionWithFeedback = selectEditorialCandidates([candA, candB], {
    minScoreThreshold: 80,
    totalLimit: 1,
    enablePillarBalancing: false,
    feedbackSignals,
  });
  assert.equal(selectionWithFeedback.approved[0].id, 'cand-a');
  assert.ok(selectionWithFeedback.approved[0].performanceFeedback);
});

test('9. Quality Gate Precedence: Feedback CANNOT resurrect a candidate with raw score < 60 or REJECT tier', () => {
  const highFeedbackSignals = aggregateFeedbackSignals(
    Array(5).fill(null).map((_, i) => ({
      articleSlug: `tech-ai/top-${i}`,
      topicId: `top-${i}`,
      pillar: 'tech-ai',
      publicationDate: '2026-09-01',
      metrics: { views: 10000, clicks: 500, engagement: 95 },
      measuredAt: '2026-09-10T12:00:00Z',
    }))
  );

  // Substandard / rejected candidate (raw score 55)
  const poorTopic = createDummyTopic('cand-poor', 'Spammy AI Clickbait', 'tech-ai', 55, {
    priorityTier: 'REJECT',
  });

  const selection = selectEditorialCandidates([poorTopic], {
    minScoreThreshold: 80,
    totalLimit: 1,
    feedbackSignals: highFeedbackSignals,
  });

  assert.equal(selection.approved.length, 0);
  assert.equal(selection.rejected.length, 1);
  assert.equal(selection.rejected[0].id, 'cand-poor');
});

test('10. Provider Fixture & Determinism: Repeated aggregation and scoring produces identical outputs', async () => {
  const provider = new FixturePerformanceProvider([
    {
      articleSlug: 'style/mindful-morning',
      topicId: 'top-style-1',
      pillar: 'style',
      publicationDate: '2026-09-01',
      metrics: { views: 800, clicks: 40, ctr: 0.05, engagement: 78 },
      measuredAt: '2026-09-10T12:00:00Z',
    },
  ]);

  const record1 = await provider.fetchArticlePerformance('style/mindful-morning');
  const record2 = await provider.fetchArticlePerformance('style/mindful-morning');

  assert.deepEqual(record1, record2);

  const score1 = calculatePerformanceScore(record1!.metrics);
  const score2 = calculatePerformanceScore(record2!.metrics);

  assert.equal(score1.overallScore, score2.overallScore);
  assert.deepEqual(score1.evaluatedDimensions, score2.evaluatedDimensions);
});
