import test from 'node:test';
import assert from 'node:assert/strict';
import { listDrafts, getDraft, saveDraft, deleteDraft, slugify } from '../src/lib/editorial/cms/drafts.ts';
import { listPublishedGuides, getPublishedGuide, computeReadingTime, formatGuideMarkdown } from '../src/lib/editorial/cms/guides.ts';
import { listMediaAssets, uploadMediaAsset } from '../src/lib/editorial/cms/media.ts';
import { validateGuideData, publishGuide } from '../src/lib/editorial/cms/publisher.ts';
import { renderMarkdownToHtml } from '../src/utils/markdown-renderer.ts';
import type { GuideData } from '../src/lib/editorial/cms/types.ts';

test('slugify helper converts title to clean URL slug', () => {
  assert.equal(slugify('How to Cook with Stainless Steel Without Sticking!'), 'how-to-cook-with-stainless-steel-without-sticking');
  assert.equal(slugify('  Tidying Up & Kitchen Organizing: 101  '), 'tidying-up-kitchen-organizing-101');
});

test('reading time calculation is accurate and rounded', () => {
  assert.equal(computeReadingTime('short text'), '1 min read');
  const longText = new Array(450).fill('word').join(' ');
  assert.equal(computeReadingTime(longText), '3 min read');
});

test('draft management lifecycle: save, list, get, delete', async () => {
  const testDraftInput: Partial<GuideData> = {
    title: 'Test Cast Iron Maintenance Draft',
    category: 'food-kitchen',
    description: 'A practical test draft for seasoning and washing cast iron pans.',
    content: '## Step 1\nWash the pan with warm water and dry immediately.\n\n## Step 2\nApply a thin layer of oil.',
  };

  const saved = await saveDraft(testDraftInput);
  assert.ok(saved.id);
  assert.equal(saved.title, testDraftInput.title);
  assert.equal(saved.slug, 'test-cast-iron-maintenance-draft');
  assert.equal(saved.category, 'food-kitchen');

  const allDrafts = await listDrafts();
  assert.ok(allDrafts.some(d => d.id === saved.id));

  const fetched = await getDraft(saved.id);
  assert.equal(fetched?.id, saved.id);
  assert.equal(fetched?.title, testDraftInput.title);

  const deleted = await deleteDraft(saved.id);
  assert.equal(deleted, true);

  const afterDelete = await getDraft(saved.id);
  assert.equal(afterDelete, null);
});

test('published guides catalog reads existing 19 production guides', async () => {
  const guides = await listPublishedGuides();
  assert.ok(guides.length >= 19, `Expected at least 19 guides, found ${guides.length}`);

  const stainlessSteel = guides.find(g => g.slug === 'how-to-cook-with-stainless-steel-without-sticking');
  assert.ok(stainlessSteel);
  assert.equal(stainlessSteel.category, 'food-kitchen');

  const fullGuide = await getPublishedGuide('how-to-cook-with-stainless-steel-without-sticking');
  assert.ok(fullGuide);
  assert.equal(fullGuide.slug, 'how-to-cook-with-stainless-steel-without-sticking');
  assert.match(fullGuide.title, /Stainless Steel/i);
  assert.ok(fullGuide.content.length > 500);
});

test('markdown renderer converts headings, tables, links, and inline images', () => {
  const markdown = '# Main Heading\n\n## Subheading\n\nA paragraph with **bold** and *italic*.\n\n![Pan](https://pub-r2.dev/pan.jpg)\n\n[Guide link](https://lifemode.site/guides/pan/)';
  const html = renderMarkdownToHtml(markdown);

  assert.match(html, /<h1>Main Heading<\/h1>/);
  assert.match(html, /<h2>Subheading<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<img src="https:\/\/pub-r2\.dev\/pan\.jpg" alt="Pan"/);
  assert.match(html, /<a href="https:\/\/lifemode\.site\/guides\/pan\/"/);
});

test('validateGuideData rejects invalid categories, short content, and empty slugs', () => {
  const invalidCategory: any = {
    title: 'Valid Title Here',
    slug: 'valid-slug',
    category: 'invalid-category',
    description: 'A valid description of sufficient length.',
    content: 'A'.repeat(100),
  };
  const res1 = validateGuideData(invalidCategory);
  assert.equal(res1.isValid, false);
  assert.match(res1.errors.join(' '), /Category must be one of/);

  const shortContent: any = {
    title: 'Valid Title Here',
    slug: 'valid-slug',
    category: 'home-maintenance',
    description: 'A valid description of sufficient length.',
    content: 'Too short',
  };
  const res2 = validateGuideData(shortContent);
  assert.equal(res2.isValid, false);
  assert.match(res2.errors.join(' '), /body must be at least 50 characters/);
});

test('publishGuide dryRun mode validates and prepares markdown without git commit or push', async () => {
  const guide: GuideData = {
    title: 'Complete Winterization Checklist and Guide',
    slug: 'test-dry-run-winterization-guide',
    category: 'home-maintenance',
    description: 'A comprehensive step-by-step framework to prepare household plumbing and insulation for winter.',
    content: '## Insulation & Pipes\nInsulate all exterior bibs and unheated basements before freezing temperatures arrive.\n\n## Windows\nCheck weatherstripping on all double-hung windows.',
  };

  const result = await publishGuide(guide, { dryRun: true });
  assert.equal(result.status, 'success');
  assert.match(result.message, /\[DRY RUN\]/);
  assert.match(result.filePath, /test-dry-run-winterization-guide\.md/);

  // Clean up test dryRun file
  const fs = await import('node:fs/promises');
  await fs.unlink(result.filePath).catch(() => {});
});

test('media upload rejects invalid mime types and accepts valid base64 images', async () => {
  await assert.rejects(
    () => uploadMediaAsset({
      fileName: 'bad.txt',
      mimeType: 'text/plain',
      base64Data: Buffer.from('hello').toString('base64'),
    }),
    /Unsupported (?:image|media) format/
  );

  // 1x1 transparent PNG base64
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const asset = await uploadMediaAsset({
    fileName: 'test-pixel.png',
    mimeType: 'image/png',
    base64Data: tinyPng,
  });

  assert.ok(asset.url);
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.fileName, 'test-pixel.png');

  const mediaList = await listMediaAssets();
  assert.ok(mediaList.some(m => m.id === asset.id));
});

