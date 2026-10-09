import test from 'node:test';
import assert from 'node:assert/strict';

import { validateEditorialArticle } from '../src/lib/editorial/validation/validator.ts';
import { evaluatePublishingGate } from '../src/lib/editorial/publishing/gate.ts';
import { evaluateReviewGates } from '../src/lib/editorial/review/gates.ts';
import { validateGeneratedArticle } from '../src/lib/editorial/generation/validation.ts';
import type { GeneratedArticle } from '../src/lib/editorial/generation/types.ts';
import type { PublishingRequest } from '../src/lib/editorial/publishing/types.ts';
import type { ReviewRequest, ReviewResult, ReviewDimensionKey, ReviewDimensionScore } from '../src/lib/editorial/review/types.ts';
import type { EditorialValidationContext } from '../src/lib/editorial/validation/types.ts';

function createMockReviewDimensions(scores: Partial<Record<ReviewDimensionKey, number>> = {}, baseScore = 90): Record<ReviewDimensionKey, ReviewDimensionScore> {
  const keys: ReviewDimensionKey[] = [
    'factuality',
    'usefulness',
    'originality',
    'readability',
    'structure',
    'searchIntent',
    'seo',
    'editorialFit',
    'safety',
    'monetizationFit',
  ];

  const result = {} as Record<ReviewDimensionKey, ReviewDimensionScore>;
  for (const k of keys) {
    const score = scores[k] !== undefined ? scores[k]! : baseScore;
    result[k] = {
      score,
      rationale: `Rationale for ${k}`,
      issues: [],
    };
  }
  return result;
}

const validSampleArticle: GeneratedArticle = {
  title: 'Mindful Tech Architecture: Designing Calm Workspaces',
  slug: 'mindful-tech-architecture-designing-calm-workspaces',
  description: 'An evidence-backed guide to creating distraction-free digital environments and energy-conscious hardware setups.',
  excerpt: 'Cultivating intentional focus through minimal hardware setups and deliberate digital boundaries.',
  content: [
    'Creating a mindful tech architecture begins by establishing physical and digital boundaries that protect focus and minimize daily distraction during long working hours.',
    '',
    '## 1. What You Need: Setup & Workspace Layout',
    'Arrange hardware peripherals with adequate clearance, configure display monitors at eye level, and gather clean cable routing ties to keep surfaces uncluttered.',
    '',
    '## 2. Step-by-Step Configuration Protocol',
    '1. Disconnect auxiliary monitors and focus on a single primary display to eliminate visual fragmentation.',
    '2. Standardize keyboard shortcuts and automate routine system maintenance commands.',
    '3. Isolate notification channels into dedicated 30-minute review intervals.',
    '',
    '## 3. Operational Parameters & Troubleshooting',
    'Maintain a primary monitor distance of 20 to 30 inches and screen illumination below 60% ambient brightness to prevent eye fatigue.',
    'Common troubleshooting fixes for digital clutter include scheduled 15-minute weekly audits.'
  ].join('\n'),
  faq: [
    { question: 'What is mindful tech architecture?', answer: 'It is the deliberate configuration of computing tools to minimize cognitive friction.' }
  ],
  sources: [
    { name: 'ACM Computing Standards', url: 'https://dl.acm.org/standards' }
  ],
  internalLinks: ['/tech-ai'],
  affiliateIntents: [],
  socialHooks: ['Why minimal computing is the defining productivity shift of 2026.'],
};

const validSampleReview: ReviewResult = {
  decision: 'PASS',
  overallScore: 92,
  dimensions: createMockReviewDimensions({ safety: 95, factuality: 92 }),
  criticalIssues: [],
  warnings: [],
  reviewer: 'Senior Editorial Reviewer',
  metadata: {
    provider: 'Fixture AI Reviewer',
    model: 'fixture-review-v1',
    reviewedAt: '2026-09-13T14:00:00.000Z',
    durationMs: 15,
  },
  gatePassed: true,
};

const validContext: EditorialValidationContext = {
  topicId: 'lm-tech-ai-val-01',
  pillar: 'tech-ai',
  format: 'guide',
  audience: 'Intentional creators and knowledge workers.',
  primaryIntent: 'informational',
  secondaryIntent: 'inspirational',
  riskLevel: 'low',
  readerProblem: 'Digital distraction and inefficient workstation design.',
  doNotClaim: ['guaranteed 10x productivity', 'cures burnout instantly'],
  evidenceLimitations: ['Hardware performance varies by operating system.'],
  searchTargets: {
    primaryKeyword: 'mindful tech architecture',
    secondaryKeywords: ['calm workspace', 'minimal computing'],
  },
  affiliateIntent: false,
  estimatedWordCount: { min: 80, target: 120, max: 200 },
  imageMetadata: {
    url: 'https://assets.lifemode.life/editorial/2026/mindful-tech.jpg',
    prompt: 'Minimalist desktop workstation photography with natural lighting.',
  },
};

test('1. Valid generated article passes unified editorial validation', () => {
  const result = validateEditorialArticle(validSampleArticle, validContext);
  assert.equal(result.passed, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.checks.structure, true);
  assert.equal(result.checks.seo, true);
  assert.equal(result.checks.evidence, true);
  assert.equal(result.checks.citations, true);
  assert.equal(result.checks.risk, true);
  assert.equal(result.checks.affiliate, true);
  assert.equal(result.checks.image, true);
});

test('2. Missing required structure fails validation', () => {
  // Case A: Missing title
  const missingTitle = validateEditorialArticle({ ...validSampleArticle, title: '' }, validContext);
  assert.equal(missingTitle.passed, false);
  assert.equal(missingTitle.checks.structure, false);
  assert.ok(missingTitle.errors.some((e) => e.toLowerCase().includes('title')));

  // Case B: Missing H2 headings
  const missingH2 = validateEditorialArticle(
    {
      ...validSampleArticle,
      content: 'Paragraph one without any markdown headings. Paragraph two continuing the essay without structured sections for readability and SEO.',
    },
    validContext
  );
  assert.equal(missingH2.passed, false);
  assert.equal(missingH2.checks.structure, false);
  assert.ok(missingH2.errors.some((e) => e.includes('H2')));

  // Case C: Severely undersized word count
  const undersized = validateEditorialArticle(
    {
      ...validSampleArticle,
      content: '## 1. Intro\n\nToo brief.',
    },
    { ...validContext, estimatedWordCount: { min: 500, target: 800, max: 1200 } }
  );
  assert.equal(undersized.passed, false);
  assert.equal(undersized.checks.structure, false);
  assert.ok(undersized.errors.some((e) => e.includes('substantially below')));
});

test('3. Unsupported dummy/placeholder citation fails validation', () => {
  const dummyCitationArticle: GeneratedArticle = {
    ...validSampleArticle,
    sources: [{ name: 'Fake Test Source', url: 'https://example.com/fake-benchmark' }],
  };

  const result = validateEditorialArticle(dummyCitationArticle, validContext);
  assert.equal(result.passed, false);
  assert.equal(result.checks.citations, false);
  assert.ok(result.errors.some((e) => e.includes('dummy/placeholder source citation URL')));
});

test('4. Discovery-only signal cited as authoritative evidence fails validation', () => {
  const discoverySourceArticle: GeneratedArticle = {
    ...validSampleArticle,
    sources: [{ name: 'Reddit Discussion', url: 'https://reddit.com/r/productivity/comments/123' }],
  };

  const result = validateEditorialArticle(discoverySourceArticle, validContext);
  assert.equal(result.passed, false);
  assert.equal(result.checks.citations, false);
  assert.ok(result.errors.some((e) => e.includes('Discovery signal') && e.includes('cannot be cited as authoritative')));
});

test('5. doNotClaim constraint violation fails deterministically', () => {
  const violatingArticle: GeneratedArticle = {
    ...validSampleArticle,
    content: [
      '## 1. The Strategy',
      'This workstation framework provides guaranteed 10x productivity for all creators.',
      '## 2. Execution',
      'Follow these steps to proceed.'
    ].join('\n'),
  };

  const result = validateEditorialArticle(violatingArticle, validContext);
  assert.equal(result.passed, false);
  assert.equal(result.checks.evidence, false);
  assert.ok(result.errors.some((e) => e.includes('violates doNotClaim constraint') && e.includes('guaranteed 10x productivity')));
});

test('6. Informational article with forced affiliate promotion fails validation', () => {
  const forcedPromoArticle: GeneratedArticle = {
    ...validSampleArticle,
    content: [
      '## 1. Overview',
      'Discover modern tech design.',
      'Use promo code LIFEMODE20 to buy now with code at our partner checkout.',
      '## 2. Details',
      'More insights.'
    ].join('\n'),
  };

  const result = validateEditorialArticle(forcedPromoArticle, {
    ...validContext,
    affiliateIntent: false,
    commercialIntentType: 'informational',
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.affiliate, false);
  assert.ok(result.errors.some((e) => e.includes('Informational article must not contain forced promotional')));
});

test('7. Unresolved affiliate URL cannot pass as a live link', () => {
  const unresolvedArticle: GeneratedArticle = {
    ...validSampleArticle,
    content: [
      '## 1. Recommended Gear',
      'Check out the [Smart Hub](https://affiliate-fake.com?aff_id=fake123) for your studio.',
      '## 2. Setup',
      'Plug it in.'
    ].join('\n'),
  };

  const commercialContext: EditorialValidationContext = {
    ...validContext,
    affiliateIntent: true,
    commercialIntentType: 'commercial-investigation',
    affiliateGuidance: {
      hasMatches: true,
      intentType: 'commercial-investigation',
      primaryCategory: 'Smart Home Hardware',
      disclosureRequired: true,
      disclosureText: 'LifeMode may earn a commission on verified recommendations.',
      matchedOpportunities: [
        {
          programId: 'cat-smart-home-hub',
          name: 'Smart Hub',
          category: 'Smart Home Hardware',
          score: 85,
          matchReasons: ['Category fit'],
          placementSuggestion: 'contextual-recommendation',
          isLinkable: false,
          approvedDestinationUrl: undefined,
          disclosureRequired: true,
        },
      ],
      editorialGuidance: [],
      safetyConstraints: [],
    },
  };

  const result = validateEditorialArticle(unresolvedArticle, commercialContext);
  assert.equal(result.passed, false);
  assert.equal(result.checks.affiliate, false);
  assert.ok(result.errors.some((e) => e.includes('fabricated affiliate tracking URL') || e.includes('Unresolved affiliate opportunity')));
});

test('8. Approved affiliate URL with proper disclosure passes validation', () => {
  const approvedCommercialArticle: GeneratedArticle = {
    ...validSampleArticle,
    description: 'An editorial guide to home automation. LifeMode may earn an affiliate commission on verified purchases.',
    content: [
      'Creating a mindful tech architecture begins by establishing physical and digital boundaries that protect focus and minimize daily distraction.',
      '',
      '## 1. Verified Hardware Options & Equipment',
      'We tested the [Verified Automation Hub](https://store.google.com/product/nest_hub) for local connectivity and reliable device management.',
      '',
      '## 2. Step-by-Step Configuration & Daily Protocols',
      '1. Connect the hub to your local network using standard WPA3 encryption.',
      '2. Configure automated dimming schedules for 22:00 hours with standard 5 GHz network isolation.',
      '3. Verify sensor readings across 15-minute test intervals.',
      '',
      '## 3. Operational Parameters & Troubleshooting',
      'Maintain device distance of at least 1 meter from high-interference appliances to prevent signal dropouts.'
    ].join('\n'),
  };

  const approvedCommercialContext: EditorialValidationContext = {
    ...validContext,
    affiliateIntent: true,
    commercialIntentType: 'commercial-investigation',
    affiliateGuidance: {
      hasMatches: true,
      intentType: 'commercial-investigation',
      primaryCategory: 'Smart Home Hardware',
      disclosureRequired: true,
      disclosureText: 'LifeMode may earn a commission on verified purchases.',
      matchedOpportunities: [
        {
          programId: 'cat-google-nest',
          name: 'Verified Automation Hub',
          category: 'Smart Home Hardware',
          score: 92,
          matchReasons: ['Category match'],
          placementSuggestion: 'contextual-recommendation',
          isLinkable: true,
          approvedDestinationUrl: 'https://store.google.com/product/nest_hub',
          disclosureRequired: true,
        },
      ],
      editorialGuidance: [],
      safetyConstraints: [],
    },
  };

  const result = validateEditorialArticle(approvedCommercialArticle, approvedCommercialContext);
  assert.equal(result.passed, true);
  assert.equal(result.checks.affiliate, true);
  assert.equal(result.errors.length, 0);
});

test('9. Missing required affiliate disclosure fails validation', () => {
  const noDisclosureArticle: GeneratedArticle = {
    ...validSampleArticle,
    description: 'Clean description with zero disclosure mention.',
    content: [
      '## 1. Top Picks',
      'We recommend the [Verified Automation Hub](https://store.google.com/product/nest_hub).',
      '## 2. Protocols',
      'Setup steps.'
    ].join('\n'),
  };

  const commercialContextWithRequiredDisclosure: EditorialValidationContext = {
    ...validContext,
    affiliateIntent: true,
    commercialIntentType: 'commercial-investigation',
    affiliateGuidance: {
      hasMatches: true,
      intentType: 'commercial-investigation',
      primaryCategory: 'Smart Home Hardware',
      disclosureRequired: true,
      disclosureText: 'LifeMode may earn a commission on purchases.',
      matchedOpportunities: [
        {
          programId: 'cat-google-nest',
          name: 'Verified Automation Hub',
          category: 'Smart Home Hardware',
          score: 90,
          matchReasons: ['Category match'],
          placementSuggestion: 'contextual-recommendation',
          isLinkable: true,
          approvedDestinationUrl: 'https://store.google.com/product/nest_hub',
          disclosureRequired: true,
        },
      ],
      editorialGuidance: [],
      safetyConstraints: [],
    },
  };

  const result = validateEditorialArticle(noDisclosureArticle, commercialContextWithRequiredDisclosure);
  assert.equal(result.passed, false);
  assert.equal(result.checks.affiliate, false);
  assert.ok(result.errors.some((e) => e.includes('Affiliate disclosure is required')));
});

test('10. Missing required image fails when requireImage is enabled', () => {
  const contextWithoutImage: EditorialValidationContext = {
    ...validContext,
    imageMetadata: undefined,
  };

  const result = validateEditorialArticle(validSampleArticle, contextWithoutImage, { requireImage: true });
  assert.equal(result.passed, false);
  assert.equal(result.checks.image, false);
  assert.ok(result.errors.some((e) => e.includes('requires a valid hero image URL')));
});

test('11. High-risk article requirements are strictly enforced', () => {
  // Case A: High-risk missing sources
  const highRiskNoSources: GeneratedArticle = {
    ...validSampleArticle,
    content: '## 1. Protocol\n\nAlways consult a doctor before starting any regimen.\n\n## 2. Next\n\nRest well.',
    sources: [],
  };

  const highRiskContext: EditorialValidationContext = {
    ...validContext,
    pillar: 'health',
    riskLevel: 'high',
  };

  const resultA = validateEditorialArticle(highRiskNoSources, highRiskContext);
  assert.equal(resultA.passed, false);
  assert.equal(resultA.checks.risk, false);
  assert.ok(resultA.errors.some((e) => e.includes('High-risk editorial topic requires verified source citations')));

  // Case B: High-risk missing disclaimer
  const highRiskNoDisclaimer: GeneratedArticle = {
    ...validSampleArticle,
    content: '## 1. Overview\n\nDaily wellness routines for optimal morning energy.\n\n## 2. Protocols\n\nStep by step morning habit guide.',
    sources: [{ name: 'Mayo Clinic', url: 'https://mayoclinic.org/wellness' }],
  };

  const resultB = validateEditorialArticle(highRiskNoDisclaimer, highRiskContext);
  assert.equal(resultB.passed, false);
  assert.equal(resultB.checks.risk, false);
  assert.ok(resultB.errors.some((e) => e.includes('requires professional safety disclaimer')));

  // Case C: High-risk with sources and disclaimer passes
  const highRiskCompliant: GeneratedArticle = {
    ...validSampleArticle,
    title: 'Mindful Tech Architecture: Designing Calm Workspaces and Health Routines',
    content: [
      'Editorial disclaimer: This guide is strictly for educational purposes only. Always consult a qualified physician or doctor before beginning any physical or nutritional regimen.',
      '',
      '## 1. What You Need: Ergonomic Equipment for Mindful Tech Architecture',
      'Configuring a calm workspace architecture requires gathering an adjustable desk converter, blue-light filtering lenses, and an analog timer.',
      '',
      '## 2. Step-by-Step Ergonomic Execution Protocol',
      '1. Position mindful tech displays at eye level 25 inches from seating position.',
      '2. Perform 5 minutes of postural resetting stretches every 60 minutes.',
      '3. Maintain scheduled hydration checks across working blocks.',
      '',
      '## 3. Key Parameters & Troubleshooting',
      'Aim for 150 minutes of weekly Zone 2 cardiovascular effort with baseline rest periods of 48 hours between strenuous sessions.'
    ].join('\n'),
    sources: [{ name: 'Mayo Clinic', url: 'https://mayoclinic.org/wellness' }],
  };

  const resultC = validateEditorialArticle(highRiskCompliant, highRiskContext);
  assert.equal(resultC.passed, true);
  assert.equal(resultC.checks.risk, true);
});

test('12. Valid article reaches publication eligibility in evaluatePublishingGate', () => {
  const pubReq: PublishingRequest = {
    article: validSampleArticle,
    review: validSampleReview,
    context: {
      topicId: 'lm-tech-ai-val-01',
      pillar: 'tech-ai',
      format: 'guide',
      audience: 'Intentional creators',
      primaryIntent: 'informational',
      riskLevel: 'low',
      imageMetadata: {
        url: 'https://assets.lifemode.life/editorial/2026/sample.jpg',
      },
    },
  };

  const gateResult = evaluatePublishingGate(pubReq);
  assert.equal(gateResult.eligible, true);
  assert.equal(gateResult.reasons.length, 0);
  assert.ok(gateResult.validationResult);
  assert.equal(gateResult.validationResult?.passed, true);
});

test('13. Existing quality review gate behavior remains intact', () => {
  const revReq: ReviewRequest = {
    topicId: 'lm-tech-ai-val-01',
    title: validSampleArticle.title,
    description: validSampleArticle.description,
    excerpt: validSampleArticle.excerpt,
    content: validSampleArticle.content,
    pillar: 'tech-ai',
    format: 'guide',
    audience: 'Intentional creators',
    primaryIntent: 'informational',
    riskLevel: 'low',
    affiliateIntent: false,
    sources: validSampleArticle.sources,
    internalLinks: validSampleArticle.internalLinks,
  };

  const gateResult = evaluateReviewGates(revReq);
  assert.equal(gateResult.passed, true);
  assert.equal(gateResult.criticalIssues.length, 0);
});

test('14. Backward compatibility: validateGeneratedArticle operates seamlessly on legacy briefs', () => {
  const report = validateGeneratedArticle(validSampleArticle);
  assert.equal(report.isValid, true);
  assert.ok(report.score >= 80);
  assert.ok(report.editorialValidation);
  assert.equal(report.editorialValidation?.passed, true);
});
