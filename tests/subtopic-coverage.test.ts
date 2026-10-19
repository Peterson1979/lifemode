import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { listExistingGuides } from '../src/lib/editorial/guides/service.ts';
import {
  ALL_SUBTOPIC_DEFINITIONS,
  EDITORIAL_ARTICLE_SUBTOPICS,
  TOOL_SUBTOPICS,
  resolveTopicSubtopic,
  calculateSubtopicCoverage,
  calculateSubtopicStarvationBoost,
  getSubtopicCoverageReport,
} from '../src/lib/editorial/coverage.ts';
import { selectEditorialCandidates } from '../src/lib/editorial/selection.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';

test('1. Taxonomy Completeness: All 22 defined editorial subtopics are cataloged across 5 active pillars', () => {
  const healthSubs = EDITORIAL_ARTICLE_SUBTOPICS.filter((s) => s.pillar === 'health');
  const wealthSubs = EDITORIAL_ARTICLE_SUBTOPICS.filter((s) => s.pillar === 'wealth');
  const homeSubs = EDITORIAL_ARTICLE_SUBTOPICS.filter((s) => s.pillar === 'home');
  const lifeSubs = EDITORIAL_ARTICLE_SUBTOPICS.filter((s) => s.pillar === 'life');
  const techSubs = EDITORIAL_ARTICLE_SUBTOPICS.filter((s) => s.pillar === 'tech-ai');

  assert.equal(healthSubs.length, 5, 'Health must define exactly 5 subtopics');
  assert.equal(wealthSubs.length, 5, 'Wealth must define exactly 5 subtopics');
  assert.equal(homeSubs.length, 4, 'Home must define exactly 4 subtopics');
  assert.equal(lifeSubs.length, 3, 'Life must define exactly 3 subtopics');
  assert.equal(techSubs.length, 5, 'Tech & AI must define exactly 5 subtopics');
  assert.equal(EDITORIAL_ARTICLE_SUBTOPICS.length, 22, 'Total active editorial subtopics must be 22');
  assert.equal(TOOL_SUBTOPICS.length, 8, 'Total interactive tools subtopics must be 8');
  assert.equal(ALL_SUBTOPIC_DEFINITIONS.length, 30, 'Total subtopics across 6 pillars must be 30');

  // Verify key slugs
  assert.ok(healthSubs.some((s) => s.slug === 'longevity-aging'));
  assert.ok(wealthSubs.some((s) => s.slug === 'online-side-hustles'));
  assert.ok(homeSubs.some((s) => s.slug === 'food-kitchen'));
  assert.ok(lifeSubs.some((s) => s.slug === 'style-beauty'));
  assert.ok(techSubs.some((s) => s.slug === 'ai-tools'));
});

test('2. Subtopic Resolution: Accurately maps topics by explicit subtopic, tag, or semantic keyword', () => {
  // Explicit subtopic
  assert.equal(
    resolveTopicSubtopic({ pillar: 'health', subtopic: 'metabolic-health' }),
    'metabolic-health'
  );

  // Tag match
  assert.equal(
    resolveTopicSubtopic({ pillar: 'wealth', tags: ['wealth', 'digital-products'] }),
    'digital-products'
  );

  // Keyword match
  assert.equal(
    resolveTopicSubtopic({ pillar: 'health', canonicalTopic: 'Continuous Glucose Monitoring for Energy' }),
    'metabolic-health'
  );

  assert.equal(
    resolveTopicSubtopic({ pillar: 'home', canonicalTopic: 'Enzyme Detergent Chemistry for Stubborn Stains' }),
    'cleaning-laundry'
  );

  assert.equal(
    resolveTopicSubtopic({ pillar: 'tech-ai', canonicalTopic: 'Personal Threat Modeling and FIDO2 Hardware Keys' }),
    'privacy-security'
  );
});

test('3. Restored Guide Collection: every guide file parses and covers each active guide category', async () => {
  const guidesRoot = resolve(process.cwd(), 'src', 'content', 'guides');
  const guideEntries = await listExistingGuides(guidesRoot);
  const guideFiles = (await import('node:fs/promises')).readdir(guidesRoot);
  const markdownFiles = (await guideFiles).filter((file) => /\.mdx?$/i.test(file));
  const expectedCategories = [
    'cleaning-laundry',
    'everyday-how-to',
    'food-kitchen',
    'home-maintenance',
    'storage-organization',
  ];

  assert.ok(markdownFiles.length > 0, 'The restored guide collection must contain Markdown files');
  assert.equal(guideEntries.length, markdownFiles.length, 'Every guide file must parse into a guide entry');

  const categories = new Set(guideEntries.map((guide) => guide.frontmatter.category));
  assert.deepEqual([...categories].sort(), expectedCategories, 'The restored collection must cover every guide category');

  for (const guide of guideEntries) {
    const { frontmatter } = guide;
    assert.ok(frontmatter.title?.trim(), `${guide.slug} must have a title`);
    assert.ok(frontmatter.quickSummary?.trim(), `${guide.slug} must have a quick summary`);
    assert.ok(frontmatter.publishedDate && !Number.isNaN(Date.parse(frontmatter.publishedDate)), `${guide.slug} must have a valid published date`);
    assert.ok(frontmatter.updatedDate && !Number.isNaN(Date.parse(frontmatter.updatedDate)), `${guide.slug} must have a valid updated date`);
    assert.ok(frontmatter.category && expectedCategories.includes(frontmatter.category), `${guide.slug} must have a valid guide category`);
    assert.ok(guide.content.trim().length > 0, `${guide.slug} must have article content`);
  }
});

test('4. Anti-Starvation Boost: Under-covered subtopics gain competitive advantage while respecting quality gate', () => {
  const coverageMock: Record<string, number> = {
    'longevity-aging': 0, // Empty
    'metabolic-health': 1, // Single article
    'weight-fitness': 2, // Moderate
    'sleep-recovery': 3, // Well covered
  };

  assert.equal(calculateSubtopicStarvationBoost('longevity-aging', coverageMock), 10);
  assert.equal(calculateSubtopicStarvationBoost('metabolic-health', coverageMock), 5);
  assert.equal(calculateSubtopicStarvationBoost('weight-fitness', coverageMock), 2);
  assert.equal(calculateSubtopicStarvationBoost('sleep-recovery', coverageMock), 0);
  assert.equal(calculateSubtopicStarvationBoost(undefined, coverageMock), 0);

  const createTopic = (id: string, subtopic: string, score: number): EditorialTopic => ({
    id,
    canonicalTopic: `Topic ${id}`,
    slug: `topic-${id}`,
    pillar: 'health',
    subtopic,
    status: 'SCORED',
    opportunityType: 'ARTICLE',
    priorityTier: 'CANDIDATE',
    totalScore: score,
    freshnessScore: 80,
    tags: ['health', subtopic],
    sourceSignals: [],
    queryVariants: [`Topic ${id}`],
    scoring: {
      searchPotential: score,
      pinterestPotential: 80,
      socialPotential: 75,
      lifeModeRelevance: 85,
      commercialPotential: 60,
      freshness: 80,
      competitionOpportunity: 70,
      originalityPotential: 80,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Candidate A: subtopic has 0 articles, raw score 82
  const candidateA = createTopic('cand-a', 'longevity-aging', 82);
  // Candidate B: subtopic has 3 articles, raw score 88
  const candidateB = createTopic('cand-b', 'sleep-recovery', 88);

  // Candidate A gets +10 boost -> effective 92. Candidate B gets 0 boost -> effective 88.
  const { approved } = selectEditorialCandidates([candidateA, candidateB], {
    totalLimit: 1,
    existingSubtopicCoverage: coverageMock,
    enableSubtopicBalancing: true,
  });

  assert.equal(approved.length, 1);
  assert.equal(approved[0].id, 'cand-a', 'Starved subtopic candidate should be selected first');

  // Strict quality rule test: candidate with raw score < 80 must NEVER be approved even if starved
  const subThresholdCandidate = createTopic('cand-sub', 'longevity-aging', 75);
  const { approved: approvedSub, deferred } = selectEditorialCandidates([subThresholdCandidate], {
    totalLimit: 1,
    existingSubtopicCoverage: coverageMock,
    enableSubtopicBalancing: true,
  });

  assert.equal(approvedSub.length, 0, 'Candidate below 80 raw score must not be approved');
  assert.equal(deferred.length, 1, 'Sub-threshold candidate must be deferred');
});

test('5. Resumable Batching & Bounded Automation: Honors batch limits and avoids duplicate work', () => {
  const candidates: EditorialTopic[] = [
    {
      id: 'topic-1',
      canonicalTopic: 'Candidate 1',
      slug: 'candidate-1',
      pillar: 'wealth',
      subtopic: 'online-side-hustles',
      status: 'SCORED',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 88,
      freshnessScore: 80,
      tags: ['wealth'],
      sourceSignals: [],
      queryVariants: ['Candidate 1'],
      scoring: {
        searchPotential: 88,
        pinterestPotential: 80,
        socialPotential: 75,
        lifeModeRelevance: 90,
        commercialPotential: 60,
        freshness: 80,
        competitionOpportunity: 70,
        originalityPotential: 80,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'topic-2',
      canonicalTopic: 'Candidate 2',
      slug: 'candidate-2',
      pillar: 'tech-ai',
      subtopic: 'ai-tools',
      status: 'SCORED',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 86,
      freshnessScore: 80,
      tags: ['tech-ai'],
      sourceSignals: [],
      queryVariants: ['Candidate 2'],
      scoring: {
        searchPotential: 86,
        pinterestPotential: 80,
        socialPotential: 75,
        lifeModeRelevance: 90,
        commercialPotential: 60,
        freshness: 80,
        competitionOpportunity: 70,
        originalityPotential: 80,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'topic-3',
      canonicalTopic: 'Candidate 3',
      slug: 'candidate-3',
      pillar: 'health',
      subtopic: 'longevity-aging',
      status: 'SCORED',
      opportunityType: 'ARTICLE',
      priorityTier: 'PRIORITY',
      totalScore: 85,
      freshnessScore: 80,
      tags: ['health'],
      sourceSignals: [],
      queryVariants: ['Candidate 3'],
      scoring: {
        searchPotential: 85,
        pinterestPotential: 80,
        socialPotential: 75,
        lifeModeRelevance: 90,
        commercialPotential: 60,
        freshness: 80,
        competitionOpportunity: 70,
        originalityPotential: 80,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Batch limit bounded to 2
  const { approved, deferred } = selectEditorialCandidates(candidates, {
    totalLimit: 2,
  });

  assert.equal(approved.length, 2, 'Must strictly respect bounded batch limit of 2');
  assert.equal(deferred.length, 1, 'Remaining candidate must be deferred for next run');
  assert.equal(deferred[0].id, 'topic-3');
});
