import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateTotalScore,
  classifyPriorityTier,
  determineOpportunityType,
  scoreTopicEntity,
} from '../src/lib/editorial/scoring.ts';

import {
  calculatePinterestScore,
  isHighPotentialPinterestTopic,
} from '../src/lib/editorial/pinterest-scoring.ts';

import {
  cleanTopicString,
  slugify,
  inferPillarFromKeywords,
  generateTopicId,
} from '../src/lib/editorial/normalization.ts';

import {
  stringSimilarity,
  tokenJaccardSimilarity,
  checkTopicDuplicate,
} from '../src/lib/editorial/deduplication.ts';

import { selectEditorialCandidates } from '../src/lib/editorial/selection.ts';
import { buildContentBrief } from '../src/lib/editorial/brief.ts';
import { validateArticleDraft } from '../src/lib/editorial/quality.ts';
import { createInitialEditorialMemory, recordTopicPerformance } from '../src/lib/editorial/memory.ts';
import type { TopicScoringDimensions, EditorialTopic } from '../src/lib/editorial/types.ts';

test('Editorial Scoring - calculateTotalScore', () => {
  const perfectScore: TopicScoringDimensions = {
    searchPotential: 100,
    pinterestPotential: 100,
    socialPotential: 100,
    lifeModeRelevance: 100,
    commercialPotential: 100,
    freshness: 100,
    competitionOpportunity: 100,
    originalityPotential: 100,
  };
  assert.equal(calculateTotalScore(perfectScore), 100);

  const zeroScore: TopicScoringDimensions = {
    searchPotential: 0,
    pinterestPotential: 0,
    socialPotential: 0,
    lifeModeRelevance: 0,
    commercialPotential: 0,
    freshness: 0,
    competitionOpportunity: 0,
    originalityPotential: 0,
  };
  assert.equal(calculateTotalScore(zeroScore), 0);

  // Exact weighted check:
  // 100*0.20 + 80*0.15 + 60*0.15 + 90*0.15 + 70*0.10 + 50*0.10 + 40*0.05 + 80*0.10
  // = 20 + 12 + 9 + 13.5 + 7 + 5 + 2 + 8 = 76.5
  const sampleDimensions: TopicScoringDimensions = {
    searchPotential: 100, // 20
    pinterestPotential: 80, // 12
    socialPotential: 60, // 9
    lifeModeRelevance: 90, // 13.5
    commercialPotential: 70, // 7
    freshness: 50, // 5
    competitionOpportunity: 40, // 2
    originalityPotential: 80, // 8
  };
  assert.equal(calculateTotalScore(sampleDimensions), 76.5);

  const topicBase = {
    id: 'lm-test-topic',
    canonicalTopic: 'Test Topic',
    slug: 'test-topic',
    pillar: 'life' as const,
    sourceSignals: [],
    queryVariants: ['test topic query'],
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    tags: ['test'],
  };

  const scored = scoreTopicEntity(topicBase, sampleDimensions);
  assert.equal(scored.totalScore, 76.5);
  assert.equal(scored.priorityTier, 'LOW_PRIORITY');
  assert.equal(scored.opportunityType, 'ARTICLE_AND_SOCIAL');
  assert.equal(scored.status, 'SCORED');
});

test('Priority Tier Classification', () => {
  assert.equal(classifyPriorityTier(50), 'REJECT');
  assert.equal(classifyPriorityTier(59), 'REJECT');
  assert.equal(classifyPriorityTier(60), 'LOW_PRIORITY');
  assert.equal(classifyPriorityTier(79), 'LOW_PRIORITY');
  assert.equal(classifyPriorityTier(80), 'CANDIDATE');
  assert.equal(classifyPriorityTier(87), 'CANDIDATE');
  assert.equal(classifyPriorityTier(88), 'PRIORITY');
  assert.equal(classifyPriorityTier(92), 'PRIORITY');
  assert.equal(classifyPriorityTier(93), 'IMMEDIATE_OPPORTUNITY');
  assert.equal(classifyPriorityTier(100), 'IMMEDIATE_OPPORTUNITY');
});

test('Opportunity Type Determination', () => {
  // Low score -> REJECT
  assert.equal(
    determineOpportunityType(
      {
        searchPotential: 20,
        pinterestPotential: 20,
        socialPotential: 20,
        lifeModeRelevance: 20,
        commercialPotential: 20,
        freshness: 20,
        competitionOpportunity: 20,
        originalityPotential: 20,
      },
      20
    ),
    'REJECT'
  );

  // High search & high visual -> ARTICLE_AND_SOCIAL
  assert.equal(
    determineOpportunityType(
      {
        searchPotential: 85,
        pinterestPotential: 80,
        socialPotential: 60,
        lifeModeRelevance: 90,
        commercialPotential: 70,
        freshness: 80,
        competitionOpportunity: 60,
        originalityPotential: 80,
      },
      88
    ),
    'ARTICLE_AND_SOCIAL'
  );

  // High social/pinterest but low search -> SOCIAL_ONLY
  assert.equal(
    determineOpportunityType(
      {
        searchPotential: 30,
        pinterestPotential: 85,
        socialPotential: 90,
        lifeModeRelevance: 80,
        commercialPotential: 60,
        freshness: 80,
        competitionOpportunity: 50,
        originalityPotential: 70,
      },
      68
    ),
    'SOCIAL_ONLY'
  );
});

test('Pinterest Scoring - calculatePinterestScore', () => {
  // 100*0.30 + 80*0.20 + 90*0.15 + 70*0.20 + 60*0.15
  // = 30 + 16 + 13.5 + 14 + 9 = 82.5
  const pinScore = calculatePinterestScore({
    trendGrowth: 100,
    searchRelevance: 80,
    seasonalRelevance: 90,
    visualPotential: 70,
    categoryFit: 60,
  });
  assert.equal(pinScore, 82.5);
  assert.equal(isHighPotentialPinterestTopic(pinScore), true);
  assert.equal(isHighPotentialPinterestTopic(60), false);
});

test('Normalization & Slugification', () => {
  assert.equal(
    cleanTopicString('  Minimalist Home Office Workflows & Gear!  '),
    'Minimalist Home Office Workflows & Gear'
  );
  assert.equal(
    slugify('AI Tools for Modern Investors (2026 Edition)'),
    'ai-tools-for-modern-investors-2026-edition'
  );
  assert.equal(inferPillarFromKeywords('Best Kyoto Slow Travel Itinerary'), 'travel');
  assert.equal(inferPillarFromKeywords('Private AI LLM Workflows'), 'tech-ai');
  assert.equal(inferPillarFromKeywords('Personal Budget Strategy'), 'money');
  assert.match(generateTopicId('travel', 'kyoto-guide'), /^lm-travel-\d{8}-kyoto-guide/);
});

test('Deduplication & Similarity', () => {
  assert.equal(stringSimilarity('minimalist living', 'minimalist living'), 1.0);
  assert.ok(tokenJaccardSimilarity('best coffee grinders 2026', 'best 2026 coffee grinders') >= 0.8);

  const existingTopics = [
    { canonicalTopic: 'The Modern Guide to Slow Travel in Kyoto', slug: 'modern-guide-to-slow-travel-in-kyoto' },
    { canonicalTopic: 'High Yield Savings Account Strategies', slug: 'high-yield-savings-account-strategies' },
  ];

  // Exact duplicate
  const dupResult1 = checkTopicDuplicate('The Modern Guide to Slow Travel in Kyoto', existingTopics);
  assert.equal(dupResult1.isDuplicate, true);
  assert.equal(dupResult1.similarityScore, 1.0);

  // Near duplicate
  const dupResult2 = checkTopicDuplicate('A Modern Guide for Slow Travel in Kyoto', existingTopics);
  assert.equal(dupResult2.isDuplicate, true);

  // Completely novel topic
  const novelResult = checkTopicDuplicate('Emerging Quantum Computing Frameworks for Designers', existingTopics);
  assert.equal(novelResult.isDuplicate, false);
});

test('Selection Gatekeeping', () => {
  const sampleCandidate = (id: string, score: number, pillar: any): EditorialTopic => ({
    id,
    canonicalTopic: `Topic ${id}`,
    slug: `topic-${id}`,
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
    priorityTier: classifyPriorityTier(score),
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['test'],
  });

  const candidates: EditorialTopic[] = [
    sampleCandidate('t1', 95, 'tech-ai'), // Approved
    sampleCandidate('t2', 85, 'travel'),  // Approved
    sampleCandidate('t3', 70, 'money'),   // Deferred (< 80)
    sampleCandidate('t4', 45, 'life'),    // Rejected (< 60)
  ];

  const selection = selectEditorialCandidates(candidates, { minScoreThreshold: 80 });
  assert.equal(selection.approved.length, 2);
  assert.equal(selection.deferred.length, 1);
  assert.equal(selection.rejected.length, 1);

  assert.equal(selection.approved[0].id, 't1');
  assert.equal(selection.approved[0].status, 'APPROVED');
  assert.equal(selection.deferred[0].id, 't3');
  assert.equal(selection.deferred[0].status, 'DEFERRED');
  assert.equal(selection.rejected[0].id, 't4');
  assert.equal(selection.rejected[0].status, 'REJECTED');
});

test('Content Brief Builder', () => {
  const topic: EditorialTopic = {
    id: 'lm-tech-ai-2026-local-llm',
    canonicalTopic: 'Local LLM Workflows',
    slug: 'local-llm-workflows',
    pillar: 'tech-ai',
    sourceSignals: [],
    queryVariants: ['local llms', 'private ai'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 70,
      socialPotential: 80,
      lifeModeRelevance: 90,
      commercialPotential: 70,
      freshness: 90,
      competitionOpportunity: 60,
      originalityPotential: 85,
    },
    totalScore: 81.5,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['ai', 'tech'],
  };

  const brief = buildContentBrief(topic);
  assert.equal(brief.topicId, topic.id);
  assert.equal(brief.pillar, 'tech-ai');
  assert.ok(brief.titleAngle.includes('Local LLM Workflows'));
  assert.equal(brief.searchTargets.primaryKeyword, 'local llm workflows');
  assert.equal(brief.affiliateOpportunities.hasAffiliateIntent, true);
  assert.ok(brief.outlineSections.length >= 3);
});

test('Quality Validation Engine', () => {
  // Valid article
  const validFrontmatter = {
    title: 'The Intentional Architecture of Daily Rituals',
    description: 'Exploring how structured morning routines and aesthetic spaces shape modern mindfulness.',
  };
  const validBody = Array(350).fill('word').join(' ');

  const validResult = validateArticleDraft(validFrontmatter, validBody);
  assert.equal(validResult.passed, true);
  assert.equal(validResult.state, 'APPROVED');
  assert.equal(validResult.issues.length, 0);

  // Invalid article (short title, forbidden phrase, too short content)
  const invalidFrontmatter = {
    title: 'Short',
    description: 'Too short',
  };
  const invalidBody = 'This gives guaranteed returns in 24 hours.';

  const invalidResult = validateArticleDraft(invalidFrontmatter, invalidBody);
  assert.equal(invalidResult.passed, false);
  assert.equal(invalidResult.state, 'REJECTED');
  assert.ok(invalidResult.issues.some((i) => i.rule === 'LENGTH_TOO_SHORT'));
  assert.ok(invalidResult.issues.some((i) => i.rule === 'MIN_WORD_COUNT'));
  assert.ok(invalidResult.issues.some((i) => i.rule === 'FORBIDDEN_PHRASE'));
});

test('Editorial Memory Recording', () => {
  const initialMemory = createInitialEditorialMemory();
  assert.equal(initialMemory.successfulTopics.length, 0);

  const updatedMemory = recordTopicPerformance(initialMemory, {
    topicId: 'lm-travel-kyoto',
    canonicalTopic: 'Kyoto Slow Travel',
    pillar: 'travel',
    performanceScore: 92,
    format: 'guide',
    pinterestTheme: 'Minimalist Japan',
  });

  assert.equal(updatedMemory.successfulTopics.length, 1);
  assert.equal(updatedMemory.successfulFormats.guide, 1);
  assert.equal(updatedMemory.highPerformingPinterestThemes[0], 'Minimalist Japan');
});
