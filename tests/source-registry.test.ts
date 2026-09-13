import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOURCE_REGISTRY,
  CURATED_TOPIC_EVIDENCE,
  getSourceById,
  getSourcesByPillar,
  getSourcesByTopic,
  findSourceByDomainOrUrl,
  classifySourceFromRegistry,
  getCuratedEvidenceForTopic,
  getDiscoveryFeedsFromRegistry,
} from '../src/lib/editorial/sources/registry.ts';
import { DEFAULT_CURATED_RSS_FEEDS } from '../src/lib/editorial/discovery/config.ts';
import { WebEditorialResearchProvider } from '../src/lib/editorial/research/providers/web.ts';
import { buildContentBrief } from '../src/lib/editorial/brief.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';

const mockTravelTopic: EditorialTopic = {
  id: 'lm-travel-test-01',
  canonicalTopic: 'Mindful Kyoto Tea House Architecture & Sukiya Pavilions',
  slug: 'mindful-kyoto-tea-house-architecture-sukiya-pavilions',
  pillar: 'travel',
  sourceSignals: [],
  queryVariants: ['kyoto tea house', 'sukiya architecture', 'chashitsu'],
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
  priorityTier: 'PRIORITY',
  opportunityType: 'ARTICLE',
  status: 'BRIEF_READY',
  freshnessScore: 95,
  createdAt: '2026-02-10T09:00:00.000Z',
  updatedAt: '2026-02-10T09:00:00.000Z',
  tags: ['travel', 'architecture', 'japan', 'kyoto'],
};

const mockMoneyTopic: EditorialTopic = {
  id: 'lm-money-test-01',
  canonicalTopic: 'Treasury Bills and Cash Liquidity Strategies for 2026',
  slug: 'treasury-bills-and-cash-liquidity-strategies-for-2026',
  pillar: 'money',
  sourceSignals: [],
  queryVariants: ['treasury bills', 'cash management', 'yield curve'],
  scoring: {
    searchPotential: 90,
    pinterestPotential: 60,
    socialPotential: 85,
    lifeModeRelevance: 95,
    commercialPotential: 75,
    freshness: 95,
    competitionOpportunity: 70,
    originalityPotential: 85,
  },
  totalScore: 88.0,
  priorityTier: 'PRIORITY',
  opportunityType: 'ARTICLE',
  status: 'BRIEF_READY',
  freshnessScore: 95,
  createdAt: '2026-02-10T09:00:00.000Z',
  updatedAt: '2026-02-10T09:00:00.000Z',
  tags: ['money', 'treasury', 'investing'],
};

const mockTechTopic: EditorialTopic = {
  id: 'lm-tech-test-01',
  canonicalTopic: 'Local LLM Deployment Standards and Quantized Model Architectures',
  slug: 'local-llm-deployment-standards-and-quantized-model-architectures',
  pillar: 'tech-ai',
  sourceSignals: [],
  queryVariants: ['local llm', 'quantization', 'gguf', 'ollama'],
  scoring: {
    searchPotential: 90,
    pinterestPotential: 60,
    socialPotential: 90,
    lifeModeRelevance: 95,
    commercialPotential: 70,
    freshness: 95,
    competitionOpportunity: 70,
    originalityPotential: 85,
  },
  totalScore: 87.0,
  priorityTier: 'PRIORITY',
  opportunityType: 'ARTICLE',
  status: 'BRIEF_READY',
  freshnessScore: 95,
  createdAt: '2026-02-10T09:00:00.000Z',
  updatedAt: '2026-02-10T09:00:00.000Z',
  tags: ['tech-ai', 'llm', 'open-source'],
};

const mockWellbeingTopic: EditorialTopic = {
  id: 'lm-wellbeing-test-01',
  canonicalTopic: 'Circadian Light Protocols and Slow-Wave Sleep Architecture',
  slug: 'circadian-light-protocols-and-slow-wave-sleep-architecture',
  pillar: 'wellbeing',
  sourceSignals: [],
  queryVariants: ['circadian rhythm', 'sleep architecture', 'morning light'],
  scoring: {
    searchPotential: 85,
    pinterestPotential: 85,
    socialPotential: 80,
    lifeModeRelevance: 95,
    commercialPotential: 65,
    freshness: 90,
    competitionOpportunity: 70,
    originalityPotential: 85,
  },
  totalScore: 85.0,
  priorityTier: 'PRIORITY',
  opportunityType: 'ARTICLE',
  status: 'BRIEF_READY',
  freshnessScore: 90,
  createdAt: '2026-02-10T09:00:00.000Z',
  updatedAt: '2026-02-10T09:00:00.000Z',
  tags: ['wellbeing', 'sleep', 'longevity'],
};

test('1. Source Registry V1 structure adheres to schema with valid metadata and unique IDs', () => {
  assert.ok(SOURCE_REGISTRY.length >= 25, `Expected at least 25 V1 sources, got ${SOURCE_REGISTRY.length}`);

  const ids = new Set<string>();
  for (const src of SOURCE_REGISTRY) {
    assert.ok(src.id && src.id.length > 0, 'Source must have a non-empty id');
    assert.ok(!ids.has(src.id), `Duplicate source id detected: ${src.id}`);
    ids.add(src.id);

    assert.ok(src.name && src.name.length > 0, 'Source must have a name');
    assert.ok(['discovery', 'research', 'both'].includes(src.role), `Invalid role: ${src.role}`);
    assert.ok(
      ['government', 'official', 'academic', 'reputable_media', 'industry', 'primary'].includes(src.sourceType),
      `Invalid sourceType: ${src.sourceType}`
    );
    assert.ok(['high', 'medium', 'low'].includes(src.reliability), `Invalid reliability: ${src.reliability}`);
    assert.ok(Array.isArray(src.pillars) && src.pillars.length > 0, 'Source must declare at least 1 pillar');
    assert.ok(Array.isArray(src.domains) && src.domains.length > 0, 'Source must declare at least 1 domain pattern');
    assert.equal(typeof src.enabled, 'boolean', 'Enabled must be boolean');

    if (src.isDiscoveryOnly) {
      assert.equal(src.role, 'discovery', 'Discovery-only sources must have role "discovery"');
    }
  }
});

test('2. Source retrieval by pillar returns correctly partitioned sources', () => {
  const techSources = getSourcesByPillar('tech-ai');
  assert.ok(techSources.some((s) => s.id === 'huggingface'));
  assert.ok(techSources.some((s) => s.id === 'github-docs'));
  assert.ok(techSources.some((s) => s.id === 'mit-tech-review'));

  const moneySources = getSourcesByPillar('money');
  assert.ok(moneySources.some((s) => s.id === 'treasurydirect'));
  assert.ok(moneySources.some((s) => s.id === 'federal-reserve'));
  assert.ok(moneySources.some((s) => s.id === 'sec'));
  assert.ok(moneySources.some((s) => s.id === 'vanguard-research'));

  const wellbeingSources = getSourcesByPillar('wellbeing');
  assert.ok(wellbeingSources.some((s) => s.id === 'nih-ncbi'));
  assert.ok(wellbeingSources.some((s) => s.id === 'who'));
  assert.ok(wellbeingSources.some((s) => s.id === 'sleep-foundation'));

  const travelSources = getSourcesByPillar('travel');
  assert.ok(travelSources.some((s) => s.id === 'kyoto-tourism'));
  assert.ok(travelSources.some((s) => s.id === 'nps'));
  assert.ok(travelSources.some((s) => s.id === 'unesco'));
});

test('3. Topic matching ranks relevant authority sources higher based on candidate keywords', () => {
  const travelMatches = getSourcesByTopic(mockTravelTopic, 'research');
  assert.ok(travelMatches.length > 0);
  assert.equal(travelMatches[0].id, 'kyoto-tourism', 'Kyoto tourism must rank first for Kyoto tea architecture');

  const moneyMatches = getSourcesByTopic(mockMoneyTopic, 'research');
  assert.ok(moneyMatches.length > 0);
  assert.equal(moneyMatches[0].id, 'treasurydirect', 'TreasuryDirect must rank first for Treasury bills topic');

  const techMatches = getSourcesByTopic(mockTechTopic, 'research');
  assert.ok(techMatches.length > 0);
  assert.ok(techMatches[0].id === 'huggingface' || techMatches[0].id === 'ollama', 'HuggingFace or Ollama must rank top for local LLM');
});

test('4. Authority classification accurately maps registry domains and flags discovery-only sources', () => {
  // Government
  const gov = classifySourceFromRegistry('https://treasurydirect.gov/marketable-securities');
  assert.equal(gov.sourceType, 'government');
  assert.equal(gov.reliability, 'high');
  assert.equal(gov.isDiscoveryOnly, false);

  // Official Standards
  const official = classifySourceFromRegistry('https://huggingface.co/docs/transformers/quantization');
  assert.equal(official.sourceType, 'official');
  assert.equal(official.reliability, 'high');
  assert.equal(official.isDiscoveryOnly, false);

  // Academic / Peer-Reviewed
  const academic = classifySourceFromRegistry('https://ncbi.nlm.nih.gov/pmc/articles/PMC7015487');
  assert.equal(academic.sourceType, 'academic');
  assert.equal(academic.reliability, 'high');
  assert.equal(academic.isDiscoveryOnly, false);

  // Reputable Media
  const media = classifySourceFromRegistry('https://www.technologyreview.com/2026/02/ai-trends');
  assert.equal(media.sourceType, 'reputable_media');
  assert.equal(media.reliability, 'high');
  assert.equal(media.isDiscoveryOnly, false);

  // Discovery Signals: Reddit
  const reddit = classifySourceFromRegistry('https://reddit.com/r/technology/comments/xyz123');
  assert.equal(reddit.isDiscoveryOnly, true);

  // Discovery Signals: Google Trends
  const googleTrends = classifySourceFromRegistry('https://trends.google.com/trends/explore?q=ai');
  assert.equal(googleTrends.isDiscoveryOnly, true);

  // Discovery Signals: Pinterest
  const pinterest = classifySourceFromRegistry('https://pinterest.com/pin/123456789');
  assert.equal(pinterest.isDiscoveryOnly, true);

  // Discovery Signals: YouTube
  const youtube = classifySourceFromRegistry('https://youtube.com/watch?v=123456');
  assert.equal(youtube.isDiscoveryOnly, true);
});

test('5. Curated topic evidence extractor retrieves structured benchmark evidence across all pillars', () => {
  const travelEvidence = getCuratedEvidenceForTopic(mockTravelTopic);
  assert.ok(travelEvidence.length >= 2);
  assert.ok(travelEvidence.some((e) => e.publisher.includes('Kyoto City Tourism')));
  assert.ok(travelEvidence.some((e) => e.publisher.includes('Tokyo National Research')));

  const moneyEvidence = getCuratedEvidenceForTopic(mockMoneyTopic);
  assert.ok(moneyEvidence.length >= 2);
  assert.ok(moneyEvidence.some((e) => e.publisher.includes('TreasuryDirect')));
  assert.ok(moneyEvidence.some((e) => e.publisher.includes('Vanguard')));

  const techEvidence = getCuratedEvidenceForTopic(mockTechTopic);
  assert.ok(techEvidence.length >= 2);
  assert.ok(techEvidence.some((e) => e.publisher.includes('Hugging Face')));
  assert.ok(techEvidence.some((e) => e.publisher.includes('Ollama')));

  const wellbeingEvidence = getCuratedEvidenceForTopic(mockWellbeingTopic);
  assert.ok(wellbeingEvidence.length >= 2);
  assert.ok(wellbeingEvidence.some((e) => e.publisher.includes('NCBI')));
  assert.ok(wellbeingEvidence.some((e) => e.publisher.includes('Sleep Foundation')));
});

test('6. Discovery RSS config seamlessly syncs with Source Registry feeds', () => {
  const registryFeeds = getDiscoveryFeedsFromRegistry();
  assert.ok(registryFeeds.length >= 10, `Expected at least 10 registry RSS feeds, got ${registryFeeds.length}`);

  assert.equal(DEFAULT_CURATED_RSS_FEEDS.length, registryFeeds.length);
  for (const feed of DEFAULT_CURATED_RSS_FEEDS) {
    assert.ok(feed.id && feed.id.length > 0);
    assert.ok(feed.name && feed.name.length > 0);
    assert.ok(feed.url.startsWith('http://') || feed.url.startsWith('https://'));
    assert.ok(feed.pillar && feed.pillar.length > 0);
  }
});

test('7. WebEditorialResearchProvider operates seamlessly with Source Registry backing', async () => {
  const provider = new WebEditorialResearchProvider({ enableLiveSearch: false });
  const brief = buildContentBrief(mockTravelTopic);

  const result = await provider.research(mockTravelTopic, brief);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(result.items.length >= 2);
  assert.ok(result.items.some((i) => i.publisher.includes('Kyoto')));
  assert.ok(result.items.every((i) => i.sourceType === 'official' || i.sourceType === 'academic'));
});

test('8. Lookup utilities findSourceByDomainOrUrl and getSourceById retrieve exact records', () => {
  const byId = getSourceById('treasurydirect');
  assert.ok(byId);
  assert.equal(byId?.name, 'U.S. Department of the Treasury (TreasuryDirect)');
  assert.equal(byId?.sourceType, 'government');

  const byDomain = findSourceByDomainOrUrl('https://huggingface.co/blog/quantization');
  assert.ok(byDomain);
  assert.equal(byDomain?.id, 'huggingface');

  const byPublisher = findSourceByDomainOrUrl('https://unknown.com/article', 'Kyoto City Tourism Association');
  assert.ok(byPublisher);
  assert.equal(byPublisher?.id, 'kyoto-tourism');

  assert.ok(CURATED_TOPIC_EVIDENCE.length >= 5);
  for (const spec of CURATED_TOPIC_EVIDENCE) {
    assert.ok(spec.pillar);
    assert.ok(spec.keywords.length > 0);
    assert.ok(spec.evidence.length > 0);
  }
});
