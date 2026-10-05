import { test } from 'node:test';
import assert from 'node:assert';
import { selectEditorialCandidates } from '../src/lib/editorial/selection.ts';
import { validateEditorialArticle } from '../src/lib/editorial/validation/validator.ts';
import { PILLARS, SITE_CONFIG } from '../src/config/site.ts';
import { CATEGORIES } from '../src/utils/categories.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';

test('1. Life Hacks: Selection guard rejects text article candidate generation', () => {
  const candidate: EditorialTopic = {
    id: 'topic-hack-1',
    canonicalTopic: '5 Quick Kitchen Peeling Hacks',
    slug: '5-quick-kitchen-peeling-hacks',
    pillar: 'life-hacks' as any,
    targetAudience: 'Home cooks',
    primaryIntent: 'informational',
    tags: ['kitchen hacks', 'peeling tips'],
    freshnessScore: 90,
    totalScore: 92,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'SCORED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceSignals: [],
    queryVariants: ['kitchen peeling hacks'],
    scoring: {
      searchPotential: 90,
      pinterestPotential: 90,
      socialPotential: 90,
      lifeModeRelevance: 90,
      commercialPotential: 80,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
  };

  const result = selectEditorialCandidates([candidate]);

  assert.strictEqual(result.approved.length, 0, 'Life Hacks topic must not be approved for text article generation');
  assert.strictEqual(result.rejected.length, 1, 'Life Hacks topic must be rejected');
  assert.match(
    result.rejected[0].rejectionReason || '',
    /Life Hacks is a video-only pillar/i,
    'Rejection reason must clearly state Life Hacks is video-only'
  );
});

test('2. Life Hacks: Validator gate rejects written text articles for life-hacks pillar', () => {
  const article = {
    title: 'Clever Ways to Organize Cords with Binder Clips',
    slug: 'clever-cord-organization-clips',
    description: 'Use binder clips to organize messy cables and desk cords in minutes.',
    content: '## Cord Organization\n\nHere is a step by step guide to clipping cords to your desk edge with metal clips.\n\n### Step 1\nAttach the clip.',
    sources: [{ name: 'LifeMode Home Science', url: 'https://lifemode.life' }],
  };

  const validation = validateEditorialArticle(article, {
    pillar: 'life-hacks' as any,
    topicId: 'topic-hack-1',
  });

  assert.strictEqual(validation.passed, false, 'Validation must fail for text articles under life-hacks');
  assert.ok(
    validation.errors.some((e) => e.includes('Life Hacks is a video-only pillar')),
    'Validation errors must include video-only pillar rule'
  );
});

test('3. Pillar & Category Architecture: Kitchen & Food Care and Food & Drink are clearly differentiated', () => {
  // Editorial pillar: Food & Drink
  assert.strictEqual(PILLARS['food-drink'].name, 'Food & Drink');
  assert.match(PILLARS['food-drink'].description, /recipes|culinary/i);

  // Practical guidance pillar: Kitchen & Food Care
  assert.strictEqual(CATEGORIES['food-kitchen'].title, 'Kitchen & Food Care');
  assert.strictEqual(
    CATEGORIES['food-kitchen'].description,
    'Practical guidance for food safety, storage, pantry longevity, cookware care, and everyday kitchen problem-solving.'
  );

  assert.strictEqual(PILLARS['food-kitchen'].name, 'Kitchen & Food Care');
  assert.strictEqual(
    PILLARS['food-kitchen'].description,
    'Practical guidance for food safety, storage, pantry longevity, cookware care, and everyday kitchen problem-solving.'
  );

  // Life Hacks top-level topic
  assert.strictEqual(PILLARS['life-hacks'].name, 'Life Hacks');
  // 6 Magazine Core Pillars in Primary Navigation
  assert.ok(
    SITE_CONFIG.navLinks.some((l) => l.name === 'Home' && l.href === '/home'),
    'Navigation must include Home pillar'
  );
  assert.ok(
    SITE_CONFIG.navLinks.some((l) => l.name === 'Life' && l.href === '/life'),
    'Navigation must include Life pillar'
  );
  assert.ok(
    SITE_CONFIG.footerLinks.some((l) => l.name === 'Video Life Hacks' && l.href === '/life-hacks'),
    'Footer navigation must include Video Life Hacks'
  );
});
