import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';

import { FixtureDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/fixture.ts';
import { PinterestTrendsDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/pinterest.ts';
import { GoogleTrendsDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/google-trends.ts';
import { transformSignalToCandidate } from '../src/lib/editorial/discovery/transform.ts';
import { runDiscoveryPipeline } from '../src/lib/editorial/discovery/runner.ts';
import { loadCandidates, saveCandidates, mergeCandidateTopic } from '../src/lib/editorial/discovery/storage.ts';
import type { DiscoverySignal } from '../src/lib/editorial/discovery/types.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';

test('Discovery Adapters - Fixture Adapter returns available signals', async () => {
  const adapter = new FixtureDiscoveryAdapter();
  assert.equal(adapter.name, 'LifeMode Fixture Signals');
  assert.equal(adapter.sourceType, 'FIXTURE');

  const result = await adapter.fetchSignals();
  assert.equal(result.status, 'AVAILABLE');
  assert.ok(result.signals.length >= 7);
  assert.equal(result.signals[0].source, 'FIXTURE');
});

test('Discovery Adapters - Pinterest unconfigured state handling', async () => {
  const adapter = new PinterestTrendsDiscoveryAdapter();
  const result = await adapter.fetchSignals();

  // Without PINTEREST_ACCESS_TOKEN, gracefully reports NOT_CONFIGURED
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.equal(result.signals.length, 0);
  assert.ok(result.error?.includes('Pinterest'));
});

test('Discovery Adapters - Google Trends unconfigured state handling', async () => {
  const adapter = new GoogleTrendsDiscoveryAdapter();
  const result = await adapter.fetchSignals();

  // Without GOOGLE_TRENDS_API_KEY, gracefully reports NOT_CONFIGURED
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.equal(result.signals.length, 0);
  assert.ok(result.error?.includes('Google Trends'));
});

test('Discovery Signal Transformation - transforms and scores signal', () => {
  const signal: DiscoverySignal = {
    source: 'FIXTURE',
    sourceId: 'test-sig-01',
    rawQuery: '  The Minimalist Desk Setup for Deep Focus & Flow!  ',
    timestamp: '2026-09-09T10:00:00.000Z',
    metrics: {
      growthRate: 85,
      searchVolume: 20000,
      relativeInterest: 90,
      isBreakout: true,
      visualPotentialScore: 92,
    },
    geography: 'US',
    category: 'life',
    metadata: {
      curatedTags: ['desk', 'productivity', 'minimalism'],
    },
  };

  const candidate = transformSignalToCandidate(signal);

  assert.equal(candidate.canonicalTopic, 'The Minimalist Desk Setup for Deep Focus & Flow');
  assert.equal(candidate.slug, 'the-minimalist-desk-setup-for-deep-focus-flow');
  assert.equal(candidate.pillar, 'life');
  assert.equal(candidate.sourceSignals.length, 1);
  assert.equal(candidate.sourceSignals[0].source, 'FIXTURE');
  assert.equal(candidate.sourceSignals[0].sourceId, 'test-sig-01');
  assert.ok(candidate.totalScore >= 80);
  assert.ok(['CANDIDATE', 'PRIORITY', 'IMMEDIATE_OPPORTUNITY'].includes(candidate.priorityTier));
  assert.ok(candidate.pinterestScore !== undefined && candidate.pinterestScore > 70);
});

test('Candidate Storage - load, save, and merge', async () => {
  const tempPath = resolve(process.cwd(), 'data/topics/test-candidates-temp.json');

  try {
    const sampleTopic: EditorialTopic = {
      id: 'lm-travel-test-kyoto',
      canonicalTopic: 'Kyoto Hidden Temples',
      slug: 'kyoto-hidden-temples',
      pillar: 'travel',
      sourceSignals: [
        {
          source: 'GOOGLE_TRENDS',
          query: 'kyoto temples',
          recordedAt: new Date().toISOString(),
        },
      ],
      queryVariants: ['kyoto temples'],
      scoring: {
        searchPotential: 85,
        pinterestPotential: 85,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 90,
        competitionOpportunity: 70,
        originalityPotential: 85,
      },
      totalScore: 83.5,
      priorityTier: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      status: 'CANDIDATE',
      freshnessScore: 90,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['travel', 'japan'],
    };

    // Save
    await saveCandidates([sampleTopic], tempPath);

    // Load
    const loaded = await loadCandidates(tempPath);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].canonicalTopic, 'Kyoto Hidden Temples');

    // Merge new topic
    const newTopic: EditorialTopic = {
      ...sampleTopic,
      id: 'lm-tech-ai-test-agents',
      canonicalTopic: 'Autonomous Coding Agents',
      slug: 'autonomous-coding-agents',
      pillar: 'tech-ai',
    };

    const mergeResult1 = mergeCandidateTopic(newTopic, loaded);
    assert.equal(mergeResult1.isNew, true);
    assert.equal(mergeResult1.updatedList.length, 2);

    // Merge existing topic update
    const updatedTopic: EditorialTopic = {
      ...sampleTopic,
      canonicalTopic: 'Kyoto Hidden Temples & Quiet Gardens',
      totalScore: 86.0,
    };

    const mergeResult2 = mergeCandidateTopic(updatedTopic, mergeResult1.updatedList);
    assert.equal(mergeResult2.isNew, false);
    assert.equal(mergeResult2.updatedList.length, 2);
    assert.equal(mergeResult2.updatedList[0].canonicalTopic, 'Kyoto Hidden Temples & Quiet Gardens');
    assert.equal(mergeResult2.updatedList[0].totalScore, 86.0);
  } finally {
    await rm(tempPath, { force: true });
  }
});

test('Discovery Pipeline Runner - executes fixture pipeline end-to-end', async () => {
  const tempPath = resolve(process.cwd(), 'data/topics/test-pipeline-runner-temp.json');

  try {
    const report = await runDiscoveryPipeline(
      [
        new PinterestTrendsDiscoveryAdapter(),
        new GoogleTrendsDiscoveryAdapter(),
        new FixtureDiscoveryAdapter(),
      ],
      {
        storagePath: tempPath,
        saveToDisk: true,
      }
    );

    assert.ok(report.timestamp);
    assert.equal(report.providerResults.length, 3);

    // Unconfigured external providers reported gracefully
    const pinResult = report.providerResults.find((p) => p.sourceType === 'PINTEREST_TRENDS');
    assert.equal(pinResult?.status, 'NOT_CONFIGURED');

    const googleResult = report.providerResults.find((p) => p.sourceType === 'GOOGLE_TRENDS');
    assert.equal(googleResult?.status, 'NOT_CONFIGURED');

    // Fixture provider executed successfully
    const fixtureResult = report.providerResults.find((p) => p.sourceType === 'FIXTURE');
    assert.equal(fixtureResult?.status, 'AVAILABLE');
    assert.ok(fixtureResult?.signals.length ?? 0 >= 7);

    // Ingestion results
    assert.ok(report.totalSignalsReceived >= 7);
    assert.ok(report.normalizedCount >= 7);
    assert.ok(report.newCandidatesStored >= 7);
    assert.ok(report.candidatesSummary.length >= 7);

    // Verify stored file
    const stored = await loadCandidates(tempPath);
    assert.equal(stored.length, report.candidatesSummary.length);
  } finally {
    await rm(tempPath, { force: true });
  }
});
