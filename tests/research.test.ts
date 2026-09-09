import test from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { evaluateResearchRequirement } from '../src/lib/editorial/research/classifier.ts';
import { FixtureEditorialResearchProvider } from '../src/lib/editorial/research/providers/fixture.ts';
import { WebEditorialResearchProvider } from '../src/lib/editorial/research/providers/web.ts';
import { runResearchPipeline } from '../src/lib/editorial/research/runner.ts';
import { buildContentBrief } from '../src/lib/editorial/brief.ts';
import { briefToGenerationRequest } from '../src/lib/editorial/generation/brief-adapter.ts';
import { buildGenerationPrompt } from '../src/lib/editorial/generation/prompt.ts';
import { buildReviewPrompt } from '../src/lib/editorial/review/prompt.ts';
import { runEditorialAutomation } from '../src/lib/editorial/automation/runner.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';
import type { IEditorialResearchProvider } from '../src/lib/editorial/research/providers/types.ts';

const travelTopic: EditorialTopic = {
  id: 'lm-travel-test-01',
  canonicalTopic: 'The Architectural Kyoto Guide to Slow Tea Houses',
  slug: 'the-architectural-kyoto-guide-to-slow-tea-houses',
  pillar: 'travel',
  sourceSignals: [],
  queryVariants: ['kyoto tea houses', 'sukiya architecture'],
  scoring: {
    searchPotential: 85,
    pinterestPotential: 90,
    socialPotential: 80,
    lifeModeRelevance: 90,
    commercialPotential: 60,
    freshness: 95,
    competitionOpportunity: 70,
    originalityPotential: 85,
  },
  totalScore: 84.0,
  priorityTier: 'CANDIDATE',
  opportunityType: 'ARTICLE',
  status: 'BRIEF_READY',
  freshnessScore: 95,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tags: ['kyoto', 'japan', 'travel', 'architecture'],
};

const nowTopic: EditorialTopic = {
  id: 'lm-now-test-01',
  canonicalTopic: 'The 2026 Cultural Shift Toward Digital Intentionality',
  slug: 'the-2026-cultural-shift-toward-digital-intentionality',
  pillar: 'now',
  sourceSignals: [],
  queryVariants: ['digital intentionality', '2026 trends'],
  scoring: {
    searchPotential: 90,
    pinterestPotential: 90,
    socialPotential: 95,
    lifeModeRelevance: 90,
    commercialPotential: 70,
    freshness: 95,
    competitionOpportunity: 70,
    originalityPotential: 85,
  },
  totalScore: 88.5,
  priorityTier: 'PRIORITY',
  opportunityType: 'ARTICLE_AND_SOCIAL',
  status: 'BRIEF_READY',
  freshnessScore: 95,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tags: ['trends', 'zeitgeist', 'lifestyle', 'culture'],
};

const lifeTopic: EditorialTopic = {
  id: 'lm-life-test-01',
  canonicalTopic: 'Minimalist Morning Routines for Creative Clarity',
  slug: 'minimalist-morning-routines-for-creative-clarity',
  pillar: 'life',
  sourceSignals: [],
  queryVariants: ['minimalist morning routines'],
  scoring: {
    searchPotential: 70,
    pinterestPotential: 80,
    socialPotential: 70,
    lifeModeRelevance: 90,
    commercialPotential: 60,
    freshness: 80,
    competitionOpportunity: 70,
    originalityPotential: 85,
  },
  totalScore: 78.0,
  priorityTier: 'LOW_PRIORITY',
  opportunityType: 'ARTICLE',
  status: 'BRIEF_READY',
  freshnessScore: 80,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tags: ['routines', 'minimalism'],
};

test('1. Research evaluator classifies research requirement correctly based on topic/brief', () => {
  const travelBrief = buildContentBrief(travelTopic);
  const travelReq = evaluateResearchRequirement(travelTopic, travelBrief);
  assert.equal(travelReq.required, true);
  assert.ok(travelReq.reason.length > 0);

  const nowBrief = buildContentBrief(nowTopic);
  const nowReq = evaluateResearchRequirement(nowTopic, nowBrief);
  assert.equal(nowReq.required, true);
  assert.ok(nowReq.reason.includes('zeitgeist') || nowReq.reason.includes('trend') || nowReq.reason.includes('authoritative'));

  const lifeBrief = buildContentBrief(lifeTopic);
  const lifeReq = evaluateResearchRequirement(lifeTopic, lifeBrief);
  assert.equal(lifeReq.required, false);
});

test('2. Fixture research provider generates structured evidence for required topics', async () => {
  const provider = new FixtureEditorialResearchProvider();
  const brief = buildContentBrief(travelTopic);

  const result = await provider.research(travelTopic, brief);
  assert.equal(result.required, true);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(result.items.length >= 2);

  const firstItem = result.items[0];
  assert.ok(firstItem.title.length > 0);
  assert.ok(firstItem.url.startsWith('https://'));
  assert.ok(firstItem.publisher.length > 0);
  assert.equal(firstItem.reliability, 'high');
  assert.ok(firstItem.claimSummary.length > 20);
  assert.ok(firstItem.sourceType === 'official' || firstItem.sourceType === 'academic');
});

test('3. Web research provider generates verified domain evidence for travel and now topics', async () => {
  const provider = new WebEditorialResearchProvider();
  const travelBrief = buildContentBrief(travelTopic);

  const result = await provider.research(travelTopic, travelBrief);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(result.items.some((i) => i.publisher.includes('Kyoto')));

  const nowBrief = buildContentBrief(nowTopic);
  const nowResult = await provider.research(nowTopic, nowBrief);
  assert.equal(nowResult.status, 'SUCCESS');
  assert.ok(nowResult.items.some((i) => i.publisher.includes('Pew Research') || i.publisher.includes('Humane Tech')));
});

test('4. Research pipeline preserves timing metadata and error boundaries', async () => {
  const failingProvider: IEditorialResearchProvider = {
    name: 'Failing Provider',
    research: async () => {
      throw new Error('Upstream network timeout during search retrieval');
    },
  };

  const brief = buildContentBrief(travelTopic);
  const result = await runResearchPipeline({
    topic: travelTopic,
    brief,
    provider: failingProvider,
  });

  assert.equal(result.status, 'FAILED');
  assert.ok(result.error?.includes('Upstream network timeout'));
  assert.ok(result.metadata && result.metadata.durationMs >= 0);
});

test('5. Content Brief adapter seamlessly transfers evidence to GenerationRequest', () => {
  const brief = buildContentBrief(travelTopic);
  brief.evidence = [
    {
      title: 'Kyoto Tea Architecture',
      url: 'https://kyoto.travel/tea',
      publisher: 'Kyoto Tourism',
      accessedAt: new Date().toISOString(),
      claimSummary: 'Historical Sukiya-style proportions and tea master protocols.',
      sourceType: 'official',
      reliability: 'high',
    },
  ];

  const genRequest = briefToGenerationRequest(brief);
  assert.ok(genRequest.evidence);
  assert.equal(genRequest.evidence.length, 1);
  assert.equal(genRequest.evidence[0].title, 'Kyoto Tea Architecture');
});

test('6. Generation prompt integrates verified evidence package into system and user prompts', () => {
  const brief = buildContentBrief(travelTopic);
  brief.evidence = [
    {
      title: 'Kyoto Official Cultural Tourism Board',
      url: 'https://kyoto.travel/en/culture/tea-ceremony.html',
      publisher: 'Kyoto City Tourism Association',
      accessedAt: new Date().toISOString(),
      claimSummary: 'Verified guide to historic Sukiya-style chashitsu across Uji and Gion.',
      sourceType: 'official',
      reliability: 'high',
    },
  ];

  const genRequest = briefToGenerationRequest(brief);
  const payload = buildGenerationPrompt(genRequest);

  assert.ok(payload.userPrompt.includes('Verified Research Evidence & Factual Grounding'));
  assert.ok(payload.userPrompt.includes('Kyoto Official Cultural Tourism Board'));
  assert.ok(payload.userPrompt.includes('https://kyoto.travel/en/culture/tea-ceremony.html'));
  assert.ok(payload.systemPrompt.includes('Factuality & Evidence Grounding'));
});

test('7. Review prompt receives verified evidence package as ground truth benchmark', () => {
  const payload = buildReviewPrompt({
    topicId: 'lm-travel-01',
    title: 'The Architectural Kyoto Guide to Slow Tea Houses',
    description: 'A curated editorial guide to mindful tea ceremony architecture in Kyoto.',
    excerpt: 'Mindful tea ceremony architecture in Kyoto.',
    content: '## 1. Introduction\n\nContent body grounded in evidence.',
    pillar: 'travel',
    format: 'guide',
    audience: 'Modern curious travelers',
    primaryIntent: 'informational',
    riskLevel: 'low',
    affiliateIntent: false,
    sources: [{ name: 'Kyoto Tourism Association', url: 'https://kyoto.travel' }],
    evidence: [
      {
        title: 'Kyoto Tourism Heritage Guide',
        url: 'https://kyoto.travel/heritage',
        publisher: 'Kyoto City Tourism',
        accessedAt: new Date().toISOString(),
        claimSummary: 'Official architectural registry of historic tea pavilions.',
        sourceType: 'official',
        reliability: 'high',
      },
    ],
    internalLinks: ['/travel'],
  });

  assert.ok(payload.userPrompt.includes('Verified Evidence Package (Ground Truth Benchmark)'));
  assert.ok(payload.userPrompt.includes('Kyoto Tourism Heritage Guide'));
  assert.ok(payload.systemPrompt.includes('grounding against the supplied verified evidence package'));
});

async function createTempWorkspace(): Promise<{
  repoDir: string;
  contentDir: string;
  cleanup: () => Promise<void>;
}> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-res-test-'));
  const contentDir = path.join(repoDir, 'src', 'content');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'travel'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'life'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'money'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'wellbeing'), { recursive: true });

  const cleanup = async () => {
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
    } catch {}
  };

  return { repoDir, contentDir, cleanup };
}

test('8. Automation runner rejects candidate safely when required research returns NO_EVIDENCE', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const tmpStorage = path.join(os.tmpdir(), `test-research-8-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const noEvidenceProvider: IEditorialResearchProvider = {
    name: 'Empty Research Provider',
    research: async (topic) => ({
      topicId: topic.id,
      required: true,
      reason: 'Mandatory research required',
      status: 'NO_EVIDENCE',
      items: [],
      error: 'No verified citations found for query',
      researchedAt: new Date().toISOString(),
    }),
  };

  try {
    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      maxOpportunities: 1,
      minScoreThreshold: 80,
      providerMode: 'fixture',
      storagePath: tmpStorage,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      researchProvider: noEvidenceProvider,
    });

    assert.equal(result.processedCount, 1);
    assert.equal(result.rejectedCount, 1);
    const opp = result.opportunities[0];
    assert.equal(opp.status, 'REJECTED');
    assert.equal(opp.failedStage, 'RESEARCH');
    assert.equal(opp.stageResults.RESEARCH.status, 'FAILED');
    assert.ok(
      opp.stageResults.RESEARCH.error?.message.includes('Required editorial research failed') ||
      opp.stageResults.RESEARCH.error?.message.includes('No verifiable evidence sources found')
    );
  } finally {
    await fs.rm(tmpStorage, { force: true }).catch(() => {});
    await cleanup();
  }
});

test('9. Automation runner seamlessly advances through RESEARCH -> GENERATION -> REVIEW when research succeeds', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const tmpStorage = path.join(os.tmpdir(), `test-research-9-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  try {
    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      maxOpportunities: 1,
      minScoreThreshold: 80,
      providerMode: 'fixture',
      storagePath: tmpStorage,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      researchProvider: new FixtureEditorialResearchProvider(),
    });

    assert.equal(result.processedCount, 1);
    const opp = result.opportunities[0];
    assert.equal(opp.stageResults.RESEARCH.status, 'SUCCESS');
    assert.ok(opp.stageResults.RESEARCH.data.items.length >= 2);
    assert.equal(opp.stageResults.GENERATION.status, 'SUCCESS');
    assert.equal(opp.stageResults.REVIEW.status, 'SUCCESS');
  } finally {
    await fs.rm(tmpStorage, { force: true }).catch(() => {});
    await cleanup();
  }
});
