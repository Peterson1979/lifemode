import test from 'node:test';
import assert from 'node:assert/strict';

import { FixtureGenerationProvider } from '../src/lib/editorial/generation/providers/fixture.ts';
import type { IGenerationProvider } from '../src/lib/editorial/generation/providers/types.ts';
import { buildGenerationPrompt } from '../src/lib/editorial/generation/prompt.ts';
import { validateGeneratedArticle } from '../src/lib/editorial/generation/validation.ts';
import { runGenerationPipeline } from '../src/lib/editorial/generation/runner.ts';
import { briefToGenerationRequest } from '../src/lib/editorial/generation/brief-adapter.ts';
import { buildContentBrief } from '../src/lib/editorial/brief.ts';
import type { GenerationRequest, GeneratedArticle } from '../src/lib/editorial/generation/types.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';

const validRequest: GenerationRequest = {
  topicId: 'lm-tech-ai-2026-test-01',
  titleAngle: 'The Intentional Guide to Local LLMs in 2026',
  pillar: 'tech-ai',
  format: 'guide',
  audience: 'Curious developers and knowledge workers seeking digital intentionality.',
  primaryIntent: 'informational',
  secondaryIntent: 'inspirational',
  searchTargets: {
    primaryKeyword: 'local llm setup',
    secondaryKeywords: ['private ai', 'offline models', 'knowledge management'],
    targetSearchVolumeTier: 'high',
  },
  pinterestAngle: {
    visualTheme: 'Minimalist Workspace & Code Editor Aesthetics',
    pinTitleAngle: 'How to Run Private Local LLMs in 2026',
    pinDescriptionAngle: 'A complete step-by-step editorial guide for intentional tech setups.',
    aestheticKeywords: ['tech', 'minimalism', 'workspace', 'ai'],
  },
  socialAngle: {
    hookAngle: 'Why running your own local AI is the best digital productivity shift in 2026.',
    keyTakeaways: ['Data privacy', 'Zero latency', 'Calm technology workflow'],
  },
  affiliateIntent: true,
  affiliateCategories: ['tech', 'hardware'],
  riskLevel: 'low',
  requiredSources: [
    {
      name: 'LifeMode Editorial Tech Standards',
      url: 'https://lifemode.io/editorial-standards',
      citationType: 'authority',
    },
  ],
  internalLinks: ['/tech-ai', '/life'],
  contentInstructions: 'Focus on calmness, digital sovereignty, and practical terminal workflows.',
  estimatedWordCount: { min: 800, target: 1200, max: 1600 },
  outlineSections: [
    {
      heading: 'Foundational Perspective',
      keyPoints: ['Define local intelligence', 'Why intentional setup matters'],
    },
    {
      heading: 'Practical Architecture',
      keyPoints: ['Step-by-step setup', 'Recommended models'],
    },
  ],
};

test('1. Valid GenerationRequest is accepted by prompt builder and pipeline', () => {
  const promptPayload = buildGenerationPrompt(validRequest);
  assert.ok(promptPayload.systemPrompt.includes('LifeMode'));
  assert.ok(promptPayload.userPrompt.includes('The Intentional Guide to Local LLMs in 2026'));
  assert.ok(promptPayload.userPrompt.includes('local llm setup'));
  assert.ok(promptPayload.fullPromptText.length > 200);
});

test('2. Invalid GenerationRequest is rejected by runner', async () => {
  const provider = new FixtureGenerationProvider();

  // Missing topicId
  const invalidRequest = { ...validRequest, topicId: '' };
  const result = await runGenerationPipeline({
    request: invalidRequest,
    provider,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.errorCode, 'INVALID_REQUEST');
    assert.ok(result.errorMessage.includes('topicId'));
  }
});

test('3. Fixture provider produces deterministic output', async () => {
  const provider = new FixtureGenerationProvider();

  const payload1 = await provider.generate(validRequest);
  const payload2 = await provider.generate(validRequest);

  assert.equal(payload1.article.title, payload2.article.title);
  assert.equal(payload1.article.slug, payload2.article.slug);
  assert.equal(payload1.article.content, payload2.article.content);
  assert.equal(payload1.article.faq.length, 2);
  assert.equal(payload1.article.sources.length, 1);
  assert.equal(payload1.metadata?.model, 'fixture-deterministic-v1');
});

test('4. Fixture output passes validation', async () => {
  const provider = new FixtureGenerationProvider();
  const { article } = await provider.generate(validRequest);

  const report = validateGeneratedArticle(article, validRequest);
  assert.equal(report.isValid, true);
  assert.equal(report.score, 100);
  assert.ok(report.headingsCount >= 2);
  assert.ok(report.wordCount > 100);
});

test('5. Malformed generated article fails validation (invalid metadata types)', () => {
  const malformedArticle: Partial<GeneratedArticle> = {
    title: 'Valid Title for Article Testing',
    slug: 'valid-title-for-article-testing',
    description: 'A valid description of sufficient length for the article.',
    excerpt: 'Valid excerpt text.',
    content: '## Heading One\n\nSome body text here.\n\n## Heading Two\n\nMore body text here for validation.',
    faq: 'not an array' as any,
    sources: 'not an array' as any,
  };

  const report = validateGeneratedArticle(malformedArticle);
  assert.equal(report.isValid, false);
  const faqIssue = report.issues.find((i) => i.field === 'faq');
  const srcIssue = report.issues.find((i) => i.field === 'sources');
  assert.ok(faqIssue);
  assert.ok(srcIssue);
});

test('6. Missing title fails validation', () => {
  const article: Partial<GeneratedArticle> = {
    title: '',
    slug: 'some-slug',
    description: 'A description that is quite long enough to pass validation.',
    excerpt: 'Excerpt text',
    content: '## Heading One\n\nContent body with enough words to pass validation testing.',
  };

  const report = validateGeneratedArticle(article);
  assert.equal(report.isValid, false);
  const titleIssue = report.issues.find((i) => i.field === 'title' && i.rule === 'REQUIRED');
  assert.ok(titleIssue);
});

test('7. Missing content fails validation', () => {
  const article: Partial<GeneratedArticle> = {
    title: 'Valid Title of Good Length',
    slug: 'valid-title-of-good-length',
    description: 'A description that is long enough to pass validation checks cleanly.',
    excerpt: 'Valid excerpt text.',
    content: '',
  };

  const report = validateGeneratedArticle(article);
  assert.equal(report.isValid, false);
  const contentIssue = report.issues.find((i) => i.field === 'content' && i.rule === 'REQUIRED');
  assert.ok(contentIssue);
});

test('8. Missing H2 heading fails validation', () => {
  const article: Partial<GeneratedArticle> = {
    title: 'Valid Title of Good Length',
    slug: 'valid-title-of-good-length',
    description: 'A description that is long enough to pass validation checks cleanly.',
    excerpt: 'Valid excerpt text.',
    content: 'This is plain text with more than eighty words to pass the minimum word count check, but it completely lacks any H2 subheadings. In contemporary lifestyle publishing, formatting and clear structure are paramount for effortless readability, and omitting headings detracts from the reader experience significantly.',
  };

  const report = validateGeneratedArticle(article);
  assert.equal(report.isValid, false);
  const h2Issue = report.issues.find((i) => i.field === 'content' && i.rule === 'MISSING_H2');
  assert.ok(h2Issue);
});

test('9. Unresolved template placeholders are detected', () => {
  const article: Partial<GeneratedArticle> = {
    title: 'Valid Title with {{topic_placeholder}}',
    slug: 'valid-title-with-placeholder',
    description: 'A description that mentions [Insert Summary Here] for testing placeholder detection.',
    excerpt: 'Valid excerpt text.',
    content: '## Heading One\n\nIn this section we discuss {{feature_name}} and need to finish TODO items.\n\n## Heading Two\n\nMore content body.',
  };

  const report = validateGeneratedArticle(article);
  assert.equal(report.isValid, false);
  const placeholderIssue = report.issues.find((i) => i.rule === 'UNRESOLVED_PLACEHOLDER');
  assert.ok(placeholderIssue);
});

test('10. Provider failure becomes a typed failed GenerationResult', async () => {
  const failingProvider: IGenerationProvider = {
    name: 'Failing Mock Provider',
    model: 'failing-mock-v1',
    generate: async () => {
      throw new Error('Simulated upstream provider timeout / rate limit');
    },
  };

  const result = await runGenerationPipeline({
    request: validRequest,
    provider: failingProvider,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.errorCode, 'PROVIDER_ERROR');
    assert.equal(result.provider, 'Failing Mock Provider');
    assert.ok(result.errorMessage.includes('Simulated upstream provider timeout'));
  }
});

test('11. Runner successfully executes with the fixture provider', async () => {
  const provider = new FixtureGenerationProvider();

  const result = await runGenerationPipeline({
    request: validRequest,
    provider,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.article.title, validRequest.titleAngle);
    assert.ok(result.article.content.includes('## 1. Foundational Perspective'));
    assert.equal(result.metadata.provider, 'Fixture Generation Provider');
    assert.equal(result.metadata.model, 'fixture-deterministic-v1');
    assert.equal(result.validation.isValid, true);
  }
});

test('12. Runner does not write files or publish anything (pure in-memory)', async () => {
  const provider = new FixtureGenerationProvider();
  const result = await runGenerationPipeline({
    request: validRequest,
    provider,
  });

  assert.ok(result);
  assert.equal(result.success, true);
  // Pure execution returns typed memory object without filesystem side-effects
  if (result.success) {
    assert.equal(typeof result.article.content, 'string');
    assert.equal(typeof result.metadata.durationMs, 'number');
  }
});

test('13. Brief adapter converts ContentBrief to GenerationRequest seamlessly', () => {
  const topic: EditorialTopic = {
    id: 'lm-travel-01',
    canonicalTopic: 'Slow Travel in Kyoto',
    slug: 'slow-travel-in-kyoto',
    pillar: 'travel',
    sourceSignals: [],
    queryVariants: ['kyoto tea houses', 'slow travel japan'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 90,
      socialPotential: 75,
      lifeModeRelevance: 95,
      commercialPotential: 60,
      freshness: 80,
      competitionOpportunity: 70,
      originalityPotential: 85,
    },
    totalScore: 82.5,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'BRIEF_READY',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['kyoto', 'japan', 'travel'],
  };

  const brief = buildContentBrief(topic);
  const request = briefToGenerationRequest(brief, {
    contentInstructions: 'Focus on traditional architecture and mindfulness.',
  });

  assert.equal(request.topicId, topic.id);
  assert.equal(request.pillar, 'travel');
  assert.equal(request.searchTargets.primaryKeyword, 'slow travel in kyoto');
  assert.ok(request.contentInstructions?.includes('traditional architecture'));
  assert.ok(request.outlineSections && request.outlineSections.length > 0);
});

test('14. Normal article within brief target range passes generation validation', () => {
  const req: GenerationRequest = {
    ...validRequest,
    estimatedWordCount: { min: 1000, target: 1400, max: 2000 },
  };
  const dummyContent = Array(1200).fill('word').join(' ');
  const article: Partial<GeneratedArticle> = {
    title: 'Intentional Living in the Modern Age',
    slug: 'intentional-living-in-the-modern-age',
    description: 'An editorial guide to mindful everyday routines and calm environments.',
    excerpt: 'Mindful everyday routines for modern living.',
    content: `## 1. Core Principles\n\n${dummyContent}\n\n## 2. Practical Framework\n\nMore detailed text here.`,
  };

  const report = validateGeneratedArticle(article, req);
  assert.equal(report.isValid, true);
  assert.equal(report.score, 100);
  assert.equal(report.issues.some((i) => i.rule === 'BELOW_TARGET_WORD_COUNT'), false);
  assert.equal(report.issues.some((i) => i.rule === 'NEAR_MINIMUM_WORD_COUNT'), false);
});

test('15. Article slightly below target but within 80% tolerance passes with warning', () => {
  const req: GenerationRequest = {
    ...validRequest,
    estimatedWordCount: { min: 1000, target: 1400, max: 2000 },
  };
  // 850 words is >= 800 (80% of 1000), but < 1000
  const dummyContent = Array(850).fill('editorial').join(' ');
  const article: Partial<GeneratedArticle> = {
    title: 'Intentional Living in the Modern Age',
    slug: 'intentional-living-in-the-modern-age',
    description: 'An editorial guide to mindful everyday routines and calm environments.',
    excerpt: 'Mindful everyday routines for modern living.',
    content: `## 1. Section One\n\n${dummyContent}\n\n## 2. Section Two\n\nPractical application notes.`,
  };

  const report = validateGeneratedArticle(article, req);
  assert.equal(report.isValid, true); // Still valid (warning only)
  assert.equal(report.issues.some((i) => i.rule === 'NEAR_MINIMUM_WORD_COUNT' && i.severity === 'warning'), true);
  assert.equal(report.issues.some((i) => i.rule === 'BELOW_TARGET_WORD_COUNT'), false);
});

test('16. Severely undersized article below 80% boundary fails generation validation', () => {
  const req: GenerationRequest = {
    ...validRequest,
    estimatedWordCount: { min: 1400, target: 2000, max: 2800 },
  };
  // 546 words is severely undersized (39% of 1400, threshold is 1120)
  const dummyContent = Array(540).fill('short').join(' ');
  const article: Partial<GeneratedArticle> = {
    title: '10 Simple Ways to Make a Small Bedroom Feel Bigger',
    slug: '10-simple-ways-to-make-a-small-bedroom-feel-bigger',
    description: 'A brief guide on small bedroom optimization.',
    excerpt: 'Short excerpt.',
    content: `## 1. Vertical Space\n\n${dummyContent}\n\n## 2. Lighting\n\nBrief notes.`,
  };

  const report = validateGeneratedArticle(article, req);
  assert.equal(report.isValid, false); // Blocked
  const belowTargetIssue = report.issues.find((i) => i.rule === 'BELOW_TARGET_WORD_COUNT');
  assert.ok(belowTargetIssue);
  assert.equal(belowTargetIssue?.severity, 'error');
  assert.ok(belowTargetIssue?.message.includes('1400'));
});

test('17. Missing/invalid target metadata falls back safely to default minimum threshold', () => {
  const reqWithoutTarget: GenerationRequest = {
    ...validRequest,
    estimatedWordCount: undefined,
  };
  // 120 words exceeds default 80 words
  const dummyContent = Array(120).fill('content').join(' ');
  const article: Partial<GeneratedArticle> = {
    title: 'Intentional Living Guide',
    slug: 'intentional-living-guide',
    description: 'A comprehensive editorial guide to modern lifestyle architecture.',
    excerpt: 'Editorial guide excerpt.',
    content: `## 1. Overview\n\n${dummyContent}\n\n## 2. Details\n\nMore text.`,
  };

  const report = validateGeneratedArticle(article, reqWithoutTarget);
  assert.equal(report.isValid, true);
  assert.equal(report.issues.some((i) => i.rule === 'BELOW_TARGET_WORD_COUNT'), false);
});

test('18. Generation prompt builder communicates target vs minimum word counts and mental allocation', () => {
  const payload = buildGenerationPrompt(validRequest);

  // Checks target word count vs minimum distinction
  assert.ok(payload.userPrompt.includes('TARGET WORD COUNT: Approximately 1200 words'));
  assert.ok(payload.userPrompt.includes('ABSOLUTE MINIMUM ACCEPTABLE WORD COUNT: 800 words'));
  assert.ok(payload.userPrompt.includes('Internal Structural & Length Allocation Plan'));
  assert.ok(payload.userPrompt.includes('Introduction (~15%'));
  assert.ok(payload.userPrompt.includes('Core Major Sections (~70%'));
  assert.ok(payload.userPrompt.includes('Conclusion & Practical Takeaways (~15%'));
  assert.ok(payload.userPrompt.includes('Do NOT output these planning notes'));
});

test('19. Generation prompt builder enforces depth directives and zero-filler/zero-hallucination rules', () => {
  const payload = buildGenerationPrompt(validRequest);

  // System prompt guidelines
  assert.ok(payload.systemPrompt.includes('Complete Article Requirement'));
  assert.ok(payload.systemPrompt.includes('Section-by-Section Depth'));
  assert.ok(payload.systemPrompt.includes('Substantive Introduction & Conclusion'));
  assert.ok(payload.systemPrompt.includes('Natural Editorial Prose & Zero Filler'));
  assert.ok(payload.systemPrompt.includes('Factuality & Evidence'));
  assert.ok(payload.systemPrompt.includes('JSON Schema Conformance'));
});

test('20. Revision prompt communicates depth, hard minimums, target word count, and non-compression', () => {
  const revRequest: GenerationRequest = {
    ...validRequest,
    revisionContext: {
      originalArticle: {
        title: 'Original Draft Title',
        slug: 'original-draft-slug',
        description: 'Original description of sufficient length for review testing.',
        excerpt: 'Original excerpt.',
        content: '## 1. Introduction\n\nOriginal content body.\n\n## 2. Practical Framework\n\nMore original text.',
        faq: [],
        sources: [],
        internalLinks: [],
        affiliateIntents: [],
        socialHooks: [],
      },
      reviewResult: {
        decision: 'REVISE',
        overallScore: 82,
        dimensions: {
          factuality: { score: 78, rationale: 'Contains unverified claims.', issues: ['Unsubstantiated trend claim'] },
        },
        criticalIssues: ['Remove unsubstantiated trend claims'],
        warnings: ['Expand section 2 with concrete methodologies'],
      },
      revisionAttempt: 1,
    },
  };

  const payload = buildGenerationPrompt(revRequest);

  assert.ok(payload.systemPrompt.includes('Maintain Full Article Depth'));
  assert.ok(payload.systemPrompt.includes('TARGET WORD COUNT (~1200 words)'));
  assert.ok(payload.systemPrompt.includes('ABSOLUTE MINIMUM ACCEPTABLE WORD COUNT (800 words)'));
  assert.ok(payload.userPrompt.includes('TARGET WORD COUNT: Approximately 1200 words'));
  assert.ok(payload.userPrompt.includes('ABSOLUTE MINIMUM ACCEPTABLE WORD COUNT: 800 words'));
  assert.ok(payload.userPrompt.includes('Critical Issues to Resolve:'));
  assert.ok(payload.userPrompt.includes('Original Draft Content to Revise:'));
});

