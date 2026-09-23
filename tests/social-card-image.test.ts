import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';

import {
  composeSocialCard,
  computeTitleLayout,
  escapeXml,
  resolvePillarBackgroundPath,
  loadLocalImage,
  PILLAR_BACKGROUND_FILES,
  PILLAR_VISUAL_THEMES,
  FixtureSocialImageProvider,
  APISocialImageProvider,
  isValidJpegBuffer,
  validateSocialVisualAsset,
  selectSocialOpportunities,
  buildSocialBrief,
  FacebookPlatformAdapter,
  InstagramPlatformAdapter,
  type PillarSlug,
  type EditorialTopic,
} from '../src/lib/social/index.ts';

test('LifeMode Social Card Image Generation & Layout Test Suite', async (t) => {

  await t.test('1. All seven pillar background files exist on disk and map deterministically', async () => {
    const pillars: PillarSlug[] = ['style', 'travel', 'food-drink', 'tech-ai', 'money', 'wellbeing', 'culture'];

    for (const pillar of pillars) {
      const relPath = PILLAR_BACKGROUND_FILES[pillar];
      assert.ok(relPath, `Missing relative path for pillar: ${pillar}`);

      const absPath = resolvePillarBackgroundPath(pillar);
      assert.ok(absPath.endsWith(`${pillar}.jpg`), `Path should end with ${pillar}.jpg: ${absPath}`);

      const stats = await fs.stat(absPath);
      assert.ok(stats.isFile(), `Background image should exist on disk: ${absPath}`);
      assert.ok(stats.size > 10000, `Background image should have substantive size: ${stats.size} bytes`);

      const meta = await sharp(absPath).metadata();
      assert.equal(meta.format, 'jpeg');
      assert.ok(meta.width && meta.width >= 1080, `Width should be at least 1080: ${meta.width}`);
      assert.ok(meta.height && meta.height >= 1350, `Height should be at least 1350: ${meta.height}`);
    }
  });

  await t.test('2. All seven pillar themes have defined accent colors and uppercase display names', () => {
    const pillars: PillarSlug[] = ['style', 'travel', 'food-drink', 'tech-ai', 'money', 'wellbeing', 'culture'];

    for (const pillar of pillars) {
      const theme = PILLAR_VISUAL_THEMES[pillar];
      assert.ok(theme, `Theme missing for pillar: ${pillar}`);
      assert.ok(theme.displayName.length > 0);
      assert.ok(theme.accentColor.startsWith('#'));
      assert.ok(theme.accentBg.startsWith('rgba'));
    }
  });

  await t.test('3. Title typography and line wrapping prevents overflow across all length tiers', () => {
    // A. Very Short Title
    const shortTitle = 'Local AI';
    const shortLayout = computeTitleLayout(shortTitle);
    assert.equal(shortLayout.fontSize, 72);
    assert.equal(shortLayout.lines.length, 1);
    assert.equal(shortLayout.lines[0], 'Local AI');

    // B. Normal Title
    const normalTitle = 'The Intentional Guide to Local LLMs in 2026';
    const normalLayout = computeTitleLayout(normalTitle);
    assert.equal(normalLayout.fontSize, 58);
    assert.ok(normalLayout.lines.length >= 1 && normalLayout.lines.length <= 2);
    assert.equal(normalLayout.lines.join(' '), normalTitle);

    // C. Long Title
    const longTitle = 'Minimalist coastal retreats: secluded architecture across the Mediterranean';
    const longLayout = computeTitleLayout(longTitle);
    assert.equal(longLayout.fontSize, 48);
    assert.ok(longLayout.lines.length >= 2 && longLayout.lines.length <= 3);
    assert.equal(normalLayout.lines.join(' ').replace(/\s+/g, ' '), normalLayout.lines.join(' '));

    // D. Very Long Title (should wrap into max lines without clipping edges)
    const veryLongTitle = 'A Comprehensive Exploration of Sovereign Privacy-First Offline Artificial Intelligence Deployments for Mindful Professionals and Knowledge Workers in 2026';
    const veryLongLayout = computeTitleLayout(veryLongTitle);
    assert.equal(veryLongLayout.fontSize, 40);
    assert.ok(veryLongLayout.lines.length <= 6);
    assert.ok(veryLongLayout.lines.every((line) => line.length > 0));
  });

  await t.test('4. XML escaping safely handles special characters (&, <, >, ", \') in titles and text', () => {
    const dangerous = 'Design & "Architecture": <Minimalism> for Life\'s Calm Moments';
    const escaped = escapeXml(dangerous);
    assert.equal(escaped, 'Design &amp; &quot;Architecture&quot;: &lt;Minimalism&gt; for Life&apos;s Calm Moments');
    assert.equal(escaped.includes('<'), false);
    assert.equal(escaped.includes('>'), false);
    assert.equal(escaped.includes('"'), false);
  });

  await t.test('5. composeSocialCard produces 1080x1350 JPEG with valid magic bytes across all 7 pillars', async () => {
    const pillars: PillarSlug[] = ['style', 'travel', 'food-drink', 'tech-ai', 'money', 'wellbeing', 'culture'];

    for (const pillar of pillars) {
      const buffer = await composeSocialCard({
        topicId: `lm-test-${pillar}`,
        pillar,
        format: '1080x1350',
        title: `The Architecture of ${pillar.toUpperCase()} in Modern Living`,
      });

      assert.ok(buffer);
      assert.equal(isValidJpegBuffer(buffer), true);

      const meta = await sharp(buffer).metadata();
      assert.equal(meta.format, 'jpeg');
      assert.equal(meta.width, 1080);
      assert.equal(meta.height, 1350);
    }
  });

  await t.test('6. composeSocialCard seamlessly embeds article image buffer with rounded framing', async () => {
    // Generate a mock article image buffer (e.g. 1200x800 red image)
    const mockArticleImage = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 180, g: 80, b: 60 },
      },
    })
      .jpeg()
      .toBuffer();

    const cardBuffer = await composeSocialCard({
      topicId: 'lm-test-with-image',
      pillar: 'travel',
      format: '1080x1350',
      title: 'Minimalist Coastal Retreats: Secluded Architecture',
      articleImage: mockArticleImage,
      ctaText: 'Read the complete guide on lifemode.life',
    });

    assert.ok(cardBuffer);
    assert.equal(isValidJpegBuffer(cardBuffer), true);

    const meta = await sharp(cardBuffer).metadata();
    assert.equal(meta.format, 'jpeg');
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
  });

  await t.test('7. composeSocialCard safely falls back when remote article image fetch fails', async () => {
    const mockFailingFetch = async () => {
      return { ok: false, status: 404, statusText: 'Not Found' } as any;
    };

    const cardBuffer = await composeSocialCard({
      topicId: 'lm-test-remote-fail',
      pillar: 'tech-ai',
      format: '1080x1350',
      title: 'Running Sovereign Local AI Models',
      articleImage: 'https://images.lifemode.life/non-existent-image.jpg',
      customFetch: mockFailingFetch as any,
    });

    assert.ok(cardBuffer);
    assert.equal(isValidJpegBuffer(cardBuffer), true);

    const meta = await sharp(cardBuffer).metadata();
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
  });

  await t.test('8. FixtureSocialImageProvider generates valid 1080x1350 JPEG asset passing visual validation', async () => {
    const provider = new FixtureSocialImageProvider();
    const result = await provider.generateImage({
      topicId: 'lm-culture-2026-analog-turn',
      pillar: 'culture',
      prompt: 'High signal professionals returning to analog notebooks',
      format: '1080x1350',
      headlineOverlay: 'The Analog Turn in Knowledge Work',
      articleTitle: 'The Analog Turn: Why High-Signal Professionals Are Embracing Tactile Tools',
    });

    assert.equal(result.success, true);
    assert.ok(result.asset);
    assert.equal(result.asset.format, '1080x1350');
    assert.equal(result.asset.mimeType, 'image/jpeg');
    assert.equal(result.asset.width, 1080);
    assert.equal(result.asset.height, 1350);
    assert.ok(result.asset.buffer);
    assert.equal(isValidJpegBuffer(result.asset.buffer), true);

    // Validate with LifeMode visual asset validator
    const valResult = validateSocialVisualAsset(result.asset);
    assert.equal(valResult.valid, true);
    assert.equal(valResult.errors.length, 0);
  });

  await t.test('9. APISocialImageProvider generates valid 1080x1350 JPEG asset with custom image input', async () => {
    const mockImageBytes = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 60, b: 90 } },
    }).png().toBuffer();

    const mockFetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ b64_json: mockImageBytes.toString('base64') }],
        }),
      } as any;
    };

    const origKey = process.env.OPENAI_API_KEY;
    try {
      process.env.OPENAI_API_KEY = 'mock-openai-key';
      const provider = new APISocialImageProvider(mockFetch as any);

      const result = await provider.generateImage({
        topicId: 'lm-money-2026-treasury',
        pillar: 'money',
        prompt: 'Minimalist financial treasury charts and clean typography',
        format: '1080x1350',
        headlineOverlay: 'Anti-Fragile Asset Allocation',
        articleTitle: 'The Anti-Fragile Cash Buffer: A Modern Treasury Framework',
      });

      assert.equal(result.success, true);
      assert.ok(result.asset);
      assert.equal(result.asset.mimeType, 'image/jpeg');
      assert.equal(result.asset.width, 1080);
      assert.equal(result.asset.height, 1350);
      assert.ok(result.asset.buffer);
      assert.equal(isValidJpegBuffer(result.asset.buffer), true);

      const valResult = validateSocialVisualAsset(result.asset);
      assert.equal(valResult.valid, true);
    } finally {
      if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  await t.test('10. Article image resolution loads real public/editorial local images and differs from fallback card', async () => {
    // A. Verify loadLocalImage resolves root-relative path correctly
    const lentilBuffer = await loadLocalImage('/editorial/food/cooking-with-lentils.webp');
    assert.ok(lentilBuffer, 'Must load /editorial/food/cooking-with-lentils.webp from public/');
    assert.ok(lentilBuffer.length > 10000, `Buffer size must be substantive: ${lentilBuffer.length}`);

    // B. Compose social card with actual assigned article image path
    const cardWithRealImage = await composeSocialCard({
      topicId: 'lm-food-drink-cooking-with-lentils',
      pillar: 'food-drink',
      format: '1080x1350',
      title: 'A Practical Guide to Cooking with Lentils',
      articleImage: '/editorial/food/cooking-with-lentils.webp',
      ctaText: 'Read the complete guide on lifemode.life',
    });

    assert.ok(cardWithRealImage);
    assert.equal(isValidJpegBuffer(cardWithRealImage), true);

    // C. Compose card with NO image (fallback geometric SVG)
    const cardWithFallback = await composeSocialCard({
      topicId: 'lm-food-drink-cooking-with-lentils',
      pillar: 'food-drink',
      format: '1080x1350',
      title: 'A Practical Guide to Cooking with Lentils',
      articleImage: undefined,
      ctaText: 'Read the complete guide on lifemode.life',
    });

    assert.ok(cardWithFallback);
    assert.equal(isValidJpegBuffer(cardWithFallback), true);

    // D. Verify that the card with real image is distinct from the fallback card
    assert.notDeepEqual(
      cardWithRealImage,
      cardWithFallback,
      'Card rendered with assigned article image must NOT be identical to generic fallback card'
    );

    // E. Verify canonical lifemode.life URL is also resolved locally
    const cardWithCanonicalUrl = await composeSocialCard({
      topicId: 'lm-food-drink-cooking-with-lentils',
      pillar: 'food-drink',
      format: '1080x1350',
      title: 'A Practical Guide to Cooking with Lentils',
      articleImage: 'https://lifemode.life/editorial/food/cooking-with-lentils.webp',
      ctaText: 'Read the complete guide on lifemode.life',
    });

    assert.ok(cardWithCanonicalUrl);
    assert.equal(isValidJpegBuffer(cardWithCanonicalUrl), true);
    assert.deepEqual(
      cardWithRealImage,
      cardWithCanonicalUrl,
      'Canonical https://lifemode.life image URL should resolve to the identical production image bytes'
    );
  });

  await t.test('11. End-to-end regression: Published Food & Drink article with assigned image propagates exact image URL to Facebook and Instagram packages without generic fallback', async () => {
    const publishedFoodTopic: EditorialTopic = {
      id: 'lm-food-drink-20260918-sourdough-craft',
      canonicalTopic: 'How Sourdough Fermentation Works',
      slug: 'how-sourdough-fermentation-works',
      pillar: 'food-drink',
      sourceSignals: [],
      queryVariants: ['sourdough fermentation science', 'wild yeast microbiology'],
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
      tags: ['food-drink', 'baking', 'science'],
      articleImage: '/editorial/food/sourdough-fermentation.webp',
    } as any;

    // 1. Candidate Selection: Social opportunity contains the exact assigned article image
    const opportunities = await selectSocialOpportunities([publishedFoodTopic], {
      maxOpportunities: 1,
      minScoreThreshold: 80,
      publishedOnly: true,
      baseUrl: 'https://lifemode.life',
    });

    assert.equal(opportunities.length, 1);
    const opp = opportunities[0];
    assert.equal(opp.articleImage, '/editorial/food/sourdough-fermentation.webp');
    assert.equal(opp.destinationUrl, 'https://lifemode.life/food-drink/how-sourdough-fermentation-works');

    // 2. Brief contains the article image
    const brief = buildSocialBrief(opp);
    assert.equal(brief.articleImage, '/editorial/food/sourdough-fermentation.webp');

    // 3. Fixture/API Image Provider generates card with the assigned article image
    const imageProvider = new FixtureSocialImageProvider();
    const imageResult = await imageProvider.generateImage({
      topicId: opp.topicId,
      pillar: opp.pillar,
      prompt: 'Microbiology of sourdough fermentation and crumb structure',
      format: '1080x1350',
      headlineOverlay: 'How Sourdough Fermentation Works',
      articleImage: opp.articleImage,
      articleTitle: opp.canonicalTopic,
      ctaText: 'Read the complete guide on lifemode.life',
    });

    assert.equal(imageResult.success, true);
    assert.ok(imageResult.asset);
    assert.ok(imageResult.asset.buffer);

    // Mock storage upload assigning a public HTTPS asset URL
    const expectedPublicUrl = 'https://pub-8fcd679c40fd4aaa851f6ee7cdd4d083.r2.dev/social/lm-food-drink-sourdough/social-card.jpg';
    imageResult.asset.url = expectedPublicUrl;

    const content = {
      topicId: opp.topicId,
      pillar: opp.pillar,
      concept: 'The science behind wild yeast and lactic acid bacteria in sourdough.',
      hook: 'Why sourdough fermentation creates superior flavour and texture.',
      title: 'How Sourdough Fermentation Works: The Complete Guide',
      shortCaption: 'Exploring the microbiology of wild yeast and slow fermentation.',
      callToAction: 'Read the full guide on LifeMode',
      hashtags: ['#LifeMode', '#FoodDrink', '#Sourdough', '#BakingCraft'],
      visualConcept: 'Artisanal bread scoring and bubbly fermentation starter',
      imageText: { headline: 'How Sourdough Fermentation Works' },
      targetPlatforms: ['facebook', 'instagram'] as any[],
      destinationUrl: opp.destinationUrl,
    };

    // 4. Facebook Adapter receives the exact public image URL
    const fbAdapter = new FacebookPlatformAdapter();
    const fbPkg = await fbAdapter.prepare(content, imageResult.asset, { destinationUrl: opp.destinationUrl });
    const fbValidation = fbAdapter.validate(fbPkg);
    assert.equal(fbValidation.valid, true);
    assert.equal(fbPkg.mediaAsset.url, expectedPublicUrl);
    assert.equal(fbPkg.preparedPayload.url, expectedPublicUrl);
    assert.ok(fbPkg.caption.includes('https://lifemode.life/food-drink/how-sourdough-fermentation-works'));

    // 5. Instagram Adapter receives the exact public image URL
    const igAdapter = new InstagramPlatformAdapter();
    const igPkg = await igAdapter.prepare(content, imageResult.asset, { destinationUrl: opp.destinationUrl });
    const igValidation = igAdapter.validate(igPkg);
    assert.equal(igValidation.valid, true);
    assert.equal(igPkg.mediaAsset.url, expectedPublicUrl);
    assert.equal(igPkg.preparedPayload.image_url, expectedPublicUrl);
  });

  await t.test('12. Non-Food articles (culture, wellbeing, travel, life) propagate assigned production images unaffected while preserving selection limits', async () => {
    const publishedTopics: EditorialTopic[] = [
      {
        id: 'lm-culture-20260910-jose-trevino',
        canonicalTopic: 'Jose Trevino: Cultural & Athletic Profile',
        slug: 'jose-trevino-profile',
        pillar: 'culture',
        sourceSignals: [],
        queryVariants: ['jose trevino catcher'],
        scoring: {
          searchPotential: 85,
          pinterestPotential: 70,
          socialPotential: 85,
          lifeModeRelevance: 85,
          commercialPotential: 50,
          freshness: 90,
          competitionOpportunity: 80,
          originalityPotential: 80,
        },
        totalScore: 85.0,
        priorityTier: 'PRIORITY',
        opportunityType: 'ARTICLE_AND_SOCIAL',
        status: 'PUBLISHED',
        freshnessScore: 90,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        tags: ['culture', 'baseball', 'sports'],
        articleImage: '/editorial/baseball-diamond-catcher-gear.jpg',
      } as any,
      {
        id: 'lm-wellbeing-20260910-morning-sunlight',
        canonicalTopic: 'Morning Sunlight and Adenosine Clearing',
        slug: 'morning-sunlight-and-adenosine-clearing',
        pillar: 'wellbeing',
        sourceSignals: [],
        queryVariants: ['morning sunlight protocol'],
        scoring: {
          searchPotential: 80,
          pinterestPotential: 80,
          socialPotential: 80,
          lifeModeRelevance: 90,
          commercialPotential: 50,
          freshness: 80,
          competitionOpportunity: 80,
          originalityPotential: 80,
        },
        totalScore: 82.0,
        priorityTier: 'NORMAL',
        opportunityType: 'ARTICLE_AND_SOCIAL',
        status: 'PUBLISHED',
        freshnessScore: 80,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        tags: ['wellbeing', 'circadian', 'health'],
        articleImage: 'https://pub-8fcd679c40fd4aaa851f6ee7cdd4d083.r2.dev/editorial/lm-wellbeing-20260910-morning-sunlight-a/a77354965b8ad6b4.jpg',
      } as any,
    ];

    // A. Verify selection limit: maxOpportunities = 1 strictly returns exactly 1 item
    const selected = await selectSocialOpportunities(publishedTopics, {
      maxOpportunities: 1,
      minScoreThreshold: 80,
      publishedOnly: true,
      baseUrl: 'https://lifemode.life',
    });

    assert.equal(selected.length, 1, 'maxOpportunities: 1 must return exactly 1 opportunity');
    assert.equal(selected[0].topicId, 'lm-culture-20260910-jose-trevino');
    assert.equal(selected[0].articleImage, '/editorial/baseball-diamond-catcher-gear.jpg');

    // B. Verify local image loading for existing non-Food article (/editorial/baseball-diamond-catcher-gear.jpg)
    const baseballBuffer = await loadLocalImage(selected[0].articleImage!);
    assert.ok(baseballBuffer, 'Must load /editorial/baseball-diamond-catcher-gear.jpg from public/');
    assert.ok(baseballBuffer.length > 10000);

    const nonFoodCard = await composeSocialCard({
      topicId: selected[0].topicId,
      pillar: selected[0].pillar,
      format: '1080x1350',
      title: selected[0].canonicalTopic,
      articleImage: selected[0].articleImage,
    });

    assert.ok(nonFoodCard);
    assert.equal(isValidJpegBuffer(nonFoodCard), true);
  });
});
