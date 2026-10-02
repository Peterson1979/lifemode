import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFactSheet, determineContentType } from '../src/lib/editorial/fact-sheet.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';
import type { EvidenceItem } from '../src/lib/editorial/research/types.ts';

test('1. determineContentType classifies news, explainer, and evergreen correctly', () => {
  const newsTopic: EditorialTopic = {
    id: 'test-news-01',
    canonicalTopic: 'Breaking: Delta Flight 2311 Rapid Descent Updates',
    slug: 'delta-flight-2311-rapid-descent',
    pillar: 'travel',
    tags: ['aviation', 'news'],
    sourceSignals: [],
    queryVariants: ['delta flight 2311'],
    scoring: { searchPotential: 80, pinterestPotential: 80, socialPotential: 80, lifeModeRelevance: 80, commercialPotential: 50, freshness: 90, competitionOpportunity: 70, originalityPotential: 80 },
    totalScore: 80,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const explainerTopic: EditorialTopic = {
    ...newsTopic,
    id: 'test-explainer-01',
    canonicalTopic: 'How Sourdough Fermentation Works: The Science of Wild Yeast',
    scoring: { ...newsTopic.scoring, freshness: 30 },
    freshnessScore: 30,
  };

  const evergreenTopic: EditorialTopic = {
    ...newsTopic,
    id: 'test-evergreen-01',
    canonicalTopic: 'The Art of the Capsule Wardrobe: Building an Everyday Uniform',
    scoring: { ...newsTopic.scoring, freshness: 20 },
    freshnessScore: 20,
  };

  assert.equal(determineContentType(newsTopic), 'NEWS');
  assert.equal(determineContentType(explainerTopic), 'EXPLAINER');
  assert.equal(determineContentType(evergreenTopic), 'EVERGREEN_GUIDE');
});

test('2. buildFactSheet extracts entities, confirmed facts, and important statistics', () => {
  const topic: EditorialTopic = {
    id: 'lm-entertainment-astros-01',
    canonicalTopic: 'Houston Astros vs Cleveland Guardians Playoff Chase',
    slug: 'astros-vs-guardians',
    pillar: 'entertainment',
    tags: ['sports', 'baseball'],
    sourceSignals: [
      {
        source: 'RSS_FEEDS',
        query: 'Astros vs Guardians',
        sourceUrl: 'https://mlb.com/news/astros-guardians',
        publisherName: 'MLB Official',
        contentSnippet: 'Houston recorded 90 wins while Cleveland locked in a 3.20 bullpen ERA.',
        recordedAt: '2026-09-24T12:00:00.000Z',
      },
    ],
    queryVariants: ['astros vs guardians'],
    scoring: { searchPotential: 85, pinterestPotential: 85, socialPotential: 85, lifeModeRelevance: 90, commercialPotential: 50, freshness: 85, competitionOpportunity: 70, originalityPotential: 90 },
    totalScore: 85,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 85,
    createdAt: '2026-09-24T12:00:00.000Z',
    updatedAt: '2026-09-24T12:00:00.000Z',
  };

  const evidence: EvidenceItem[] = [
    {
      sourceType: 'official',
      reliability: 'high',
      title: 'MLB Official Standings',
      publisher: 'Major League Baseball',
      url: 'https://mlb.com/standings',
      claimSummary: 'Houston maintained an 8-game winning streak with 15 home runs in September.',
      publishedAt: '2026-09-24T10:00:00.000Z',
      accessedAt: '2026-09-24T11:00:00.000Z',
    },
  ];

  const factSheet = buildFactSheet(topic, evidence, topic.sourceSignals);

  assert.equal(factSheet.primaryEntity, 'Houston Astros');
  assert.equal(factSheet.contentType, 'NEWS');
  assert.equal(factSheet.isSufficient, true);
  assert.ok(factSheet.organizations.includes('Major League Baseball'));
  assert.ok(factSheet.organizations.includes('MLB Official'));
  assert.ok(factSheet.confirmedFacts.length >= 2);
  assert.ok(factSheet.sourceUrls.includes('https://mlb.com/standings'));
});

test('3. buildFactSheet marks news topic as insufficient when source material is absent', () => {
  const emptyNewsTopic: EditorialTopic = {
    id: 'test-empty-news-01',
    canonicalTopic: 'Breaking Incident 2026',
    slug: 'breaking-incident-2026',
    pillar: 'entertainment',
    tags: ['news'],
    sourceSignals: [],
    queryVariants: [],
    scoring: { searchPotential: 85, pinterestPotential: 85, socialPotential: 85, lifeModeRelevance: 90, commercialPotential: 50, freshness: 95, competitionOpportunity: 70, originalityPotential: 90 },
    totalScore: 85,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 95,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const factSheet = buildFactSheet(emptyNewsTopic, [], []);

  assert.equal(factSheet.isSufficient, false);
  assert.ok(factSheet.insufficiencyReason?.includes('Grounding is mandatory'));
});
