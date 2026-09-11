import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  serializeArticle,
  parseArticle,
  FilesystemContentRepository,
  resolveSafeArticlePath,
  validatePillar,
  sanitizeSlug,
  publishPackageToStoredArticleInput,
  storePublishPackage,
  storePublishingResult,
  type StoredArticleFrontmatter,
  type StoredArticleInput,
} from '../src/lib/editorial/index.ts';
import type { PublishPackage, PublishingResult } from '../src/lib/editorial/publishing/types.ts';

// Helper to create isolated temporary directory
async function createTempContentRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-storage-test-'));
}

async function cleanupTempContentRoot(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

const sampleFrontmatter: StoredArticleFrontmatter = {
  title: 'Minimalist Workspaces and Local AI in 2026',
  description: 'An editorial guide on configuring intentional workstations with quiet local AI hardware.',
  pubDate: '2026-09-09',
  author: 'LifeMode Editorial',
  tags: ['workspaces', 'minimalism', 'hardware'],
  featured: true,
  draft: false,
  format: 'guide',
  topicId: 'lm-tech-001',
  audience: 'Digital creators and minimalist technologists',
  primaryIntent: 'informational',
  secondaryIntent: 'commercial',
  affiliateIntent: false,
  riskLevel: 'low',
  sources: [
    { name: 'LifeMode Standards', url: 'https://lifemode.life/editorial-standards' },
    { name: 'Energy Efficiency Report', url: 'https://example.com/energy-report' },
  ],
  image: '/images/workspaces-2026.webp',
  readingTime: '5 min read',
  version: 1,
  lifecycleStatus: 'STORED',
};

const sampleBody = [
  '## 1. Introduction: Calm Workspaces',
  '',
  'Designing an intentional workspace begins with reducing acoustic and visual clutter.',
  '',
  '## 2. Local AI Workstations',
  '',
  'Modern local accelerators allow running open models directly on device with minimal power draw.',
].join('\n');

test('LifeMode Article Serializer', async (t) => {
  await t.test('serializes a valid article to canonical Markdown with YAML frontmatter', () => {
    const serialized = serializeArticle({
      frontmatter: sampleFrontmatter,
      content: sampleBody,
    });

    assert.ok(serialized.startsWith('---\n'));
    assert.ok(serialized.includes('title: "Minimalist Workspaces and Local AI in 2026"'));
    assert.ok(serialized.includes('description: "An editorial guide on configuring intentional workstations with quiet local AI hardware."'));
    assert.ok(serialized.includes('pubDate: "2026-09-09"'));
    assert.ok(serialized.includes('author: "LifeMode Editorial"'));
    assert.ok(serialized.includes('tags: ["workspaces","minimalism","hardware"]'));
    assert.ok(serialized.includes('featured: true'));
    assert.ok(serialized.includes('draft: false'));
    assert.ok(serialized.includes('format: "guide"'));
    assert.ok(serialized.includes('topicId: "lm-tech-001"'));
    assert.ok(serialized.includes('primaryIntent: "informational"'));
    assert.ok(serialized.includes('riskLevel: "low"'));
    assert.ok(serialized.includes('version: 1'));
    assert.ok(serialized.includes('lifecycleStatus: "STORED"'));
    assert.ok(serialized.includes('sources:'));
    assert.ok(serialized.includes('- name: "LifeMode Standards"'));
    assert.ok(serialized.includes('url: "https://lifemode.life/editorial-standards"'));
    assert.ok(serialized.includes('## 1. Introduction: Calm Workspaces'));
  });

  await t.test('serialization is deterministic across repeated calls', () => {
    const call1 = serializeArticle({ frontmatter: sampleFrontmatter, content: sampleBody });
    const call2 = serializeArticle({ frontmatter: sampleFrontmatter, content: sampleBody });
    assert.strictEqual(call1, call2);
  });

  await t.test('does not mutate input objects', () => {
    const copyFrontmatter = { ...sampleFrontmatter, tags: [...sampleFrontmatter.tags] };
    const frozenFrontmatter = Object.freeze({ ...copyFrontmatter });
    assert.doesNotThrow(() => {
      serializeArticle({ frontmatter: frozenFrontmatter as any, content: sampleBody });
    });
  });

  await t.test('preserves Markdown body exactly without alteration', () => {
    const body = 'Custom # Title\n\n- item 1\n- item 2\n\n```ts\nconst x = 1;\n```';
    const serialized = serializeArticle({ frontmatter: sampleFrontmatter, content: body });
    const parsed = parseArticle(serialized, 'tech-ai', 'minimalist-workspaces');
    assert.strictEqual(parsed.content, body);
  });
});

test('LifeMode Article Parser', async (t) => {
  await t.test('correctly parses serialized Markdown back into StoredArticle', () => {
    const serialized = serializeArticle({
      frontmatter: sampleFrontmatter,
      content: sampleBody,
    });

    const parsed = parseArticle(serialized, 'tech-ai', 'minimalist-workspaces-2026', '/fake/path.md');

    assert.strictEqual(parsed.pillar, 'tech-ai');
    assert.strictEqual(parsed.slug, 'minimalist-workspaces-2026');
    assert.strictEqual(parsed.frontmatter.title, sampleFrontmatter.title);
    assert.strictEqual(parsed.frontmatter.description, sampleFrontmatter.description);
    assert.strictEqual(parsed.frontmatter.pubDate, '2026-09-09');
    assert.strictEqual(parsed.frontmatter.format, 'guide');
    assert.strictEqual(parsed.frontmatter.primaryIntent, 'informational');
    assert.strictEqual(parsed.frontmatter.riskLevel, 'low');
    assert.strictEqual(parsed.frontmatter.version, 1);
    assert.strictEqual(parsed.frontmatter.lifecycleStatus, 'STORED');
    assert.strictEqual(parsed.frontmatter.sources.length, 2);
    assert.strictEqual(parsed.frontmatter.sources[0].name, 'LifeMode Standards');
    assert.strictEqual(parsed.content, sampleBody);
  });

  await t.test('rejects malformed Markdown missing start delimiter', () => {
    assert.throws(
      () => parseArticle('title: "No Delimiter"\n\nContent body', 'tech-ai', 'test'),
      /File must start with "---"/
    );
  });

  await t.test('rejects malformed Markdown missing closing delimiter', () => {
    assert.throws(
      () => parseArticle('---\ntitle: "Unclosed"\ncontent here', 'tech-ai', 'test'),
      /Missing closing "---"/
    );
  });

  await t.test('rejects missing title or description', () => {
    const invalidYaml = '---\ndescription: "Desc"\npubDate: "2026-09-09"\n---\nBody';
    assert.throws(() => parseArticle(invalidYaml, 'tech-ai', 'test'), /"title" is required/);

    const invalidYaml2 = '---\ntitle: "Title"\npubDate: "2026-09-09"\n---\nBody';
    assert.throws(() => parseArticle(invalidYaml2, 'tech-ai', 'test'), /"description" is required/);
  });

  await t.test('rejects unsupported pillar', () => {
    const validYaml = serializeArticle({ frontmatter: sampleFrontmatter, content: sampleBody });
    assert.throws(
      () => parseArticle(validYaml, 'unsupported-pillar' as any, 'test'),
      /Unsupported pillar/
    );
  });

  await t.test('rejects unsupported format or intent', () => {
    const invalidFormat = '---\ntitle: "T"\ndescription: "D"\npubDate: "2026-09-09"\nformat: "unsupported"\n---\nBody';
    assert.throws(() => parseArticle(invalidFormat, 'tech-ai', 'test'), /Unsupported format/);
  });
});

test('Path Security and Slug Validation', async (t) => {
  const contentRoot = 'c:/Users/opeti/LifeMode/lifemode/src/content';

  await t.test('accepts valid pillars and sanitizes valid slugs', () => {
    const res = resolveSafeArticlePath(contentRoot, 'travel', 'sustainable-train-travel-in-japan');
    assert.strictEqual(res.pillar, 'travel');
    assert.strictEqual(res.slug, 'sustainable-train-travel-in-japan');
    assert.ok(res.safePath.endsWith(path.join('travel', 'sustainable-train-travel-in-japan.md')));
  });

  await t.test('rejects relative traversal in slug', () => {
    assert.throws(() => resolveSafeArticlePath(contentRoot, 'life', '../../secret'), /Invalid slug/);
    assert.throws(() => resolveSafeArticlePath(contentRoot, 'life', '..\\..\\secret'), /Invalid slug/);
    assert.throws(() => resolveSafeArticlePath(contentRoot, 'life', '../escape'), /Invalid slug/);
  });

  await t.test('rejects encoded traversal sequences', () => {
    assert.throws(() => resolveSafeArticlePath(contentRoot, 'life', '%2e%2e%2fpasswd'), /Invalid slug/);
  });

  await t.test('rejects invalid pillar names', () => {
    assert.throws(() => validatePillar('admin'), /Unsupported pillar/);
    assert.throws(() => validatePillar('../secret'), /Unsupported pillar/);
    assert.throws(() => validatePillar(''), /non-empty string/);
  });

  await t.test('sanitizeSlug cleans formatting and whitespace', () => {
    assert.strictEqual(sanitizeSlug('Hello World  2026!'), 'hello-world-2026');
    assert.strictEqual(sanitizeSlug('---multiple---hyphens---'), 'multiple-hyphens');
  });
});

test('FilesystemContentRepository CRUD and Idempotency', async (t) => {
  const tempDir = await createTempContentRoot();
  const repo = new FilesystemContentRepository({ contentRoot: tempDir });

  const sampleInput: StoredArticleInput = {
    pillar: 'tech-ai',
    slug: 'local-ai-hardware-guide',
    content: sampleBody,
    frontmatter: {
      title: 'Local AI Hardware Guide',
      description: 'A comprehensive review of quiet, high-efficiency local machine learning setups.',
      pubDate: '2026-09-09',
      format: 'guide',
      primaryIntent: 'informational',
      riskLevel: 'low',
      tags: ['ai', 'hardware'],
    },
  };

  try {
    await t.test('create: successfully creates and writes article file', async () => {
      const result = await repo.create(sampleInput);

      assert.strictEqual(result.status, 'STORED');
      assert.strictEqual(result.operation, 'create');
      assert.strictEqual(result.version, 1);
      assert.strictEqual(result.pillar, 'tech-ai');
      assert.strictEqual(result.slug, 'local-ai-hardware-guide');
      assert.ok(result.path);

      // Verify file exists on disk
      const exists = await repo.exists('tech-ai', 'local-ai-hardware-guide');
      assert.strictEqual(exists, true);
    });

    await t.test('create idempotency: refuses duplicate create for existing article', async () => {
      const duplicateResult = await repo.create(sampleInput);

      assert.strictEqual(duplicateResult.status, 'EXISTS');
      assert.strictEqual(duplicateResult.operation, 'create');
      assert.strictEqual(duplicateResult.error?.code, 'ARTICLE_EXISTS');
    });

    await t.test('get: retrieves persisted article accurately', async () => {
      const article = await repo.get('tech-ai', 'local-ai-hardware-guide');

      assert.ok(article);
      assert.strictEqual(article?.frontmatter.title, 'Local AI Hardware Guide');
      assert.strictEqual(article?.frontmatter.version, 1);
      assert.strictEqual(article?.frontmatter.lifecycleStatus, 'STORED');
      assert.strictEqual(article?.content, sampleBody);
    });

    await t.test('get: returns null for non-existent article', async () => {
      const missing = await repo.get('life', 'non-existent-article');
      assert.strictEqual(missing, null);
    });

    await t.test('exists: returns false for missing article', async () => {
      const exists = await repo.exists('money', 'no-such-slug');
      assert.strictEqual(exists, false);
    });

    await t.test('update: fails if article does not exist', async () => {
      const updateMissingResult = await repo.update({
        pillar: 'travel',
        slug: 'unrecorded-article',
        content: 'New content',
        frontmatter: {
          title: 'Unrecorded Article',
          description: 'Desc',
        },
      });

      assert.strictEqual(updateMissingResult.status, 'NOT_FOUND');
      assert.strictEqual(updateMissingResult.operation, 'update');
    });

    await t.test('update: updates existing article and increments version to 2', async () => {
      const updatedBody = sampleBody + '\n\n## 3. Updated Section\nAdded fresh insights.';
      const updateResult = await repo.update({
        pillar: 'tech-ai',
        slug: 'local-ai-hardware-guide',
        content: updatedBody,
        frontmatter: {
          title: 'Local AI Hardware Guide (Updated 2026)',
          description: 'Updated description for modern hardware.',
        },
      });

      assert.strictEqual(updateResult.status, 'UPDATED');
      assert.strictEqual(updateResult.version, 2);
      assert.strictEqual(updateResult.article?.frontmatter.version, 2);
      assert.strictEqual(updateResult.article?.frontmatter.title, 'Local AI Hardware Guide (Updated 2026)');

      // Verify by retrieving again
      const retrieved = await repo.get('tech-ai', 'local-ai-hardware-guide');
      assert.ok(retrieved);
      assert.strictEqual(retrieved?.frontmatter.version, 2);
      assert.strictEqual(retrieved?.frontmatter.title, 'Local AI Hardware Guide (Updated 2026)');
      assert.ok(retrieved?.content.includes('## 3. Updated Section'));
    });

    await t.test('update: increments version to 3 on subsequent update', async () => {
      const updateResult = await repo.update({
        pillar: 'tech-ai',
        slug: 'local-ai-hardware-guide',
        content: sampleBody,
        frontmatter: {
          title: 'Local AI Hardware Guide (Revision 3)',
          description: 'Revision 3 description.',
        },
      });

      assert.strictEqual(updateResult.status, 'UPDATED');
      assert.strictEqual(updateResult.version, 3);
    });

    await t.test('list: lists stored articles filtered by pillar and all pillars', async () => {
      // Add another article in a different pillar
      await repo.create({
        pillar: 'money',
        slug: 'passive-index-fund-allocation',
        content: 'Index funds guide...',
        frontmatter: {
          title: 'Passive Index Fund Allocation',
          description: 'A long-term guide to core index portfolio structuring.',
          pubDate: '2026-09-10',
          format: 'guide',
          primaryIntent: 'informational',
          riskLevel: 'low',
        },
      });

      const techArticles = await repo.list('tech-ai');
      assert.strictEqual(techArticles.length, 1);
      assert.strictEqual(techArticles[0].slug, 'local-ai-hardware-guide');

      const moneyArticles = await repo.list('money');
      assert.strictEqual(moneyArticles.length, 1);
      assert.strictEqual(moneyArticles[0].slug, 'passive-index-fund-allocation');

      const allArticles = await repo.list();
      assert.strictEqual(allArticles.length, 2);
      // Sorted by pubDate desc: money article (2026-09-10) should come first
      assert.strictEqual(allArticles[0].slug, 'passive-index-fund-allocation');
      assert.strictEqual(allArticles[1].slug, 'local-ai-hardware-guide');
    });

    await t.test('remove: removes article safely', async () => {
      const removeResult = await repo.remove('money', 'passive-index-fund-allocation');
      assert.strictEqual(removeResult.status, 'REMOVED');

      const exists = await repo.exists('money', 'passive-index-fund-allocation');
      assert.strictEqual(exists, false);

      const getResult = await repo.get('money', 'passive-index-fund-allocation');
      assert.strictEqual(getResult, null);
    });
  } finally {
    await cleanupTempContentRoot(tempDir);
  }
});

test('Publishing V1 Integration Adapter', async (t) => {
  const tempDir = await createTempContentRoot();
  const repo = new FilesystemContentRepository({ contentRoot: tempDir });

  const mockPublishPackage: PublishPackage = {
    id: 'pub-lm-tech-001-mindful-hardware-2026',
    topicId: 'lm-tech-001',
    slug: 'mindful-hardware-2026',
    title: 'Mindful Hardware Architecture in 2026',
    description: 'An editorial guide exploring modern minimal computing setups and energy-efficient chips.',
    excerpt: 'Designing a calm, intentional workstation for modern creators.',
    content: sampleBody,
    pillar: 'tech-ai',
    format: 'guide',
    audience: 'Digital creators and knowledge workers',
    primaryIntent: 'informational',
    secondaryIntent: 'commercial',
    riskLevel: 'low',
    tags: ['hardware', 'workspaces', 'ai'],
    sources: [{ name: 'LifeMode Editorial Standards', url: 'https://lifemode.life/editorial-standards' }],
    internalLinks: ['/tech-ai'],
    affiliateIntent: false,
    faq: [{ question: 'What is mindful hardware?', answer: 'Focusing on energy efficiency and silence.' }],
    socialHooks: ['Is your workstation draining your focus?'],
    imageMetadata: {
      url: '/images/mindful-hardware.webp',
      alt: 'Minimalist desk setup',
      visualTheme: 'calm workspace',
    },
    publicationMetadata: {
      targetDate: '2026-09-09',
      version: 1,
      author: 'LifeMode Editorial',
    },
    qualitySummary: {
      overallScore: 92,
      safetyScore: 95,
      factualityScore: 90,
      reviewedAt: '2026-09-09T12:00:00.000Z',
      reviewer: 'ai-quality-review-v1',
      decision: 'PASS',
    },
  };

  try {
    await t.test('converts PublishPackage into StoredArticleInput', () => {
      const input = publishPackageToStoredArticleInput(mockPublishPackage);

      assert.strictEqual(input.pillar, 'tech-ai');
      assert.strictEqual(input.slug, 'mindful-hardware-2026');
      assert.strictEqual(input.topicId, 'lm-tech-001');
      assert.strictEqual(input.frontmatter.title, 'Mindful Hardware Architecture in 2026');
      assert.strictEqual(input.frontmatter.lifecycleStatus, 'STORED');
      assert.strictEqual(input.frontmatter.version, 1);
    });

    await t.test('storePublishPackage persists article to repository', async () => {
      const storageResult = await storePublishPackage(repo, mockPublishPackage);

      assert.strictEqual(storageResult.status, 'STORED');
      assert.strictEqual(storageResult.operation, 'create');
      assert.strictEqual(storageResult.version, 1);

      const stored = await repo.get('tech-ai', 'mindful-hardware-2026');
      assert.ok(stored);
      assert.strictEqual(stored?.frontmatter.title, 'Mindful Hardware Architecture in 2026');
      assert.strictEqual(stored?.frontmatter.lifecycleStatus, 'STORED'); // Explicitly stored, not externally published
    });

    await t.test('storePublishingResult rejects blocked or ineligible result', async () => {
      const blockedResult: PublishingResult = {
        status: 'BLOCKED',
        slug: 'blocked-article',
        dryRun: true,
        provider: 'fixture',
        gateResult: {
          eligible: false,
          reasons: ['Safety score below required minimum.'],
          warnings: [],
          evaluatedAt: '2026-09-09T12:00:00.000Z',
        },
        error: {
          code: 'GATE_BLOCKED',
          message: 'Quality gate blocked publication.',
        },
      };

      const result = await storePublishingResult(repo, blockedResult);
      assert.strictEqual(result.status, 'INVALID');
      assert.strictEqual(result.error?.code, 'GATE_BLOCKED');
    });

    await t.test('storePublishingResult stores eligible publishing result', async () => {
      const eligiblePackage: PublishPackage = {
        ...mockPublishPackage,
        slug: 'eligible-article',
      };

      const eligibleResult: PublishingResult = {
        status: 'READY',
        publicationId: 'pub-test-01',
        slug: 'eligible-article',
        dryRun: true,
        provider: 'fixture',
        publishPackage: eligiblePackage,
        gateResult: {
          eligible: true,
          reasons: [],
          warnings: [],
          evaluatedAt: '2026-09-09T12:00:00.000Z',
        },
      };

      const result = await storePublishingResult(repo, eligibleResult);
      assert.strictEqual(result.status, 'STORED');
      assert.strictEqual(result.slug, 'eligible-article');
    });
  } finally {
    await cleanupTempContentRoot(tempDir);
  }
});
