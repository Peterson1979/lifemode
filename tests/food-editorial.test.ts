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
