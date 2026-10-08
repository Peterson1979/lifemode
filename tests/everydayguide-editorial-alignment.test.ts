import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  isMeaningfulEditorialTopic,
  normalizePillar,
  toEditorialTitleCase,
  LEGACY_PILLAR_MAP,
} from '../src/lib/editorial/normalization.ts';
import {
  classifyTrendingQueryPillar,
} from '../src/lib/editorial/discovery/adapters/google-trends.ts';
import {
  transformSignalToCandidate,
  evaluatePracticalIntent,
} from '../src/lib/editorial/discovery/transform.ts';
import {
  selectEditorialCandidates,
} from '../src/lib/editorial/selection.ts';
import {
  deriveEditorialTitleAngle,
  synthesizeEditorialBrief,
  buildContentBrief,
  deriveArticleFormat,
} from '../src/lib/editorial/brief.ts';
import {
  detectFormulaicTitle,
  FORMULAIC_TITLE_PATTERNS,
} from '../src/lib/editorial/quality.ts';
import {
  validateEditorialArticle,
  evaluateContentFormation,
} from '../src/lib/editorial/validation/validator.ts';
import {
  validateGeneratedArticle,
} from '../src/lib/editorial/generation/validation.ts';
import {
  briefToGenerationRequest,
} from '../src/lib/editorial/generation/brief-adapter.ts';
import {
  buildGenerationPrompt,
} from '../src/lib/editorial/generation/prompt.ts';
import {
  isAiCadenceDay,
  getEditorialDailyPlan,
} from '../src/lib/editorial/cadence.ts';
import { ACTIVE_PILLARS, type EditorialTopic } from '../src/lib/editorial/types.ts';
import type { DiscoverySignal } from '../src/lib/editorial/discovery/types.ts';

// ---------------------------------------------------------------------------
// 1. Legacy Category and Entertainment Rejection
// ---------------------------------------------------------------------------
test('1. Legacy Category Rejection: entertainment, travel, style, culture are rejected and do not map to active pillars', () => {
  assert.equal(LEGACY_PILLAR_MAP['entertainment'] ?? null, null);
  assert.equal(LEGACY_PILLAR_MAP['travel'] ?? null, null);
  assert.equal(LEGACY_PILLAR_MAP['style'] ?? null, null);
  assert.equal(LEGACY_PILLAR_MAP['culture'] ?? null, null);
  assert.equal(LEGACY_PILLAR_MAP['gaming'] ?? null, null);
  assert.equal(LEGACY_PILLAR_MAP['sports'] ?? null, null);

  assert.equal(normalizePillar('entertainment'), null);
  assert.equal(normalizePillar('travel'), null);
  assert.equal(normalizePillar('style'), null);
  assert.equal(normalizePillar('culture'), null);
  assert.equal(normalizePillar('gaming'), null);
  assert.equal(normalizePillar('sports'), null);

  // Excluded topics must fail isMeaningfulEditorialTopic
  const entertainmentQueries = [
    'Summer Blockbusters 2026: Movies to Watch',
    'Celebrity Red Carpet Fashion Highlights',
    'Top 10 Tourist Destinations in Southern Italy',
    'Cinema Box Office Records and Hollywood Drama',
    'Grammy Awards Nominees and Music Gossip',
    'Premier League Match Results and Football Transfer News',
  ];

  for (const q of entertainmentQueries) {
    const res = isMeaningfulEditorialTopic(q);
    assert.equal(res.isValid, false, `Expected "${q}" to be rejected`);
  }
});

// ---------------------------------------------------------------------------
// 2. Gaming vs Practical Maintenance Disambiguation
// ---------------------------------------------------------------------------
test('2. Gaming vs Practical Maintenance: MMO/server maintenance is rejected; home appliance/hvac maintenance is accepted', () => {
  const gamingMaintenanceTopics = [
    'Aion 2 Server Maintenance and Weekly Patch Notes',
    'World of Warcraft Server Maintenance Schedule',
    'Final Fantasy XIV Scheduled Maintenance and Raid Reset',
    'Fortnite Server Downtime and Battle Pass Update',
  ];

  for (const topic of gamingMaintenanceTopics) {
    const check = isMeaningfulEditorialTopic(topic);
    assert.equal(check.isValid, false, `Expected gaming topic "${topic}" to be rejected`);
    assert.equal(classifyTrendingQueryPillar(topic), null, `Expected pillar classification to be null for "${topic}"`);
  }

  const practicalMaintenanceTopics = [
    { topic: 'How to Clean and Maintain a Refrigerator Condenser Coil', pillar: 'home' },
    { topic: 'Winter HVAC Filter Replacement and Seasonal Maintenance Protocol', pillar: 'home' },
    { topic: 'How to Descale an Espresso Machine and Care for Boiler Seals', pillar: 'home' },
    { topic: 'Gutter Cleaning and Downspout Drainage Maintenance Protocol', pillar: 'home' },
  ];

  for (const { topic, pillar } of practicalMaintenanceTopics) {
    const check = isMeaningfulEditorialTopic(topic);
    assert.equal(check.isValid, true, `Expected practical maintenance topic "${topic}" to be valid`);
    const classified = classifyTrendingQueryPillar(topic);
    assert.equal(classified, pillar, `Expected pillar "${pillar}" for "${topic}"`);
  }
});

// ---------------------------------------------------------------------------
// 3. Generic Trend & Abstract Essay Rejection
// ---------------------------------------------------------------------------
test('3. Generic Trend & Abstract Essay Rejection: vague lifestyle buzz and philosophical musings are rejected', () => {
  const vagueTrends = [
    'Why This Appliance Trend Is Transforming Modern Homes',
    'The Philosophy of Contemporary Intentional Living',
    'Modern Living Aesthetics in Urban Spaces',
    'What Is Digital Mindfulness and Why Everyone Is Talking About It',
    'Vibe Shift: How Modern Consumers Are Reimagining Everything',
  ];

  for (const trend of vagueTrends) {
    const check = isMeaningfulEditorialTopic(trend);
    assert.equal(check.isValid, false, `Expected vague trend "${trend}" to be rejected`);
  }
});

// ---------------------------------------------------------------------------
// 4. Practical-Intent Scoring & EverydayGuide Boosts
// ---------------------------------------------------------------------------
test('4. Practical-Intent Scoring: Actionable protocols and decision frameworks receive intent bonuses', () => {
  const protocolIntent = evaluatePracticalIntent('How to Store Cooked Rice Safely in the Refrigerator');
  assert.equal(protocolIntent.isProtocolOrAction, true);
  assert.equal(protocolIntent.isDecisionOrComparison, false);

  const decisionIntent = evaluatePracticalIntent('Cast Iron vs Stainless Steel Cookware: Decision Matrix and Sizing Guide');
  assert.equal(protocolIntent.isProtocolOrAction, true); // contains protocol intent
  assert.equal(decisionIntent.isDecisionOrComparison, true);

  const signalProtocol: DiscoverySignal = {
    source: 'RSS_FEEDS',
    rawQuery: 'How to Store Cooked Rice: Food Safety Guidelines and Reheating Protocol',
    category: 'home',
    timestamp: new Date().toISOString(),
    metrics: { searchVolume: 50000 },
  };

  const candidate = transformSignalToCandidate(signalProtocol, 0);
  assert.ok(candidate);
  assert.ok(candidate.totalScore >= 80, `Expected score >= 80, got ${candidate.totalScore}`);
  assert.equal(candidate.pillar, 'home');
});

// ---------------------------------------------------------------------------
// 5. Protocol vs Decision Classification in Brief Synthesis
// ---------------------------------------------------------------------------
test('5. Content Type Classification: Content briefs distinguish between Reference Protocol and Decision Framework', () => {
  const protocolTopic: EditorialTopic = {
    id: 'lm-home-cooked-rice',
    canonicalTopic: 'How to Store Cooked Rice: The Safety Rules and Reheating Protocol',
    slug: 'how-to-store-cooked-rice-safety-rules-reheating-protocol',
    pillar: 'home',
    sourceSignals: [],
    queryVariants: ['how to store cooked rice', 'reheat rice safely'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 70,
      socialPotential: 65,
      lifeModeRelevance: 95,
      commercialPotential: 40,
      freshness: 60,
      competitionOpportunity: 80,
      originalityPotential: 85,
    },
    totalScore: 88,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['kitchen', 'food-safety', 'storage'],
  };

  const protocolBrief = synthesizeEditorialBrief(protocolTopic);
  assert.equal(protocolBrief.contentType, 'reference');
  assert.ok(protocolBrief.outlineSections.some((s) => s.heading.includes('Protocol') || s.heading.includes('Summary')));

  const decisionTopic: EditorialTopic = {
    id: 'lm-tools-cookware-materials',
    canonicalTopic: 'Which Cookware Material Is Right for You? Cast Iron vs Stainless Steel vs Carbon Steel',
    slug: 'which-cookware-material-is-right-cast-iron-vs-stainless-vs-carbon-steel',
    pillar: 'tools',
    sourceSignals: [],
    queryVariants: ['cast iron vs stainless steel', 'cookware material decision guide'],
    scoring: {
      searchPotential: 88,
      pinterestPotential: 75,
      socialPotential: 70,
      lifeModeRelevance: 95,
      commercialPotential: 80,
      freshness: 50,
      competitionOpportunity: 82,
      originalityPotential: 88,
    },
    totalScore: 90,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['cookware', 'kitchen-tools', 'decision-guide'],
  };

  const decisionBrief = synthesizeEditorialBrief(decisionTopic);
  assert.equal(decisionBrief.contentType, 'decision');
  assert.ok(decisionBrief.outlineSections.some((s) => s.heading.includes('Decision') || s.heading.includes('Matrix') || s.heading.includes('Tradeoff')));
});

// ---------------------------------------------------------------------------
// 6. Title Quality & Banned Abstract Title Formulas
// ---------------------------------------------------------------------------
test('6. Title Quality & Banned Formulas: Eliminates "The Art of X: Restraint..." and "Elevates Modern Living"', () => {
  const bannedTitles = [
    'The Art of Kitchen Maintenance: Restraint, Craft, and Purpose',
    'How Cookware Elevates Modern Daily Living',
    'The Poetry of Cast Iron: Restraint, Craft, & Purpose',
    'How Morning Sunlight Elevates Contemporary Living',
    'The Curated Pantry: Restraint, Craft, and Purpose',
  ];

  for (const title of bannedTitles) {
    const isFormulaic = FORMULAIC_TITLE_PATTERNS.some((p) => p.test(title));
    assert.equal(isFormulaic, true, `Expected "${title}" to match banned formula pattern`);
    assert.equal(detectFormulaicTitle(title), true, `Expected detectFormulaicTitle to flag "${title}"`);
  }

  const validEverydayTitles = [
    'How to Store Cooked Rice: The Safety Rules and Reheating Protocol',
    'Which Cookware Material Is Right for You? Cast Iron vs Stainless Steel vs Carbon Steel',
    'How to Clean a Coffee Machine: What to Use and What to Avoid',
    'How to Use AI Vision to Identify Objects, Translate Labels, and Troubleshoot Everyday Problems',
    'How to Choose a High-Yield Savings Account: Rates, Fees, and FDIC Insurance Explained',
  ];

  for (const title of validEverydayTitles) {
    const isFormulaic = FORMULAIC_TITLE_PATTERNS.some((p) => p.test(title));
    assert.equal(isFormulaic, false, `Expected "${title}" NOT to match formula pattern`);
    assert.equal(detectFormulaicTitle(title), false, `Expected detectFormulaicTitle to accept "${title}"`);
  }
});

// ---------------------------------------------------------------------------
// 7. Validation Gate rejects commentary, formulaic titles, and missing practical structure
// ---------------------------------------------------------------------------
test('7. Validation Gate: Rejects articles with formulaic titles or legacy categories', () => {
  const formulaicArticle = {
    title: 'The Art of Cookware: Restraint, Craft, and Purpose',
    slug: 'the-art-of-cookware-restraint-craft-and-purpose',
    description: 'An abstract meditation on kitchen items and restraint.',
    excerpt: 'An abstract meditation on kitchen items and restraint.',
    content: `## Quick Summary & Key Parameters\n\nChoosing the right cookware requires evaluating thermal conductivity, heat retention, maintenance demands, and non-reactive cooking surfaces across daily culinary protocols. Cast iron offers unmatched thermal mass for high-heat searing, while tri-ply stainless steel delivers precise temperature responsiveness without reactive acid degradation. Carbon steel bridges both worlds with lightweight agility and natural seasoning development.\n\n## Core Decision Criteria\n\nCarefully assess whether your primary recipes involve high acidity like tomato sauces or rapid thermal changes like stir-frying. Maintenance protocols differ significantly between dishwasher-safe stainless steel and hand-washed seasoned iron surfaces.`,
    sources: [{ name: 'Culinary Standards Institute', url: 'https://www.culinarystandards.org' }],
  };

  const resultFormulaic = validateEditorialArticle(formulaicArticle, {
    topicId: 'lm-home-cookware',
    pillar: 'home',
  });
  assert.equal(resultFormulaic.passed, false);
  assert.ok(resultFormulaic.errors.some((e) => e.toLowerCase().includes('formulaic') || e.toLowerCase().includes('generic')));

  const validArticle = {
    title: 'Which Cookware Material Is Right for You? Cast Iron vs Stainless Steel vs Carbon Steel',
    slug: 'which-cookware-material-is-right-cast-iron-vs-stainless-vs-carbon-steel',
    description: 'A practical comparison matrix and decision guide for cast iron, stainless steel, and carbon steel pans.',
    excerpt: 'Comparing cast iron, stainless steel, and carbon steel cookware materials.',
    content: `## Quick Summary & Key Parameters\n\nChoosing the right cookware requires evaluating thermal conductivity, heat retention, maintenance demands, and non-reactive cooking surfaces across daily culinary protocols. Cast iron offers unmatched thermal mass for high-heat searing, while tri-ply stainless steel delivers precise temperature responsiveness without reactive acid degradation. Carbon steel bridges both worlds with lightweight agility and natural seasoning development.\n\n## Core Decision Criteria\n\nCarefully assess whether your primary recipes involve high acidity like tomato sauces or rapid thermal changes like stir-frying. Maintenance protocols differ significantly between dishwasher-safe stainless steel and hand-washed seasoned iron surfaces. Always match the pan material to your heat source and cleaning preferences for optimal longevity.`,
    sources: [{ name: 'Culinary Standards Institute', url: 'https://www.culinarystandards.org' }],
  };

  const resultValid = validateEditorialArticle(validArticle, {
    topicId: 'lm-home-cookware-valid',
    pillar: 'home',
  });
  assert.equal(resultValid.passed, true);
});

// ---------------------------------------------------------------------------
// 8. Insufficient Candidate Threshold: Do NOT fill daily quota with weak candidates
// ---------------------------------------------------------------------------
test('8. Selection Bar: Only candidates >= 80 score are approved; never fills quota with weak candidates', () => {
  const sampleCandidate = (id: string, score: number, pillar: any): EditorialTopic => ({
    id,
    canonicalTopic: `Practical Topic ${id}`,
    slug: `practical-topic-${id}`,
    pillar,
    sourceSignals: [],
    queryVariants: [],
    scoring: {
      searchPotential: score,
      pinterestPotential: score,
      socialPotential: score,
      lifeModeRelevance: score,
      commercialPotential: score,
      freshness: score,
      competitionOpportunity: score,
      originalityPotential: score,
    },
    totalScore: score,
    priorityTier: score >= 80 ? 'PRIORITY' : 'LOW_PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['test'],
  });

  // Only 1 candidate satisfies threshold >= 80
  const candidatePool: EditorialTopic[] = [
    sampleCandidate('cand-1', 88, 'home'),
    sampleCandidate('cand-2', 74, 'health'),
    sampleCandidate('cand-3', 68, 'wealth'),
    sampleCandidate('cand-4', 55, 'life'),
  ];

  const selection = selectEditorialCandidates(candidatePool, { minScoreThreshold: 80, totalLimit: 3 });
  // Must only approve the 1 strong candidate, NOT fill the remaining 2 quota slots with weak candidates
  assert.equal(selection.approved.length, 1);
  assert.equal(selection.approved[0].id, 'cand-1');
  assert.equal(selection.deferred.length, 2); // cand-2 (74) and cand-3 (68) are deferred
  assert.equal(selection.rejected.length, 1); // cand-4 (55) is rejected (< 60)
});

// ---------------------------------------------------------------------------
// 9. GetAISet 3-Day Cadence Preservation & Editorial Quality Enforcement
// ---------------------------------------------------------------------------
test('9. GetAISet Cadence: Exactly 3 GetAISet days per week (Tue/Thu/Sat) and 4 Regular LifeMode days (Sun/Mon/Wed/Fri)', () => {
  const dTue = new Date('2026-10-06T00:00:00.000Z'); // Tuesday -> AI Day
  const dWed = new Date('2026-10-07T00:00:00.000Z'); // Wednesday -> Regular Day
  const dThu = new Date('2026-10-08T00:00:00.000Z'); // Thursday -> AI Day
  const dFri = new Date('2026-10-09T00:00:00.000Z'); // Friday -> Regular Day
  const dSat = new Date('2026-10-10T00:00:00.000Z'); // Saturday -> AI Day

  assert.equal(isAiCadenceDay(dTue), true);
  assert.equal(isAiCadenceDay(dWed), false);
  assert.equal(isAiCadenceDay(dThu), true);
  assert.equal(isAiCadenceDay(dFri), false);
  assert.equal(isAiCadenceDay(dSat), true);

  const aiDayPlan = getEditorialDailyPlan(dTue);
  assert.equal(aiDayPlan.isAiDay, true);
  assert.equal(aiDayPlan.aiArticlesTarget, 1);
  assert.equal(aiDayPlan.dynamicArticlesTarget, 2);
  assert.equal(aiDayPlan.totalArticlesTarget, 3);

  const normalDayPlan = getEditorialDailyPlan(dWed);
  assert.equal(normalDayPlan.isAiDay, false);
  assert.equal(normalDayPlan.aiArticlesTarget, 0);
  assert.equal(normalDayPlan.dynamicArticlesTarget, 3);
  assert.equal(normalDayPlan.totalArticlesTarget, 3);
});

// ---------------------------------------------------------------------------
// 10. Six-Pillar Taxonomy Enforcement
// ---------------------------------------------------------------------------
test('10. Six Active Pillars: System strictly recognizes exactly 6 active editorial pillars', () => {
  const expectedPillars = ['health', 'wealth', 'home', 'life', 'tech-ai', 'tools'];
  assert.deepEqual(ACTIVE_PILLARS, expectedPillars);
  assert.equal(ACTIVE_PILLARS.length, 6);

  for (const pillar of expectedPillars) {
    assert.equal(normalizePillar(pillar), pillar);
  }

  const legacyPillars = ['entertainment', 'travel', 'style', 'culture', 'gaming', 'sports', 'celebrity'];
  for (const legacy of legacyPillars) {
    assert.equal(ACTIVE_PILLARS.includes(legacy as any), false);
    assert.equal(normalizePillar(legacy), null);
  }
});

// ---------------------------------------------------------------------------
// 11. Reference vs Decision Mode Propagation
// ---------------------------------------------------------------------------
test('11. Mode Propagation: Reference and Decision Briefs produce reference and decision modes', () => {
  const refTopic: EditorialTopic = {
    id: 'lm-home-rice-storage',
    canonicalTopic: 'How to Store Cooked Rice Safely',
    slug: 'how-to-store-cooked-rice-safely',
    pillar: 'home',
    sourceSignals: [],
    queryVariants: ['store cooked rice', 'rice food safety'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 70,
      socialPotential: 65,
      lifeModeRelevance: 95,
      commercialPotential: 40,
      freshness: 60,
      competitionOpportunity: 80,
      originalityPotential: 85,
    },
    totalScore: 88,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['kitchen', 'food-safety'],
  };

  const refBrief = synthesizeEditorialBrief(refTopic);
  assert.equal(refBrief.contentType, 'reference');
  assert.equal(refBrief.guideMode, 'reference');

  const refGenReq = briefToGenerationRequest(refBrief);
  assert.equal(refGenReq.guideMode, 'reference');

  const decTopic: EditorialTopic = {
    id: 'lm-tools-cookware-choice',
    canonicalTopic: 'Cast Iron vs Stainless Steel Cookware: Which Is Right for You?',
    slug: 'cast-iron-vs-stainless-steel-cookware',
    pillar: 'tools',
    sourceSignals: [],
    queryVariants: ['cast iron vs stainless', 'cookware comparison'],
    scoring: {
      searchPotential: 88,
      pinterestPotential: 75,
      socialPotential: 70,
      lifeModeRelevance: 95,
      commercialPotential: 80,
      freshness: 50,
      competitionOpportunity: 82,
      originalityPotential: 88,
    },
    totalScore: 90,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['cookware', 'comparison'],
  };

  const decBrief = synthesizeEditorialBrief(decTopic);
  assert.equal(decBrief.contentType, 'decision');
  assert.equal(decBrief.guideMode, 'decision');

  const decGenReq = briefToGenerationRequest(decBrief);
  assert.equal(decGenReq.guideMode, 'decision');
});

// ---------------------------------------------------------------------------
// 12. Mode-Specific Prompt Directives
// ---------------------------------------------------------------------------
test('12. Prompt Directives: Reference prompt contains practical/protocol guidance; Decision prompt contains comparison/tradeoff guidance', () => {
  const refTopic: EditorialTopic = {
    id: 'lm-home-clean-coffee',
    canonicalTopic: 'How to Descale an Espresso Machine: Step-by-Step Maintenance Protocol',
    slug: 'how-to-descale-espresso-machine',
    pillar: 'home',
    sourceSignals: [],
    queryVariants: ['descale espresso machine'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 70,
      socialPotential: 65,
      lifeModeRelevance: 95,
      commercialPotential: 40,
      freshness: 60,
      competitionOpportunity: 80,
      originalityPotential: 85,
    },
    totalScore: 88,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['coffee', 'maintenance'],
  };

  const refBrief = synthesizeEditorialBrief(refTopic);
  const refPrompt = buildGenerationPrompt(briefToGenerationRequest(refBrief));

  assert.ok(refPrompt.userPrompt.includes('- Content Mode: EVERGREEN_GUIDE (reference)'));
  assert.ok(refPrompt.systemPrompt.includes('### EVERGREEN / GUIDE EDITORIAL STRUCTURE:'));
  assert.ok(refPrompt.systemPrompt.includes('Mode: REFERENCE PROTOCOL'));
  assert.ok(refPrompt.systemPrompt.includes('actionable guidance'));
  assert.ok(refPrompt.systemPrompt.includes('key parameters'));
  assert.ok(refPrompt.systemPrompt.includes('troubleshooting'));
  assert.equal(refPrompt.fullPromptText.includes('DECISION_GUIDE'), false);

  const decTopic: EditorialTopic = {
    id: 'lm-tools-stand-mixers',
    canonicalTopic: 'Direct Drive vs Belt Driven Stand Mixers: Which Model Fits Your Baking?',
    slug: 'direct-drive-vs-belt-driven-stand-mixers',
    pillar: 'tools',
    sourceSignals: [],
    queryVariants: ['stand mixer comparison'],
    scoring: {
      searchPotential: 88,
      pinterestPotential: 75,
      socialPotential: 70,
      lifeModeRelevance: 95,
      commercialPotential: 80,
      freshness: 50,
      competitionOpportunity: 82,
      originalityPotential: 88,
    },
    totalScore: 90,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['mixers', 'decision-guide'],
  };

  const decBrief = synthesizeEditorialBrief(decTopic);
  const decPrompt = buildGenerationPrompt(briefToGenerationRequest(decBrief));

  assert.ok(decPrompt.userPrompt.includes('- Content Mode: EVERGREEN_GUIDE (decision)'));
  assert.ok(decPrompt.systemPrompt.includes('### EVERGREEN / GUIDE EDITORIAL STRUCTURE:'));
  assert.ok(decPrompt.systemPrompt.includes('Mode: DECISION FRAMEWORK'));
  assert.ok(decPrompt.systemPrompt.includes('decision criteria'));
  assert.ok(decPrompt.systemPrompt.includes('trade-offs'));
  assert.ok(decPrompt.systemPrompt.includes('comparison table'));
  assert.equal(decPrompt.fullPromptText.includes('DECISION_GUIDE'), false);
});

// ---------------------------------------------------------------------------
// 13. Deterministic Content Formation Validation: Structurally Valid vs Generic Failure
// ---------------------------------------------------------------------------
test('13. Content Formation QA: Valid reference and decision articles pass; generic non-actionable or non-comparative articles fail', () => {
  // A. Structurally valid reference article with natural headings
  const validReferenceArticle = {
    title: 'How to Descale an Espresso Machine: Safe Cleaning and Maintenance Protocol',
    slug: 'how-to-descale-an-espresso-machine-safe-cleaning-maintenance-protocol',
    description: 'A step-by-step household protocol for descaling espresso machine boilers using citric acid solution.',
    excerpt: 'Step-by-step descaling protocol, solution ratios, and flush sequences for home espresso machines.',
    content: `## What You Need
Before beginning, prepare 2 tablespoons of food-grade citric acid powder, 1 liter of warm filtered water, a collection pitcher, and a clean microfiber cloth.

## The Right Process
1. Dissolve 2 tablespoons of citric acid into 1 liter of warm water until fully clear.
2. Fill the machine reservoir with the solution and power on the boiler until operating temperature is reached.
3. Run 200ml through the group head and 100ml through the steam wand. Allow the solution to rest inside the boiler for 20 minutes to dissolve mineral scale.
4. Flush the remaining solution, then run two complete reservoirs of clean water to rinse.

## Common Problems & Failure Prevention
Never use vinegar in machines with aluminum boilers or silicone group gaskets to prevent rubber degradation. If water flow remains restricted, inspect the shower screen for scale blockage.`,
    sources: [{ name: 'Espresso Equipment Standards', url: 'https://espresso-standards.org/care' }],
  };

  const refValidReport = validateEditorialArticle(validReferenceArticle, {
    topicId: 'lm-home-descale-espresso',
    pillar: 'home',
    format: 'guide',
    contentType: 'reference',
    guideMode: 'reference',
  });
  assert.equal(refValidReport.passed, true);
  assert.equal(refValidReport.errors.length, 0);

  // B. Generic non-actionable essay fails as reference content
  const genericReferenceEssay = {
    title: 'How to Care for Kitchen Appliances in Daily Living',
    slug: 'how-to-care-for-kitchen-appliances-in-daily-living',
    description: 'An abstract meditation on the role of appliances in modern domestic routines.',
    excerpt: 'Reflections on the beauty and purpose of kitchen appliances.',
    content: `## The Joy of the Morning Kitchen
The kitchen represents the heart of the home where family members gather. Modern life is made richer by the quiet moments we share before the day begins.

## Reflections on Domestic Machinery
Appliances serve as silent companions in our daily lives. Taking time to appreciate their contribution elevates contemporary daily living.

## Embracing Everyday Care
Caring for our tools is an act of mindfulness. When we care for what surrounds us, we foster peace in our environment.`,
    sources: [{ name: 'Domestic Arts Journal', url: 'https://domesticarts.org/home' }],
  };

  const refGenericReport = validateEditorialArticle(genericReferenceEssay, {
    topicId: 'lm-home-care-appliances',
    pillar: 'home',
    format: 'guide',
    contentType: 'reference',
    guideMode: 'reference',
  });
  assert.equal(refGenericReport.passed, false);
  assert.equal(refGenericReport.checks.structure, false);
  assert.ok(refGenericReport.errors.some((e) => e.includes('lacks actionable practical guidance')));

  // Also test through validateGeneratedArticle
  const genReport = validateGeneratedArticle(genericReferenceEssay, {
    topicId: 'lm-home-care-appliances',
    titleAngle: genericReferenceEssay.title,
    pillar: 'home',
    format: 'guide',
    audience: 'Homeowners',
    primaryIntent: 'informational',
    riskLevel: 'low',
    searchTargets: { primaryKeyword: 'care for kitchen appliances' },
    affiliateIntent: false,
    contentType: 'reference',
    guideMode: 'reference',
  });
  assert.equal(genReport.isValid, false);
  assert.ok(genReport.issues.some((i) => i.rule === 'CONTENT_FORMATION_MISMATCH'));

  // C. Structurally valid decision article with natural headings
  const validDecisionArticle = {
    title: 'Which Cooktop Surface Is Right for You? Induction vs Gas vs Electric Radiant',
    slug: 'which-cooktop-surface-is-right-induction-vs-gas-vs-electric',
    description: 'A practical evaluation of heating speed, energy efficiency, cookware compatibility, and maintenance across cooktop types.',
    excerpt: 'Comparing induction, gas, and radiant cooktops on responsiveness, efficiency, and cleaning.',
    content: `## What Matters Most
When selecting a cooktop surface, consider four primary decision criteria: heat responsiveness, thermal efficiency, ventilation requirements, and cookware compatibility.

## How the Options Differ
Induction cooktops deliver 85% to 90% energy transfer efficiency and instant thermal adjustments, but require magnetic ferrous cookware. In contrast, gas ranges provide visual flame feedback and work with any pan material, but lose over 60% of heat into ambient room air. Electric radiant cooktops offer low purchase costs but slow response times.

## Which Option Fits Which Situation
- Choose Induction if you prioritize rapid boiling, easy flat-glass cleaning, and indoor air quality.
- Choose Gas if you use round-bottom woks, frequently char peppers directly over flame, or already have dedicated gas line hookups.
Avoid underestimating electrical circuit breaker requirements when upgrading to high-wattage induction units.`,
    sources: [{ name: 'Home Energy Institute', url: 'https://homeenergy.org/cooktops' }],
  };

  const decValidReport = validateEditorialArticle(validDecisionArticle, {
    topicId: 'lm-tools-cooktop-comparison',
    pillar: 'tools',
    format: 'curation',
    contentType: 'decision',
    guideMode: 'decision',
  });
  assert.equal(decValidReport.passed, true);
  assert.equal(decValidReport.errors.length, 0);

  // D. Generic informational article fails as decision content
  const genericDecisionArticle = {
    title: 'Which Cooktop Surface Is Right for You? Modern Cooking Appliances',
    slug: 'which-cooktop-surface-is-right-modern-cooking-appliances',
    description: 'General information about cooking appliances and food culture.',
    excerpt: 'A general overview of stoves and kitchens.',
    content: `## The Evolution of Cooking Surfaces
Cooking food over heat is one of humanity’s oldest discoveries. Today homes use various heating methods.

## Kitchen Design Considerations
A kitchen layout should reflect personal aesthetic preferences and open floor plan concepts.

## Final Summary
Cooking brings people together around delicious home-cooked meals every day.`,
    sources: [{ name: 'Kitchen Design Review', url: 'https://kitchendesign.org/review' }],
  };

  const decGenericReport = validateEditorialArticle(genericDecisionArticle, {
    topicId: 'lm-tools-cooktop-generic',
    pillar: 'tools',
    format: 'curation',
    contentType: 'decision',
    guideMode: 'decision',
  });
  assert.equal(decGenericReport.passed, false);
  assert.equal(decGenericReport.checks.structure, false);
  assert.ok(decGenericReport.errors.some((e) => e.includes('lacks comparative decision support')));
});

// ---------------------------------------------------------------------------
// 14. Explainer and News Formation QA
// ---------------------------------------------------------------------------
test('14. Content Formation QA: Explainer and News behaviors remain intact and validated', () => {
  // Explainer article
  const validExplainer = {
    title: 'How Induction Cooktops Work: The Science of Electromagnetic Heating',
    slug: 'how-induction-cooktops-work-electromagnetic-heating',
    description: 'An accessible scientific breakdown of alternating magnetic fields and Joule heating in induction cooking.',
    excerpt: 'The physics behind induction coils, eddy currents, and resistive heat generation.',
    content: `## How Induction Heating Operates
Induction cooktops function by passing high-frequency alternating electrical current through copper coils beneath the ceramic glass surface. This creates an oscillating magnetic field that penetrates the bottom of ferromagnetic cookware.

## The Mechanism of Eddy Currents and Resistance
When the magnetic field interacts with the iron in the pan, it induces rapid swirling electrical currents called eddy currents. Because the iron offers electrical resistance to these currents, kinetic energy is converted directly into thermal heat inside the base of the pan.

## Why Thermal Efficiency Is Superior
Because heat is generated directly inside the pan rather than transferred through ambient air, over 85% of electrical energy reaches the food. This mechanism explains why induction surfaces remain relatively cool to the touch.`,
    sources: [{ name: 'Applied Physics Research', url: 'https://appliedphysics.org/induction' }],
  };

  const explainerReport = validateEditorialArticle(validExplainer, {
    topicId: 'lm-tech-ai-induction-physics',
    pillar: 'tech-ai',
    format: 'deep-dive',
    contentType: 'EXPLAINER',
  });
  assert.equal(explainerReport.passed, true);
  assert.equal(explainerReport.errors.length, 0);

  const tipsExplainer = {
    title: 'How Induction Cooktops Work: 5 Quick Tips for Everyday Users',
    slug: 'how-induction-cooktops-work-5-quick-tips',
    description: 'A list of five simple tips for using an induction cooktop.',
    excerpt: 'Five tips for induction cooking.',
    content: `## 1. Keep It Clean
Always wipe down the glass after cooking.

## 2. Buy Good Pans
Make sure pans are flat on the bottom.

## 3. Adjust Temperatures
Use the touch buttons to change heat.`,
    sources: [{ name: 'Kitchen Tips', url: 'https://kitchentips.org' }],
  };

  const tipsExplainerReport = validateEditorialArticle(tipsExplainer, {
    topicId: 'lm-tech-ai-induction-tips',
    pillar: 'tech-ai',
    format: 'deep-dive',
    contentType: 'EXPLAINER',
  });
  assert.equal(tipsExplainerReport.passed, false);
  assert.ok(tipsExplainerReport.errors.some((e) => e.includes('lacks explanatory and causal substance')));
});

// ---------------------------------------------------------------------------
// 15. Zero DECISION_GUIDE in Production Code
// ---------------------------------------------------------------------------
test('15. Architectural Integrity: No production code in src/lib/editorial uses DECISION_GUIDE', () => {
  const editorialDir = path.resolve('src/lib/editorial');
  
  function scanDirectory(dir: string): string[] {
    const files = fs.readdirSync(dir);
    let results: string[] = [];
    for (const f of files) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(scanDirectory(fullPath));
      } else if (f.endsWith('.ts') || f.endsWith('.js')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const allEditorialFiles = scanDirectory(editorialDir);
  for (const file of allEditorialFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    assert.equal(
      content.includes('DECISION_GUIDE'),
      false,
      `File ${file} contains obsolete type DECISION_GUIDE`
    );
  }
});
