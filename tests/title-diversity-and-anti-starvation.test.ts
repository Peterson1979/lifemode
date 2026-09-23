import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveEditorialTitleAngle } from '../src/lib/editorial/brief.ts';
import { detectFormulaicTitle, detectRepetitiveTitlePattern } from '../src/lib/editorial/quality.ts';
import { selectEditorialCandidates, calculatePillarStarvationBoost } from '../src/lib/editorial/selection.ts';
import { getDiscoveryFeedsFromRegistry, SOURCE_REGISTRY } from '../src/lib/editorial/sources/registry.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';

test('1. Title Angle Generation: Produces diverse, substantive titles and avoids formulaic ": What to Know"', () => {
  const topics: Array<{ canonicalTopic: string; pillar: any }> = [
    { canonicalTopic: 'Global Sleep Hygiene Science', pillar: 'wellbeing' },
    { canonicalTopic: 'Kyoto Tea House Architecture', pillar: 'culture' },
    { canonicalTopic: 'Minimalist Wardrobe Systems', pillar: 'style' },
    { canonicalTopic: 'Extra Virgin Olive Oil Standards', pillar: 'food-drink' },
    { canonicalTopic: 'Treasury Yield Curve Inversion', pillar: 'money' },
    { canonicalTopic: 'Autonomous Vehicle Deployment', pillar: 'tech-ai' },
    { canonicalTopic: 'Alps Alpine Train Routes', pillar: 'travel' },
  ];

  for (const topic of topics) {
    const angle = deriveEditorialTitleAngle(topic.canonicalTopic, topic.pillar);
    assert.ok(angle, `Angle must be generated for ${topic.canonicalTopic}`);
    assert.ok(!angle.toLowerCase().includes('what to know'), `Angle "${angle}" must not contain ": What to Know"`);
    assert.ok(!angle.toLowerCase().includes('what you need to know'), `Angle "${angle}" must not contain ": What You Need to Know"`);

    const isFormulaic = detectFormulaicTitle(angle);
    assert.equal(isFormulaic, false, `Generated angle "${angle}" should pass formulaic check`);
  }
});

test('2. Title Pattern Detection: Flags formulaic patterns and excessive repetition across recent titles', () => {
  // Direct formulaic patterns
  assert.equal(detectFormulaicTitle('Tokyo Coffee Scene: What to Know'), true);
  assert.equal(detectFormulaicTitle('Sleep Hygiene: What You Need to Know'), true);
  assert.equal(detectFormulaicTitle('Electric Vehicles: What You Should Know'), true);
  assert.equal(detectFormulaicTitle('Inside Tokyo’s Specialty Coffee Culture'), false);

  // Cross-article pattern repetition
  const recentTitles = [
    'Exploring Tokyo’s Hidden Architecture',
    'Exploring Kyoto’s Zen Gardens',
    'Exploring Osaka’s Street Markets',
  ];

  const repeatedCandidate = 'Exploring Nara’s Sacred Groves';
  const nonRepeatedCandidate = 'Inside the Preservation of Nara’s Ancient Cedars';

  const repetitionDetected = detectRepetitiveTitlePattern(repeatedCandidate, recentTitles, 3);
  assert.equal(repetitionDetected.isRepetitive, true, 'Should detect excessive repetition of "Exploring X" prefix');

  const cleanRepetition = detectRepetitiveTitlePattern(nonRepeatedCandidate, recentTitles, 3);
  assert.equal(cleanRepetition.isRepetitive, false, 'Should allow diverse title structures');
});

test('3. Anti-Starvation Boost: Accurately calculates dynamic boost based on elapsed days', () => {
  assert.equal(calculatePillarStarvationBoost('style', undefined), 0);
  assert.equal(calculatePillarStarvationBoost('style', { style: 1 }), 0);
  assert.equal(calculatePillarStarvationBoost('style', { style: 3.5 }), 3);
  assert.equal(calculatePillarStarvationBoost('style', { style: 5.5 }), 6);
  assert.equal(calculatePillarStarvationBoost('style', { style: 8.0 }), 10);
});

test('4. Candidate Selection: Prevents starvation of underserved pillars while preserving minimum quality bar', () => {
  const baseTopic = (id: string, pillar: any, totalScore: number, canonicalTopic: string): EditorialTopic => ({
    id,
    pillar,
    canonicalTopic,
    slug: canonicalTopic.toLowerCase().replace(/\s+/g, '-'),
    status: 'SCORED',
    opportunityType: 'ARTICLE',
    priorityTier: 'PRIORITY',
    totalScore,
    freshnessScore: 85,
    queryVariants: [canonicalTopic],
    scoring: {
      searchPotential: totalScore,
      pinterestPotential: 80,
      socialPotential: 75,
      lifeModeRelevance: 90,
      commercialPotential: 60,
      freshness: 85,
      competitionOpportunity: 70,
      originalityPotential: 80,
    },
    tags: [pillar],
    sourceSignals: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Tech candidate with raw score 90 (recent publish = 0.5 days ago)
  const techCandidate = baseTopic('topic-tech', 'tech-ai', 90, 'Autonomous Vehicle Standards');

  // Culture candidate with raw score 84 (starved = 8 days ago)
  const cultureCandidate = baseTopic('topic-culture', 'culture', 84, 'Minimalist Wooden Pavilion');

  // Low quality candidate with raw score 72 (starved = 10 days ago) - MUST NOT BE APPROVED
  const lowQualityStarved = baseTopic('topic-wellbeing', 'wellbeing', 72, 'Unverified Daily Routine');

  const existingPillarRecency = {
    'tech-ai': 0.5,
    culture: 8.0, // Starved -> +10 boost -> effectiveScore = 94
    wellbeing: 10.0, // Starved, but raw score 72 < 80 threshold
  };

  const selection = selectEditorialCandidates([techCandidate, cultureCandidate, lowQualityStarved], {
    minScoreThreshold: 80,
    totalLimit: 1, // Batch only selects 1 opportunity
    existingPillarRecency,
    enablePillarBalancing: true,
  });

  // Starved Culture candidate (84 + 10 = 94 effective) wins over Tech candidate (90)
  assert.equal(selection.approved.length, 1);
  assert.equal(selection.approved[0].pillar, 'culture', 'Starved Culture candidate should win candidate selection');
  assert.equal(selection.approved[0].id, 'topic-culture');

  // Low quality candidate must be deferred even if starved
  const wellbeingDeferred = selection.deferred.find((d) => d.id === 'topic-wellbeing');
  assert.ok(wellbeingDeferred, 'Raw score < 80 must be deferred despite starvation');
});

test('5. Food & Drink Integration: Active RSS feeds exist in SOURCE_REGISTRY and getDiscoveryFeedsFromRegistry', () => {
  const discoveryFeeds = getDiscoveryFeedsFromRegistry();
  const foodFeeds = discoveryFeeds.filter((f) => f.pillar === 'food-drink');

  assert.ok(foodFeeds.length >= 3, `Expected at least 3 active Food & Drink discovery feeds, got ${foodFeeds.length}`);
  const feedNames = foodFeeds.map((f) => f.name);
  assert.ok(feedNames.some((n) => n.includes('Serious Eats')), 'Should include Serious Eats feed');
  assert.ok(feedNames.some((n) => n.includes('Eater')), 'Should include Eater feed');
  assert.ok(feedNames.some((n) => n.includes('Food52')), 'Should include Food52 feed');

  const foodSourcesInRegistry = SOURCE_REGISTRY.filter((s) => s.pillars.includes('food-drink'));
  assert.ok(foodSourcesInRegistry.length >= 6, 'SOURCE_REGISTRY should contain both research and discovery sources for food-drink');
});
