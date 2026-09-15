import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';

import {
  composeSocialCard,
  computeTitleLayout,
  escapeXml,
  resolvePillarBackgroundPath,
  PILLAR_BACKGROUND_FILES,
  PILLAR_VISUAL_THEMES,
  FixtureSocialImageProvider,
  APISocialImageProvider,
  isValidJpegBuffer,
  validateSocialVisualAsset,
  type PillarSlug,
} from '../src/lib/social/index.ts';

test('LifeMode Social Card Image Generation & Layout Test Suite', async (t) => {

  await t.test('1. All seven pillar background files exist on disk and map deterministically', async () => {
    const pillars: PillarSlug[] = ['life', 'travel', 'tech-ai', 'money', 'wellbeing', 'discover', 'now'];

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
    const pillars: PillarSlug[] = ['life', 'travel', 'tech-ai', 'money', 'wellbeing', 'discover', 'now'];

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
    assert.equal(shortLayout.fontSize, 48);
    assert.equal(shortLayout.lines.length, 1);
    assert.equal(shortLayout.lines[0], 'Local AI');

    // B. Normal Title
    const normalTitle = 'The Intentional Guide to Local LLMs in 2026';
    const normalLayout = computeTitleLayout(normalTitle);
    assert.equal(normalLayout.fontSize, 40);
    assert.ok(normalLayout.lines.length >= 1 && normalLayout.lines.length <= 2);
    assert.equal(normalLayout.lines.join(' '), normalTitle);

    // C. Long Title
    const longTitle = 'Minimalist coastal retreats: secluded architecture across the Mediterranean';
    const longLayout = computeTitleLayout(longTitle);
    assert.equal(longLayout.fontSize, 34);
    assert.ok(longLayout.lines.length >= 2 && longLayout.lines.length <= 3);
    assert.equal(normalLayout.lines.join(' ').replace(/\s+/g, ' '), normalLayout.lines.join(' '));

    // D. Very Long Title (should wrap into max lines without clipping edges)
    const veryLongTitle = 'A Comprehensive Exploration of Sovereign Privacy-First Offline Artificial Intelligence Deployments for Mindful Professionals and Knowledge Workers in 2026';
    const veryLongLayout = computeTitleLayout(veryLongTitle);
    assert.equal(veryLongLayout.fontSize, 28);
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
    const pillars: PillarSlug[] = ['life', 'travel', 'tech-ai', 'money', 'wellbeing', 'discover', 'now'];

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
      topicId: 'lm-now-2026-analog-turn',
      pillar: 'now',
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
});
