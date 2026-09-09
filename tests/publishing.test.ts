import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePublishingGate } from '../src/lib/editorial/publishing/gate.ts';
import { buildPublishPackage } from '../src/lib/editorial/publishing/builder.ts';
import { FixturePublishingProvider } from '../src/lib/editorial/publishing/providers/fixture.ts';
import { runPublishingPipeline } from '../src/lib/editorial/publishing/runner.ts';
import type { PublishingRequest } from '../src/lib/editorial/publishing/types.ts';
import type { GeneratedArticle } from '../src/lib/editorial/generation/types.ts';
import type { ReviewResult, ReviewDimensionKey, ReviewDimensionScore } from '../src/lib/editorial/review/types.ts';

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

const sampleArticle: GeneratedArticle = {
  title: 'Mindful Hardware Architecture in 2026',
  slug: 'mindful-hardware-architecture-in-2026',
  description: 'An editorial guide exploring modern minimal computing setups, energy-efficient chips, and local AI workspaces.',
  excerpt: 'Designing a calm, intentional workstation for modern creators and knowledge workers.',
  content: [
    'In contemporary lifestyle design, intentionality represents a foundational shift toward clarity and sustainable daily focus.',
    '',
    '## 1. The Modern Shift: Signal Over Noise',
    'Navigating digital overload requires cultivating a calm, deliberate relationship with our tools and physical spaces.',
    'Rather than reacting to every new impulse, we establish clear boundaries and structured daily rhythms.',
    '',
    '## 2. Practical Framework & Daily Protocols',
    'Implementing intentional design begins with small, repeatable workflows that compound over time.',
    'By focusing on essential priorities, modern knowledge workers preserve cognitive bandwidth for deep, meaningful work.'
  ].join('\n'),
  faq: [
    { question: 'What is mindful hardware?', answer: 'Focusing on energy efficiency, repairability, and quiet performance.' }
  ],
  sources: [
    { name: 'LifeMode Editorial Standards', url: 'https://lifemode.io/editorial-standards' }
  ],
  internalLinks: ['/tech-ai'],
  affiliateIntents: ['tech', 'hardware'],
  socialHooks: ['Why mindful hardware architecture is the defining computing shift of 2026.'],
};

const sampleReview: ReviewResult = {
  decision: 'PASS',
  overallScore: 92,
  dimensions: createMockReviewDimensions({ safety: 95, factuality: 92 }),
  criticalIssues: [],
  warnings: [],
  reviewer: 'Senior Editorial Reviewer',
  metadata: {
    provider: 'Fixture AI Reviewer',
    model: 'fixture-review-v1',
    reviewedAt: '2026-09-09T16:00:00.000Z',
    durationMs: 15,
  },
  gatePassed: true,
};

const validPublishingRequest: PublishingRequest = {
  article: sampleArticle,
  review: sampleReview,
  context: {
    topicId: 'lm-tech-ai-2026-pub-01',
    pillar: 'tech-ai',
    format: 'guide',
    audience: 'Curious developers and intentional knowledge workers.',
    primaryIntent: 'informational',
    secondaryIntent: 'inspirational',
    riskLevel: 'low',
    affiliateIntent: true,
    affiliateCategories: ['tech', 'hardware'],
    tags: ['tech-ai', 'hardware', 'workspaces'],
  },
};

test('1. Valid PASS article is eligible in Publishing Gate', () => {
  const gateResult = evaluatePublishingGate(validPublishingRequest);
  assert.equal(gateResult.eligible, true);
  assert.equal(gateResult.reasons.length, 0);
});

test('2. REVISE decision is blocked by Publishing Gate', () => {
  const reviseReq: PublishingRequest = {
    ...validPublishingRequest,
    review: {
      ...sampleReview,
      decision: 'REVISE',
      overallScore: 78,
    },
  };
  const gateResult = evaluatePublishingGate(reviseReq);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('decision is "REVISE"')));
});

test('3. REJECT decision is blocked by Publishing Gate', () => {
  const rejectReq: PublishingRequest = {
    ...validPublishingRequest,
    review: {
      ...sampleReview,
      decision: 'REJECT',
      overallScore: 55,
      criticalIssues: ['Factuality failure.'],
    },
  };
  const gateResult = evaluatePublishingGate(rejectReq);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('decision is "REJECT"')));
});

test('4. Missing title is blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    article: { ...sampleArticle, title: '' },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.toLowerCase().includes('title')));
});

test('5. Missing description is blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    article: { ...sampleArticle, description: '' },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.toLowerCase().includes('description')));
});

test('6. Missing content is blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    article: { ...sampleArticle, content: '' },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.toLowerCase().includes('content')));
});

test('7. Missing H2 heading is blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    article: {
      ...sampleArticle,
      content: 'This is plain text with more than eighty words to satisfy the minimum length requirement, but it contains absolutely no H2 section headings. In modern digital publishing, structured headings are essential for readability and SEO indexability, so omitting them will prevent the gate from approving publication.',
    },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('H2')));
});

test('8. Unresolved template placeholders are blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    article: {
      ...sampleArticle,
      content: '## 1. Heading One\n\nHere is text with {{placeholder_tag}} and TODO item.\n\n## 2. Heading Two\n\nMore text.',
    },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('placeholder')));
});

test('9. Safety score below threshold is blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    review: {
      ...sampleReview,
      dimensions: createMockReviewDimensions({ safety: 72, factuality: 90 }),
    },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('Safety review score (72) is below publishing threshold')));
});

test('10. Factuality score below threshold is blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    review: {
      ...sampleReview,
      dimensions: createMockReviewDimensions({ safety: 90, factuality: 70 }),
    },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('Factuality review score (70) is below publishing threshold')));
});

test('11. High-risk article without required sources is blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    context: {
      ...validPublishingRequest.context,
      riskLevel: 'high',
    },
    article: {
      ...sampleArticle,
      sources: [], // Missing sources for high-risk topic
    },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.toLowerCase().includes('source')));
});

test('12. Suspicious dummy URLs in sources are blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    article: {
      ...sampleArticle,
      sources: [{ name: 'Fake Ref', url: 'https://example.com/fake-post' }],
    },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('dummy source URL')));
});

test('13. Already-published article is blocked by Publishing Gate', () => {
  const req: PublishingRequest = {
    ...validPublishingRequest,
    context: {
      ...validPublishingRequest.context,
      isAlreadyPublished: true,
    },
  };
  const gateResult = evaluatePublishingGate(req);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('already marked as published')));
});

test('14. Package Builder correctly maps article + review into canonical PublishPackage', () => {
  const pkg = buildPublishPackage(validPublishingRequest, {
    author: 'Editorial Lead',
    targetDate: '2026-09-10T12:00:00.000Z',
  });

  assert.equal(pkg.id, 'pub-lm-tech-ai-2026-pub-01-mindful-hardware-architecture-in-2026');
  assert.equal(pkg.title, sampleArticle.title);
  assert.equal(pkg.slug, sampleArticle.slug);
  assert.equal(pkg.pillar, 'tech-ai');
  assert.equal(pkg.format, 'guide');
  assert.equal(pkg.publicationMetadata.author, 'Editorial Lead');
  assert.equal(pkg.publicationMetadata.targetDate, '2026-09-10T12:00:00.000Z');
  assert.equal(pkg.qualitySummary.overallScore, 92);
  assert.equal(pkg.qualitySummary.decision, 'PASS');
});

test('15. Package Builder does not mutate source objects (pure function)', () => {
  const articleCopy = JSON.parse(JSON.stringify(sampleArticle));
  const reviewCopy = JSON.parse(JSON.stringify(sampleReview));

  const pkg = buildPublishPackage({
    article: articleCopy,
    review: reviewCopy,
    context: validPublishingRequest.context,
  });

  assert.deepEqual(articleCopy, sampleArticle);
  assert.deepEqual(reviewCopy, sampleReview);
  assert.ok(pkg.id);
});

test('16. Runner: Eligible article + fixture provider produces successful dry-run', async () => {
  const provider = new FixturePublishingProvider();
  const result = await runPublishingPipeline({
    request: validPublishingRequest,
    provider,
  });

  assert.equal(result.status, 'READY');
  assert.equal(result.dryRun, true);
  assert.equal(result.gateResult.eligible, true);
  assert.ok(result.publishPackage);
  assert.equal(result.publicationId, result.publishPackage?.id);
  assert.equal(result.publishedAt, undefined); // Dry-run does not set real publishedAt
});

test('17. Runner: Real publication execution (dryRun: false) sets PUBLISHED status and timestamp', async () => {
  const provider = new FixturePublishingProvider();
  const reqWithLive: PublishingRequest = {
    ...validPublishingRequest,
    options: { dryRun: false },
  };

  const result = await runPublishingPipeline({
    request: reqWithLive,
    provider,
  });

  assert.equal(result.status, 'PUBLISHED');
  assert.equal(result.dryRun, false);
  assert.ok(result.publishedAt);
  assert.equal(await provider.isPublished(result.publicationId!), true);
});

test('18. Runner: Blocked article never reaches provider', async () => {
  let providerCalled = false;
  const spyProvider = {
    name: 'Spy Provider',
    publish: async () => {
      providerCalled = true;
      throw new Error('Should not be called');
    },
    isPublished: async () => false,
  };

  const blockedReq: PublishingRequest = {
    ...validPublishingRequest,
    article: { ...sampleArticle, title: '' }, // Fails gate
  };

  const result = await runPublishingPipeline({
    request: blockedReq,
    provider: spyProvider,
  });

  assert.equal(providerCalled, false);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.error?.code, 'GATE_BLOCKED');
});

test('19. Runner: Provider failure is returned structurally', async () => {
  const failingProvider = new FixturePublishingProvider({
    forcedError: 'Simulated downstream storage reject',
  });

  const result = await runPublishingPipeline({
    request: validPublishingRequest,
    provider: failingProvider,
  });

  assert.equal(result.status, 'FAILED');
  assert.equal(result.error?.code, 'PROVIDER_REJECTED');
  assert.ok(result.error?.message.includes('Simulated downstream storage reject'));
});

test('20. Runner: Duplicate publication is detected and handled safely (idempotency)', async () => {
  const provider = new FixturePublishingProvider();
  const liveReq: PublishingRequest = {
    ...validPublishingRequest,
    options: { dryRun: false },
  };

  // First live publication
  const firstResult = await runPublishingPipeline({
    request: liveReq,
    provider,
  });
  assert.equal(firstResult.status, 'PUBLISHED');

  // Second live publication attempt with same ID
  const duplicateResult = await runPublishingPipeline({
    request: liveReq,
    provider,
  });

  assert.equal(duplicateResult.status, 'SKIPPED');
  assert.equal(duplicateResult.error?.code, 'DUPLICATE_PUBLICATION');
});

test('21. Provider: Fixture provider is deterministic and tracks publication registry', async () => {
  const provider = new FixturePublishingProvider();
  const pkg = buildPublishPackage(validPublishingRequest);

  assert.equal(await provider.isPublished(pkg.id), false);

  const dryRes = await provider.publish(pkg, { dryRun: true });
  assert.equal(dryRes.success, true);
  assert.equal(dryRes.dryRun, true);
  assert.equal(await provider.isPublished(pkg.id), false); // Dry run does not record in registry

  const liveRes = await provider.publish(pkg, { dryRun: false });
  assert.equal(liveRes.success, true);
  assert.equal(liveRes.dryRun, false);
  assert.equal(await provider.isPublished(pkg.id), true); // Recorded in registry

  provider.reset();
  assert.equal(await provider.isPublished(pkg.id), false);
});

test('22. Publishing Gate blocks article substantially below target minimum word count', () => {
  const undersizedRequest: PublishingRequest = {
    ...validPublishingRequest,
    context: {
      ...validPublishingRequest.context,
      estimatedWordCount: { min: 1400, target: 2000, max: 2800 },
    },
  };

  const gateResult = evaluatePublishingGate(undersizedRequest);
  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('substantially below the required minimum target') && r.includes('1400')));
});

test('23. Publishing Gate allows article meeting target minimum word count', () => {
  const dummyContent = Array(1200).fill('editorial').join(' ');
  const sizedArticle: GeneratedArticle = {
    ...sampleArticle,
    content: `## 1. Intro\n\n${dummyContent}\n\n## 2. Conclusion\n\nMore details.`,
  };

  const sizedRequest: PublishingRequest = {
    ...validPublishingRequest,
    article: sizedArticle,
    context: {
      ...validPublishingRequest.context,
      estimatedWordCount: { min: 1000, target: 1400, max: 2000 },
    },
  };

  const gateResult = evaluatePublishingGate(sizedRequest);
  assert.equal(gateResult.eligible, true);
});

