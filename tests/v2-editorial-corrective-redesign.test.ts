import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

import { ACTIVE_EDITORIAL_PILLARS, type ActivePillarSlug } from '../src/config/site.ts';
import { VALID_PILLARS } from '../src/lib/editorial/types.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';
import {
  normalizePillar,
  isMeaningfulEditorialTopic,
  cleanTopicString,
  inferPillarFromKeywords,
} from '../src/lib/editorial/normalization.ts';
import {
  pruneAndMigrateCandidates,
  loadCandidates,
} from '../src/lib/editorial/discovery/storage.ts';
import { selectEditorialCandidates } from '../src/lib/editorial/selection.ts';
import {
  isAiCadenceDay,
  getEditorialDailyPlan,
  getElapsedUtcDays,
  parseUtcDateMidnight,
} from '../src/lib/editorial/cadence.ts';
import { GetAISetDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/get-ai-set.ts';
import { AIRouter } from '../src/lib/ai/router.ts';
import { loadAIConfig } from '../src/lib/ai/config.ts';
import type { IAIProvider, AIRequest, AIResponse, AIProviderError } from '../src/lib/ai/types.ts';
import { isPersonTopic } from '../src/lib/editorial/person-policy.ts';
import { checkDailyRunStatus, runEditorialWatchdog } from '../src/lib/editorial/automation/watchdog.ts';
import { runScheduledEditorialAutomation } from '../src/lib/editorial/automation/scheduler.ts';
import { FilesystemContentRepository } from '../src/lib/editorial/storage/repository.ts';

// ---------------------------------------------------------------------------
// 1. Authoritative Taxonomy Contract Tests
// ---------------------------------------------------------------------------

test('1. Authoritative Taxonomy: Only 6 active editorial pillars exist in contract', () => {
  const expectedPillars: ActivePillarSlug[] = [
    'health',
    'wealth',
    'home',
    'life',
    'tech-ai',
    'tools',
  ];

  assert.deepEqual(Array.from(ACTIVE_EDITORIAL_PILLARS), expectedPillars);
  assert.deepEqual(Array.from(VALID_PILLARS), expectedPillars);

  // Legacy mappings
  assert.equal(normalizePillar('wellbeing'), 'health');
  assert.equal(normalizePillar('money'), 'wealth');
  assert.equal(normalizePillar('food-drink'), 'home');
  assert.equal(normalizePillar('food-kitchen'), 'home');
  assert.equal(normalizePillar('style'), 'life');
  assert.equal(normalizePillar('travel'), 'life');
  assert.equal(normalizePillar('entertainment'), 'life');
  assert.equal(normalizePillar('health'), 'health');
  assert.equal(normalizePillar('tech-ai'), 'tech-ai');

  // Hard exclusions
  assert.equal(normalizePillar('life-hacks'), null);
  assert.equal(normalizePillar('celebrity-gossip'), null);
  assert.equal(normalizePillar('random-news'), null);
});

test('2. Discovery & Quality Normalization: Rejects gossip, crime, and 1-word filler', () => {
  // Reject single-word queries lacking depth
  assert.equal(isMeaningfulEditorialTopic('Fitness').isValid, false);
  assert.equal(isMeaningfulEditorialTopic('Money').isValid, false);
  assert.equal(isMeaningfulEditorialTopic('Travel').isValid, false);

  // Reject celebrity gossip and crime
  assert.equal(isMeaningfulEditorialTopic('Celebrity Dating Rumors and Drama').isValid, false);
  assert.equal(isMeaningfulEditorialTopic('Local Robbery Suspect Arrested').isValid, false);
  assert.equal(isMeaningfulEditorialTopic('Quarterback Injured in Final Score Game Recap').isValid, false);

  // Accept rich LifeMode editorial topics
  assert.equal(isMeaningfulEditorialTopic('Zone 2 Cardio Protocols for Metabolic Health').isValid, true);
  assert.equal(isMeaningfulEditorialTopic('Cast Iron Seasoning and Care Guide').isValid, true);
  assert.equal(isMeaningfulEditorialTopic('Practical AI Document Summarization Tools').isValid, true);
});

// ---------------------------------------------------------------------------
// 2. Candidate Lifecycle Management Tests
// ---------------------------------------------------------------------------

test('3. Candidate Lifecycle: Prunes stale candidates, decays freshness, and bounds pool', () => {
  const now = new Date('2026-10-07T12:00:00Z');

  const candidates: EditorialTopic[] = [
    // Fresh trending candidate (1 day old) -> should remain
    {
      id: 'cand-01',
      canonicalTopic: 'Zone 2 Cardio Protocols',
      slug: 'zone-2-cardio-protocols',
      pillar: 'wellbeing' as any, // Legacy pillar to be migrated
      status: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 90,
      freshnessScore: 90,
      queryVariants: ['zone 2 cardio'],
      scoring: {
        searchPotential: 90,
        pinterestPotential: 80,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 90,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['cardio', 'health'],
      sourceSignals: [],
      createdAt: new Date('2026-10-06T12:00:00Z').toISOString(),
      updatedAt: new Date('2026-10-06T12:00:00Z').toISOString(),
    },
    // Stale trending candidate (9 days old > 7 days TTL) -> should be pruned
    {
      id: 'cand-02-stale',
      canonicalTopic: 'Outdated Flash Trend Query',
      slug: 'outdated-flash-trend-query',
      pillar: 'tech-ai',
      status: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 95,
      freshnessScore: 95,
      queryVariants: ['outdated flash trend'],
      scoring: {
        searchPotential: 95,
        pinterestPotential: 80,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 95,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['tech'],
      sourceSignals: [],
      createdAt: new Date('2026-09-27T12:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-27T12:00:00Z').toISOString(),
    },
    // Seasonal candidate (10 days old <= 14 days TTL) -> should remain with freshness decay
    {
      id: 'cand-03-seasonal',
      canonicalTopic: 'Autumn Small Space Organization',
      slug: 'autumn-small-space-organization',
      pillar: 'home',
      status: 'CANDIDATE',
      opportunityType: 'SEASONAL_ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 88,
      freshnessScore: 85,
      queryVariants: ['autumn small space organization'],
      scoring: {
        searchPotential: 88,
        pinterestPotential: 85,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 85,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['seasonal', 'home'],
      sourceSignals: [],
      createdAt: new Date('2026-09-28T12:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-28T12:00:00Z').toISOString(),
    },
    // Excluded legacy entertainment gossip candidate -> should be removed
    {
      id: 'cand-04-gossip',
      canonicalTopic: 'Celebrity Breakup and Red Carpet Fashion',
      slug: 'celebrity-breakup-and-red-carpet-fashion',
      pillar: 'entertainment' as any,
      status: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 92,
      freshnessScore: 90,
      queryVariants: ['celebrity breakup'],
      scoring: {
        searchPotential: 92,
        pinterestPotential: 80,
        socialPotential: 80,
        lifeModeRelevance: 50,
        commercialPotential: 50,
        freshness: 90,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['entertainment'],
      sourceSignals: [],
      createdAt: new Date('2026-10-06T12:00:00Z').toISOString(),
      updatedAt: new Date('2026-10-06T12:00:00Z').toISOString(),
    },
    // Single-word filler candidate -> should be removed
    {
      id: 'cand-05-filler',
      canonicalTopic: 'Fitness',
      slug: 'fitness',
      pillar: 'health',
      status: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 88,
      freshnessScore: 88,
      queryVariants: ['fitness'],
      scoring: {
        searchPotential: 88,
        pinterestPotential: 80,
        socialPotential: 80,
        lifeModeRelevance: 80,
        commercialPotential: 60,
        freshness: 88,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['fitness'],
      sourceSignals: [],
      createdAt: new Date('2026-10-06T12:00:00Z').toISOString(),
      updatedAt: new Date('2026-10-06T12:00:00Z').toISOString(),
    },
  ];

  const pruned = pruneAndMigrateCandidates(candidates, { now, maxPoolSize: 10 });

  // Only cand-01 (migrated to health) and cand-03-seasonal should remain
  assert.equal(pruned.length, 2);
  const cand01 = pruned.find((c) => c.id === 'cand-01');
  assert.ok(cand01);
  assert.equal(cand01?.pillar, 'health'); // Normalized from wellbeing to health

  const seasonal = pruned.find((c) => c.id === 'cand-03-seasonal');
  assert.ok(seasonal);
  // Freshness score decayed for 10-day-old seasonal candidate
  assert.ok(seasonal!.freshnessScore < 85);
});

// ---------------------------------------------------------------------------
// 3. Cadence & Selection Tests (AI Day vs Normal Day)
// ---------------------------------------------------------------------------

test('4. Deterministic UTC Cadence: Every 3rd UTC day is an AI Day', () => {
  // Day 0 (2026-01-01) -> AI Day
  assert.equal(isAiCadenceDay('2026-01-01'), true);
  assert.equal(isAiCadenceDay('2026-01-02'), false);
  assert.equal(isAiCadenceDay('2026-01-03'), false);
  assert.equal(isAiCadenceDay('2026-01-04'), true);

  // October 2026 cadence (Oct 1 is day 273 % 3 === 0 -> AI Day)
  assert.equal(isAiCadenceDay('2026-10-04'), true);
  assert.equal(isAiCadenceDay('2026-10-05'), false);
  assert.equal(isAiCadenceDay('2026-10-06'), false);
  assert.equal(isAiCadenceDay('2026-10-07'), true);
  assert.equal(isAiCadenceDay('2026-10-08'), false);
  assert.equal(isAiCadenceDay('2026-10-10'), true);

  // Repeat calls on the same UTC date yield identical plan
  const plan1 = getEditorialDailyPlan('2026-10-07', 3);
  const plan2 = getEditorialDailyPlan(new Date('2026-10-07T22:30:00Z'), 3);
  assert.equal(plan1.isAiDay, true);
  assert.equal(plan2.isAiDay, true);
  assert.equal(plan1.aiArticlesTarget, 1);
  assert.equal(plan1.dynamicArticlesTarget, 2);
});

test('5. Candidate Selection: AI Day selects 1 GetAISet + 2 dynamic LifeMode articles', () => {
  const candidates: EditorialTopic[] = [
    {
      id: 'getaiset-tools-01',
      canonicalTopic: 'Practical Guide to AI Note Taking for Everyday Tasks',
      slug: 'practical-guide-to-ai-note-taking',
      pillar: 'tech-ai',
      targetProject: 'get-ai-set',
      status: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 92,
      freshnessScore: 90,
      queryVariants: ['ai note taking'],
      scoring: {
        searchPotential: 92,
        pinterestPotential: 80,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 90,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['get-ai-set', 'tech-ai'],
      sourceSignals: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'lm-health-01',
      canonicalTopic: 'Circadian Light Timing and Sleep Recovery',
      slug: 'circadian-light-timing',
      pillar: 'health',
      status: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 94,
      freshnessScore: 90,
      queryVariants: ['circadian light timing'],
      scoring: {
        searchPotential: 94,
        pinterestPotential: 80,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 90,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['health'],
      sourceSignals: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'lm-wealth-01',
      canonicalTopic: 'Digital Micro Business Systems for Solopreneurs',
      slug: 'digital-micro-business-systems',
      pillar: 'wealth',
      status: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 93,
      freshnessScore: 90,
      queryVariants: ['digital micro business'],
      scoring: {
        searchPotential: 93,
        pinterestPotential: 80,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 90,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['wealth'],
      sourceSignals: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'lm-home-01',
      canonicalTopic: 'Small Pantry Shelf Organization Blueprint',
      slug: 'small-pantry-shelf-organization',
      pillar: 'home',
      status: 'CANDIDATE',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 91,
      freshnessScore: 90,
      queryVariants: ['small pantry shelf organization'],
      scoring: {
        searchPotential: 91,
        pinterestPotential: 80,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 90,
        competitionOpportunity: 80,
        originalityPotential: 80,
      },
      tags: ['home'],
      sourceSignals: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // AI Day Selection (e.g. 2026-10-07)
  const aiDaySelection = selectEditorialCandidates(candidates, {
    targetDate: '2026-10-07',
    totalLimit: 3,
  });

  assert.equal(aiDaySelection.approved.length, 3);
  const getAiSetApproved = aiDaySelection.approved.find((a) => a.targetProject === 'get-ai-set');
  assert.ok(getAiSetApproved, 'AI Day must select 1 GetAISet candidate');
  assert.equal(getAiSetApproved?.pillar, 'tech-ai');

  // Normal Day Selection (e.g. 2026-10-08)
  const normalDaySelection = selectEditorialCandidates(candidates, {
    targetDate: '2026-10-08',
    totalLimit: 3,
  });

  assert.equal(normalDaySelection.approved.length, 3);
  const normalPillars = normalDaySelection.approved.map((a) => a.pillar);
  // All 3 selected topics belong to active 6 pillars
  for (const pillar of normalPillars) {
    assert.ok(ACTIVE_EDITORIAL_PILLARS.includes(pillar as ActivePillarSlug));
  }
});

// ---------------------------------------------------------------------------
// 4. GetAISet Live Discovery & Fallback Tests
// ---------------------------------------------------------------------------

test('6. GetAISet Discovery: Live RSS probe parses items or falls back gracefully', async () => {
  const mockRssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>GetAISet Live Feed</title>
    <link>https://www.getaiset.com/</link>
    <description>Everyday AI Learning</description>
    <item>
      <title>How Everyday People Can Use Claude for Document Summarization</title>
      <link>https://www.getaiset.com/learn/claude-document-summarization</link>
      <description>A beginner guide to summarizing long reports with ease.</description>
      <pubDate>Wed, 07 Oct 2026 10:00:00 GMT</pubDate>
      <category>AI Tools</category>
    </item>
  </channel>
</rss>`;

  const mockLiveFetch: typeof fetch = async (url) => {
    return new Response(mockRssXml, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
  };

  const liveAdapter = new GetAISetDiscoveryAdapter(mockLiveFetch);
  const liveResult = await liveAdapter.fetchSignals({ limit: 5 });

  assert.equal(liveResult.status, 'AVAILABLE');
  assert.ok(liveResult.signals.length >= 1);
  assert.equal(liveResult.signals[0].category, 'tech-ai');
  assert.equal(liveResult.signals[0].metadata?.targetProject, 'get-ai-set');
  assert.equal(liveResult.signals[0].metadata?.isMainstreamAi, true);

  // Network failure fallback test
  const failingFetch: typeof fetch = async () => {
    throw new Error('Network connection failed');
  };

  const fallbackAdapter = new GetAISetDiscoveryAdapter(failingFetch);
  const fallbackResult = await fallbackAdapter.fetchSignals({ limit: 5 });

  assert.equal(fallbackResult.status, 'AVAILABLE');
  assert.ok(fallbackResult.signals.length >= 1);
  assert.equal(fallbackResult.signals[0].category, 'tech-ai');
  assert.equal(fallbackResult.signals[0].metadata?.targetProject, 'get-ai-set');
  assert.equal(fallbackResult.signals[0].metadata?.isCuratedFallback, true);
});

// ---------------------------------------------------------------------------
// 5. AI Router / Groq Resilience Tests
// ---------------------------------------------------------------------------

test('7. AI Router Resilience: Groq 429 and 400 fail over cleanly without 60s bucket poisoning', async () => {
  let groqCalls = 0;
  let geminiCalls = 0;
  let sleptMs = 0;

  const mockSleep = async (ms: number) => {
    sleptMs += ms;
  };

  // Mock Failing Gemini (returns 500)
  const mockGemini: IAIProvider = {
    id: 'gemini',
    defaultModel: 'gemini-2.5-flash',
    isConfigured: () => true,
    generate: async () => {
      geminiCalls++;
      const err: AIProviderError = {
        code: 'PROVIDER_ERROR',
        message: 'Gemini service unavailable',
        provider: 'gemini',
        retryable: true,
      };
      throw err;
    },
  };

  // Mock Groq returning Rate Limit (429)
  const mockGroq: IAIProvider = {
    id: 'groq',
    defaultModel: 'llama-3.3-70b-versatile',
    isConfigured: () => true,
    generate: async () => {
      groqCalls++;
      const err: AIProviderError = {
        code: 'RATE_LIMIT',
        message: 'Rate limit reached. Please try again in 5s.',
        provider: 'groq',
        retryable: true,
        retryAfterMs: 5000,
      };
      throw err;
    },
  };

  const router = new AIRouter({
    config: {
      providerOrder: ['gemini', 'groq'],
      gemini: { apiKey: 'mock', model: 'gemini-2.5-flash', dailyTokenBudget: 1000000 },
      groq: { apiKey: 'mock', model: 'llama-3.3-70b-versatile', dailyTokenBudget: 1000000, tokensPerMinute: 8000 },
      router: {
        timeoutMs: 5000,
        maxAttempts: 2,
        retryDelayMs: 100,
        dailyTotalTokenBudget: 2000000,
        requestsPerMinute: 30,
        requestsPerDay: 1000,
      },
    },
    providers: new Map([
      ['gemini', mockGemini],
      ['groq', mockGroq],
    ]),
    sleepFn: mockSleep,
    logRateLimits: false,
  });

  const request: AIRequest = {
    prompt: 'Generate an article outline in JSON',
    responseFormat: 'json',
    taskType: 'content_generation',
  };

  const result = await router.route(request);

  // Both providers were attempted promptly; Groq retried once bounded
  assert.equal(geminiCalls, 1);
  assert.equal(groqCalls, 2);
  assert.equal(result.success, false);
  // Sleep duration did NOT exceed 10 seconds (no multi-minute stalls)
  assert.ok(sleptMs <= 10000);
});

// ---------------------------------------------------------------------------
// 6. Person Policy False Positive Fix Tests
// ---------------------------------------------------------------------------

test('8. Person Policy: "Chicago Fire", "Apple Watch", "ChatGPT" are NOT classified as persons', () => {
  // Non-person entities must return false
  assert.equal(isPersonTopic({ canonicalTopic: 'Chicago Fire' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'Apple Watch Series 10 Review' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'ChatGPT Productivity Workflows' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'Google Home Smart Automation' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'Cold Plunge Protocols' }), false);

  // Legitimate real person topics with biographical context must return true
  assert.equal(isPersonTopic({ canonicalTopic: 'José Trevino' }), true);
  assert.equal(isPersonTopic({ canonicalTopic: 'Blake Lively' }), true);
  assert.equal(isPersonTopic({ title: 'Who Is Josh Hartnett? Career, Background and More' }), true);
  assert.equal(isPersonTopic({ canonicalTopic: 'Shohei Ohtani', tags: ['athlete'] }), true);
});

// ---------------------------------------------------------------------------
// 7. Watchdog Post-Run Accounting Tests
// ---------------------------------------------------------------------------

test('9. Watchdog Accounting: Refreshes post-execution publication count accurately', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-test-'));

  try {
    const contentDir = path.join(tmpDir, 'src', 'content');
    await fs.mkdir(path.join(contentDir, 'health'), { recursive: true });

    // Initial check: 0 articles published today
    const initialReport = await checkDailyRunStatus({
      contentRoot: contentDir,
      targetDate: '2026-10-07',
      dailyLimit: 3,
    });
    assert.equal(initialReport.publishedTodayCount, 0);
    assert.equal(initialReport.remainingQuota, 3);
    assert.equal(initialReport.isQuotaMet, false);

    // Simulate publishing 1 article today to the repository
    const sampleArticle = `---
title: "Morning Light and Circadian Rhythms"
description: "How morning light exposure optimizes wakefulness and biological clock alignment."
pillar: "health"
slug: "morning-light-circadian-rhythms"
pubDate: "2026-10-07T08:00:00.000Z"
---
Content here.`;

    await fs.writeFile(path.join(contentDir, 'health', 'morning-light-circadian-rhythms.md'), sampleArticle, 'utf-8');

    // Refreshed check: exactly 1 article published today -> Published Today: 1/3
    const refreshedReport = await checkDailyRunStatus({
      contentRoot: contentDir,
      targetDate: '2026-10-07',
      dailyLimit: 3,
    });

    assert.equal(refreshedReport.publishedTodayCount, 1);
    assert.equal(refreshedReport.remainingQuota, 2);
    assert.equal(refreshedReport.isQuotaMet, false);
    assert.equal(refreshedReport.publishedArticles.length, 1);
    assert.equal(refreshedReport.publishedArticles[0].slug, 'morning-light-circadian-rhythms');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
