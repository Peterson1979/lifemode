import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isPersonTopic,
  generatePersonTitle,
} from '../src/lib/editorial/person-policy.ts';

import {
  synthesizeEditorialBrief,
} from '../src/lib/editorial/brief.ts';

import {
  generateEditorialImagePrompt,
} from '../src/lib/editorial/image-prompt.ts';

import {
  validateEditorialArticle,
} from '../src/lib/editorial/validation/validator.ts';

import {
  evaluatePublishingGate,
} from '../src/lib/editorial/publishing/gate.ts';

import type { EditorialTopic } from '../src/lib/editorial/types.ts';
import type { GeneratedArticle } from '../src/lib/editorial/generation/types.ts';

// ---------------------------------------------------------------------------
// Helpers & Mock Entities
// ---------------------------------------------------------------------------
function createMockPersonTopic(overrides: Partial<EditorialTopic> = {}): EditorialTopic {
  return {
    id: 'lm-culture-20260916-jose-trevino',
    canonicalTopic: 'José Trevino',
    slug: 'jose-trevino',
    pillar: 'culture',
    sourceSignals: [],
    queryVariants: ['jose trevino career', 'who is jose trevino', 'jose trevino stats'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 70,
      socialPotential: 80,
      lifeModeRelevance: 88,
      commercialPotential: 60,
      freshness: 90,
      competitionOpportunity: 75,
      originalityPotential: 85,
    },
    totalScore: 82,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['culture', 'person', 'baseball', 'mlb'],
    ...overrides,
  };
}

function createMockNonPersonTopic(overrides: Partial<EditorialTopic> = {}): EditorialTopic {
  return {
    id: 'lm-travel-20260916-the-azores',
    canonicalTopic: 'The Azores Solitary Coastlines',
    slug: 'the-azores-solitary-coastlines',
    pillar: 'travel',
    sourceSignals: [],
    queryVariants: ['the azores travel guide', 'quietest islands in the azores'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 90,
      socialPotential: 80,
      lifeModeRelevance: 95,
      commercialPotential: 70,
      freshness: 75,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    totalScore: 85,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
    freshnessScore: 75,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['travel', 'coast', 'islands'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite: Person Editorial Policy
// ---------------------------------------------------------------------------

test('1. Person topic detection: Accurately identifies real people vs non-person topics', () => {
  // Positive person detections
  assert.equal(isPersonTopic({ canonicalTopic: 'José Trevino' }), true);
  assert.equal(isPersonTopic({ canonicalTopic: 'Eliezer Alfonzo' }), true);
  assert.equal(isPersonTopic({ canonicalTopic: 'Blake Lively' }), true);
  assert.equal(isPersonTopic({ canonicalTopic: 'Josh Hartnett' }), true);
  assert.equal(isPersonTopic({ canonicalTopic: 'Shohei Ohtani', tags: ['athlete'] }), true);
  assert.equal(isPersonTopic({ title: 'Who Is Emma Watson?', queryVariants: ['emma watson career'] }), true);
  assert.equal(isPersonTopic({ isPerson: true }), true);
  assert.equal(isPersonTopic({ tags: ['person', 'biography'] }), true);

  // Negative non-person detections
  assert.equal(isPersonTopic({ canonicalTopic: 'Apple Tv Last Seen Series' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'Delta Flight 2311' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'San Jose Earthquakes' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'DeepSeek V4.1 Flash' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'Downdetector Guide' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'Laguna Beach Coastal Guide' }), false);
  assert.equal(isPersonTopic({ canonicalTopic: 'Morning Sunlight and Adenosine Clearing' }), false);
});

test('2. Person articles require at least 2 credible sources for biographical reporting', () => {
  const personArticle = {
    title: 'Who Is José Trevino? Career, Background and More',
    slug: 'who-is-jose-trevino',
    description: 'A factual biographical report on New York Yankees catcher José Trevino.',
    excerpt: 'Examining José Trevino’s career milestones and community leadership.',
    content: `## Background & Career Overview

José Trevino is an established Major League Baseball catcher recognized across the sport for his exceptional defensive craftsmanship, pitch framing precision, and leadership behind the plate. Over multiple competitive seasons with the Texas Rangers and the New York Yankees, Trevino has earned distinguished honors including an All-Star selection and a Platinum Glove Award.

## Community Impact and Leadership

Beyond his defensive accomplishments on the diamond, Trevino has maintained deep dedication to community engagement and youth initiatives. His charitable endeavors and foundation efforts have supported families and young athletes across Texas and New York, earning him league-wide recognition including a nomination for the prestigious Roberto Clemente Award.`,
    sources: [
      { name: 'MLB.com Official Profile', url: 'https://www.mlb.com/player/jose-trevino-624431' },
      { name: 'Sports Illustrated', url: 'https://www.si.com/mlb/yankees/news/jose-trevino-nominated-award' },
    ],
  };

  const result = validateEditorialArticle(
    personArticle,
    {
      topicId: 'lm-culture-20260916-jose-trevino',
      pillar: 'culture',
      isPerson: true,
    }
  );

  assert.equal(result.passed, true);
  assert.equal(result.checks.citations, true);
  assert.equal(result.errors.length, 0);
});

test('3. Person articles expose source metadata cleanly', () => {
  const topic = createMockPersonTopic();
  const nowIso = new Date().toISOString();
  const brief = synthesizeEditorialBrief(topic, [
    {
      title: 'MLB.com Official Profile',
      url: 'https://www.mlb.com/player/jose-trevino-624431',
      publisher: 'MLB.com',
      sourceType: 'official',
      reliability: 'high',
      claimSummary: 'Official player statistics and awards.',
      accessedAt: nowIso,
    },
    {
      title: 'Sports Illustrated',
      url: 'https://www.si.com/mlb/yankees/news/trevino-clemente-award',
      publisher: 'Sports Illustrated',
      sourceType: 'reputable_media',
      reliability: 'high',
      claimSummary: 'Roberto Clemente Award nomination reporting.',
      accessedAt: nowIso,
    },
  ]);

  assert.ok(brief.requiredSources.length >= 2);
  assert.ok(brief.sourceUrls && brief.sourceUrls.length >= 2);
  assert.ok(brief.sourceUrls.includes('https://www.mlb.com/player/jose-trevino-624431'));
  assert.ok(brief.sourceUrls.includes('https://www.si.com/mlb/yankees/news/trevino-clemente-award'));
});

test('4. Insufficient sourcing (< 2 sources or invalid sources) strictly blocks publication', () => {
  // Case A: Only 1 source provided
  const singleSourceArticle: GeneratedArticle = {
    title: 'Who Is José Trevino? Career, Background and More',
    slug: 'who-is-jose-trevino',
    description: 'A factual biographical report on José Trevino.',
    excerpt: 'Examining José Trevino’s career milestones.',
    content: '## Background & Career\n\nJosé Trevino is a major league catcher...\n\n## Achievements\n\nPlatinum glove winner.',
    sources: [
      { name: 'MLB.com', url: 'https://www.mlb.com/player/jose-trevino-624431' },
    ],
    faq: [],
    internalLinks: [],
    affiliateIntents: [],
    socialHooks: [],
  };

  const valResultSingle = validateEditorialArticle(
    singleSourceArticle,
    { topicId: 'lm-now-20260916-jose-trevino', isPerson: true }
  );

  assert.equal(valResultSingle.passed, false);
  assert.equal(valResultSingle.checks.citations, false);
  assert.ok(valResultSingle.errors.some((e) => e.includes('requires at least 2 verified, credible sources')));

  // Case B: Zero sources provided
  const zeroSourceArticle: GeneratedArticle = {
    ...singleSourceArticle,
    sources: [],
  };

  const valResultZero = validateEditorialArticle(
    zeroSourceArticle,
    { topicId: 'lm-now-20260916-jose-trevino', isPerson: true }
  );

  assert.equal(valResultZero.passed, false);
  assert.equal(valResultZero.checks.citations, false);

  // Case C: Sources include discovery-only or self-referential placeholder URLs
  const fakeSourceArticle: GeneratedArticle = {
    ...singleSourceArticle,
    sources: [
      { name: 'Reddit Thread', url: 'https://reddit.com/r/baseball/comments/12345' },
      { name: 'Internal Standards', url: 'https://lifemode.life/editorial-standards' },
    ],
  };

  const valResultFake = validateEditorialArticle(
    fakeSourceArticle,
    { topicId: 'lm-now-20260916-jose-trevino', isPerson: true }
  );

  assert.equal(valResultFake.passed, false);
  assert.equal(valResultFake.checks.citations, false);

function createMockDimensions(baseScore = 90): Record<import('../src/lib/editorial/review/types.ts').ReviewDimensionKey, import('../src/lib/editorial/review/types.ts').ReviewDimensionScore> {
  const keys: import('../src/lib/editorial/review/types.ts').ReviewDimensionKey[] = [
    'factuality', 'usefulness', 'originality', 'readability', 'structure',
    'searchIntent', 'seo', 'editorialFit', 'safety', 'monetizationFit',
  ];
  const result = {} as Record<import('../src/lib/editorial/review/types.ts').ReviewDimensionKey, import('../src/lib/editorial/review/types.ts').ReviewDimensionScore>;
  for (const k of keys) {
    result[k] = { score: baseScore, rationale: 'Mock pass', issues: [] };
  }
  return result;
}

  // Publishing Gate Check: Must be ineligible
  const gateResult = evaluatePublishingGate({
    article: singleSourceArticle,
    review: {
      overallScore: 92,
      decision: 'PASS',
      dimensions: createMockDimensions(92),
      criticalIssues: [],
      warnings: [],
      gatePassed: true,
      reviewer: 'deterministic-tester',
      metadata: {
        provider: 'fixture',
        model: 'fixture',
        reviewedAt: new Date().toISOString(),
        durationMs: 10,
      },
    },
    context: {
      topicId: 'lm-culture-20260916-jose-trevino',
      pillar: 'culture',
      format: 'deep-dive',
      audience: 'general',
      primaryIntent: 'informational',
      riskLevel: 'low',
      isPerson: true,
    },
  });

  assert.equal(gateResult.eligible, false);
  assert.ok(gateResult.reasons.some((r) => r.includes('requires at least 2 verified')));
});

test('5. Generic "[Name]: What to Know" is no longer mandatory; titles vary organically', () => {
  const name1 = 'José Trevino';
  const name2 = 'Eliezer Alfonzo';
  const name3 = 'Shohei Ohtani';
  const name4 = 'Misty Copeland';

  const title1 = generatePersonTitle(name1, { topicId: 'topic-trevino-1' });
  const title2 = generatePersonTitle(name2, { topicId: 'topic-alfonzo-2' });
  const title3 = generatePersonTitle(name3, { topicId: 'topic-ohtani-3' });
  const title4 = generatePersonTitle(name4, { topicId: 'topic-copeland-4' });

  // None of them should be the exact old formula "[Name]: what to know"
  assert.notEqual(title1.toLowerCase(), 'josé trevino: what to know');
  assert.notEqual(title2.toLowerCase(), 'eliezer alfonzo: what to know');

  // Verify they contain the subject name and high-signal phrasing
  assert.ok(title1.includes('José Trevino'));
  assert.ok(title2.includes('Eliezer Alfonzo'));
  assert.ok(title3.includes('Shohei Ohtani'));
  assert.ok(title4.includes('Misty Copeland'));

  // Verify brief synthesis produces varied person titles
  const topic1 = createMockPersonTopic({ id: 't1', canonicalTopic: 'José Trevino' });
  const topic2 = createMockPersonTopic({ id: 't2', canonicalTopic: 'Eliezer Alfonzo' });
  const brief1 = synthesizeEditorialBrief(topic1);
  const brief2 = synthesizeEditorialBrief(topic2);

  assert.notEqual(brief1.titleAngle.toLowerCase(), 'josé trevino: what to know');
  assert.notEqual(brief2.titleAngle.toLowerCase(), 'eliezer alfonzo: what to know');
});

test('6. Person-image prompts cannot request a photorealistic likeness of the named person', () => {
  const result = generateEditorialImagePrompt({
    title: 'Who Is José Trevino? Career, Background and More',
    description: 'Biographical overview of MLB catcher José Trevino and his community contributions.',
    pillar: 'culture',
    tags: ['culture', 'person', 'baseball', 'mlb'],
  });

  const promptText = result.prompt.toLowerCase();
  const negativePromptText = result.negativePrompt.toLowerCase();

  // Must not ask for likeness or portrait of José Trevino
  assert.ok(promptText.includes('no depiction, portrait, or resemblance of josé trevino'));
  assert.ok(promptText.includes('no identifiable human facial likeness'));

  // Negative prompt must explicitly forbid person likeness recreation
  assert.ok(negativePromptText.includes('photorealistic likeness of specific real person'));
  assert.ok(negativePromptText.includes('portrait of josé trevino'));
  assert.ok(negativePromptText.includes('facial likeness of josé trevino'));
  assert.ok(negativePromptText.includes('deepfake likeness'));
});

test('7. Contextual person-topic images are allowed and correctly composed', () => {
  const sportsPrompt = generateEditorialImagePrompt({
    title: 'José Trevino: Career, Background and Latest Updates',
    description: 'An overview of baseball catcher achievements.',
    pillar: 'culture',
    tags: ['person', 'baseball', 'sport'],
  });

  assert.ok(sportsPrompt.prompt.includes('baseball diamond') || sportsPrompt.prompt.includes('catcher equipment'));
  assert.ok(sportsPrompt.visualTheme.length > 0);
  assert.equal(sportsPrompt.recommendedAspectRatio, '16:9');

  const musicPrompt = generateEditorialImagePrompt({
    title: 'Who Is Julian Lage? Career, Background and More',
    description: 'Contemporary jazz guitarist profile.',
    pillar: 'culture',
    tags: ['person', 'music', 'concert'],
  });

  assert.ok(musicPrompt.prompt.includes('recording studio') || musicPrompt.prompt.includes('instruments'));
});

test('8. Existing cleaned/deleted articles are no longer published/indexed', () => {
  const contentRoot = join(process.cwd(), 'src', 'content', 'culture');

  // Deleted articles must NOT exist on disk
  assert.equal(existsSync(join(contentRoot, 'eliezer-alfonzo-what-to-know.md')), false);
  assert.equal(existsSync(join(contentRoot, 'blake-lively-a-modern-guide-to-trends-signals-zeitgeist.md')), false);
  assert.equal(existsSync(join(contentRoot, 'cynthia-klitbo-habits.md')), false);
  assert.equal(existsSync(join(contentRoot, 'josh-hartnett-a-modern-guide-to-trends-signals-zeitgeist.md')), false);
  assert.equal(existsSync(join(contentRoot, 'ted-cruz-modern-guide-trends-signals-zeitgeist.md')), false);
  assert.equal(existsSync(join(contentRoot, 'tommy-mcmillen-what-you-should-know.md')), false);

  // Repaired article must exist on disk and have verified facts and >= 2 sources
  const repairedPath = join(contentRoot, 'jose-trevino-what-to-know.md');
  assert.equal(existsSync(repairedPath), true);

  const repairedContent = readFileSync(repairedPath, 'utf-8');
  assert.ok(repairedContent.includes('Who Is José Trevino? Career, Background and Community Impact'));
  assert.ok(repairedContent.includes('https://www.mlb.com/player/jose-trevino-624431'));
  assert.ok(repairedContent.includes('https://www.si.com/mlb/yankees/news/new-york-yankees-jose-trevino-nominated-roberto-clemente-award'));
  assert.ok(repairedContent.includes('## Sources'));
  assert.ok(repairedContent.includes('New York Yankees'));
});

test('9. Unrelated article generation and image-required invariants remain intact', () => {
  // Non-person topic brief generation
  const nonPersonTopic = createMockNonPersonTopic();
  const nonPersonBrief = synthesizeEditorialBrief(nonPersonTopic);

  assert.ok(nonPersonBrief.titleAngle.includes('The Azores'));
  assert.equal(isPersonTopic(nonPersonTopic), false);

  // Non-person image prompt generation
  const nonPersonImagePrompt = generateEditorialImagePrompt({
    title: 'The Quietest Islands in the Azores',
    description: 'A slow travel guide to volcanic hot springs.',
    pillar: 'travel',
    tags: ['travel', 'islands'],
  });

  assert.ok(nonPersonImagePrompt.prompt.includes('Editorial') || nonPersonImagePrompt.prompt.includes('Azores') || nonPersonImagePrompt.prompt.includes('volcanic'));
  assert.equal(nonPersonImagePrompt.visualTheme, 'Slow Journeys & Cultural Landscapes');
  assert.equal(nonPersonImagePrompt.recommendedAspectRatio, '16:9');

  // Image requirement validation
  const azoresContent = `## Volcanic Landscapes and Secluded Ridges

The Azores archipelago offers travelers an exceptional combination of dormant volcanic calderas, natural hot springs, and serene coastal walking trails. Unlike high-traffic island destinations, each island in the chain maintains distinct rural architecture, dramatic cliffside panoramas, and protected nature preserves.

## Slow Travel and Cultural Immersion

Exploring the islands at an unhurried pace allows visitors to experience traditional thermal mineral baths, endemic subtropical flora, and sustainable regional culinary traditions rooted in authentic local agriculture and centuries-old fishing communities across the mid-Atlantic.`;

  const validationWithImage = validateEditorialArticle(
    {
      title: 'The Quietest Islands in the Azores',
      slug: 'the-quietest-islands-in-the-azores',
      description: 'A comprehensive travel exploration of the Azores.',
      excerpt: 'Discovering secluded volcanic trails and hot springs.',
      content: azoresContent,
      sources: [{ name: 'Azores Tourism Board', url: 'https://visitazores.com' }],
    },
    {
      topicId: 'lm-travel-the-azores',
      pillar: 'travel',
      imageMetadata: { url: 'https://pub-8fcd679c40fd4aaa851f6ee7cdd4d083.r2.dev/editorial/azores.jpg' },
    },
    { requireImage: true }
  );

  assert.equal(validationWithImage.passed, true);
  assert.equal(validationWithImage.checks.image, true);

  const validationMissingImage = validateEditorialArticle(
    {
      title: 'The Quietest Islands in the Azores',
      slug: 'the-quietest-islands-in-the-azores',
      description: 'A comprehensive travel exploration of the Azores.',
      excerpt: 'Discovering secluded volcanic trails and hot springs.',
      content: azoresContent,
      sources: [{ name: 'Azores Tourism Board', url: 'https://visitazores.com' }],
    },
    {
      topicId: 'lm-travel-the-azores',
      pillar: 'travel',
      imageMetadata: undefined,
    },
    { requireImage: true }
  );

  assert.equal(validationMissingImage.passed, false);
  assert.equal(validationMissingImage.checks.image, false);
});
