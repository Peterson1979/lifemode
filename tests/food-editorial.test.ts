import test from 'node:test';
import assert from 'node:assert/strict';

import { FOOD_TAXONOMY_TOPICS, FOOD_TOPIC_SLUGS, isFoodTaxonomyTopic } from '../src/lib/food/taxonomy.ts';
import {
  APPROVED_RECIPE_SOURCES,
  getApprovedSource,
  validateRecipeProvenance,
} from '../src/lib/food/sources/registry.ts';
import { formatRecipeToMarkdown } from '../src/lib/food/importer/pipeline.ts';
import { CURATED_SEED_RECIPES } from '../src/lib/food/importer/curated-seed.ts';
import { parseDurationToISO, generateRecipeSchema } from '../src/utils/seo.ts';
import { VALID_PILLARS, type EditorialTopic } from '../src/lib/editorial/types.ts';
import { selectEditorialCandidates } from '../src/lib/editorial/selection.ts';
import { buildContentBrief } from '../src/lib/editorial/brief.ts';
import { generateEditorialImagePrompt } from '../src/lib/editorial/image-prompt.ts';
import {
  getDeterministicAssetKey,
  orchestrateEditorialImage,
  loadEditorialImageConfig,
  FixtureEditorialImageProvider,
} from '../src/lib/editorial/images/index.ts';
import { runPublishingPipeline } from '../src/lib/editorial/publishing/runner.ts';
import type { PublishingRequest } from '../src/lib/editorial/publishing/types.ts';
import {
  selectSocialOpportunities,
  determineTargetPlatforms,
  buildSocialBrief,
} from '../src/lib/social/index.ts';
import type {
  ISocialAssetStorageProvider,
  AssetUploadRequest,
  AssetUploadResult,
} from '../src/lib/social/images/storage/contracts.ts';

test('Food & Drink Content Taxonomy includes all 11 required stable topics', () => {
  const expectedSlugs = [
    'food-drink',
    'recipes',
    'ingredients',
    'cooking',
    'food-culture',
    'drinks',
    'food-travel',
    'seasonal-food',
    'kitchen',
    'food-wellbeing',
    'food-trends',
  ];

  for (const slug of expectedSlugs) {
    assert.ok(FOOD_TOPIC_SLUGS.includes(slug), `Missing expected taxonomy slug: ${slug}`);
    assert.ok(isFoodTaxonomyTopic(slug), `isFoodTaxonomyTopic should return true for: ${slug}`);
    const topic = FOOD_TAXONOMY_TOPICS[slug];
    assert.ok(topic.name.length > 0, `Topic ${slug} must have a name`);
    assert.ok(topic.description.length > 0, `Topic ${slug} must have a description`);
  }
});

test('Approved Recipe Source Registry registers Based Cooking and Public Domain Recipes', () => {
  assert.equal(Object.keys(APPROVED_RECIPE_SOURCES).length, 2, 'Exactly 2 sources approved');
  const based = getApprovedSource('based-cooking');
  assert.ok(based, 'Based Cooking must be an approved source');
  assert.equal(based.enabled, true);
  assert.equal(based.id, 'based-cooking');
  assert.ok(based.repositoryUrl.includes('LukeSmithxyz/based.cooking'));

  const pdr = getApprovedSource('public-domain-recipes');
  assert.ok(pdr, 'Public Domain Recipes must be an approved source');
  assert.equal(pdr.enabled, true);
  assert.equal(pdr.id, 'public-domain-recipes');
  assert.ok(pdr.repositoryUrl.includes('ronaldl29/public-domain-recipes'));

  // Unknown source must be rejected
  const unknown = getApprovedSource('random-unverified-site');
  assert.equal(unknown, undefined);
});

test('validateRecipeProvenance enforces strict recipe + image pairing and license provenance', () => {
  // Valid recipe
  const validRecipe = {
    title: 'Fresh Guacamole',
    source: 'based-cooking',
    sourceUrl: 'https://github.com/LukeSmithxyz/based.cooking/blob/master/content/guacamole.md',
    sourceLicense: 'CC0 1.0 Universal',
    sourceAuthor: 'Yaroslav Smirnov',
    image: '/editorial/food/guacamole.webp',
    imageAlt: 'Fresh guacamole plated with totopos',
    imageSource: 'Original photo via Based Cooking (CC0)',
    imageSourceUrl: 'https://github.com/LukeSmithxyz/based.cooking',
    imageLicense: 'CC0 1.0 Universal',
    ingredients: ['2 ripe Hass avocados', '1 whole fresh lime', 'Sea salt'],
    directions: ['Mash avocados in a bowl.', 'Stir in lime juice and salt.'],
  };

  const validResult = validateRecipeProvenance(validRecipe);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.errors.length, 0);

  // Missing image must fail
  const noImageRecipe = { ...validRecipe, image: undefined };
  const noImageResult = validateRecipeProvenance(noImageRecipe);
  assert.equal(noImageResult.valid, false);
  assert.ok(noImageResult.errors.some((e) => e.includes('image is required')));

  // Unapproved external hotlink must fail
  const hotlinkedRecipe = {
    ...validRecipe,
    image: 'https://some-random-unverified-cdn.com/stolen-photo.jpg',
  };
  const hotlinkResult = validateRecipeProvenance(hotlinkedRecipe);
  assert.equal(hotlinkResult.valid, false);
  assert.ok(hotlinkResult.errors.some((e) => e.includes('must be stored as a local LifeMode static asset')));

  // Unregistered source must fail
  const unapprovedSourceRecipe = { ...validRecipe, source: 'unapproved-blog-scraper' };
  const unapprovedSourceResult = validateRecipeProvenance(unapprovedSourceRecipe);
  assert.equal(unapprovedSourceResult.valid, false);
  assert.ok(unapprovedSourceResult.errors.some((e) => e.includes('not an approved LifeMode recipe registry source')));
});

test('Curated Seed Recipes all format cleanly and validate schema', () => {
  assert.equal(CURATED_SEED_RECIPES.length >= 6, true, 'Should have at least 6 curated seed recipes');

  for (const rawRecipe of CURATED_SEED_RECIPES) {
    const result = formatRecipeToMarkdown(rawRecipe);
    assert.equal(result.valid, true, `Recipe ${rawRecipe.slug} must format cleanly: ${result.errors?.join(', ')}`);
    assert.ok(result.body.includes('## Ingredients'));
    assert.ok(result.body.includes('## Instructions'));

    // Validate frontmatter structure and required fields
    const fm = result.frontmatter;
    assert.equal(fm.format, 'recipe');
    assert.ok(Array.isArray(fm.tags) && fm.tags.includes('food-drink'), `food-drink tag missing for ${rawRecipe.slug}`);
    assert.ok(fm.title && fm.title.length > 0, `Title missing for ${rawRecipe.slug}`);
    assert.ok(fm.description && fm.description.length > 0, `Description missing for ${rawRecipe.slug}`);
    assert.ok(fm.source && ['Based Cooking', 'Public Domain Recipes'].includes(fm.source), `Source invalid for ${rawRecipe.slug}: ${fm.source}`);
    assert.ok(fm.sourceUrl && fm.sourceUrl.startsWith('https://github.com/'), `SourceUrl invalid for ${rawRecipe.slug}`);
    assert.ok(fm.sourceLicense && fm.sourceLicense.length > 0, `SourceLicense missing for ${rawRecipe.slug}`);
    assert.ok(fm.image && fm.image.startsWith('/editorial/food/'), `Image path invalid for ${rawRecipe.slug}`);
    assert.ok(fm.imageSource && fm.imageSource.length > 0, `ImageSource missing for ${rawRecipe.slug}`);
    assert.ok(fm.imageLicense && fm.imageLicense.length > 0, `ImageLicense missing for ${rawRecipe.slug}`);
    assert.ok(Array.isArray(fm.ingredients) && fm.ingredients.length > 0, `Ingredients missing for ${rawRecipe.slug}`);
    assert.ok(Array.isArray(fm.directions) && fm.directions.length > 0, `Directions missing for ${rawRecipe.slug}`);
  }
});

test('parseDurationToISO correctly converts human recipe durations', () => {
  assert.equal(parseDurationToISO('15 min'), 'PT15M');
  assert.equal(parseDurationToISO('80 min'), 'PT1H20M');
  assert.equal(parseDurationToISO('1 hour 20 min'), 'PT1H20M');
  assert.equal(parseDurationToISO('2 hours'), 'PT2H');
  assert.equal(parseDurationToISO('PT30M'), 'PT30M');
  assert.equal(parseDurationToISO(undefined), undefined);
});

test('generateRecipeSchema outputs valid Schema.org Recipe JSON-LD without fabricated facts', () => {
  const schema = generateRecipeSchema({
    title: 'Traditional Guacamole',
    description: 'Fresh homemade guacamole.',
    url: 'https://lifemode.life/food-drink/fresh-guacamole/',
    pubDate: '2026-09-18T12:00:00.000Z',
    authorName: 'Yaroslav Smirnov / Based Cooking',
    image: '/editorial/food/guacamole.webp',
    prepTime: '10 min',
    cookTime: '0 min',
    servings: '2 portions',
    cuisine: 'Mexican',
    mealType: 'Appetizer',
    ingredients: ['2 ripe avocados', '1 lime', 'Salt'],
    directions: ['Mash avocados.', 'Stir in lime and salt.'],
  });

  assert.equal(schema['@context'], 'https://schema.org');
  assert.equal(schema['@type'], 'Recipe');
  assert.equal(schema.name, 'Traditional Guacamole');
  assert.equal(schema.prepTime, 'PT10M');
  assert.equal(schema.recipeYield, '2 portions');
  assert.equal(schema.recipeCuisine, 'Mexican');
  assert.equal(schema.recipeCategory, 'Appetizer');
  assert.equal(schema.recipeIngredient.length, 3);
  assert.equal(schema.recipeInstructions.length, 2);
  assert.equal(schema.recipeInstructions[0]['@type'], 'HowToStep');

  // Ensure no fabricated rating or nutrition data was added
  assert.equal(schema.aggregateRating, undefined);
  assert.equal(schema.nutrition, undefined);
});

test('All 21 Food & Drink articles have valid local images and verified provenance metadata', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const contentDir = path.resolve(process.cwd(), 'src/content/food-drink');
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.md'));

  assert.equal(files.length, 21, 'Exactly 21 Food & Drink articles should exist');

  let recipeCount = 0;
  let nonRecipeCount = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(contentDir, file), 'utf-8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(match, `File ${file} must contain valid frontmatter`);
    const fm = match[1];

    const isRecipe = fm.includes('format: "recipe"') || fm.includes("format: 'recipe'");

    const getField = (name: string) => {
      const reg = new RegExp(`^${name}:\\s*["']?([^"'\\r\\n]+)["']?`, 'm');
      const m = fm.match(reg);
      return m ? m[1].trim() : null;
    };

    const image = getField('image');
    const imageAlt = getField('imageAlt');
    const imageSource = getField('imageSource');
    const imageSourceUrl = getField('imageSourceUrl');
    const imageLicense = getField('imageLicense');

    assert.ok(image, `Article ${file} must have an image property`);
    assert.ok(imageAlt, `Article ${file} must have an imageAlt property`);
    assert.ok(imageSource, `Article ${file} must have an imageSource property`);

    // Verify file exists on disk
    const diskPath = path.resolve(process.cwd(), 'public' + (image.startsWith('/') ? image : '/' + image));
    assert.ok(fs.existsSync(diskPath), `Image file for ${file} must exist on disk: ${diskPath}`);

    if (isRecipe) {
      recipeCount++;
      assert.ok(image.startsWith('/editorial/food/'), `Recipe ${file} image should be in /editorial/food/`);
      const source = getField('source');
      assert.ok(source && ['Based Cooking', 'Public Domain Recipes'].includes(source), `Recipe ${file} source must be approved`);
    } else {
      nonRecipeCount++;
      assert.ok(imageSourceUrl, `Non-recipe ${file} must have an imageSourceUrl`);
      assert.ok(imageLicense, `Non-recipe ${file} must have an imageLicense`);
    }
  }

  assert.equal(recipeCount, 6, 'Exactly 6 recipe articles');
  assert.equal(nonRecipeCount, 15, 'Exactly 15 non-recipe editorial articles');
});

// Mock Storage Provider for image testing
class MockTestStorageProvider implements ISocialAssetStorageProvider {
  readonly name = 'Mock Test R2 Storage';
  public uploadCalls: AssetUploadRequest[] = [];
  public shouldSucceed: boolean;

  constructor(shouldSucceed = true) {
    this.shouldSucceed = shouldSucceed;
  }

  isConfigured(): boolean { return true; }
  getObjectKey(topicId: string, assetHash: string): string {
    return `editorial/${topicId}/${assetHash}.jpg`;
  }
  async uploadAsset(request: AssetUploadRequest): Promise<AssetUploadResult> {
    this.uploadCalls.push(request);
    if (!this.shouldSucceed) {
      return { success: false, status: 'FAILED', error: 'Upload failed', provider: this.name, durationMs: 1 };
    }
    return {
      success: true,
      status: 'SUCCESS',
      publicUrl: `https://cdn.lifemode.life/editorial/${request.topicId}/${request.assetHash}.jpg`,
      objectKey: request.customKey || `editorial/${request.topicId}/${request.assetHash}.jpg`,
      contentType: request.mimeType,
      sizeBytes: request.buffer.length,
      assetHash: request.assetHash,
      provider: this.name,
      durationMs: 1,
    };
  }
}

const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_PNG_BUFFER = Buffer.from(FIXTURE_PNG_BASE64, 'base64');

test('Daily Editorial Generation: food-drink is a first-class pillar in candidate selection & brief generation', () => {
  assert.ok(VALID_PILLARS.includes('food-drink'), 'food-drink must be a recognized valid pillar');

  const foodTopic1: EditorialTopic = {
    id: 'lm-food-drink-20260918-extra-virgin-olive-oil',
    canonicalTopic: 'Understanding Extra Virgin Olive Oil Harvests',
    slug: 'understanding-extra-virgin-olive-oil-harvests',
    pillar: 'food-drink',
    sourceSignals: [],
    queryVariants: ['extra virgin olive oil', 'cold pressed olive oil quality'],
    scoring: {
      searchPotential: 88,
      pinterestPotential: 82,
      socialPotential: 75,
      lifeModeRelevance: 92,
      commercialPotential: 70,
      freshness: 85,
      competitionOpportunity: 75,
      originalityPotential: 85,
    },
    totalScore: 82.5,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 85,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['food-drink', 'ingredients', 'cooking'],
  };

  const foodTopic2: EditorialTopic = {
    id: 'lm-food-drink-20260918-sourdough-microbiology',
    canonicalTopic: 'How Sourdough Fermentation Works',
    slug: 'how-sourdough-fermentation-works',
    pillar: 'food-drink',
    sourceSignals: [],
    queryVariants: ['sourdough fermentation science', 'wild yeast microbiology'],
    scoring: {
      searchPotential: 86,
      pinterestPotential: 85,
      socialPotential: 80,
      lifeModeRelevance: 90,
      commercialPotential: 65,
      freshness: 80,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    totalScore: 83.0,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['food-drink', 'cooking', 'food-culture'],
  };

  // 1. Candidate Selection: Food & Drink candidates are accepted and balanced
  const selection = selectEditorialCandidates([foodTopic1, foodTopic2], { minScoreThreshold: 80, totalLimit: 6 });
  assert.equal(selection.approved.length, 2);
  assert.equal(selection.approved[0].pillar, 'food-drink');
  assert.equal(selection.approved[1].pillar, 'food-drink');

  // 2. Content Brief Builder: Generates specialized Food & Drink angles and structure
  const brief1 = buildContentBrief(foodTopic1);
  assert.equal(brief1.pillar, 'food-drink');
  assert.ok(brief1.titleAngle.includes('Understanding Extra Virgin Olive Oil Harvests'));
  assert.ok(brief1.outlineSections.length >= 3);
  assert.equal(brief1.searchTargets.primaryKeyword, 'understanding extra virgin olive oil harvests');

  const brief2 = buildContentBrief(foodTopic2);
  assert.equal(brief2.pillar, 'food-drink');
  assert.ok(brief2.titleAngle.includes('How Sourdough Fermentation Works'));
});

test('Image Assignment & Fallback Regression: Prevents duplicate/unrelated image assignment across Food & Drink articles', async () => {
  // Simulate 2 distinct Food & Drink editorial articles
  const oliveOilArticle = {
    title: 'Understanding Extra Virgin Olive Oil Harvests',
    slug: 'understanding-extra-virgin-olive-oil-harvests',
    description: 'A deep exploration into harvest timing, oleic acid levels, and cold extraction methods.',
    pillar: 'food-drink' as const,
    tags: ['food-drink', 'ingredients', 'olive-oil'],
  };

  const sourdoughArticle = {
    title: 'The Microbiology of Sourdough Fermentation',
    slug: 'the-microbiology-of-sourdough-fermentation',
    description: 'How wild yeast and lactic acid bacteria transform flour and water into complex loaves.',
    pillar: 'food-drink' as const,
    tags: ['food-drink', 'cooking', 'baking'],
  };

  // 1. Image Prompt Generation: Verify distinct semantic prompts for each article
  const promptResult1 = generateEditorialImagePrompt(oliveOilArticle);
  const promptResult2 = generateEditorialImagePrompt(sourdoughArticle);

  assert.ok(promptResult1.prompt.includes('olive') || promptResult1.prompt.includes('Olive'));
  assert.equal(promptResult1.visualTheme, 'Culinary Craft, Seasonal Food & Mindful Dining');
  assert.ok(promptResult2.prompt.includes('sourdough') || promptResult2.prompt.includes('fermentation') || promptResult2.prompt.includes('Sourdough'));
  assert.equal(promptResult2.visualTheme, 'Culinary Craft, Seasonal Food & Mindful Dining');
  assert.notEqual(promptResult1.prompt, promptResult2.prompt, 'Prompts must be completely distinct');

  // 2. Deterministic Asset Keys: Verify distinct hashes and non-colliding storage paths
  const key1 = getDeterministicAssetKey('lm-food-olive-oil', oliveOilArticle.slug, promptResult1.prompt, 'jpg');
  const key2 = getDeterministicAssetKey('lm-food-sourdough', sourdoughArticle.slug, promptResult2.prompt, 'jpg');

  assert.notEqual(key1.assetHash, key2.assetHash, 'Asset hashes must be unique per article');
  assert.notEqual(key1.objectKey, key2.objectKey, 'Object keys must be unique per article');
  assert.ok(key1.objectKey.includes('lm-food-olive-oil'));
  assert.ok(key2.objectKey.includes('lm-food-sourdough'));

  // 3. Image Orchestration with Mock Provider: Both receive their own distinct image URLs
  const storage = new MockTestStorageProvider(true);
  const primaryProvider = new FixtureEditorialImageProvider(true, VALID_PNG_BUFFER);

  const pkg1 = {
    id: 'pub-olive-oil-01',
    topicId: 'lm-food-olive-oil',
    slug: oliveOilArticle.slug,
    title: oliveOilArticle.title,
    description: oliveOilArticle.description,
    excerpt: oliveOilArticle.description,
    content: 'Full editorial content about olive oil...',
    pillar: 'food-drink' as const,
    format: 'guide' as const,
    audience: 'Culinary enthusiasts',
    primaryIntent: 'informational' as const,
    riskLevel: 'low' as const,
    tags: oliveOilArticle.tags,
    sources: [{ name: 'LifeMode Editorial', url: 'https://lifemode.life' }],
    internalLinks: ['/food-drink'],
    affiliateIntent: false,
    faq: [],
    socialHooks: ['How harvest timing defines oil flavor.'],
    imageMetadata: {
      prompt: promptResult1.prompt,
      alt: promptResult1.altText,
      visualTheme: promptResult1.visualTheme,
      recommendedAspectRatio: '16:9',
    },
    publicationMetadata: { targetDate: new Date().toISOString(), version: 1, author: 'LifeMode Editorial' },
    qualitySummary: { overallScore: 92, safetyScore: 95, factualityScore: 90, reviewedAt: new Date().toISOString(), reviewer: 'Lead', decision: 'PASS' as const },
  };

  const pkg2 = {
    id: 'pub-sourdough-02',
    topicId: 'lm-food-sourdough',
    slug: sourdoughArticle.slug,
    title: sourdoughArticle.title,
    description: sourdoughArticle.description,
    excerpt: sourdoughArticle.description,
    content: 'Full editorial content about sourdough...',
    pillar: 'food-drink' as const,
    format: 'guide' as const,
    audience: 'Baking enthusiasts',
    primaryIntent: 'informational' as const,
    riskLevel: 'low' as const,
    tags: sourdoughArticle.tags,
    sources: [{ name: 'LifeMode Editorial', url: 'https://lifemode.life' }],
    internalLinks: ['/food-drink'],
    affiliateIntent: false,
    faq: [],
    socialHooks: ['The microbiology of wild yeast.'],
    imageMetadata: {
      prompt: promptResult2.prompt,
      alt: promptResult2.altText,
      visualTheme: promptResult2.visualTheme,
      recommendedAspectRatio: '16:9',
    },
    publicationMetadata: { targetDate: new Date().toISOString(), version: 1, author: 'LifeMode Editorial' },
    qualitySummary: { overallScore: 92, safetyScore: 95, factualityScore: 90, reviewedAt: new Date().toISOString(), reviewer: 'Lead', decision: 'PASS' as const },
  };

  const res1 = await orchestrateEditorialImage(pkg1, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    primaryProvider,
    storageProvider: storage,
  });

  const res2 = await orchestrateEditorialImage(pkg2, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    primaryProvider,
    storageProvider: storage,
  });

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.ok(res1.publicUrl?.includes('lm-food-olive-oil'));
  assert.ok(res2.publicUrl?.includes('lm-food-sourdough'));
  assert.notEqual(res1.publicUrl, res2.publicUrl, 'Each article must have a distinct image URL; cannot share the same asset');

  // 4. Safe Failure & Rejection: When image generation fails and fallback is disabled, pipeline halts publication safely
  const failingPrimary = new FixtureEditorialImageProvider(false);
  const failingFallback = new FixtureEditorialImageProvider(false);
  const failingStorage = new MockTestStorageProvider(false);

  const fullContent = [
    'In contemporary lifestyle design and mindful cooking, extra virgin olive oil represents a foundational culinary ingredient shaped by terroir, harvest timing, and meticulous craftsmanship.',
    '',
    '## 1. Harvest Timing & Fruit Maturity',
    'Navigating olive oil quality requires understanding the critical distinction between early harvest and late harvest production methods.',
    'Early harvest olives, picked while still green and firm, yield intensely aromatic oils packed with high polyphenol concentrations and vibrant peppery finishes.',
    'Rather than prioritizing maximum volume yield, artisanal producers sacrifice quantity to preserve delicate aromatic nuances and potent antioxidant profiles.',
    '',
    '## 2. Cold Extraction Protocols and Temperature Control',
    'Implementing strict cold extraction standards begins with processing harvested fruit within hours of departure from the grove.',
    'Modern stainless steel hammer mills and continuous centrifugation systems operate below 27 degrees Celsius without water dilution.',
    'By avoiding excessive heating or prolonged air exposure, producers prevent premature oxidation and retain volatile aromatic esters.',
    '',
    '## 3. Practical Storage and Culinary Integration',
    'Preserving the integrity of cold-extracted olive oil requires dark UV-filtering glass and cool, stable storage temperatures away from stoves.',
    'Integrating high-phenolic oils into daily cooking elevates simple ingredients, from freshly baked sourdough to seasonal roasted vegetables and fresh legumes.',
    'Approaching ingredients with culinary mindfulness connects daily nourishment with authentic agricultural landscapes.',
  ].join('\n');

  const pubRequest: PublishingRequest = {
    article: {
      title: oliveOilArticle.title,
      slug: oliveOilArticle.slug,
      description: oliveOilArticle.description,
      excerpt: oliveOilArticle.description,
      content: fullContent,
      sources: [{ name: 'LifeMode Editorial Standards', url: 'https://lifemode.life' }],
      internalLinks: ['/food-drink'],
      affiliateIntents: [],
      faq: [],
      socialHooks: ['Key insights into olive oil harvest.'],
    },
    review: {
      decision: 'PASS',
      overallScore: 94,
      dimensions: {
        safety: { score: 95, rationale: 'Safe', issues: [] },
        factuality: { score: 92, rationale: 'Accurate', issues: [] },
        readability: { score: 90, rationale: 'Clear', issues: [] },
        structure: { score: 90, rationale: 'Solid', issues: [] },
        usefulness: { score: 90, rationale: 'High', issues: [] },
        originality: { score: 90, rationale: 'Original', issues: [] },
        searchIntent: { score: 90, rationale: 'Matches', issues: [] },
        seo: { score: 90, rationale: 'Optimized', issues: [] },
        editorialFit: { score: 90, rationale: 'Fits', issues: [] },
        monetizationFit: { score: 90, rationale: 'Good', issues: [] },
      },
      criticalIssues: [],
      warnings: [],
      reviewer: 'Senior Reviewer',
      metadata: { provider: 'fixture', model: 'v1', reviewedAt: new Date().toISOString(), durationMs: 5 },
      gatePassed: true,
    },
    context: {
      topicId: 'lm-food-olive-oil',
      pillar: 'food-drink',
      format: 'guide',
      audience: 'Culinary enthusiasts',
      primaryIntent: 'informational',
      riskLevel: 'low',
      tags: ['food-drink', 'ingredients'],
    },
    options: {
      dryRun: false,
      allowNoImageFallback: false, // Strict production gate
    },
  };

  const publishResult = await runPublishingPipeline({
    request: pubRequest,
    imageConfig: loadEditorialImageConfig({ enabled: true, allowNoImageFallback: false }),
    imagePrimaryProvider: failingPrimary,
    imageFallbackProvider: failingFallback,
    imageStorageProvider: failingStorage,
  });

  assert.equal(publishResult.status, 'BLOCKED', 'Must block publication when image fails and fallback is disabled');
  assert.equal(publishResult.error?.code, 'IMAGE_REQUIRED');
  assert.equal(publishResult.gateResult.eligible, false);
});

test('Social Automation: Published Food & Drink articles enter Facebook/Instagram candidate selection with canonical URLs', async () => {
  const publishedFoodTopic: EditorialTopic = {
    id: 'lm-food-drink-20260918-sourdough-craft',
    canonicalTopic: 'Why Sourdough Became a Global Food Culture',
    slug: 'why-sourdough-became-a-global-food-culture',
    pillar: 'food-drink',
    sourceSignals: [],
    queryVariants: ['sourdough culture', 'artisanal bread craft'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 88,
      socialPotential: 90,
      lifeModeRelevance: 95,
      commercialPotential: 70,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    totalScore: 88.0,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE_AND_SOCIAL',
    status: 'PUBLISHED',
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    tags: ['food-drink', 'food-culture', 'baking'],
  };

  // 1. Platform targeting for food-drink
  const platforms = determineTargetPlatforms(publishedFoodTopic);
  assert.ok(platforms.includes('facebook'), 'Facebook must be a target platform for food-drink');
  assert.ok(platforms.includes('instagram'), 'Instagram must be a target platform for food-drink');

  // 2. Candidate Selection: Food & Drink enters social candidate flow
  const socialOpportunities = await selectSocialOpportunities([publishedFoodTopic], {
    maxOpportunities: 1,
    minScoreThreshold: 80,
    publishedOnly: true,
    baseUrl: 'https://lifemode.life',
  });

  assert.equal(socialOpportunities.length, 1, 'Published food-drink article should be selected');
  const opp = socialOpportunities[0];
  assert.equal(opp.topicId, publishedFoodTopic.id);
  assert.equal(opp.pillar, 'food-drink');
  assert.equal(opp.destinationUrl, 'https://lifemode.life/food-drink/why-sourdough-became-a-global-food-culture');
  assert.ok(!opp.destinationUrl.includes('lifemode.com'), 'Destination URL must NEVER use lifemode.com');

  // 3. Social Brief Generation: Verify Food & Drink audience and aesthetic style mapping
  const brief = buildSocialBrief(opp);

  assert.equal(brief.pillar, 'food-drink');
  assert.ok(brief.targetAudience.toLowerCase().includes('culinary'), `Audience should be tailored for food-drink: ${brief.targetAudience}`);
  assert.ok(brief.visualGuidelines.aestheticStyle.includes('Warm kitchen') || brief.visualGuidelines.aestheticStyle.includes('tableware'));
  assert.equal(brief.destinationUrl, 'https://lifemode.life/food-drink/why-sourdough-became-a-global-food-culture');
});
