import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AFFILIATE_CATALOG,
  DEFAULT_AFFILIATE_DISCLOSURE,
  validateAffiliateCatalog,
} from '../src/lib/editorial/affiliate/catalog.ts';
import {
  matchAffiliateOpportunities,
  calculateAffiliateMatchScore,
  isAffiliateItemAllowed,
} from '../src/lib/editorial/affiliate/matcher.ts';
import type {
  AffiliateCatalogItem,
} from '../src/lib/editorial/affiliate/types.ts';
import { synthesizeEditorialBrief } from '../src/lib/editorial/brief.ts';
import { briefToGenerationRequest } from '../src/lib/editorial/generation/brief-adapter.ts';
import { buildGenerationPrompt } from '../src/lib/editorial/generation/prompt.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';

const mockCommercialBookTopic: EditorialTopic = {
  id: 'topic-living-books-001',
  canonicalTopic: 'Best Architecture and Design Books for Thoughtful Homes',
  slug: 'best-architecture-and-design-books-for-thoughtful-homes',
  pillar: 'culture',
  sourceSignals: [],
  queryVariants: ['best design books 2026', 'architecture monographs home', 'thoughtful living books'],
  scoring: {
    searchPotential: 85,
    pinterestPotential: 90,
    socialPotential: 75,
    lifeModeRelevance: 95,
    commercialPotential: 65,
    freshness: 60,
    competitionOpportunity: 70,
    originalityPotential: 85,
  },
  totalScore: 82.5,
  priorityTier: 'CANDIDATE',
  opportunityType: 'ARTICLE',
  status: 'CANDIDATE',
  freshnessScore: 60,
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
  primaryIntent: 'commercial',
  tags: ['culture', 'books', 'architecture', 'design', 'home'],
};

const mockTransactionalCoffeeTopic: EditorialTopic = {
  id: 'topic-living-coffee-001',
  canonicalTopic: 'Specialty Coffee Grinders and Precision Brewing Gear',
  slug: 'specialty-coffee-grinders-and-precision-brewing-gear',
  pillar: 'food-drink',
  sourceSignals: [],
  queryVariants: ['best coffee grinder', 'espresso grinder comparison', 'pour over kettle'],
  scoring: {
    searchPotential: 88,
    pinterestPotential: 80,
    socialPotential: 70,
    lifeModeRelevance: 90,
    commercialPotential: 90,
    freshness: 70,
    competitionOpportunity: 75,
    originalityPotential: 80,
  },
  totalScore: 84.0,
  priorityTier: 'CANDIDATE',
  opportunityType: 'ARTICLE',
  status: 'CANDIDATE',
  freshnessScore: 70,
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
  primaryIntent: 'transactional',
  tags: ['food-drink', 'coffee', 'gear', 'kitchen'],
};

const mockInformationalTopic: EditorialTopic = {
  id: 'topic-wellbeing-info-001',
  canonicalTopic: 'Understanding Cortisol Awakening Response and Natural Light',
  slug: 'understanding-cortisol-awakening-response-and-natural-light',
  pillar: 'wellbeing',
  sourceSignals: [],
  queryVariants: ['cortisol awakening response', 'morning light biology'],
  scoring: {
    searchPotential: 75,
    pinterestPotential: 60,
    socialPotential: 70,
    lifeModeRelevance: 90,
    commercialPotential: 10,
    freshness: 50,
    competitionOpportunity: 80,
    originalityPotential: 85,
  },
  totalScore: 74.0,
  priorityTier: 'CANDIDATE',
  opportunityType: 'ARTICLE',
  status: 'CANDIDATE',
  freshnessScore: 50,
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
  primaryIntent: 'informational',
  tags: ['wellbeing', 'science', 'sleep', 'circadian'],
};

const mockHighRiskMedicalTopic: EditorialTopic = {
  id: 'topic-wellbeing-risk-001',
  canonicalTopic: 'Clinical Peptide Protocols for Rapid Joint Healing',
  slug: 'clinical-peptide-protocols-for-rapid-joint-healing',
  pillar: 'wellbeing',
  sourceSignals: [],
  queryVariants: ['peptide therapy joints', 'bpc 157 medical treatment'],
  scoring: {
    searchPotential: 80,
    pinterestPotential: 40,
    socialPotential: 70,
    lifeModeRelevance: 70,
    commercialPotential: 85,
    freshness: 80,
    competitionOpportunity: 60,
    originalityPotential: 70,
  },
  totalScore: 72.0,
  priorityTier: 'CANDIDATE',
  opportunityType: 'ARTICLE',
  status: 'CANDIDATE',
  freshnessScore: 80,
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
  primaryIntent: 'commercial',
  tags: ['wellbeing', 'peptides', 'medical', 'joints'],
};

test('1. Central affiliate catalog passes schema validation and integrity checks', () => {
  const report = validateAffiliateCatalog(DEFAULT_AFFILIATE_CATALOG);

  assert.equal(report.isValid, true);
  assert.equal(report.errors.length, 0);
  assert.ok(report.totalItems >= 8);
  assert.ok(report.enabledItems >= 8);

  // Validate rejection of broken catalog items
  const brokenCatalog: any[] = [
    { id: '', name: 'Broken', category: '', applicablePillars: ['invalid-pillar'], applicableIntents: [] },
    { id: 'dup-1', name: 'Valid 1', category: 'books', applicablePillars: ['culture'], applicableIntents: ['transactional'], enabled: true },
    { id: 'dup-1', name: 'Duplicate 1', category: 'books', applicablePillars: ['culture'], applicableIntents: ['transactional'], enabled: true },
    { id: 'bad-url', name: 'Bad URL', category: 'books', applicablePillars: ['culture'], applicableIntents: ['transactional'], approvedDestinationUrl: 'not-a-url', enabled: true },
  ];

  const brokenReport = validateAffiliateCatalog(brokenCatalog);
  assert.equal(brokenReport.isValid, false);
  assert.ok(brokenReport.errors.some((e) => e.includes('duplicate id')));
  assert.ok(brokenReport.errors.some((e) => e.includes('invalid pillar')));
  assert.ok(brokenReport.errors.some((e) => e.includes('approvedDestinationUrl')));
});

test('2. Category and keyword matching identifies relevant catalog opportunities', () => {
  const brief = synthesizeEditorialBrief(mockCommercialBookTopic);
  const result = matchAffiliateOpportunities(brief);

  assert.equal(result.hasMatches, true);
  assert.equal(result.intentType, 'commercial-investigation');
  assert.ok(result.matchedOpportunities.length > 0);

  const bookMatch = result.matchedOpportunities.find((o) => o.programId === 'aff-books-curated');
  assert.ok(bookMatch, 'Should match curated books catalog item');
  assert.equal(bookMatch.category, 'books');
  assert.ok(bookMatch.score >= 60);
  assert.ok(bookMatch.matchReasons.some((r) => r.includes('category') || r.includes('keyword')));
});

test('3. Pillar matching restricts catalog items to their declared applicable pillars', () => {
  const brief = synthesizeEditorialBrief(mockTransactionalCoffeeTopic);
  const result = matchAffiliateOpportunities(brief);

  assert.equal(result.hasMatches, true);
  const matchedPillars = result.matchedOpportunities.map((o) => o.programId);

  // aff-tech-hardware is tech-ai only; must not appear for food-drink pillar
  assert.ok(!matchedPillars.includes('aff-tech-hardware'));

  // aff-coffee-gear is food-drink/travel/style; must match
  assert.ok(matchedPillars.includes('aff-coffee-gear'));
});

test('4. Commercial intent matching correctly discriminates transactional and commercial-investigation', () => {
  const transactionalBrief = synthesizeEditorialBrief(mockTransactionalCoffeeTopic);
  const transResult = matchAffiliateOpportunities(transactionalBrief);

  assert.equal(transResult.hasMatches, true);
  assert.equal(transResult.intentType, 'transactional');
  assert.ok(transResult.topOpportunity);
  assert.ok(transResult.topOpportunity.score >= 70);
  assert.equal(transResult.disclosureRequired, true);
});

test('5. Deterministic scoring computes reproducible scores without fake metrics', () => {
  const brief = synthesizeEditorialBrief(mockTransactionalCoffeeTopic);
  const item = DEFAULT_AFFILIATE_CATALOG.find((c) => c.id === 'aff-coffee-gear')!;

  const run1 = calculateAffiliateMatchScore(brief, item);
  const run2 = calculateAffiliateMatchScore(brief, item);

  assert.equal(run1.score, run2.score);
  assert.deepEqual(run1.reasons, run2.reasons);
  assert.ok(run1.score >= 0 && run1.score <= 100);
});

test('6. Purely informational topic produces zero forced matches', () => {
  const infoBrief = synthesizeEditorialBrief(mockInformationalTopic);
  const result = matchAffiliateOpportunities(infoBrief);

  assert.equal(result.hasMatches, false);
  assert.equal(result.matchedOpportunities.length, 0);
  assert.equal(result.disclosureRequired, false);
  assert.ok(result.editorialGuidance[0].includes('Purely informational topic'));
  assert.ok(result.safetyConstraints[0].includes('Do not insert affiliate links'));
});

test('7. High-risk topics strictly enforce safety restrictions and filter out unapproved recommendations', () => {
  const highRiskBrief = synthesizeEditorialBrief(mockHighRiskMedicalTopic, undefined, {
    riskLevel: 'high',
  });

  const sleepItem = DEFAULT_AFFILIATE_CATALOG.find((c) => c.id === 'aff-wellness-sleep')!;
  const recoveryItem = DEFAULT_AFFILIATE_CATALOG.find((c) => c.id === 'aff-wellness-recovery')!;

  // High risk disallowance
  const sleepCheck = isAffiliateItemAllowed(highRiskBrief, sleepItem);
  assert.equal(sleepCheck.allowed, false);
  assert.ok(sleepCheck.reason?.includes('High-risk'));

  // Disallowed keyword (peptides) check
  const recoveryCheck = isAffiliateItemAllowed(highRiskBrief, recoveryItem);
  assert.equal(recoveryCheck.allowed, false);
});

test('8. Unresolved destination URLs cannot become links and never generate fake tracking URLs', () => {
  const brief = synthesizeEditorialBrief(mockCommercialBookTopic);
  const customCatalog: AffiliateCatalogItem[] = [
    {
      id: 'aff-unresolved-lighting',
      name: 'Artisan Architectural Desk Lamps',
      category: 'workspace',
      applicablePillars: ['culture'],
      applicableIntents: ['commercial-investigation'],
      keywords: ['architecture', 'design', 'home'],
      enabled: true,
      // No approvedDestinationUrl
    },
  ];

  const result = matchAffiliateOpportunities(brief, customCatalog);
  assert.equal(result.hasMatches, true);
  const opp = result.matchedOpportunities[0];

  assert.equal(opp.isLinkable, false);
  assert.equal(opp.approvedDestinationUrl, undefined);
  assert.ok(!opp.approvedDestinationUrl);
});

test('9. Approved destination URLs are preserved accurately and flagged as linkable', () => {
  const brief = synthesizeEditorialBrief(mockCommercialBookTopic);
  const result = matchAffiliateOpportunities(brief);

  const bookMatch = result.matchedOpportunities.find((o) => o.programId === 'aff-books-curated')!;
  assert.equal(bookMatch.isLinkable, true);
  assert.equal(bookMatch.approvedDestinationUrl, 'https://bookshop.org');
});

test('10. Disclosure requirement and text are derived deterministically', () => {
  const brief = synthesizeEditorialBrief(mockTransactionalCoffeeTopic);
  const result = matchAffiliateOpportunities(brief, DEFAULT_AFFILIATE_CATALOG, {
    customDisclosureText: 'Custom affiliate disclosure statement.',
  });

  assert.equal(result.disclosureRequired, true);
  assert.equal(result.disclosureText, 'Custom affiliate disclosure statement.');

  const defaultResult = matchAffiliateOpportunities(brief);
  assert.equal(defaultResult.disclosureText, DEFAULT_AFFILIATE_DISCLOSURE);
});

test('11. Generation request and prompt builder integrate affiliate guidance with hard safety constraints', () => {
  const brief = synthesizeEditorialBrief(mockTransactionalCoffeeTopic);
  const request = briefToGenerationRequest(brief);

  assert.ok(request.affiliateGuidance);
  assert.equal(request.affiliateGuidance.hasMatches, true);
  assert.equal(request.affiliateGuidance.intentType, 'transactional');

  const promptPayload = buildGenerationPrompt(request);

  // Assert prompt includes guidance and strict safety rules
  assert.ok(promptPayload.userPrompt.includes('### Commercial & Affiliate Editorial Guidance (Optional & Non-Intrusive):'));
  assert.ok(promptPayload.userPrompt.includes('- Commercial Intent: transactional'));
  assert.ok(promptPayload.userPrompt.includes('Affiliate Safety & Integrity Rules:'));
  assert.ok(promptPayload.userPrompt.includes('Do NOT fabricate or guess affiliate URLs'));
  assert.ok(promptPayload.userPrompt.includes('https://fellowproducts.com'));
});

test('12. Backward compatibility: generation prompt without affiliate matches omits commercial guidance cleanly', () => {
  const infoBrief = synthesizeEditorialBrief(mockInformationalTopic);
  const request = briefToGenerationRequest(infoBrief);

  assert.ok(request.affiliateGuidance);
  assert.equal(request.affiliateGuidance.hasMatches, false);

  const promptPayload = buildGenerationPrompt(request);

  // Should NOT contain the commercial guidance block for informational topic
  assert.ok(!promptPayload.userPrompt.includes('### Commercial & Affiliate Editorial Guidance (Optional & Non-Intrusive):'));
});
