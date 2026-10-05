import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAiCadenceDay,
  getEditorialDailyPlan,
} from '../src/lib/editorial/cadence.ts';

import {
  GetAISetDiscoveryAdapter,
} from '../src/lib/editorial/discovery/adapters/get-ai-set.ts';

import { transformSignalToCandidate } from '../src/lib/editorial/discovery/transform.ts';
import { selectEditorialCandidates } from '../src/lib/editorial/selection.ts';
import { buildContentBrief } from '../src/lib/editorial/brief.ts';
import { briefToGenerationRequest } from '../src/lib/editorial/generation/brief-adapter.ts';
import { buildGenerationPrompt } from '../src/lib/editorial/generation/prompt.ts';
import { buildPublishPackage } from '../src/lib/editorial/publishing/builder.ts';
import { publishPackageToStoredArticleInput } from '../src/lib/editorial/storage/publishing-adapter.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';
import type { PublishingRequest } from '../src/lib/editorial/publishing/types.ts';

test('1. Deterministic UTC Cadence: Evaluates every-third-day AI schedule reliably', () => {
  // Fixed reference anchor is 2026-01-01 (Day 0 -> (0 % 3) === 0 -> AI Day)
  assert.equal(isAiCadenceDay('2026-01-01'), true, '2026-01-01 is Day 0 (AI Day)');
  assert.equal(isAiCadenceDay('2026-01-02'), false, '2026-01-02 is Day 1 (Normal Day)');
  assert.equal(isAiCadenceDay('2026-01-03'), false, '2026-01-03 is Day 2 (Normal Day)');
  assert.equal(isAiCadenceDay('2026-01-04'), true, '2026-01-04 is Day 3 (AI Day)');
  assert.equal(isAiCadenceDay('2026-01-05'), false, '2026-01-05 is Day 4 (Normal Day)');
  assert.equal(isAiCadenceDay('2026-01-06'), false, '2026-01-06 is Day 5 (Normal Day)');
  assert.equal(isAiCadenceDay('2026-01-07'), true, '2026-01-07 is Day 6 (AI Day)');

  // Known target dates in October 2026:
  // 2026-10-03 (Day 275 -> 275 % 3 = 2 -> Normal)
  // 2026-10-04 (Day 276 -> 276 % 3 = 0 -> AI Day)
  // 2026-10-05 (Day 277 -> 277 % 3 = 1 -> Normal)
  // 2026-10-06 (Day 278 -> 278 % 3 = 2 -> Normal)
  // 2026-10-07 (Day 279 -> 279 % 3 = 0 -> AI Day)
  assert.equal(isAiCadenceDay('2026-10-03'), false);
  assert.equal(isAiCadenceDay('2026-10-04'), true);
  assert.equal(isAiCadenceDay('2026-10-05'), false);
  assert.equal(isAiCadenceDay('2026-10-06'), false);
  assert.equal(isAiCadenceDay('2026-10-07'), true);
  assert.equal(isAiCadenceDay('2026-10-08'), false);
  assert.equal(isAiCadenceDay('2026-10-09'), false);
  assert.equal(isAiCadenceDay('2026-10-10'), true);
});

test('2. Watchdog & Retry Determinism: Same UTC date produces identical plan across retries and times', () => {
  const timeA = '2026-10-04T02:15:00.000Z';
  const timeB = '2026-10-04T12:00:00.000Z';
  const timeC = '2026-10-04T23:59:59.999Z';
  const dateOnly = '2026-10-04';

  const planA = getEditorialDailyPlan(timeA, 3);
  const planB = getEditorialDailyPlan(timeB, 3);
  const planC = getEditorialDailyPlan(timeC, 3);
  const planD = getEditorialDailyPlan(dateOnly, 3);

  assert.equal(planA.isAiDay, true);
  assert.equal(planB.isAiDay, true);
  assert.equal(planC.isAiDay, true);
  assert.equal(planD.isAiDay, true);

  assert.equal(planA.aiArticlesTarget, 1);
  assert.equal(planA.dynamicArticlesTarget, 2);
  assert.equal(planA.totalArticlesTarget, 3);
  assert.equal(planA.targetDate, '2026-10-04');

  assert.deepEqual(planA, planB);
  assert.deepEqual(planB, planC);
  assert.deepEqual(planC, planD);

  // Normal day plan
  const normalPlan = getEditorialDailyPlan('2026-10-05', 3);
  assert.equal(normalPlan.isAiDay, false);
  assert.equal(normalPlan.aiArticlesTarget, 0);
  assert.equal(normalPlan.dynamicArticlesTarget, 3);
  assert.equal(normalPlan.totalArticlesTarget, 3);
});

test('3. GetAISet Discovery Adapter: Returns qualified mainstream AI signals with targetProject', async () => {
  const adapter = new GetAISetDiscoveryAdapter();
  const result = await adapter.fetchSignals();

  assert.equal(result.status, 'AVAILABLE');
  assert.ok(result.signals.length >= 6);

  for (const sig of result.signals) {
    assert.equal(sig.category, 'tech-ai');
    assert.equal(sig.metadata?.targetProject, 'get-ai-set');
    assert.equal(sig.metadata?.isMainstreamAi, true);
    assert.ok(sig.rawQuery.length > 10);
    assert.ok(sig.contentSnippet && sig.contentSnippet.length > 20);

    // Transforming signal must forward targetProject
    const candidate = transformSignalToCandidate(sig);
    assert.equal(candidate.pillar, 'tech-ai');
    assert.equal(candidate.targetProject, 'get-ai-set');
    assert.ok(candidate.totalScore >= 80, `Score (${candidate.totalScore}) must meet quality threshold >= 80`);
  }
});

test('4. Candidate Selection on AI Day: Selects 1 GetAISet candidate + 2 dynamic LifeMode candidates', () => {
  const aiTopic1: EditorialTopic = {
    id: 'getaiset-tools-01',
    canonicalTopic: 'How Ordinary Users Can Organize Daily Life and Work with Claude and ChatGPT',
    slug: 'organize-daily-life-work-claude-chatgpt',
    pillar: 'tech-ai',
    targetProject: 'get-ai-set',
    sourceSignals: [],
    queryVariants: ['ai productivity for ordinary people'],
    scoring: {
      searchPotential: 88,
      pinterestPotential: 80,
      socialPotential: 85,
      lifeModeRelevance: 90,
      commercialPotential: 70,
      freshness: 85,
      competitionOpportunity: 75,
      originalityPotential: 85,
    },
    totalScore: 88,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 85,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
    tags: ['tech-ai', 'get-ai-set', 'productivity'],
  };

  const aiTopic2: EditorialTopic = {
    id: 'getaiset-tools-02',
    canonicalTopic: 'The Practical Guide to AI Note-Taking and Audio Transcription',
    slug: 'practical-guide-ai-note-taking-transcription',
    pillar: 'tech-ai',
    targetProject: 'get-ai-set',
    sourceSignals: [],
    queryVariants: ['ai note taking'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 78,
      socialPotential: 82,
      lifeModeRelevance: 88,
      commercialPotential: 65,
      freshness: 80,
      competitionOpportunity: 70,
      originalityPotential: 82,
    },
    totalScore: 85,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 80,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
    tags: ['tech-ai', 'get-ai-set'],
  };

  const styleTopic: EditorialTopic = {
    id: 'style-01',
    canonicalTopic: 'The Modern Minimalist Capsule Wardrobe for Autumn',
    slug: 'modern-minimalist-capsule-wardrobe-autumn',
    pillar: 'style',
    sourceSignals: [],
    queryVariants: ['capsule wardrobe autumn'],
    scoring: {
      searchPotential: 90,
      pinterestPotential: 92,
      socialPotential: 88,
      lifeModeRelevance: 95,
      commercialPotential: 75,
      freshness: 88,
      competitionOpportunity: 75,
      originalityPotential: 90,
    },
    totalScore: 91,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 88,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
    tags: ['style', 'wardrobe'],
  };

  const foodTopic: EditorialTopic = {
    id: 'food-01',
    canonicalTopic: 'The Art of Slow-Simmered Legume Broths and Earthenware Cooking',
    slug: 'art-slow-simmered-legume-broths-earthenware',
    pillar: 'food-drink',
    sourceSignals: [],
    queryVariants: ['legume broths earthenware'],
    scoring: {
      searchPotential: 86,
      pinterestPotential: 88,
      socialPotential: 84,
      lifeModeRelevance: 92,
      commercialPotential: 68,
      freshness: 86,
      competitionOpportunity: 78,
      originalityPotential: 88,
    },
    totalScore: 89,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 86,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
    tags: ['food-drink', 'cooking'],
  };

  const entertainmentTopic: EditorialTopic = {
    id: 'ent-01',
    canonicalTopic: 'Behind the Scenes of Summer Blockbusters and Independent Cinema',
    slug: 'summer-blockbusters-independent-cinema',
    pillar: 'entertainment',
    sourceSignals: [],
    queryVariants: ['independent cinema'],
    scoring: {
      searchPotential: 84,
      pinterestPotential: 80,
      socialPotential: 86,
      lifeModeRelevance: 88,
      commercialPotential: 60,
      freshness: 85,
      competitionOpportunity: 70,
      originalityPotential: 85,
    },
    totalScore: 86,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 85,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
    tags: ['entertainment', 'film'],
  };

  const candidatePool = [aiTopic1, aiTopic2, styleTopic, foodTopic, entertainmentTopic];

  // Selection on AI Day (e.g. 2026-10-04 or isAiDay: true) with totalLimit: 3
  const result = selectEditorialCandidates(candidatePool, {
    targetDate: '2026-10-04',
    totalLimit: 3,
  });

  assert.equal(result.approved.length, 3, 'Exactly 3 articles approved');

  // Must contain exactly one GetAISet article
  const getAiSetApproved = result.approved.filter((t) => t.targetProject === 'get-ai-set');
  assert.equal(getAiSetApproved.length, 1, 'Exactly one GetAISet AI article approved on AI day');
  assert.equal(getAiSetApproved[0].id, 'getaiset-tools-01', 'Top scoring GetAISet article selected');

  // Remaining 2 articles must be non-GetAISet dynamic LifeMode articles
  const dynamicApproved = result.approved.filter((t) => t.targetProject !== 'get-ai-set');
  assert.equal(dynamicApproved.length, 2, 'Exactly 2 dynamic LifeMode articles approved');
  assert.equal(dynamicApproved[0].pillar, 'style');
  assert.equal(dynamicApproved[1].pillar, 'food-drink');

  // The second AI candidate must be deferred
  const deferredAi = result.deferred.filter((t) => t.targetProject === 'get-ai-set');
  assert.equal(deferredAi.length, 1);
  assert.equal(deferredAi[0].id, 'getaiset-tools-02');
  assert.ok(deferredAi[0].deferReason?.includes('GetAISet article quota'));
});

test('5. Candidate Selection on Normal Day: Selects 3 strongest dynamic articles with no forced pillar rotation', () => {
  const techTopic: EditorialTopic = {
    id: 'tech-01',
    canonicalTopic: 'Local LLMs on Apple Silicon: Performance and Thermal Tradeoffs',
    slug: 'local-llms-apple-silicon-tradeoffs',
    pillar: 'tech-ai',
    sourceSignals: [],
    queryVariants: ['local llm apple silicon'],
    scoring: {
      searchPotential: 89,
      pinterestPotential: 75,
      socialPotential: 90,
      lifeModeRelevance: 90,
      commercialPotential: 65,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    totalScore: 90,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 90,
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
    tags: ['tech-ai'],
  };

  const styleTopic: EditorialTopic = {
    id: 'style-01',
    canonicalTopic: 'The Modern Minimalist Capsule Wardrobe for Autumn',
    slug: 'modern-minimalist-capsule-wardrobe-autumn',
    pillar: 'style',
    sourceSignals: [],
    queryVariants: ['capsule wardrobe'],
    scoring: {
      searchPotential: 91,
      pinterestPotential: 94,
      socialPotential: 89,
      lifeModeRelevance: 95,
      commercialPotential: 75,
      freshness: 88,
      competitionOpportunity: 75,
      originalityPotential: 90,
    },
    totalScore: 92,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 88,
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
    tags: ['style'],
  };

  const moneyTopic: EditorialTopic = {
    id: 'money-01',
    canonicalTopic: 'Building a Resilient Cash-Buffer Architecture in High-Rate Environments',
    slug: 'resilient-cash-buffer-architecture-high-rates',
    pillar: 'money',
    sourceSignals: [],
    queryVariants: ['cash buffer emergency fund'],
    scoring: {
      searchPotential: 88,
      pinterestPotential: 72,
      socialPotential: 82,
      lifeModeRelevance: 92,
      commercialPotential: 70,
      freshness: 85,
      competitionOpportunity: 75,
      originalityPotential: 88,
    },
    totalScore: 88,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 85,
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
    tags: ['money'],
  };

  const foodTopic: EditorialTopic = {
    id: 'food-01',
    canonicalTopic: 'The Art of Slow-Simmered Legume Broths and Earthenware Cooking',
    slug: 'art-slow-simmered-legume-broths-earthenware',
    pillar: 'food-drink',
    sourceSignals: [],
    queryVariants: ['legume broths'],
    scoring: {
      searchPotential: 82,
      pinterestPotential: 85,
      socialPotential: 80,
      lifeModeRelevance: 88,
      commercialPotential: 65,
      freshness: 82,
      competitionOpportunity: 70,
      originalityPotential: 82,
    },
    totalScore: 83,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 82,
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
    tags: ['food-drink'],
  };

  // Normal day selection (2026-10-05 is a Normal Day)
  const result = selectEditorialCandidates([techTopic, styleTopic, moneyTopic, foodTopic], {
    targetDate: '2026-10-05',
    totalLimit: 3,
  });

  assert.equal(result.approved.length, 3, 'Exactly 3 articles approved');
  // Selected strictly by quality/opportunity ranking: style (92) -> tech (90) -> money (88)
  assert.equal(result.approved[0].pillar, 'style');
  assert.equal(result.approved[1].pillar, 'tech-ai');
  assert.equal(result.approved[2].pillar, 'money');

  // food-drink (83) deferred due to lower score without forced rotation
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].pillar, 'food-drink');
});

test('6. Content Brief & Prompt Enforcement for GetAISet articles: Plain language, non-technical audience, zero hype', () => {
  const getAiSetTopic: EditorialTopic = {
    id: 'getaiset-tools-03',
    canonicalTopic: 'How to Use AI Vision and Camera Features to Identify Objects and Troubleshoot Household Items',
    slug: 'how-to-use-ai-vision-camera-features-identify-troubleshoot',
    pillar: 'tech-ai',
    targetProject: 'get-ai-set',
    sourceSignals: [],
    queryVariants: ['ai vision everyday tools', 'camera ai object identification'],
    scoring: {
      searchPotential: 90,
      pinterestPotential: 85,
      socialPotential: 88,
      lifeModeRelevance: 94,
      commercialPotential: 70,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 88,
    },
    totalScore: 90,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 90,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
    tags: ['tech-ai', 'get-ai-set', 'ai-vision'],
  };

  // 1. Build Brief
  const brief = buildContentBrief(getAiSetTopic);
  assert.equal(brief.targetProject, 'get-ai-set');
  assert.ok(brief.audience.toLowerCase().includes('non-technical') || brief.audience.toLowerCase().includes('everyday'));
  assert.ok(brief.recommendedAngle.toLowerCase().includes('plain-language') || brief.recommendedAngle.toLowerCase().includes('practical'));

  // Check doNotClaim constraints
  assert.ok(brief.doNotClaim?.some((c) => c.toLowerCase().includes('not write for developers') || c.toLowerCase().includes('developers')));
  assert.ok(brief.doNotClaim?.some((c) => c.toLowerCase().includes('exaggerated ai claims') || c.toLowerCase().includes('hype')));

  // 2. Convert to GenerationRequest
  const genRequest = briefToGenerationRequest(brief);
  assert.equal(genRequest.targetProject, 'get-ai-set');

  // 3. Build Generation Prompt
  const promptPayload = buildGenerationPrompt(genRequest);
  assert.ok(promptPayload.systemPrompt.includes('MAINSTREAM AI & GETAISET EDITORIAL GUIDELINES'));
  assert.ok(promptPayload.systemPrompt.includes('NOT developers, data scientists, or technical engineers'));
  assert.ok(promptPayload.systemPrompt.includes('Plain-Language Explanation'));
  assert.ok(promptPayload.systemPrompt.includes('Zero Exaggerated AI Claims'));
  assert.ok(promptPayload.systemPrompt.includes('Non-Promotional Tone'));
  assert.ok(promptPayload.userPrompt.includes('Mainstream AI Editorial Requirements'));
});

test('7. Publishing & Frontmatter Integration: Preserves targetProject: get-ai-set across pipeline', () => {
  const generatedArticle = {
    title: 'How to Use AI Vision on Your Smartphone for Everyday Tasks',
    slug: 'how-to-use-ai-vision-smartphone-everyday-tasks',
    description: 'A practical, non-technical guide to using camera-based AI for identifying objects, translating text, and household troubleshooting.',
    excerpt: 'How modern smartphone AI vision tools transform daily tasks from plant identification to quick text translation.',
    content: '## Everyday AI Vision\n\nModern smartphones now include built-in AI camera tools that can identify objects in seconds.\n\n## Practical Use Cases\n\nFrom translating menus abroad to identifying plants and household repair parts, visual AI offers practical everyday utility without complex setups.',
    faq: [{ question: 'What tools support AI vision?', answer: 'Google Lens, Apple Visual Look Up, and ChatGPT mobile vision.' }],
    sources: [{ name: 'GetAISet Learning', url: 'https://www.getaiset.com' }],
    internalLinks: ['/tech-ai'],
    affiliateIntents: [],
    socialHooks: ['How to use AI vision for everyday tasks'],
  };

  const mockReview = {
    decision: 'PASS' as const,
    overallScore: 92,
    dimensions: {
      safety: { score: 95, rationale: 'Safe', issues: [] },
      factuality: { score: 92, rationale: 'Accurate', issues: [] },
    } as any,
    criticalIssues: [],
    warnings: [],
    reviewer: 'Test Reviewer',
    metadata: { provider: 'test-provider', reviewedAt: new Date().toISOString(), model: 'test', durationMs: 1, inputTokenEstimate: 10, outputTokenEstimate: 10 },
    gatePassed: true,
  };

  const pubRequest: PublishingRequest = {
    article: generatedArticle,
    review: mockReview,
    context: {
      topicId: 'getaiset-tools-03',
      pillar: 'tech-ai',
      targetProject: 'get-ai-set',
      format: 'guide',
      audience: 'Mainstream users',
      primaryIntent: 'informational',
      riskLevel: 'low',
    },
    options: {
      dryRun: true,
      allowNoImageFallback: true,
    },
  };

  const publishPackage = buildPublishPackage(pubRequest, { dryRun: true });
  assert.equal(publishPackage.targetProject, 'get-ai-set');

  const storedArticleInput = publishPackageToStoredArticleInput(publishPackage);
  assert.equal(storedArticleInput.frontmatter.targetProject, 'get-ai-set');
  assert.equal(storedArticleInput.pillar, 'tech-ai');
  assert.equal(storedArticleInput.slug, 'how-to-use-ai-vision-smartphone-everyday-tasks');
});
