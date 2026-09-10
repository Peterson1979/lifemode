import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeArticleContent,
  hasLeakedInternalMetadata,
} from '../src/lib/editorial/sanitization.ts';
import { validateGeneratedArticle } from '../src/lib/editorial/generation/validation.ts';
import { buildPublishPackage } from '../src/lib/editorial/publishing/builder.ts';
import { publishPackageToStoredArticleInput } from '../src/lib/editorial/storage/publishing-adapter.ts';
import { parseArticle } from '../src/lib/editorial/storage/serializer.ts';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('Sanitization - Detects and deterministically strips internal metadata blocks', () => {
  const leakedMarkdown = `
# The Modern Workspace Guide

## Introduction

Creating an intentional workspace requires focus and aesthetic clarity. In this article, we explore ergonomic desk setups.

## Core Protocols

1. Keep only essential tools on the desk surface.
2. Maintain natural light exposure.

## FAQ

**Q1: How often should I audit my desk setup?**
A1: Conduct a monthly review.

---

**Sources**

- Pew Research Center: https://example.com/pew
- Center for Humane Tech: https://example.com/cht

**Internal Links**

- /now
- /life/desk-setup

**Affiliate Intents**

- Digital Wellness
- Ergonomic Chairs

**Social Hooks**

- Why your morning desk setup is dictating your cognitive output in 2026.
- 3 minimal adjustments to double your focus.
`;

  const result = sanitizeArticleContent(leakedMarkdown);

  assert.equal(result.hadLeakedMetadata, true);

  // Verifies leaked metadata was extracted into structured arrays
  assert.deepEqual(result.extractedMetadata.internalLinks, ['/now', '/life/desk-setup']);
  assert.deepEqual(result.extractedMetadata.affiliateIntents, ['Digital Wellness', 'Ergonomic Chairs']);
  assert.deepEqual(result.extractedMetadata.socialHooks, [
    'Why your morning desk setup is dictating your cognitive output in 2026.',
    '3 minimal adjustments to double your focus.',
  ]);

  // Verifies cleaned Markdown body does NOT contain internal metadata sections
  assert.ok(!result.cleanContent.includes('**Internal Links**'));
  assert.ok(!result.cleanContent.includes('**Affiliate Intents**'));
  assert.ok(!result.cleanContent.includes('**Social Hooks**'));
  assert.ok(!result.cleanContent.includes('/life/desk-setup'));
  assert.ok(!result.cleanContent.includes('Ergonomic Chairs'));

  // Verifies legitimate sections remain completely intact
  assert.ok(result.cleanContent.includes('# The Modern Workspace Guide'));
  assert.ok(result.cleanContent.includes('## Introduction'));
  assert.ok(result.cleanContent.includes('## FAQ'));
  assert.ok(result.cleanContent.includes('**Sources**'));
  assert.ok(result.cleanContent.includes('Pew Research Center'));
});

test('Sanitization - Does NOT alter legitimate prose that mentions similar words', () => {
  const legitimateContent = `
## Building Connected Digital Systems

Internal links between knowledge bases improve cognitive retrieval speed.
When developing software, affiliate intents should be handled transparently.
Good storytelling uses social hooks naturally in narrative structure.

## Practical Steps

Focus on clarity and restraint.
`;

  const result = sanitizeArticleContent(legitimateContent);
  assert.equal(result.hadLeakedMetadata, false);
  assert.equal(result.cleanContent, legitimateContent.trim());
});

test('Sanitization - Validation catches leaked metadata before sanitization', () => {
  const rawLeakedArticle = {
    title: 'Minimalist Workspace Guide for Professionals',
    slug: 'minimalist-workspace-guide',
    description: 'A comprehensive editorial guide to intentional workspaces and cognitive clarity.',
    excerpt: 'Explore minimalist workspace architecture.',
    content: `
## Foundational Workspace Design
Focus and calm define intentional environments.

**Internal Links**
- /life/habits
`,
  };

  const report = validateGeneratedArticle(rawLeakedArticle as any);
  assert.equal(report.isValid, false);
  const leakIssue = report.issues.find((i) => i.rule === 'INTERNAL_METADATA_LEAK');
  assert.ok(leakIssue, 'Should produce an INTERNAL_METADATA_LEAK validation issue');
});

test('Sanitization - Publishing builder and storage adapter sanitize and extract metadata', () => {
  const draftArticle = {
    title: 'The Art of Tea Houses',
    slug: 'art-of-tea-houses',
    description: 'A curated exploration of traditional and modern Japanese tea house architecture.',
    excerpt: 'Discover the meditative calm of Japanese tea architecture.',
    content: `
## Architectural Harmony
Japanese tea houses exemplify restrained proportions and natural materials.

**Internal Links**
- /travel/kyoto

**Affiliate Intents**
- Ceramic Ware
`,
    faq: [],
    sources: [{ name: 'Kyoto Heritage', url: 'https://example.com' }],
    internalLinks: [],
    affiliateIntents: [],
    socialHooks: [],
  };

  const pkg = buildPublishPackage({
    article: draftArticle as any,
    context: {
      topicId: 'lm-travel-tea-houses',
      pillar: 'travel',
      format: 'guide',
      primaryIntent: 'informational',
      audience: 'Curious readers',
      riskLevel: 'low',
    },
    review: { overallScore: 92, decision: 'PASS' } as any,
  });

  // Package content must be sanitized
  assert.ok(!pkg.content.includes('**Internal Links**'));
  assert.ok(!pkg.content.includes('**Affiliate Intents**'));

  // Extracted metadata must be populated in the package
  assert.deepEqual(pkg.internalLinks, ['/travel/kyoto']);
  assert.deepEqual(pkg.affiliateCategories, ['Ceramic Ware']);
  assert.equal(pkg.affiliateIntent, true);

  // Storage input must also be sanitized
  const storageInput = publishPackageToStoredArticleInput(pkg);
  assert.ok(!storageInput.content.includes('**Internal Links**'));
  assert.ok(!storageInput.content.includes('**Affiliate Intents**'));
});

test('Sanitization - Production article now/the-2026-cultural-shift-toward-digital-intentionality is clean and valid', async () => {
  const articlePath = resolve(
    process.cwd(),
    'src/content/now/the-2026-cultural-shift-toward-digital-intentionality.md'
  );
  const rawFile = await readFile(articlePath, 'utf-8');

  // Must not have leaked metadata
  assert.ok(!hasLeakedInternalMetadata(rawFile), 'Production article must not contain leaked metadata');
  assert.ok(!rawFile.includes('**Internal Links**'));
  assert.ok(!rawFile.includes('**Affiliate Intents**'));
  assert.ok(!rawFile.includes('**Social Hooks**'));

  // Must parse cleanly into StoredArticle
  const parsed = parseArticle(rawFile, 'now', 'the-2026-cultural-shift-toward-digital-intentionality', articlePath);
  assert.equal(parsed.frontmatter.title, 'The 2026 Cultural Shift Toward Digital Intentionality: A Modern Guide to Trends, Signals & Zeitgeist');
  assert.equal(parsed.frontmatter.sources.length, 3);
  assert.ok(parsed.content.includes('## Introduction & Core Perspective'));
  assert.ok(parsed.content.includes('## FAQ'));
  assert.ok(parsed.content.includes('**Sources**'));
});
