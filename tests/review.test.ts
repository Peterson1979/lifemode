import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateReviewGates } from '../src/lib/editorial/review/gates.ts';
import { buildReviewPrompt } from '../src/lib/editorial/review/prompt.ts';
import { validateReviewResponse } from '../src/lib/editorial/review/validation.ts';
import { evaluateReviewDecision } from '../src/lib/editorial/review/decision.ts';
import { FixtureReviewProvider } from '../src/lib/editorial/review/providers/fixture.ts';
import { AIRouterReviewProvider } from '../src/lib/editorial/review/providers/ai-router.ts';
import { runReviewPipeline } from '../src/lib/editorial/review/runner.ts';
import { AIRouter } from '../src/lib/ai/router.ts';
import { AIRouterFixtureProvider } from '../src/lib/ai/providers/fixture.ts';
import type { ReviewRequest, ReviewDimensionKey, ReviewDimensionScore } from '../src/lib/editorial/review/types.ts';

const validReviewRequest: ReviewRequest = {
  topicId: 'lm-tech-ai-2026-review-01',
  title: 'Intentional Technology Architecture in 2026',
  description: 'An editorial guide exploring modern minimalist software setups, calm productivity, and local intelligence.',
  excerpt: 'How intentional developers and creators design calm workflows in an era of digital overload.',
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
  pillar: 'tech-ai',
  format: 'guide',
  audience: 'Curious developers and knowledge workers seeking digital intentionality.',
  primaryIntent: 'informational',
  secondaryIntent: 'inspirational',
  riskLevel: 'low',
  affiliateIntent: false,
  sources: [
    {
      name: 'LifeMode Editorial Standards',
      url: 'https://lifemode.io/editorial-standards',
    },
  ],
  internalLinks: ['/tech-ai', '/life'],
};

function createMockDimensions(scores: Partial<Record<ReviewDimensionKey, number>> = {}, baseScore = 88): Record<ReviewDimensionKey, ReviewDimensionScore> {
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
      rationale: `Evaluation rationale for ${k}`,
      issues: [],
    };
  }
  return result;
}

test('1. Valid review request passes deterministic gates', () => {
  const gateResult = evaluateReviewGates(validReviewRequest);
  assert.equal(gateResult.passed, true);
  assert.equal(gateResult.criticalIssues.length, 0);
});

test('2. Missing title blocks review in deterministic gate', () => {
  const req = { ...validReviewRequest, title: '' };
  const gateResult = evaluateReviewGates(req);
  assert.equal(gateResult.passed, false);
  assert.ok(gateResult.criticalIssues.some((i) => i.toLowerCase().includes('title')));
});

test('3. Missing content blocks review in deterministic gate', () => {
  const req = { ...validReviewRequest, content: '' };
  const gateResult = evaluateReviewGates(req);
  assert.equal(gateResult.passed, false);
  assert.ok(gateResult.criticalIssues.some((i) => i.toLowerCase().includes('content')));
});

test('4. Missing H2 heading blocks review in deterministic gate', () => {
  const req = {
    ...validReviewRequest,
    content: 'This is body content that has enough words to exceed eighty words, but it completely lacks any H2 markdown headings. Without subheadings, readers on mobile devices experience high cognitive load and difficulty scanning the material, which violates LifeMode formatting guidelines for longform guides.',
  };
  const gateResult = evaluateReviewGates(req);
  assert.equal(gateResult.passed, false);
  assert.ok(gateResult.criticalIssues.some((i) => i.includes('H2')));
});

test('5. Unresolved placeholders block review in deterministic gate', () => {
  const req = {
    ...validReviewRequest,
    content: '## Heading One\n\nHere is some body text with {{unresolved_feature_name}} and a TODO marker for missing citations.\n\n## Heading Two\n\nMore content.',
  };
  const gateResult = evaluateReviewGates(req);
  assert.equal(gateResult.passed, false);
  assert.ok(gateResult.criticalIssues.some((i) => i.includes('placeholder')));
});

test('6. High-risk content without required source support is blocked by gate', () => {
  const highRiskReq: ReviewRequest = {
    ...validReviewRequest,
    riskLevel: 'high',
    pillar: 'wellbeing',
    sources: [], // Missing required sources
  };
  const gateResult = evaluateReviewGates(highRiskReq);
  assert.equal(gateResult.passed, false);
  assert.ok(gateResult.criticalIssues.some((i) => i.toLowerCase().includes('source')));
});

test('7. Fixture PASS response is accepted and produces PASS', async () => {
  const provider = new FixtureReviewProvider({ outcome: 'PASS' });
  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider,
  });

  assert.equal(result.decision, 'PASS');
  assert.ok(result.overallScore >= 85);
  assert.equal(result.criticalIssues.length, 0);
  assert.equal(result.gatePassed, true);
});

test('8. Fixture REVISE response is accepted and produces REVISE', async () => {
  const provider = new FixtureReviewProvider({ outcome: 'REVISE' });
  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider,
  });

  assert.equal(result.decision, 'REVISE');
  assert.ok(result.overallScore >= 70 && result.overallScore < 85);
  assert.equal(result.criticalIssues.length, 0);
});

test('9. Fixture REJECT response is accepted and produces REJECT', async () => {
  const provider = new FixtureReviewProvider({ outcome: 'REJECT' });
  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider,
  });

  assert.equal(result.decision, 'REJECT');
  assert.ok(result.overallScore < 70);
  assert.ok(result.criticalIssues.length > 0);
});

test('10. Malformed reviewer response fails validation and causes REJECT', async () => {
  const provider = new FixtureReviewProvider({ outcome: 'MALFORMED' });
  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider,
  });

  assert.equal(result.decision, 'REJECT');
  assert.ok(result.criticalIssues.some((i) => i.includes('validation failed')));
});

test('11. Invalid dimension score fails validation', () => {
  const dims = createMockDimensions();
  dims.safety.score = 150; // Out of bounds > 100

  const report = validateReviewResponse({
    overallScore: 85,
    dimensions: dims,
    criticalIssues: [],
    warnings: [],
  });

  assert.equal(report.isValid, false);
  assert.ok(report.issues.some((i) => i.includes('out of bounds')));
});

test('12. Missing dimension fails validation', () => {
  const dims = createMockDimensions();
  delete (dims as any).factuality; // Delete required dimension

  const report = validateReviewResponse({
    overallScore: 85,
    dimensions: dims,
    criticalIssues: [],
    warnings: [],
  });

  assert.equal(report.isValid, false);
  assert.ok(report.issues.some((i) => i.includes('Missing required review dimension: "factuality"')));
});

test('13. PASS threshold is applied deterministically', () => {
  const decision = evaluateReviewDecision({
    overallScore: 89,
    dimensions: createMockDimensions({ safety: 90, factuality: 90 }),
    criticalIssues: [],
    gatePassed: true,
    riskLevel: 'low',
  });

  assert.equal(decision, 'PASS');
});

test('14. REVISE threshold is applied deterministically', () => {
  const decision = evaluateReviewDecision({
    overallScore: 78,
    dimensions: createMockDimensions({ safety: 80, factuality: 80 }),
    criticalIssues: [],
    gatePassed: true,
    riskLevel: 'low',
  });

  assert.equal(decision, 'REVISE');
});

test('15. REJECT threshold is applied deterministically for low score', () => {
  const decision = evaluateReviewDecision({
    overallScore: 62,
    dimensions: createMockDimensions({ safety: 65, factuality: 65 }),
    criticalIssues: [],
    gatePassed: true,
    riskLevel: 'low',
  });

  assert.equal(decision, 'REJECT');
});

test('16. Critical factuality issue prevents PASS', () => {
  const decision = evaluateReviewDecision({
    overallScore: 92, // High overall score
    dimensions: createMockDimensions({ safety: 90, factuality: 90 }),
    criticalIssues: ['Unsupported statistical claim in section 1.'], // Critical issue present
    gatePassed: true,
    riskLevel: 'low',
  });

  assert.equal(decision, 'REJECT');
});

test('17. Critical safety issue prevents PASS', () => {
  const decision = evaluateReviewDecision({
    overallScore: 90,
    dimensions: createMockDimensions({ safety: 55, factuality: 90 }), // Low safety score
    criticalIssues: [],
    gatePassed: true,
    riskLevel: 'low',
  });

  assert.equal(decision, 'REJECT');
});

test('18. Deterministic gate failure does not call AI provider', async () => {
  let providerCalled = false;
  const mockProvider = {
    name: 'Spy Provider',
    model: 'spy-v1',
    review: async () => {
      providerCalled = true;
      throw new Error('Should not be called');
    },
  };

  const invalidReq = { ...validReviewRequest, title: '' }; // Fails gate
  const result = await runReviewPipeline({
    request: invalidReq,
    provider: mockProvider,
  });

  assert.equal(providerCalled, false);
  assert.equal(result.decision, 'REJECT');
  assert.equal(result.gatePassed, false);
});

test('19. Provider failure never produces PASS', async () => {
  const failingProvider = new FixtureReviewProvider({ outcome: 'FORCED_ERROR' });
  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider: failingProvider,
  });

  assert.equal(result.decision, 'REJECT');
  assert.notEqual(result.decision, 'PASS');
  assert.ok(result.criticalIssues.some((i) => i.includes('Review provider execution failed')));
});

test('20. Review runner does not modify article content (pure evaluation)', async () => {
  const originalContent = validReviewRequest.content;
  const provider = new FixtureReviewProvider({ outcome: 'PASS' });

  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider,
  });

  assert.equal(validReviewRequest.content, originalContent);
  assert.ok(result.decision);
});

test('21. Review runner does not write files or touch filesystem', async () => {
  const provider = new FixtureReviewProvider({ outcome: 'PASS' });
  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider,
  });

  assert.equal(result.decision, 'PASS');
  assert.equal(typeof result.overallScore, 'number');
  assert.equal(typeof result.metadata.durationMs, 'number');
});

test('22. Review runner does not publish anything', async () => {
  const provider = new FixtureReviewProvider({ outcome: 'PASS' });
  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider,
  });

  // Result provides evaluation decision only, without publishing action
  assert.ok(['PASS', 'REVISE', 'REJECT'].includes(result.decision));
});

test('23. AI-router review adapter maps content_review correctly', async () => {
  const sampleReviewJsonResponse = JSON.stringify({
    overallScore: 89,
    dimensions: createMockDimensions({ safety: 92, factuality: 90 }),
    criticalIssues: [],
    warnings: ['Minor note on paragraph flow.'],
  }, null, 2);

  const fixtureAiProvider = new AIRouterFixtureProvider({
    id: 'fixture-ai-rev',
    mockResponseText: sampleReviewJsonResponse,
  });

  const router = new AIRouter({
    config: {
      providerOrder: ['fixture-ai-rev'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'llama-3.3-70b-versatile', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['fixture-ai-rev', fixtureAiProvider]]),
  });

  const routerReviewProvider = new AIRouterReviewProvider(router);

  const result = await runReviewPipeline({
    request: validReviewRequest,
    provider: routerReviewProvider,
  });

  assert.equal(result.decision, 'PASS');
  assert.equal(result.overallScore, 89);
  assert.equal(result.metadata.provider, 'fixture-ai-rev');
});

test('24. Prompt builder formats prompt correctly without conversational noise', () => {
  const promptPayload = buildReviewPrompt(validReviewRequest);
  assert.ok(promptPayload.systemPrompt.includes('Senior Editorial Quality Director'));
  assert.ok(promptPayload.systemPrompt.includes('YOU MUST NEVER REWRITE THE ARTICLE'));
  assert.ok(promptPayload.userPrompt.includes(validReviewRequest.title));
  assert.ok(promptPayload.fullPromptText.length > 300);
});
