import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FORMULAIC_TITLE_PATTERNS,
  GENERIC_EXCERPT_PATTERNS,
  validateTitle,
  validateDescription,
} from '../src/lib/editorial/quality.ts';
import {
  calculateRemainingImageCapacity,
  selectBackfillCandidates,
  runImageBackfill,
} from '../src/lib/editorial/images/backfill.ts';
import {
  FilesystemContentRepository,
  EditorialImageCostGuard,
  InMemoryCostGuardStore,
  type StoredArticle,
  type IEditorialImageProvider,
  type EditorialImageResult,
  type EditorialImageGenerationInput,
} from '../src/lib/editorial/index.ts';
import {
  EXISTING_TITLE_REPLACEMENTS,
  auditAndMigrateTitles,
  findEmptyTopics,
  runMaintenanceBackfill,
  formatMaintenanceSummary,
} from '../src/lib/editorial/maintenance/index.ts';
import type { ISocialAssetStorageProvider, AssetUploadRequest } from '../src/lib/social/images/storage/contracts.ts';
import { SITE_CONFIG, PILLARS } from '../src/config/site.ts';

// Mock 1x1 PNG Buffer
const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_PNG_BUFFER = Buffer.from(FIXTURE_PNG_BASE64, 'base64');

class MockBackfillImageProvider implements IEditorialImageProvider {
  readonly name = 'Mock Backfill Image Provider';
  readonly providerId = 'mock-backfill';
  public callCount = 0;
  public shouldSucceed: boolean;

  constructor(shouldSucceed = true) {
    this.shouldSucceed = shouldSucceed;
  }

  isConfigured(): boolean {
    return true;
  }

  async generate(_input: EditorialImageGenerationInput): Promise<EditorialImageResult> {
    this.callCount++;
    if (!this.shouldSucceed) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.name,
        model: 'mock',
        durationMs: 1,
        error: 'Simulated generation failure',
      };
    }
    return {
      success: true,
      status: 'SUCCESS',
      provider: this.name,
      model: 'mock',
      durationMs: 1,
      imageBuffer: VALID_PNG_BUFFER,
      mimeType: 'image/png',
      width: 1200,
      height: 630,
    };
  }
}

class MockBackfillStorageProvider implements ISocialAssetStorageProvider {
  readonly name = 'Mock Backfill Storage Provider';
  public uploadCalls: AssetUploadRequest[] = [];

  isConfigured(): boolean {
    return true;
  }

  getObjectKey(topicId: string, assetHash: string): string {
    return `editorial/${topicId}/${assetHash}.jpg`;
  }

  async uploadAsset(request: AssetUploadRequest) {
    this.uploadCalls.push(request);
    return {
      success: true,
      status: 'SUCCESS' as const,
      provider: this.name,
      publicUrl: `https://assets.lifemode.life/editorial/${request.assetHash}.jpg`,
      objectKey: request.customKey || `editorial/${request.topicId}/${request.assetHash}.jpg`,
      sizeBytes: request.buffer.length,
      contentType: request.mimeType,
      assetHash: request.assetHash,
      durationMs: 1,
    };
  }
}

test('Title Quality: Rejects formulaic and AI-slop title patterns', () => {
  const badTitles = [
    'Downdetector: A Modern Guide to Trends, Signals & Zeitgeist',
    'Laguna Beach: A Modern Guide to Destinations & Global Journeys',
    'Morning Routine: A Comprehensive Guide to Wellness & Focus',
    'Smart Home Tech: The Ultimate Guide to Modern Automation',
    'Desk Setup: A Complete Guide to Ergonomic Living',
    'Everything You Need to Know About Mechanical Keyboards',
    'All You Need to Know: Mastering Espresso at Home',
    'Why Mechanical Keyboards are Essential in 2026',
    'Coffee Brewing: A Definitive Guide for Enthusiasts',
  ];

  for (const title of badTitles) {
    const res = validateTitle(title);
    assert.strictEqual(
      res.valid,
      false,
      `Expected title to be rejected: "${title}"`
    );
    assert.ok(
      res.errors.some((e) => e.includes('formula') || e.includes('generic') || e.includes('cliché')),
      `Expected formulaic error for: "${title}"`
    );
  }
});

test('Title Quality: Accepts concrete, direct human titles', () => {
  const goodTitles = [
    'How Downdetector helps you spot outages',
    'Downdetector: what it tells you when a service goes down',
    'Laguna Beach beyond the postcard',
    'How to spend a day in Laguna Beach',
    'Five small updates that make a rental feel permanent',
    'The quiet utility of a physical notebook',
    'What happens when you switch to fixed-schedule grocery deliveries',
  ];

  for (const title of goodTitles) {
    const res = validateTitle(title);
    assert.strictEqual(
      res.valid,
      true,
      `Expected clean title to pass validation: "${title}" (Errors: ${res.errors.join(', ')})`
    );
  }
});

test('Excerpt Quality: Rejects boilerplate and corporate/AI filler patterns', () => {
  const badExcerpts = [
    'Discover our editorial guide on how to brew better morning coffee.',
    'Explore key principles shaping modern interior design and quiet living.',
    'Curated perspectives for modern living and everyday productivity.',
    'In today\'s fast-paced world, staying organized requires intentional habits.',
    'When it comes to desk setups, ergonomic support is critical.',
    'It is important to understand the fundamental mechanics of sleep hygiene.',
    'This framework leverages seamless tools to elevate your daily routine.',
  ];

  for (const excerpt of badExcerpts) {
    const res = validateDescription(excerpt);
    assert.strictEqual(
      res.valid,
      false,
      `Expected excerpt to be rejected: "${excerpt}"`
    );
    assert.ok(
      res.errors.some((e) => e.includes('boilerplate') || e.includes('filler') || e.includes('generic')),
      `Expected boilerplate error for: "${excerpt}"`
    );
  }
});

test('Excerpt Quality: Accepts concise, informative human descriptions', () => {
  const goodExcerpts = [
    'Downed services create sudden ripple effects across remote work. Here is how status monitors track real disruptions before official notices go out.',
    'A practical walking route along the southern cove, with three dependable coffee stops and practical parking advice.',
    'Simple changes to lighting and shelving that add storage without damaging painted drywall.',
  ];

  for (const excerpt of goodExcerpts) {
    const res = validateDescription(excerpt);
    assert.strictEqual(
      res.valid,
      true,
      `Expected excerpt to pass validation: "${excerpt}" (Errors: ${res.errors.join(', ')})`
    );
  }
});

test('Public Terminology: Site configuration uses clean reader-facing language', () => {
  assert.strictEqual(SITE_CONFIG.title, 'LifeMode — Ideas for living well now');
  assert.strictEqual(SITE_CONFIG.slogan, 'Ideas for living well now');
  assert.ok(!SITE_CONFIG.description.toLowerCase().includes('editorial pillars'));
  assert.ok(!SITE_CONFIG.description.toLowerCase().includes('contemporary editorial journal'));
  assert.ok(!SITE_CONFIG.description.toLowerCase().includes('lead editorial dispatch'));

  // Ensure pillar public descriptions do not contain self-referential jargon
  for (const pillar of Object.values(PILLARS)) {
    const desc = pillar.description.toLowerCase();
    assert.ok(!desc.includes('publishing architecture'), `Pillar ${pillar.slug} contains jargon`);
    assert.ok(!desc.includes('editorial pillar'), `Pillar ${pillar.slug} contains jargon`);
  }
});

test('Image Backfill: calculateRemainingImageCapacity enforces daily quota arithmetic', () => {
  // 5 daily limit scenarios:
  // 3 new articles + 3 new images -> 2 backfill capacity
  assert.strictEqual(calculateRemainingImageCapacity(5, 3), 2);
  // 2 new articles + 2 new images -> 3 backfill capacity
  assert.strictEqual(calculateRemainingImageCapacity(5, 2), 3);
  // 1 new article + 1 new image -> 4 backfill capacity
  assert.strictEqual(calculateRemainingImageCapacity(5, 1), 4);
  // 0 new articles -> 5 backfill capacity
  assert.strictEqual(calculateRemainingImageCapacity(5, 0), 5);
  // 5 new articles + 5 new images -> 0 backfill capacity
  assert.strictEqual(calculateRemainingImageCapacity(5, 5), 0);
  // 6 new articles + 6 new images -> 0 capacity (no negative capacity)
  assert.strictEqual(calculateRemainingImageCapacity(5, 6), 0);
});

test('Image Backfill: selectBackfillCandidates filters and prioritizes correctly', () => {
  const sampleArticles: StoredArticle[] = [
    {
      pillar: 'tech-ai',
      slug: 'article-with-image',
      identity: { pillar: 'tech-ai', slug: 'article-with-image' },
      filePath: '/content/tech-ai/article-with-image.md',
      content: 'Content...',
      frontmatter: {
        title: 'Has Image',
        description: 'Already has an image in frontmatter.',
        pubDate: '2026-03-01T00:00:00Z',
        author: 'LifeMode Editorial',
        tags: [],
        featured: false,
        draft: false,
        format: 'standard',
        topicId: 't1',
        audience: 'general',
        primaryIntent: 'informational',
        affiliateIntent: false,
        riskLevel: 'low',
        sources: [],
        version: 1,
        lifecycleStatus: 'PUBLISHED',
        image: 'https://assets.lifemode.life/editorial/tech-ai/image.jpg',
      },
    },
    {
      pillar: 'life',
      slug: 'older-article-no-image',
      identity: { pillar: 'life', slug: 'older-article-no-image' },
      filePath: '/content/life/older-article-no-image.md',
      content: 'Content...',
      frontmatter: {
        title: 'Older Article',
        description: 'Published in January without an image.',
        pubDate: '2026-01-15T00:00:00Z',
        author: 'LifeMode Editorial',
        tags: [],
        featured: false,
        draft: false,
        format: 'standard',
        topicId: 't2',
        audience: 'general',
        primaryIntent: 'informational',
        affiliateIntent: false,
        riskLevel: 'low',
        sources: [],
        version: 1,
        lifecycleStatus: 'PUBLISHED',
      },
    },
    {
      pillar: 'wellbeing',
      slug: 'newer-article-no-image',
      identity: { pillar: 'wellbeing', slug: 'newer-article-no-image' },
      filePath: '/content/wellbeing/newer-article-no-image.md',
      content: 'Content...',
      frontmatter: {
        title: 'Newer Article',
        description: 'Published in March without an image.',
        pubDate: '2026-03-10T00:00:00Z',
        author: 'LifeMode Editorial',
        tags: [],
        featured: false,
        draft: false,
        format: 'standard',
        topicId: 't3',
        audience: 'general',
        primaryIntent: 'informational',
        affiliateIntent: false,
        riskLevel: 'low',
        sources: [],
        version: 1,
        lifecycleStatus: 'PUBLISHED',
      },
    },
    {
      pillar: 'discover',
      slug: 'featured-article-no-image',
      identity: { pillar: 'discover', slug: 'featured-article-no-image' },
      filePath: '/content/discover/featured-article-no-image.md',
      content: 'Content...',
      frontmatter: {
        title: 'Featured Article',
        description: 'Featured article without an image.',
        pubDate: '2026-02-01T00:00:00Z',
        featured: true,
        author: 'LifeMode Editorial',
        tags: [],
        draft: false,
        format: 'standard',
        topicId: 't4',
        audience: 'general',
        primaryIntent: 'informational',
        affiliateIntent: false,
        riskLevel: 'low',
        sources: [],
        version: 1,
        lifecycleStatus: 'PUBLISHED',
      },
    },
    {
      pillar: 'travel',
      slug: 'draft-article-no-image',
      identity: { pillar: 'travel', slug: 'draft-article-no-image' },
      filePath: '/content/travel/draft-article-no-image.md',
      content: 'Content...',
      frontmatter: {
        title: 'Draft Article',
        description: 'Draft article.',
        pubDate: '2026-03-12T00:00:00Z',
        draft: true,
        author: 'LifeMode Editorial',
        tags: [],
        featured: false,
        format: 'standard',
        topicId: 't5',
        audience: 'general',
        primaryIntent: 'informational',
        affiliateIntent: false,
        riskLevel: 'low',
        sources: [],
        version: 1,
        lifecycleStatus: 'DRAFT',
      },
    },
  ];

  const candidates = selectBackfillCandidates(sampleArticles);

  // Drafts and articles with images must be filtered out
  assert.strictEqual(candidates.length, 3);

  // Priority order:
  // 1. Featured article first
  assert.strictEqual(candidates[0].slug, 'featured-article-no-image');
  // 2. Newer article next
  assert.strictEqual(candidates[1].slug, 'newer-article-no-image');
  // 3. Older article last
  assert.strictEqual(candidates[2].slug, 'older-article-no-image');
});

test('Image Backfill: runImageBackfill generates images and updates article repository', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-backfill-test-'));
  const contentRoot = path.join(tempDir, 'content');
  const repository = new FilesystemContentRepository({ contentRoot });

  // Create two articles without images
  await repository.create({
    pillar: 'tech-ai',
    slug: 'keyboard-guide',
    content: '## Keyboard Guide\n\nA deep dive into switch mechanisms.',
    frontmatter: {
      title: 'How mechanical switch types affect daily typing',
      description: 'Tactile, linear, and clicky switches evaluated for sustained typing comfort.',
      pubDate: '2026-03-01T00:00:00Z',
      featured: true,
    },
  });

  await repository.create({
    pillar: 'life',
    slug: 'lighting-setup',
    content: '## Lighting Setup\n\nPractical layered lighting tips.',
    frontmatter: {
      title: 'Layered lighting for home workspaces',
      description: 'Combining task, ambient, and accent lights to reduce evening eye strain.',
      pubDate: '2026-02-15T00:00:00Z',
    },
  });

  const mockProvider = new MockBackfillImageProvider(true);
  const mockStorage = new MockBackfillStorageProvider();
  const costStore = new InMemoryCostGuardStore();
  const costGuard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 100,
    store: costStore,
  });

  // Scenario: 3 new article images already generated today -> 2 backfill capacity
  const backfillResult = await runImageBackfill({
    contentRepository: repository,
    newImagesGeneratedCount: 3,
    dailyImageLimit: 5,
    imageConfig: {
      enabled: true,
      strategy: 'cloudflare',
      cloudflare: { model: 'mock', configured: true },
      bfl: { model: 'mock', configured: false },
      costGuard: {
        enabled: true,
        dailyLimit: 5,
        monthlyLimit: 100,
      },
      maxRetries: 1,
      targetWidth: 1200,
      targetHeight: 630,
      aspectRatio: '16:9',
    },
    imagePrimaryProvider: mockProvider,
    imageStorageProvider: mockStorage,
    costGuard,
  });

  assert.strictEqual(backfillResult.eligibleCount, 2);
  assert.strictEqual(backfillResult.capacity, 2);
  assert.strictEqual(backfillResult.succeededCount, 2);
  assert.strictEqual(mockProvider.callCount, 2);
  assert.strictEqual(mockStorage.uploadCalls.length, 2);

  // Verify updated frontmatter in repository
  const updatedArticle1 = await repository.get('tech-ai', 'keyboard-guide');
  assert.ok(updatedArticle1);
  assert.ok(updatedArticle1.frontmatter.image);
  assert.ok(updatedArticle1.frontmatter.image.startsWith('https://assets.lifemode.life/editorial/'));
  assert.strictEqual(updatedArticle1.frontmatter.featured, true);
  assert.strictEqual(updatedArticle1.content, '## Keyboard Guide\n\nA deep dive into switch mechanisms.');

  const updatedArticle2 = await repository.get('life', 'lighting-setup');
  assert.ok(updatedArticle2);
  assert.ok(updatedArticle2.frontmatter.image);

  // Cleanup temp dir
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('Image Backfill: Skips generation when daily limit is exhausted by new articles', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-backfill-quota-'));
  const contentRoot = path.join(tempDir, 'content');
  const repository = new FilesystemContentRepository({ contentRoot });

  await repository.create({
    pillar: 'money',
    slug: 'emergency-fund',
    content: '## Emergency Fund\n\nHigh yield savings setup.',
    frontmatter: {
      title: 'Where to hold an emergency cash reserve',
      description: 'Comparing high-yield savings accounts and money market funds for short-term liquidity.',
      pubDate: '2026-03-05T00:00:00Z',
    },
  });

  const mockProvider = new MockBackfillImageProvider(true);
  const mockStorage = new MockBackfillStorageProvider();
  const costStore = new InMemoryCostGuardStore();
  const costGuard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 100,
    store: costStore,
  });

  // Scenario: 5 new article images generated -> 0 backfill capacity
  const backfillResult = await runImageBackfill({
    contentRepository: repository,
    newImagesGeneratedCount: 5,
    dailyImageLimit: 5,
    imageConfig: {
      enabled: true,
      strategy: 'cloudflare',
      cloudflare: { model: 'mock', configured: true },
      bfl: { model: 'mock', configured: false },
      costGuard: {
        enabled: true,
        dailyLimit: 5,
        monthlyLimit: 100,
      },
      maxRetries: 1,
      targetWidth: 1200,
      targetHeight: 630,
      aspectRatio: '16:9',
    },
    imagePrimaryProvider: mockProvider,
    imageStorageProvider: mockStorage,
    costGuard,
  });

  assert.strictEqual(backfillResult.eligibleCount, 1);
  assert.strictEqual(backfillResult.capacity, 0);
  assert.strictEqual(backfillResult.processedCount, 0);
  assert.strictEqual(backfillResult.succeededCount, 0);
  assert.strictEqual(mockProvider.callCount, 0);
  assert.strictEqual(mockStorage.uploadCalls.length, 0);

  // Article remains untouched without image
  const article = await repository.get('money', 'emergency-fund');
  assert.strictEqual(article?.frontmatter.image, undefined);

  // Cleanup temp dir
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('Maintenance: All curated title replacements pass quality validation', () => {
  for (const [articleId, replacementTitle] of Object.entries(EXISTING_TITLE_REPLACEMENTS)) {
    const res = validateTitle(replacementTitle);
    assert.strictEqual(
      res.valid,
      true,
      `Replacement title for "${articleId}" failed validation: "${replacementTitle}". Errors: ${res.errors.join(', ')}`
    );
    assert.ok(
      !FORMULAIC_TITLE_PATTERNS.some((p) => p.test(replacementTitle)),
      `Replacement title contains formulaic pattern: "${replacementTitle}"`
    );
  }
});

test('Maintenance: auditAndMigrateTitles discovers formulaic titles and migrates in non-dry-run mode', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-title-migration-test-'));
  const contentRoot = path.join(tempDir, 'content');
  const repo = new FilesystemContentRepository({ contentRoot });

  // Create article with formulaic title
  await repo.create({
    pillar: 'wellbeing',
    slug: 'morning-sunlight-and-adenosine-clearing-a-simple-protocol-fo',
    content: '## Morning Protocol\n\nDirect light clears adenosine receptors...',
    frontmatter: {
      title: 'Morning Sunlight and Adenosine Clearing: A Simple Protocol for Focus: A Modern Guide to Health, Vitality & Mindset',
      description: 'Morning sunlight exposure clears adenosine and sets circadian rhythms.',
      pubDate: '2026-03-01T00:00:00Z',
    },
  });

  // Dry-run should report but not write
  const dryReport = await auditAndMigrateTitles({ contentRoot, dryRun: true });
  assert.strictEqual(dryReport.totalScanned, 1);
  assert.strictEqual(dryReport.formulaicCount, 1);
  assert.strictEqual(dryReport.correctedCount, 0);

  const untouched = await repo.get('wellbeing', 'morning-sunlight-and-adenosine-clearing-a-simple-protocol-fo');
  assert.ok(untouched?.frontmatter.title.includes('A Modern Guide'));

  // Live run should apply the curated title
  const liveReport = await auditAndMigrateTitles({ contentRoot, dryRun: false });
  assert.strictEqual(liveReport.correctedCount, 1);

  const migrated = await repo.get('wellbeing', 'morning-sunlight-and-adenosine-clearing-a-simple-protocol-fo');
  assert.strictEqual(
    migrated?.frontmatter.title,
    'Morning sunlight and adenosine: a simple protocol for morning clarity'
  );
  assert.strictEqual(migrated?.content, '## Morning Protocol\n\nDirect light clears adenosine receptors...');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('Maintenance: findEmptyTopics correctly identifies empty topics without articles', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-empty-topics-test-'));
  const contentRoot = path.join(tempDir, 'content');
  const repo = new FilesystemContentRepository({ contentRoot });

  // Add articles for wellbeing and life only
  await repo.create({
    pillar: 'wellbeing',
    slug: 'sleep-hygiene',
    content: 'Body',
    frontmatter: { title: 'Sleep Hygiene Basics', description: 'Good sleep advice for modern people.' },
  });
  await repo.create({
    pillar: 'life',
    slug: 'desk-organization',
    content: 'Body',
    frontmatter: { title: 'Organizing a Small Desk', description: 'Practical tips for clean desk spaces.' },
  });

  const report = await findEmptyTopics({ contentRoot });
  assert.ok(report.emptyPillars.includes('money'));
  assert.ok(report.emptyPillars.includes('travel'));
  assert.ok(report.emptyPillars.includes('tech-ai'));
  assert.ok(report.emptyPillars.includes('discover'));
  assert.ok(report.emptyPillars.includes('now'));
  assert.ok(!report.emptyPillars.includes('wellbeing'));
  assert.ok(!report.emptyPillars.includes('life'));

  // Money planned topic is high-yield cash buffer
  const moneyPlan = report.plannedArticles.find((p) => p.pillar === 'money');
  assert.ok(moneyPlan);
  assert.strictEqual(moneyPlan?.slug, 'high-yield-cash-buffer-emergency-savings');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('Maintenance: canGenerateMaintenanceImage allows up to monthly limit even if daily limit is reached', async () => {
  const store = new InMemoryCostGuardStore();
  const testDate = new Date('2026-09-12T10:00:00.000Z');

  // Pre-seed 5 generations today (daily limit reached)
  await store.increment(`lifemode:image-count:2026-09-12`, 5);
  await store.increment(`lifemode:image-count:2026-09`, 5);

  const guard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 120,
    store,
  });

  // Normal daily check should block
  const dailyDecision = await guard.canGenerateImage(testDate);
  assert.strictEqual(dailyDecision.allowed, false);
  assert.strictEqual(dailyDecision.reason, 'DAILY_LIMIT_EXCEEDED');

  // Maintenance mode check should allow using remaining monthly capacity (120 - 5 = 115)
  const maintenanceDecision = await guard.canGenerateMaintenanceImage(testDate);
  assert.strictEqual(maintenanceDecision.allowed, true);
  assert.strictEqual(maintenanceDecision.monthlyUsage, 5);
  assert.strictEqual(maintenanceDecision.monthlyLimit, 120);

  // If monthly limit reached, maintenance check blocks
  await store.increment(`lifemode:image-count:2026-09`, 115); // Now 120
  const maxedDecision = await guard.canGenerateMaintenanceImage(testDate);
  assert.strictEqual(maxedDecision.allowed, false);
  assert.strictEqual(maxedDecision.reason, 'MONTHLY_LIMIT_EXCEEDED');
});

test('Maintenance: runMaintenanceBackfill in dry-run mode summarizes actions without mutating content', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-runner-test-'));
  const contentRoot = path.join(tempDir, 'content');
  const repo = new FilesystemContentRepository({ contentRoot });

  await repo.create({
    pillar: 'now',
    slug: 'downdetector-guide-2026',
    content: '## Downdetector\n\nHow outages are tracked.',
    frontmatter: {
      title: 'Downdetector: A Modern Guide to Trends, Signals & Zeitgeist',
      description: 'How Downdetector tracks service outages before status pages admit them.',
      pubDate: '2026-03-01T00:00:00Z',
    },
  });

  const costStore = new InMemoryCostGuardStore();
  const costGuard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 120,
    store: costStore,
  });

  const report = await runMaintenanceBackfill({
    contentRoot,
    dryRun: true,
    providerMode: 'fixture',
    costGuard,
  });

  assert.strictEqual(report.dryRun, true);
  assert.strictEqual(report.titles.formulaicCount, 1);
  assert.strictEqual(report.titles.correctedCount, 0); // Not modified in dry run
  assert.strictEqual(report.imagesGenerated, 0);
  assert.ok(report.summary.includes('DRY-RUN'));
  assert.ok(report.summary.includes('Downdetector'));

  // Content remains untouched
  const article = await repo.get('now', 'downdetector-guide-2026');
  assert.ok(article?.frontmatter.title.includes('A Modern Guide'));

  await fs.rm(tempDir, { recursive: true, force: true });
});

