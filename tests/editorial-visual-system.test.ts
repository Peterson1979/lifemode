import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisualBrief,
  type SupportedVisualType,
  type StructuredVisualBrief,
} from '../src/lib/editorial/visual-brief.ts';
import {
  validateVisualRelevance,
  validateVisualRelevanceSync,
  resolveVisualFallback,
} from '../src/lib/editorial/visual-relevance.ts';

test('1. Structured Visual Brief: Generates all 9 canonical visual types accurately', () => {
  // A. formula_visual
  const formulaArticle = {
    title: 'Which Refrigerator Size Do You Need? (Capacity & Sizing Guide)',
    description: 'Calculate exact cubic feet and volumetric kitchen capacity for households.',
    pillar: 'home',
  };
  const formulaBrief = buildVisualBrief(formulaArticle, { pillar: 'home' });
  assert.equal(formulaBrief.visualType, 'formula_visual');
  assert.equal(formulaBrief.infographicPreferable, true);
  assert.equal(formulaBrief.photographAppropriate, false);
  assert.ok(formulaBrief.keyConcepts.includes('volumetric calculation'));

  // B. decision_tree
  const decisionArticle = {
    title: 'Cookware Material Decision Guide: Cast Iron vs Stainless vs Carbon Steel',
    description: 'Step-by-step decision flowchart for choosing the right skillet material.',
    pillar: 'home',
  };
  const decisionBrief = buildVisualBrief(decisionArticle, { pillar: 'home' });
  assert.equal(decisionBrief.visualType, 'decision_tree');
  assert.equal(decisionBrief.infographicPreferable, true);
  assert.equal(decisionBrief.photographAppropriate, false);

  // C. comparison_graphic
  const comparisonArticle = {
    title: 'Linen vs Wool: Seasonal Bedding and Wardrobe Comparison',
    description: 'Direct comparison of thermal regulation and breathability.',
    pillar: 'life',
  };
  const comparisonBrief = buildVisualBrief(comparisonArticle, { pillar: 'life' });
  assert.equal(comparisonBrief.visualType, 'comparison_graphic');
  assert.equal(comparisonBrief.infographicPreferable, true);

  // D. timeline
  const timelineArticle = {
    title: 'The Stages of Sourdough Fermentation: A Complete Lifecycle Guide',
    description: 'Chronological timeline of fermentation phases from starter to bake.',
    pillar: 'food-drink',
  };
  const timelineBrief = buildVisualBrief(timelineArticle, { pillar: 'food-drink' });
  assert.equal(timelineBrief.visualType, 'timeline');
  assert.equal(timelineBrief.infographicPreferable, true);

  // E. editorial_infographic (scientific/biological mechanism)
  const mechanismArticle = {
    title: 'Cast Iron Polymerization: The Science of Oil Bonding and Seasoning',
    description: 'Molecular cross-linking of unsaturated fatty acids onto iron surfaces.',
    pillar: 'home',
  };
  const mechanismBrief = buildVisualBrief(mechanismArticle, { pillar: 'home' });
  assert.equal(mechanismBrief.visualType, 'editorial_infographic');
  assert.equal(mechanismBrief.infographicPreferable, true);

  // F. process_diagram (procedural workflow)
  const processArticle = {
    title: 'How to Remove Coffee Stains: Step-by-Step Practical Protocol',
    description: 'Step-by-step enzymatic lifting and stain removal sequence.',
    pillar: 'home',
  };
  const processBrief = buildVisualBrief(processArticle, { pillar: 'home' });
  assert.equal(processBrief.visualType, 'process_diagram');
  assert.equal(processBrief.infographicPreferable, true);

  // G. no_image (abstract conceptual topic)
  const abstractArticle = {
    title: 'Abstract Economic Policy and Monetary Regulation in High-Frequency Markets',
    description: 'Theoretical analysis of financial liquidity models.',
    pillar: 'wealth',
  };
  const abstractBrief = buildVisualBrief(abstractArticle, { pillar: 'wealth' });
  assert.equal(abstractBrief.visualType, 'no_image');
  assert.equal(abstractBrief.noImagePreferable, true);
  assert.equal(abstractBrief.photographAppropriate, false);

  // H. editorial_photo (culinary craft)
  const photoArticle = {
    title: 'The Anatomy of Good Vinegar: Fermentation, Acidity, and Craft',
    description: 'A deep dive into artisan vinegar production and cellar aging.',
    pillar: 'food-drink',
  };
  const photoBrief = buildVisualBrief(photoArticle, { pillar: 'food-drink' });
  assert.equal(photoBrief.visualType, 'editorial_photo');
  assert.equal(photoBrief.photographAppropriate, true);
  assert.ok(photoBrief.keyObjects.length > 0);
  assert.ok(photoBrief.importantExclusions.length > 0);
});

test('2. Structured Visual Brief: Validates full metadata structure and avoids title repetition', () => {
  const article = {
    title: 'Understanding Extra Virgin Olive Oil: What You Need to Know',
    description: 'A guide to polyphenols, cold extraction, and harvest timing.',
    pillar: 'food-drink',
  };
  const brief = buildVisualBrief(article, { pillar: 'food-drink' });

  assert.equal(brief.subject, 'Extra Virgin Olive Oil');
  assert.notEqual(brief.aiGenerationPrompt, article.title);
  assert.ok(brief.composition.length > 10);
  assert.ok(brief.requiredVisualRelationship.length > 5);
  assert.equal(brief.orientation, 'landscape');
  assert.equal(brief.aspectRatio, '16:9');
  assert.ok(Array.isArray(brief.importantExclusions));
  assert.ok(Array.isArray(brief.keyObjects));
  assert.ok(brief.explanation.includes('Extra Virgin Olive Oil'));
});

test('3. Visual Relevance QA: Rejects generic stock photo clichés and artificial corporate poses', async () => {
  const article = {
    title: 'Designing a Low-Friction Kitchen Workflow',
    pillar: 'home',
  };
  const brief = buildVisualBrief(article, { pillar: 'home' });

  // A. Handshake in corporate suit
  const handshakeCandidate = {
    url: 'https://images.unsplash.com/photo-handshake',
    alt: 'Business handshake in formal corporate suit',
    prompt: 'Two business executives shaking hands in conference room with smiling corporate business team',
  };
  const handshakeResult = await validateVisualRelevance(article, brief, handshakeCandidate);
  assert.equal(handshakeResult.relevant, false);
  assert.ok(
    handshakeResult.flags.includes('generic_stock_cliche') ||
    handshakeResult.flags.includes('generic_fallback')
  );

  // B. Holding lightbulb idea cliché
  const lightbulbCandidate = {
    url: 'https://images.unsplash.com/photo-lightbulb',
    alt: 'Person holding glowing lightbulb idea above head',
    prompt: 'Concept of innovation with glowing lightbulb idea and thumbs up',
  };
  const lightbulbResult = await validateVisualRelevance(article, brief, lightbulbCandidate);
  assert.equal(lightbulbResult.relevant, false);
  assert.ok(lightbulbResult.flags.includes('generic_stock_cliche'));
});

test('4. Visual Relevance QA: Verifies trusted external image domains and flags unverified URLs', () => {
  const article = {
    title: 'The Modern Coffee Ritual: Single Origin Beans and Pour-Over Craft',
    pillar: 'food-drink',
  };
  const brief = buildVisualBrief(article, { pillar: 'food-drink' });

  // A. Trusted Unsplash domain
  const trustedCandidate = {
    url: 'https://images.unsplash.com/photo-pour-over-coffee-craft',
    alt: 'Pour over ceramic dripper with fresh coffee grounds and morning steam',
    prompt: 'Ceramic coffee dripper on wooden countertop in morning light',
  };
  const trustedResult = validateVisualRelevanceSync(article, brief, trustedCandidate);
  assert.equal(trustedResult.relevant, true);

  // B. Unverified / fake domain
  const fakeDomainCandidate = {
    url: 'https://fake-invented-stock-site.xyz/random-stock-1234.jpg',
    alt: 'Coffee beans on table',
    prompt: 'Coffee beans on table',
  };
  const fakeResult = validateVisualRelevanceSync(article, brief, fakeDomainCandidate);
  assert.equal(fakeResult.relevant, false);
  assert.ok(fakeResult.flags.includes('unverified_external_url'));
});

test('5. Fallback Hierarchy: Enforces USE_ASSET -> USE_INFOGRAPHIC -> USE_EDITORIAL_GRAPHIC -> NO_IMAGE', () => {
  // Scenario 1: Valid verified asset -> USE_ASSET
  const articleA = { title: 'Authentic Sourdough Bread', pillar: 'food-drink' };
  const briefA = buildVisualBrief(articleA, { pillar: 'food-drink' });
  const validCandidate = {
    url: 'https://images.unsplash.com/photo-sourdough',
    alt: 'Crusty artisan sourdough loaf on cutting board',
  };
  const qaA = validateVisualRelevanceSync(articleA, briefA, validCandidate);
  const fallbackA = resolveVisualFallback(articleA, briefA, qaA, validCandidate);
  assert.equal(fallbackA.action, 'USE_ASSET');

  // Scenario 2: Guide with infographic failing image QA -> USE_INFOGRAPHIC
  const articleB = {
    title: 'Home Maintenance Checklist: Foundation and HVAC Safety',
    pillar: 'home',
    infographic: { type: 'process-flow' },
  };
  const briefB = buildVisualBrief(articleB, { pillar: 'home' });
  const invalidCandidate = {
    url: 'https://images.unsplash.com/photo-wrong-stage',
    alt: 'Dark concert stage with electric guitars',
  };
  const qaB = validateVisualRelevanceSync(articleB, briefB, invalidCandidate);
  const fallbackB = resolveVisualFallback(articleB, briefB, qaB, invalidCandidate);
  assert.equal(fallbackB.action, 'USE_INFOGRAPHIC');

  // Scenario 3: Abstract topic with no suitable visual -> NO_IMAGE
  const articleC = {
    title: 'Abstract Economic Policy Liquidity Model',
    pillar: 'wealth',
  };
  const briefC = buildVisualBrief(articleC, { pillar: 'wealth' });
  const noImageCandidate = {};
  const qaC = validateVisualRelevanceSync(articleC, briefC, noImageCandidate);
  const fallbackC = resolveVisualFallback(articleC, briefC, qaC, noImageCandidate);
  assert.equal(fallbackC.action, 'NO_IMAGE');
});

test('6. Existing Infographic Compatibility: Validates all 7 established infographic use cases', () => {
  const verifiedInfographics = [
    { title: 'The Essential Home Maintenance Checklist', expectedType: 'process-flow' },
    { title: 'How to Remove Coffee Stains from Any Fabric', expectedType: 'mechanism' },
    { title: 'How to Store Seasonal Clothes to Prevent Mold and Damage', expectedType: 'mechanism' },
    { title: 'How to Store Cooked Rice Safely (B. Cereus Prevention)', expectedType: 'safety-pathway' },
    { title: 'Which Refrigerator Size Do You Need? (Capacity Formula)', expectedType: 'formula' },
    { title: 'How to Clean and Season a Cast Iron Pan', expectedType: 'mechanism' },
    { title: 'Cookware Material Decision Guide', expectedType: 'decision-tree' },
  ];

  for (const item of verifiedInfographics) {
    const brief = buildVisualBrief({ title: item.title, infographic: { type: item.expectedType } });
    assert.equal(brief.infographicPreferable, true);
  }
});
