import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContentBrief,
  synthesizeEditorialBrief,
  enrichBriefWithResearch,
  deriveArticleFormat,
  deriveArticleAngle,
  deriveReaderProblem,
  deriveCommercialIntent,
  extractSourceBackedFacts,
  deriveKeyClaims,
  deriveEvidenceLimitations,
  deriveDoNotClaimConstraints,
  deriveSeoMetadata,
} from '../src/lib/editorial/brief.ts';
import { briefToGenerationRequest } from '../src/lib/editorial/generation/brief-adapter.ts';
import { buildGenerationPrompt } from '../src/lib/editorial/generation/prompt.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';
import type { EvidenceItem } from '../src/lib/editorial/research/types.ts';

const mockMoneyTopic: EditorialTopic = {
  id: 'topic-money-001',
  canonicalTopic: 'Tax-Advantaged Retirement Strategies for High Earners',
  slug: 'tax-advantaged-retirement-strategies-for-high-earners',
  pillar: 'money',
  sourceSignals: [],
  queryVariants: ['retirement tax strategies', 'backdoor roth ira', 'hsa investing'],
  scoring: {
    searchPotential: 88,
    pinterestPotential: 40,
    socialPotential: 65,
    lifeModeRelevance: 90,
    commercialPotential: 85,
    freshness: 45,
    competitionOpportunity: 75,
    originalityPotential: 80,
  },
  totalScore: 81.5,
  priorityTier: 'CANDIDATE',
  opportunityType: 'ARTICLE',
  status: 'CANDIDATE',
  freshnessScore: 45,
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
  targetAudience: 'High-income professionals and founders',
  primaryIntent: 'informational',
  tags: ['finance', 'tax', 'retirement', 'wealth'],
};

const mockWellbeingTopic: EditorialTopic = {
  id: 'topic-wellbeing-001',
  canonicalTopic: 'Circadian Light Optimization Protocols for Deep Sleep',
  slug: 'circadian-light-optimization-protocols-for-deep-sleep',
  pillar: 'wellbeing',
  sourceSignals: [],
  queryVariants: ['circadian rhythm light', 'morning sunlight sleep', 'blue light protocol'],
  scoring: {
    searchPotential: 82,
    pinterestPotential: 88,
    socialPotential: 75,
    lifeModeRelevance: 95,
    commercialPotential: 55,
    freshness: 80,
    competitionOpportunity: 70,
    originalityPotential: 85,
  },
  totalScore: 83.2,
  priorityTier: 'CANDIDATE',
  opportunityType: 'ARTICLE',
  status: 'CANDIDATE',
  freshnessScore: 80,
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
  primaryIntent: 'informational',
  tags: ['sleep', 'health', 'wellness', 'circadian'],
};

const mockTechAiTopic: EditorialTopic = {
  id: 'topic-tech-001',
  canonicalTopic: 'Local LLM Deployment Architecture on Apple Silicon',
  slug: 'local-llm-deployment-architecture-on-apple-silicon',
  pillar: 'tech-ai',
  sourceSignals: [],
  queryVariants: ['local llm macbook', 'ollama metal setup', 'llama 3 local'],
  scoring: {
    searchPotential: 92,
    pinterestPotential: 30,
    socialPotential: 85,
    lifeModeRelevance: 90,
    commercialPotential: 70,
    freshness: 90,
    competitionOpportunity: 80,
    originalityPotential: 90,
  },
  totalScore: 87.0,
  priorityTier: 'CANDIDATE',
  opportunityType: 'ARTICLE',
  status: 'CANDIDATE',
  freshnessScore: 90,
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
  primaryIntent: 'informational',
  tags: ['ai', 'tech', 'local-llm', 'apple-silicon'],
};

const mockTravelEvidence: EvidenceItem[] = [
  {
    title: 'Kyoto Sukiya Architectural Preservation Report 2026',
    url: 'https://kyoto-preservation.gov.jp/tea-houses',
    publisher: 'Kyoto Heritage Bureau',
    accessedAt: '2026-09-13T12:00:00.000Z',
    claimSummary: 'Over 42 historical sukiya tea houses in Daitoku-ji and Uji maintain active preservation protocols.',
    sourceType: 'government',
    reliability: 'high',
  },
  {
    title: 'Contemporary Sukiya-Zukuri Design Analysis',
    url: 'https://architectural-review.example.com/sukiya-modern',
    publisher: 'Architectural Review',
    accessedAt: '2026-09-13T12:05:00.000Z',
    claimSummary: 'Modern architects integrate cedar joinery and low-e shoji panels to balance tradition with thermal insulation.',
    sourceType: 'reputable_media',
    reliability: 'high',
  },
];

test('1. Editorial Brief V2 synthesis produces full structured brief with all extended fields', () => {
  const brief = synthesizeEditorialBrief(mockMoneyTopic, undefined, { riskLevel: 'medium' });

  assert.equal(brief.topicId, 'topic-money-001');
  assert.equal(brief.pillar, 'money');
  assert.equal(brief.format, 'listicle'); // Derived from "strategies" in canonical topic
  assert.ok(brief.titleAngle.length > 0);
  assert.ok(brief.workingTitle);
  assert.ok(brief.recommendedAngle.includes('financial') || brief.recommendedAngle.includes('strategic'));
  assert.ok(brief.readerProblem.includes('Tax-Advantaged Retirement Strategies'));
  assert.ok(brief.keyClaims.length > 0);
  assert.ok(brief.seoMetadata);
  assert.equal(brief.seoMetadata.primaryKeyword, 'tax-advantaged retirement strategies for high earners');
  assert.ok(brief.affiliateOpportunities);
  assert.equal(brief.affiliateOpportunities.intentType, 'transactional'); // commercialPotential = 85
  assert.equal(brief.affiliateOpportunities.hasAffiliateIntent, true);
  assert.ok(brief.doNotClaim && brief.doNotClaim.length > 0);
  assert.ok(brief.evidenceLimitations && brief.evidenceLimitations.length > 0);

  // Explicit format override
  const standardBrief = synthesizeEditorialBrief(mockMoneyTopic, undefined, { format: 'standard' });
  assert.equal(standardBrief.format, 'standard');
});

test('2. Evidence-backed claim traceability correctly maps EvidenceItems to SourceBackedFact entries', () => {
  const facts = extractSourceBackedFacts(mockTravelEvidence);

  assert.equal(facts.length, 2);
  assert.equal(facts[0].claim, 'Over 42 historical sukiya tea houses in Daitoku-ji and Uji maintain active preservation protocols.');
  assert.equal(facts[0].sourceUrl, 'https://kyoto-preservation.gov.jp/tea-houses');
  assert.equal(facts[0].publisher, 'Kyoto Heritage Bureau');
  assert.equal(facts[0].sourceType, 'government');
  assert.equal(facts[0].reliability, 'high');

  assert.equal(facts[1].sourceUrl, 'https://architectural-review.example.com/sukiya-modern');
  assert.equal(facts[1].sourceType, 'reputable_media');
});

test('3. Unsupported claim prevention: empty evidence establishes no fake facts and generates caution limitations', () => {
  const facts = extractSourceBackedFacts([]);
  assert.deepEqual(facts, []);

  const limitations = deriveEvidenceLimitations([], mockTechAiTopic, 'low');
  assert.ok(limitations.some((lim) => lim.includes('No verified external research evidence was retrieved')));

  const keyClaims = deriveKeyClaims(mockTechAiTopic, facts);
  assert.equal(keyClaims.length, 3);
  assert.ok(keyClaims[0].includes('Local LLM Deployment Architecture on Apple Silicon'));
});

test('4. Evidence limitations derivation captures single-source, secondary-only, and high-freshness constraints', () => {
  // Single secondary evidence item
  const singleSecondary: EvidenceItem[] = [
    {
      title: 'Tech Blog Analysis',
      url: 'https://techblog.example.com/item',
      publisher: 'TechBlog',
      accessedAt: '2026-09-13T10:00:00.000Z',
      claimSummary: 'A fast new local framework is available.',
      sourceType: 'reputable_media',
      reliability: 'low',
    },
  ];

  const limitations = deriveEvidenceLimitations(singleSecondary, mockTechAiTopic, 'high');

  // Should flag single source
  assert.ok(limitations.some((l) => l.includes('Only one external source')));
  // Should flag secondary media (no primary/government/official/academic)
  assert.ok(limitations.some((l) => l.includes('secondary media or industry coverage')));
  // Should flag low reliability item
  assert.ok(limitations.some((l) => l.includes('low reliability')));
  // Should flag high freshness sensitivity (freshness = 90)
  assert.ok(limitations.some((l) => l.includes('fast-evolving current events or trends')));
  // Should flag high risk
  assert.ok(limitations.some((l) => l.includes('Sensitive domain topic')));
});

test('5. Risk-specific guardrails generate deterministic "do not claim" rules', () => {
  // Money pillar
  const moneyConstraints = deriveDoNotClaimConstraints(mockMoneyTopic, 'high', 'transactional');
  assert.ok(moneyConstraints.some((c) => c.includes('Do not guarantee returns')));
  assert.ok(moneyConstraints.some((c) => c.includes('Do not cite discovery or social signals')));

  // Wellbeing pillar
  const wellbeingConstraints = deriveDoNotClaimConstraints(mockWellbeingTopic, 'medium', 'informational');
  assert.ok(wellbeingConstraints.some((c) => c.includes('Do not imply medical certainty')));

  // Tech-AI pillar
  const techConstraints = deriveDoNotClaimConstraints(mockTechAiTopic, 'low', 'commercial-investigation');
  assert.ok(techConstraints.some((c) => c.includes('Do not claim unreleased software features')));
});

test('6. SEO metadata derivation accurately captures freshness sensitivity and scoring', () => {
  const seoHighFreshness = deriveSeoMetadata(mockTechAiTopic, 'Local LLM Deployment Guide');
  assert.equal(seoHighFreshness.freshnessSensitivity, 'high');
  assert.equal(seoHighFreshness.primaryKeyword, 'local llm deployment architecture on apple silicon');
  assert.equal(seoHighFreshness.opportunityScore, 87.0);

  const seoLowFreshness = deriveSeoMetadata(mockMoneyTopic, 'Tax-Advantaged Strategies');
  assert.equal(seoLowFreshness.freshnessSensitivity, 'medium'); // 45 score -> medium
});

test('7. Commercial / affiliate intent derivation categorizes transactional, commercial-investigation, and informational correctly', () => {
  const transactional = deriveCommercialIntent(mockMoneyTopic); // commercialPotential = 85
  assert.equal(transactional.intentType, 'transactional');
  assert.equal(transactional.hasAffiliateIntent, true);
  assert.ok(transactional.suggestedPlacements.length > 0);

  const commercialTopic: EditorialTopic = {
    ...mockTechAiTopic,
    canonicalTopic: 'Best Compact Microphones for Home Audio 2026',
    scoring: { ...mockTechAiTopic.scoring, commercialPotential: 60 },
    primaryIntent: 'commercial',
  };
  const commercial = deriveCommercialIntent(commercialTopic);
  assert.equal(commercial.intentType, 'commercial-investigation');
  assert.equal(commercial.hasAffiliateIntent, true);

  const informationalTopic: EditorialTopic = {
    ...mockWellbeingTopic,
    scoring: { ...mockWellbeingTopic.scoring, commercialPotential: 15 },
    primaryIntent: 'informational',
  };
  const informational = deriveCommercialIntent(informationalTopic);
  assert.equal(informational.intentType, 'informational');
  assert.equal(informational.hasAffiliateIntent, false);
});

test('8. Article format and angle derivation detects guide, curation, and deep-dive query patterns', () => {
  const guideTopic: EditorialTopic = {
    ...mockTechAiTopic,
    canonicalTopic: 'How to Build a Resilient Local AI Stack',
  };
  assert.equal(deriveArticleFormat(guideTopic), 'guide');

  const curationTopic: EditorialTopic = {
    ...mockTechAiTopic,
    canonicalTopic: 'Best Open Source Model Runners for Developers',
  };
  assert.equal(deriveArticleFormat(curationTopic), 'curation');

  const deepDiveTopic: EditorialTopic = {
    ...mockTechAiTopic,
    canonicalTopic: 'Why Quantization Precision Affects Local Reasoning Latency',
  };
  assert.equal(deriveArticleFormat(deepDiveTopic), 'deep-dive');

  const guideAngle = deriveArticleAngle(guideTopic, 'guide');
  assert.ok(guideAngle.includes('Step-by-step'));

  const readerProblem = deriveReaderProblem(curationTopic, 'commercial');
  assert.ok(readerProblem.includes('objective evaluation criteria'));
});

test('9. Generation prompt builder seamlessly incorporates Editorial Brief V2 structured fields', () => {
  const brief = synthesizeEditorialBrief(mockTechAiTopic, mockTravelEvidence, {
    format: 'deep-dive',
    riskLevel: 'low',
  });

  const request = briefToGenerationRequest(brief);
  const promptPayload = buildGenerationPrompt(request);

  // Verify prompt contains Brief V2 sections
  assert.ok(promptPayload.userPrompt.includes('### Topic Specifications (Editorial Brief V2):'));
  assert.ok(promptPayload.userPrompt.includes('- Recommended Angle:'));
  assert.ok(promptPayload.userPrompt.includes('- Reader Problem / Need:'));
  assert.ok(promptPayload.userPrompt.includes('### Verified Source-Backed Facts'));
  assert.ok(promptPayload.userPrompt.includes('### Strict "Do Not Claim" Guardrails:'));
  assert.ok(promptPayload.userPrompt.includes('### Approved Citation Sources'));
  assert.ok(promptPayload.userPrompt.includes('https://kyoto-preservation.gov.jp/tea-houses'));
});

test('10. Backward compatibility with existing brief consumers and in-place research enrichment', () => {
  // Legacy invocation without options
  const brief = buildContentBrief(mockWellbeingTopic);

  // Assert legacy fields exist and are typed
  assert.equal(brief.topicId, mockWellbeingTopic.id);
  assert.equal(brief.pillar, 'wellbeing');
  assert.ok(brief.titleAngle);
  assert.ok(brief.audience);
  assert.ok(brief.searchTargets.primaryKeyword);
  assert.ok(typeof brief.affiliateOpportunities.hasAffiliateIntent === 'boolean');
  assert.ok(Array.isArray(brief.outlineSections));
  assert.ok(Array.isArray(brief.requiredSources));
  assert.ok(brief.estimatedWordCount.target > 0);

  // Assert new V2 fields exist concurrently
  assert.ok(brief.recommendedAngle);
  assert.ok(brief.readerProblem);
  assert.ok(Array.isArray(brief.keyClaims));
  assert.ok(brief.seoMetadata);
  assert.ok(Array.isArray(brief.doNotClaim));

  // In-place enrichment
  const enriched = enrichBriefWithResearch(brief, mockWellbeingTopic, mockTravelEvidence);
  assert.equal(enriched.evidence?.length, 2);
  assert.equal(enriched.sourceBackedFacts?.length, 2);
  assert.equal(enriched.sourceUrls?.length, 2);
  assert.ok(enriched.requiredSources.some((s) => s.url === 'https://kyoto-preservation.gov.jp/tea-houses'));
});
