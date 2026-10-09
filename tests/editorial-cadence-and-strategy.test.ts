import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAiCadenceDay,
  isGuidesCadenceDay,
  isLifeHacksCadenceDay,
  isToolsCadenceDay,
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
import {
  listExistingGuides,
  processGuideOpportunity,
} from '../src/lib/editorial/guides/service.ts';

test('1. Deterministic Weekly Cadence: Evaluates 3-day GetAISet, 3-day Guides, 3-day Life Hacks, and 1-day Tools schedule reliably', () => {
  // Weekly structure:
  // Sun (0): Regular Day (3 regular articles), Tools Day (1 tool)
  // Mon (1): Regular Day (3 regular articles), Guides Day (1 guide opportunity)
  // Tue (2): GetAISet Day (1 AI article + 2 regular), Life Hacks Day (1 video)
  // Wed (3): Regular Day (3 regular articles), Guides Day (1 guide opportunity)
  // Thu (4): GetAISet Day (1 AI article + 2 regular), Life Hacks Day (1 video)
  // Fri (5): Regular Day (3 regular articles), Guides Day (1 guide opportunity)
  // Sat (6): GetAISet Day (1 AI article + 2 regular), Life Hacks Day (1 video)

  // October 2026 test dates:
  // 2026-10-04 (Sunday, day 0)
  assert.equal(isAiCadenceDay('2026-10-04'), false, 'Sunday is Regular LifeMode day');
  assert.equal(isToolsCadenceDay('2026-10-04'), true, 'Sunday is Tools day');
  assert.equal(isGuidesCadenceDay('2026-10-04'), false);
  assert.equal(isLifeHacksCadenceDay('2026-10-04'), false);

  // 2026-10-05 (Monday, day 1)
  assert.equal(isAiCadenceDay('2026-10-05'), false, 'Monday is Regular LifeMode day');
  assert.equal(isGuidesCadenceDay('2026-10-05'), true, 'Monday is Guides day');
  assert.equal(isToolsCadenceDay('2026-10-05'), false);
  assert.equal(isLifeHacksCadenceDay('2026-10-05'), false);

  // 2026-10-06 (Tuesday, day 2)
  assert.equal(isAiCadenceDay('2026-10-06'), true, 'Tuesday is GetAISet AI day');
  assert.equal(isLifeHacksCadenceDay('2026-10-06'), true, 'Tuesday is Life Hacks day');
  assert.equal(isGuidesCadenceDay('2026-10-06'), false);
  assert.equal(isToolsCadenceDay('2026-10-06'), false);

  // 2026-10-07 (Wednesday, day 3)
  assert.equal(isAiCadenceDay('2026-10-07'), false, 'Wednesday is Regular LifeMode day');
  assert.equal(isGuidesCadenceDay('2026-10-07'), true, 'Wednesday is Guides day');
  assert.equal(isLifeHacksCadenceDay('2026-10-07'), false);

  // 2026-10-08 (Thursday, day 4)
  assert.equal(isAiCadenceDay('2026-10-08'), true, 'Thursday is GetAISet AI day');
  assert.equal(isLifeHacksCadenceDay('2026-10-08'), true, 'Thursday is Life Hacks day');
  assert.equal(isGuidesCadenceDay('2026-10-08'), false);

  // 2026-10-09 (Friday, day 5)
  assert.equal(isAiCadenceDay('2026-10-09'), false, 'Friday is Regular LifeMode day');
  assert.equal(isGuidesCadenceDay('2026-10-09'), true, 'Friday is Guides day');
  assert.equal(isLifeHacksCadenceDay('2026-10-09'), false);

  // 2026-10-10 (Saturday, day 6)
  assert.equal(isAiCadenceDay('2026-10-10'), true, 'Saturday is GetAISet AI day');
  assert.equal(isLifeHacksCadenceDay('2026-10-10'), true, 'Saturday is Life Hacks day');
  assert.equal(isGuidesCadenceDay('2026-10-10'), false);
});

test('2. Watchdog & Retry Determinism: Same UTC date produces identical plan across retries and times', () => {
  const timeA = '2026-10-06T02:15:00.000Z';
  const timeB = '2026-10-06T12:00:00.000Z';
  const timeC = '2026-10-06T23:59:59.999Z';
  const dateOnly = '2026-10-06';

  const planA = getEditorialDailyPlan(timeA);
  const planB = getEditorialDailyPlan(timeB);
  const planC = getEditorialDailyPlan(timeC);
  const planD = getEditorialDailyPlan(dateOnly);

  assert.equal(planA.isAiDay, true);
  assert.equal(planB.isAiDay, true);
  assert.equal(planC.isAiDay, true);
  assert.equal(planD.isAiDay, true);

  assert.equal(planA.aiArticlesTarget, 1);
  assert.equal(planA.dynamicArticlesTarget, 2);
  assert.equal(planA.totalArticlesTarget, 3);
  assert.equal(planA.targetDate, '2026-10-06');

  assert.deepEqual(planA, planB);
  assert.deepEqual(planB, planC);
  assert.deepEqual(planC, planD);

  // Normal day plan (e.g. 2026-10-05 Monday)
  const normalPlan = getEditorialDailyPlan('2026-10-05');
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

  const lifeTopic: EditorialTopic = {
    id: 'life-01',
    canonicalTopic: 'Weekly Planning and Time Blocking Protocol for Deep Focus',
    slug: 'weekly-planning-time-blocking-protocol',
    pillar: 'life',
    sourceSignals: [],
    queryVariants: ['weekly planning system'],
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
    tags: ['life', 'productivity'],
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

  const candidatePool = [aiTopic1, aiTopic2, lifeTopic, foodTopic, entertainmentTopic];

  // Selection on AI Day (2026-10-06 is Tuesday, an AI Day) with standard AI day totalLimit: 1
  const resultAiDay = selectEditorialCandidates(candidatePool, {
    targetDate: '2026-10-06',
    totalLimit: 1,
  });

  assert.equal(resultAiDay.approved.length, 1, 'Exactly 1 article approved on dedicated AI day');
  assert.equal(resultAiDay.approved[0].targetProject, 'get-ai-set', 'Selected article is GetAISet');
  assert.equal(resultAiDay.approved[0].id, 'getaiset-tools-01', 'Top scoring GetAISet article selected');

  // Second AI candidate deferred
  const deferredAi = resultAiDay.deferred.filter((t) => t.targetProject === 'get-ai-set');
  assert.equal(deferredAi.length, 1);
  assert.equal(deferredAi[0].id, 'getaiset-tools-02');
  assert.ok(deferredAi[0].deferReason?.includes('GetAISet article quota'));

  // If custom totalLimit: 3 is explicitly provided on AI Day:
  const resultCustom = selectEditorialCandidates(candidatePool, {
    targetDate: '2026-10-06',
    totalLimit: 3,
  });
  assert.equal(resultCustom.approved.length, 3);
  assert.equal(resultCustom.approved.filter((t) => t.targetProject === 'get-ai-set').length, 1);
  assert.equal(resultCustom.approved.filter((t) => t.targetProject !== 'get-ai-set').length, 2);
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

  const lifeTopic: EditorialTopic = {
    id: 'life-01',
    canonicalTopic: 'Desk Ergonomics and Screen Setup for Daily Focus',
    slug: 'desk-ergonomics-screen-setup-daily-focus',
    pillar: 'life',
    sourceSignals: [],
    queryVariants: ['desk setup ergonomics'],
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
    tags: ['life'],
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
  const result = selectEditorialCandidates([techTopic, lifeTopic, moneyTopic, foodTopic], {
    targetDate: '2026-10-05',
    totalLimit: 3,
  });

  assert.equal(result.approved.length, 3, 'Exactly 3 articles approved');
  // Selected strictly by quality/opportunity ranking: style->life (92) -> tech-ai (90) -> money->wealth (88)
  assert.equal(result.approved[0].pillar, 'life');
  assert.equal(result.approved[1].pillar, 'tech-ai');
  assert.equal(result.approved[2].pillar, 'wealth');

  // food-drink->home (83) deferred due to lower score without forced rotation
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].pillar, 'home');
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

test('8. Featured Guides Management Service: Lists existing guides and parses schema compliance', async () => {
  const existingGuides = await listExistingGuides();
  assert.ok(existingGuides.length >= 13, `Must find at least 13 guides in src/content/guides (found ${existingGuides.length})`);

  for (const g of existingGuides) {
    assert.ok(g.slug.length > 0);
    assert.ok(g.frontmatter.title.length > 0);
    assert.ok(
      ['food-kitchen', 'cleaning-laundry', 'home-maintenance', 'storage-organization', 'everyday-how-to'].includes(
        g.frontmatter.category
      ),
      `Category "${g.frontmatter.category}" must be a valid Guide category`
    );
    assert.ok(g.frontmatter.quickSummary.length > 0);
    assert.ok(g.frontmatter.publishedDate.length >= 10);
    assert.ok(g.frontmatter.updatedDate.length >= 10);
  }
});

test('9. Guide Opportunity Execution: Creates or updates guides on Mon/Wed/Fri with duplicate prevention', async () => {
  // Test execution on a Guide Day (2026-10-05 is Monday) in dryRun mode
  const guideResultDryRun = await processGuideOpportunity({
    targetDate: '2026-10-05',
    dryRun: true,
  });

  assert.equal(guideResultDryRun.isCadenceDay, true);
  assert.equal(guideResultDryRun.dryRun, true);
  assert.ok(guideResultDryRun.status === 'CREATED' || guideResultDryRun.status === 'UPDATED');
  assert.ok(guideResultDryRun.slug && guideResultDryRun.slug.length > 0);
  assert.ok(
    ['food-kitchen', 'cleaning-laundry', 'home-maintenance', 'storage-organization', 'everyday-how-to'].includes(
      guideResultDryRun.category!
    )
  );

  // Test execution on a Non-Guide Day (2026-10-04 is Sunday)
  const nonGuideDayResult = await processGuideOpportunity({
    targetDate: '2026-10-04',
    dryRun: true,
  });

  assert.equal(nonGuideDayResult.isCadenceDay, false);
  assert.equal(nonGuideDayResult.status, 'SKIPPED');
});

test('10. Total Weekly Production Schedule Summary: Articles, GetAISet, Tools, Life Hacks, and Guides', () => {
  const days = [
    { date: '2026-10-04', dayName: 'Sunday', expAi: false, expGuide: false, expTools: true, expHacks: false },
    { date: '2026-10-05', dayName: 'Monday', expAi: false, expGuide: true, expTools: false, expHacks: false },
    { date: '2026-10-06', dayName: 'Tuesday', expAi: true, expGuide: false, expTools: false, expHacks: true },
    { date: '2026-10-07', dayName: 'Wednesday', expAi: false, expGuide: true, expTools: false, expHacks: false },
    { date: '2026-10-08', dayName: 'Thursday', expAi: true, expGuide: false, expTools: false, expHacks: true },
    { date: '2026-10-09', dayName: 'Friday', expAi: false, expGuide: true, expTools: false, expHacks: false },
    { date: '2026-10-10', dayName: 'Saturday', expAi: true, expGuide: false, expTools: false, expHacks: true },
  ];

  let totalArticles = 0;
  let totalAiArticles = 0;
  let totalDynamicArticles = 0;
  let totalGuides = 0;
  let totalTools = 0;
  let totalHacks = 0;

  for (const d of days) {
    const plan = getEditorialDailyPlan(d.date);
    assert.equal(plan.isAiDay, d.expAi, `${d.dayName} AI status`);
    assert.equal(plan.isGuidesDay, d.expGuide, `${d.dayName} Guides status`);
    assert.equal(plan.isToolsDay, d.expTools, `${d.dayName} Tools status`);
    assert.equal(plan.isLifeHacksDay, d.expHacks, `${d.dayName} Life Hacks status`);

    totalArticles += plan.totalArticlesTarget;
    totalAiArticles += plan.aiArticlesTarget;
    totalDynamicArticles += plan.dynamicArticlesTarget;
    totalGuides += plan.guidesTarget;
    totalTools += plan.toolsTarget;
    totalHacks += plan.lifeHacksTarget;
  }

  // Exact weekly target verification:
  assert.equal(totalArticles, 21, 'Exactly 21 articles/week');
  assert.equal(totalAiArticles, 3, 'Exactly 3 GetAISet articles/week (Tue, Thu, Sat)');
  assert.equal(totalDynamicArticles, 18, 'Exactly 18 dynamic LifeMode articles/week');
  assert.equal(totalGuides, 3, 'Exactly 3 Guide opportunities/week (Mon, Wed, Fri)');
  assert.equal(totalTools, 1, 'Exactly 1 Tools item/week (Sun)');
  assert.equal(totalHacks, 3, 'Exactly 3 Life Hacks video opportunities/week (Tue, Thu, Sat)');
});
