import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildVisualBrief } from '../src/lib/editorial/visual-brief.ts';
import { validateVisualRelevance } from '../src/lib/editorial/visual-relevance.ts';
import { orchestrateEditorialImage } from '../src/lib/editorial/images/orchestrator.ts';
import type { PublishPackage } from '../src/lib/editorial/publishing/types.ts';
import type { IEditorialImageProvider } from '../src/lib/editorial/images/contracts.ts';

test('1. buildVisualBrief generates dedicated visual brief for baseball topics', () => {
  const article = {
    title: 'Astros: Inside the Team, Their Fans, and Cultural Ripples',
    description: 'An analysis of Houston Astros baseball culture and ballpark dynamics.',
    content: 'Houston Astros baseball at Minute Maid Park...',
    pillar: 'entertainment' as const,
    tags: ['entertainment', 'baseball', 'astros'],
  };

  const brief = buildVisualBrief(article, { pillar: 'entertainment' });

  assert.equal(brief.primaryEntity, 'Houston Astros Baseball');
  assert.ok(brief.aiGenerationPrompt.includes('Houston Astros'));
  assert.ok(brief.prohibitedVisualElements.includes('musicians'));
  assert.ok(brief.prohibitedVisualElements.includes('guitarists'));
  assert.ok(brief.prohibitedVisualElements.includes('soccer pitches'));
});

test('2. validateVisualRelevance rejects mismatched sport and unrelated images via metadata', async () => {
  const baseballArticle = {
    title: 'Astros: Inside the Team, Their Fans, and Cultural Ripples',
    pillar: 'entertainment' as const,
  };
  const brief = buildVisualBrief(baseballArticle, { pillar: 'entertainment' });

  // A. Reject guitarist image for baseball article
  const guitarCandidate = {
    url: 'https://images.unsplash.com/photo-guitar-player',
    alt: 'Musician playing electric guitar on stage',
    prompt: 'Solo guitarist performing with rock band under stage lights',
  };
  const guitarResult = await validateVisualRelevance(baseballArticle, brief, guitarCandidate);
  assert.equal(guitarResult.relevant, false);
  assert.ok(guitarResult.flags.includes('wrong_subject') || guitarResult.flags.includes('unrelated_visual_theme'));

  // B. Reject soccer image for baseball article
  const soccerCandidate = {
    url: 'https://images.unsplash.com/photo-soccer-goal',
    alt: 'Soccer pitch with goal net',
    prompt: 'Soccer pitch with penalty box',
  };
  const soccerResult = await validateVisualRelevance(baseballArticle, brief, soccerCandidate);
  assert.equal(soccerResult.relevant, false);
  assert.ok(soccerResult.flags.includes('wrong_sport'));

  // C. Accept dedicated baseball ballpark image
  const baseballCandidate = {
    url: 'https://images.unsplash.com/photo-baseball-field',
    alt: 'Houston Astros baseball stadium and ballpark atmosphere',
    prompt: 'Editorial wide angle of professional baseball stadium diamond at twilight, Houston Astros navy and orange banner details, authentic Major League ballpark lighting, pristine infield clay',
  };
  const baseballResult = await validateVisualRelevance(baseballArticle, brief, baseballCandidate);
  assert.equal(baseballResult.relevant, true);
  assert.ok(baseballResult.confidence >= 0.9);
});

test('3. validateVisualRelevance confirms NO IMAGE is valid and preferred over irrelevant image', async () => {
  const article = { title: 'Abstract Economic Policy' };
  const brief = buildVisualBrief(article, { pillar: 'money' as const });

  const noImageCandidate = {};
  const result = await validateVisualRelevance(article, brief, noImageCandidate);

  assert.equal(result.relevant, true);
  assert.equal(result.confidence, 1.0);
  assert.equal(result.detected_subject, 'none');
});

test('4. validateVisualRelevance evaluates actual image pixel buffers and catches semantic mismatches', async () => {
  // Synthesize realistic image pixel buffers using Sharp
  // A. Dark concert stage with spotlights (musician / guitarist lighting): Mean brightness ~35, high contrast
  const guitarStageBuffer = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 25, g: 15, b: 20 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 80, height: 80, channels: 3, background: { r: 255, g: 220, b: 100 } },
        }).png().toBuffer(),
        top: 50,
        left: 50,
      },
    ])
    .jpeg()
    .toBuffer();

  // B. Cyan / deep blue open ocean water buffer with wave highlights
  const oceanWaterBuffer = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 20, g: 140, b: 210 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 120, height: 40, channels: 3, background: { r: 180, g: 230, b: 255 } },
        }).png().toBuffer(),
        top: 100,
        left: 100,
      },
    ])
    .jpeg()
    .toBuffer();

  // C. Lush green stadium turf / pitch buffer (G dominant) with field lines
  const sportsFieldBuffer = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 35, g: 145, b: 40 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 380, height: 10, channels: 3, background: { r: 240, g: 245, b: 240 } },
        }).png().toBuffer(),
        top: 200,
        left: 10,
      },
      {
        input: await sharp({
          create: { width: 40, height: 100, channels: 3, background: { r: 180, g: 130, b: 70 } },
        }).png().toBuffer(),
        top: 150,
        left: 180,
      },
    ])
    .jpeg()
    .toBuffer();

  // D. Neutral masonry / architectural tones (Kyoto / City) with timber framing
  const architectureBuffer = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 120, g: 115, b: 110 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 20, height: 380, channels: 3, background: { r: 60, g: 45, b: 40 } },
        }).png().toBuffer(),
        top: 10,
        left: 50,
      },
    ])
    .jpeg()
    .toBuffer();

  // 1. Test: Baseball article + Guitarist stage image pixel buffer -> MUST FAIL
  const baseballArticle = {
    title: 'Astros: Inside the Team, Their Fans, and Cultural Ripples',
    pillar: 'entertainment' as const,
  };
  const baseballBrief = buildVisualBrief(baseballArticle, { pillar: 'entertainment' });
  const baseballWithGuitarBufferResult = await validateVisualRelevance(baseballArticle, baseballBrief, {
    imageBuffer: guitarStageBuffer,
    prompt: 'Live concert stage with guitarist under spotlight',
  });
  assert.equal(baseballWithGuitarBufferResult.relevant, false);
  assert.ok(
    baseballWithGuitarBufferResult.flags.includes('wrong_subject') ||
    baseballWithGuitarBufferResult.flags.includes('unrelated_visual_theme')
  );
  assert.ok(baseballWithGuitarBufferResult.analysis?.imageBufferPresent);

  // 2. Test: Aviation incident article + Ocean cruise image pixel buffer -> MUST FAIL
  const aviationArticle = {
    title: 'Delta Flight 2311 Rapid Descent: Aviation Safety Review',
    pillar: 'travel' as const,
  };
  const aviationBrief = buildVisualBrief(aviationArticle, { pillar: 'travel' });
  const aviationWithOceanBufferResult = await validateVisualRelevance(aviationArticle, aviationBrief, {
    imageBuffer: oceanWaterBuffer,
    prompt: 'Tropical ocean cruise ship sailing through turquoise water',
  });
  assert.equal(aviationWithOceanBufferResult.relevant, false);
  assert.ok(
    aviationWithOceanBufferResult.flags.includes('wrong_subject') ||
    aviationWithOceanBufferResult.flags.includes('unrelated_visual_theme') ||
    aviationWithOceanBufferResult.flags.includes('misleading_imagery')
  );

  // 3. Test: Cricket article + Cricket pitch sports buffer -> MUST PASS
  const cricketArticle = {
    title: 'Cricinfo reveals how cricket fans shape pop culture',
    pillar: 'entertainment' as const,
  };
  const cricketBrief = buildVisualBrief(cricketArticle, { pillar: 'entertainment' });
  const cricketWithPitchBufferResult = await validateVisualRelevance(cricketArticle, cricketBrief, {
    imageBuffer: sportsFieldBuffer,
    prompt: 'Cricket pitch with wickets and leather ball on green grass',
  });
  assert.equal(cricketWithPitchBufferResult.relevant, true);
  assert.ok(cricketWithPitchBufferResult.confidence >= 0.85);

  // 4. Test: Travel Japan article + Matching architectural image buffer -> MUST PASS
  const japanArticle = {
    title: 'Japan: Traditional Timber Architecture and Historic Townscapes',
    pillar: 'travel' as const,
  };
  const japanBrief = buildVisualBrief(japanArticle, { pillar: 'travel' });
  const japanWithArchBufferResult = await validateVisualRelevance(japanArticle, japanBrief, {
    imageBuffer: architectureBuffer,
    prompt: 'Historic Kyoto timber machiya and stone paved street',
  });
  assert.equal(japanWithArchBufferResult.relevant, true);
  assert.ok(japanWithArchBufferResult.confidence >= 0.85);
});

test('5. validateVisualRelevance rejects corrupted and solid blank placeholder buffers', async () => {
  const article = { title: 'Essential Guide to Modern Design', pillar: 'style' as const };
  const brief = buildVisualBrief(article, { pillar: 'style' });

  // A. Corrupted buffer (non-image bytes)
  const corruptBuffer = Buffer.from('NOT_AN_IMAGE_PAYLOAD_STRING');
  const corruptResult = await validateVisualRelevance(article, brief, {
    imageBuffer: corruptBuffer,
  });
  assert.equal(corruptResult.relevant, false);
  assert.ok(corruptResult.flags.includes('invalid_image_buffer'));

  // B. Blank single-color canvas (zero visual variance)
  const solidBlankBuffer = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();

  const blankResult = await validateVisualRelevance(article, brief, {
    imageBuffer: solidBlankBuffer,
  });
  assert.equal(blankResult.relevant, false);
  assert.ok(
    blankResult.flags.includes('blank_placeholder_image') ||
    blankResult.flags.includes('generic_fallback')
  );
});

test('6. Production image orchestrator enforces NO IMAGE > IRRELEVANT IMAGE on mismatched generated bytes', async () => {
  const baseballPackage: PublishPackage = {
    id: 'pub-astros-01',
    topicId: 'lm-entertainment-astros-01',
    slug: 'inside-astros-story-spotlight-cultural-impact',
    pillar: 'entertainment',
    format: 'standard',
    audience: 'general',
    primaryIntent: 'informational',
    riskLevel: 'low',
    title: 'Astros: Inside the Team, Their Fans, and Cultural Ripples',
    description: 'Inside Houston Astros baseball culture and stadium atmosphere.',
    excerpt: 'Houston Astros baseball culture and stadium atmosphere.',
    content: 'Houston Astros baseball at Minute Maid Park.',
    sources: [{ name: 'MLB Official', url: 'https://mlb.com' }],
    tags: ['entertainment', 'baseball', 'astros'],
    internalLinks: [],
    affiliateIntent: false,
    faq: [],
    socialHooks: [],
    publicationMetadata: {
      targetDate: new Date().toISOString(),
      version: 1,
      author: 'LifeMode Editorial Team',
    },
    qualitySummary: {
      overallScore: 95,
      safetyScore: 100,
      factualityScore: 95,
      reviewedAt: new Date().toISOString(),
      reviewer: 'ai-router',
      decision: 'PASS',
    },
  };

  // Create a rogue provider that produces an unrelated guitarist image buffer
  const guitarBuffer = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 25, g: 15, b: 20 },
    },
  })
    .jpeg()
    .toBuffer();

  const rogueProvider: IEditorialImageProvider = {
    name: 'Rogue Guitar Provider',
    providerId: 'rogue-guitar',
    isConfigured: () => true,
    generate: async () => ({
      success: true,
      status: 'SUCCESS',
      provider: 'rogue-guitar',
      model: 'test-model',
      imageBuffer: guitarBuffer,
      mimeType: 'image/jpeg',
      durationMs: 10,
    }),
  };

  const orchestrateResult = await orchestrateEditorialImage(baseballPackage, {
    primaryProvider: rogueProvider,
    config: {
      enabled: true,
      strategy: 'cloudflare',
      maxRetries: 0,
      targetWidth: 400,
      targetHeight: 400,
      aspectRatio: '1:1',
      costGuard: { enabled: false, dailyLimit: 100, monthlyLimit: 1000 },
      cloudflare: { accountId: 'test', apiToken: 'test', model: 'test', configured: true },
      bfl: { apiKey: '', model: '', configured: false },
    },
  });

  // Must reject the image and NOT attach it to the publish package
  assert.equal(orchestrateResult.success, false);
  assert.equal(orchestrateResult.reason, 'visual-relevance-failed');
  assert.equal(baseballPackage.imageMetadata?.url, undefined);
});
