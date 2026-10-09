import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { GLOBAL_IMAGE_GUIDELINES } from '../src/config/images.ts';
import { generateEditorialImagePrompt, validateImageSemanticRelevance } from '../src/lib/editorial/image-prompt.ts';
import { buildVisualBrief } from '../src/lib/editorial/visual-brief.ts';
import { renderMarkdownToHtml } from '../src/utils/markdown-renderer.ts';

test('1. UTF-8 Encoding & HTML Structure Integrity', async (t) => {
  await t.test('BaseLayout declares <meta charset="UTF-8" /> at the very start of <head>', () => {
    const baseLayoutPath = resolve(process.cwd(), 'src/layouts/BaseLayout.astro');
    const content = readFileSync(baseLayoutPath, 'utf8');
    const headMatch = content.match(/<head>([\s\S]*?)<\/head>/);
    assert.ok(headMatch, 'BaseLayout must contain a <head> element');
    const headContent = headMatch[1].trim();
    assert.ok(
      headContent.startsWith('<meta charset="UTF-8" />') || headContent.startsWith('<meta charset="UTF-8">'),
      'meta charset="UTF-8" must be the very first tag inside <head>'
    );
  });

  await t.test('renderMarkdownToHtml preserves emojis, smart quotes, dashes, and non-breaking hyphens natively', () => {
    const markdown = [
      '# Optimizing Morning Light 🛡️',
      '',
      '## Step‑by‑Step Protocol',
      '1. **Timing & Hydration** – Start within 20‑30 minutes of waking.',
      '2. **Light intensity** – Aim for 1,000–2,000 lux at eye level.',
      '',
      '### What you’ll need',
      '- “Full-spectrum” daylight lamp or natural morning sun.',
      '- Simple log: 15–20 min sessions.',
      '',
      '> Pro tip: Consistency is key for circadian rhythm ✓',
    ].join('\n');

    const html = renderMarkdownToHtml(markdown);

    assert.ok(html.includes('🛡️'), 'Emoji 🛡️ must be preserved');
    assert.ok(html.includes('✓'), 'Checkmark ✓ must be preserved');
    assert.ok(html.includes('Step‑by‑Step'), 'Non-breaking hyphen in Step‑by‑Step must be preserved');
    assert.ok(html.includes('20‑30'), 'Non-breaking hyphen in 20‑30 must be preserved');
    assert.ok(html.includes('–'), 'En dash – must be preserved');
    assert.ok(html.includes('you’ll'), 'Smart apostrophe in you’ll must be preserved');
    assert.ok(html.includes('“Full-spectrum”'), 'Smart quotes “ ” must be preserved');
    assert.ok(!html.includes('đĄď¸'), 'Must not contain Windows-1250 corrupted emoji mojibake');
    assert.ok(!html.includes('â€™'), 'Must not contain double-encoded apostrophe mojibake');
  });

  await t.test('Editorial sample markdown files contain valid UTF-8 text without mojibake', () => {
    const samplesDir = resolve(process.cwd(), 'data/editorial-samples');
    if (existsSync(samplesDir)) {
      const files = readdirSync(samplesDir).filter((f) => f.endsWith('.md'));
      assert.ok(files.length >= 6, 'Must have at least 6 editorial sample files');

      for (const file of files) {
        const filePath = join(samplesDir, file);
        const text = readFileSync(filePath, 'utf8');
        assert.ok(!text.includes('đĄď¸'), `${file} must not contain mojibake đĄď¸`);
        assert.ok(!text.includes('â€™'), `${file} must not contain mojibake â€™`);
        assert.ok(!text.includes('â€“'), `${file} must not contain mojibake â€“`);
        assert.ok(!text.includes('?\''), `${file} must not contain corrupted quote ?'`);
      }
    }
  });
});

test('2. Text-Free AI Image Generation Policy & Validation', async (t) => {
  await t.test('GLOBAL_IMAGE_GUIDELINES strictly forbids text, typography, labels, numbers, and infographics in negative prompt rules', () => {
    const negRules = GLOBAL_IMAGE_GUIDELINES.negativePromptRules.join(' ').toLowerCase();
    assert.ok(negRules.includes('text'), 'Must forbid text');
    assert.ok(negRules.includes('typography'), 'Must forbid typography');
    assert.ok(negRules.includes('letters'), 'Must forbid letters');
    assert.ok(negRules.includes('words'), 'Must forbid words');
    assert.ok(negRules.includes('labels'), 'Must forbid labels');
    assert.ok(negRules.includes('watermarks'), 'Must forbid watermarks');
    assert.ok(negRules.includes('infographics'), 'Must forbid raster infographics');
    assert.ok(negRules.includes('diagrams'), 'Must forbid raster diagrams');
  });

  await t.test('generateEditorialImagePrompt outputs explicit text-free photography instructions', () => {
    const result = generateEditorialImagePrompt({
      title: 'Optimizing Morning Light for Alertness and Deep Sleep',
      description: 'A practical guide to timing light exposure in the morning.',
      pillar: 'health',
      tags: ['health', 'sleep', 'circadian'],
    });

    assert.ok(result.prompt.toLowerCase().includes('text-free'), 'Prompt must specify text-free');
    assert.ok(result.negativePrompt.toLowerCase().includes('text'), 'Negative prompt must include text');
    assert.ok(result.negativePrompt.toLowerCase().includes('typography'), 'Negative prompt must include typography');
  });

  await t.test('buildVisualBrief produces photographic text-free prompts even for procedural and calculation topics', () => {
    const brief = buildVisualBrief({
      title: 'Winter Home Weatherization: Step-by-Step Draft Sealing and Pipe Insulation Guide',
      description: 'Learn how to keep your house warm and protect pipes this winter.',
      pillar: 'home',
      tags: ['home', 'winter-prep', 'diy'],
      format: 'standard',
    } as any);

    assert.ok(brief.aiGenerationPrompt.toLowerCase().includes('text-free'), 'aiGenerationPrompt must be text-free');
    assert.ok(!brief.aiGenerationPrompt.toLowerCase().includes('procedural workflow diagram'), 'Must not ask model to draw procedural diagram');
    assert.ok(!brief.aiGenerationPrompt.toLowerCase().includes('explanatory infographic'), 'Must not ask model to draw infographic');
    assert.ok(brief.importantExclusions.includes('text'), 'importantExclusions must include text');
    assert.ok(brief.importantExclusions.includes('typography'), 'importantExclusions must include typography');
  });

  await t.test('validateImageSemanticRelevance rejects raster AI images generated from diagram/infographic prompts', () => {
    const badInfographicResult = validateImageSemanticRelevance(
      'Morning Light Circadian Protocol',
      'health',
      {
        url: '/dev-samples/morning-light.jpg',
        prompt: 'High-clarity explanatory infographic explaining the mechanism of morning light with labels and arrows',
        source: 'cloudflare-workers-ai',
      }
    );

    assert.equal(badInfographicResult.valid, false, 'Infographic prompt raster image must be rejected');
    assert.ok(badInfographicResult.reason?.includes('text-free'), 'Rejection reason must mention text-free requirement');

    const cleanPhotoResult = validateImageSemanticRelevance(
      'Morning Light Circadian Protocol',
      'health',
      {
        url: '/dev-samples/morning-light.jpg',
        prompt: 'Luminous natural morning sunlight streaming through an open window onto a bedside table, strictly text-free',
        source: 'cloudflare-workers-ai',
      }
    );

    assert.equal(cleanPhotoResult.valid, true, 'Clean text-free photography must be approved');
  });
});

test('3. Absolute Human-Free Image Rule Integrity', async (t) => {
  await t.test('GLOBAL_IMAGE_GUIDELINES core directives strictly mandate human-free visual composition', () => {
    const coreDirectives = GLOBAL_IMAGE_GUIDELINES.coreDirectives.join(' ').toLowerCase();
    assert.ok(coreDirectives.includes('human-free'), 'Core directives must include human-free');
    assert.ok(coreDirectives.includes('no people'), 'Core directives must include no people');
    assert.ok(coreDirectives.includes('no faces'), 'Core directives must include no faces');
    assert.ok(coreDirectives.includes('no hands'), 'Core directives must include no hands');
  });

  await t.test('GLOBAL_IMAGE_GUIDELINES negative prompt rules forbid people, faces, bodies, hands, silhouettes, and reflections', () => {
    const negRules = GLOBAL_IMAGE_GUIDELINES.negativePromptRules.join(' ').toLowerCase();
    assert.ok(negRules.includes('people'), 'Negative prompt must forbid people');
    assert.ok(negRules.includes('faces'), 'Negative prompt must forbid faces');
    assert.ok(negRules.includes('hands'), 'Negative prompt must forbid hands');
    assert.ok(negRules.includes('silhouettes'), 'Negative prompt must forbid silhouettes');
    assert.ok(negRules.includes('human reflections'), 'Negative prompt must forbid human reflections');
  });

  await t.test('generateEditorialImagePrompt generates explicit human-free directives in prompt', () => {
    const promptResult = generateEditorialImagePrompt({
      title: 'Modern Coffee Brewing Methods',
      description: 'A practical overview of artisanal coffee extraction techniques.',
      pillar: 'food-drink',
      tags: ['coffee', 'brewing', 'culinary'],
    });

    assert.ok(promptResult.prompt.toLowerCase().includes('strictly human-free'), 'Prompt must specify strictly human-free');
    assert.ok(promptResult.negativePrompt.toLowerCase().includes('hands'), 'Negative prompt must include hands');
    assert.ok(promptResult.negativePrompt.toLowerCase().includes('people'), 'Negative prompt must include people');
  });
});

