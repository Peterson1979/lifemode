import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  runDailyEditorialAutomation,
  FilesystemContentRepository,
  AstroGitPublisher,
  type IDiscoveryAdapter,
  type DiscoveryResult,
  type IEditorialImageProvider,
  type EditorialImageResult,
  type EditorialImageGenerationInput,
  EditorialImageCostGuard,
  InMemoryCostGuardStore,
} from '../src/lib/editorial/index.ts';
import type { ISocialAssetStorageProvider, AssetUploadRequest, AssetUploadResult } from '../src/lib/social/images/storage/contracts.ts';

const execFileAsync = promisify(execFile);

// Valid 1x1 PNG Buffer
const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_PNG_BUFFER = Buffer.from(FIXTURE_PNG_BASE64, 'base64');

// Mock Storage Provider
class MockStorageProvider implements ISocialAssetStorageProvider {
  readonly name = 'Mock R2 Storage Provider';
  public uploadCalls: AssetUploadRequest[] = [];
  public shouldSucceed: boolean;
  public returnPublicUrl: string;

  constructor(shouldSucceed = true, returnPublicUrl = 'https://assets.lifemode.life/editorial/test/sample.jpg') {
    this.shouldSucceed = shouldSucceed;
    this.returnPublicUrl = returnPublicUrl;
  }

  isConfigured(): boolean {
    return true;
  }

  getObjectKey(topicId: string, assetHash: string, _mimeType: string): string {
    return `editorial/${topicId}/${assetHash}.jpg`;
  }

  async uploadAsset(request: AssetUploadRequest): Promise<AssetUploadResult> {
    this.uploadCalls.push(request);
    const startTime = Date.now();

    if (!this.shouldSucceed) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.name,
        error: 'Simulated R2 storage upload error.',
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      status: 'SUCCESS',
      publicUrl: this.returnPublicUrl,
      objectKey: request.customKey || `editorial/${request.topicId}/${request.assetHash}.jpg`,
      contentType: request.mimeType,
      sizeBytes: request.buffer.length,
      assetHash: request.assetHash,
      provider: this.name,
      durationMs: Date.now() - startTime,
    };
  }
}

// Mock Image Provider
class MockImageProvider implements IEditorialImageProvider {
  public generateCalls: EditorialImageGenerationInput[] = [];
  public shouldSucceed: boolean;
  public name: string;
  public providerId: string;

  constructor(name = 'Mock Image Provider', providerId = 'mock-provider', shouldSucceed = true) {
    this.name = name;
    this.providerId = providerId;
    this.shouldSucceed = shouldSucceed;
  }

  isConfigured(): boolean {
    return true;
  }

  async generate(input: EditorialImageGenerationInput): Promise<EditorialImageResult> {
    this.generateCalls.push(input);
    const startTime = Date.now();

    if (!this.shouldSucceed) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerId,
        model: 'mock-model',
        error: 'Simulated image generation provider failure.',
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      status: 'SUCCESS',
      imageBuffer: VALID_PNG_BUFFER,
      mimeType: 'image/png',
      width: 1536,
      height: 864,
      provider: this.providerId,
      model: 'mock-model',
      durationMs: Date.now() - startTime,
    };
  }
}

// Mock Multi-topic Discovery Adapter
class MockTopicDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'FIXTURE' as const;
  readonly name = 'Mock Topic Discovery Adapter';
  private topics: Array<{ topic: string; pillar: any; score: number; searchVolume: string }>;

  constructor(topics: Array<{ topic: string; pillar: any; score: number; searchVolume: string }>) {
    this.topics = topics;
  }

  isConfigured(): boolean {
    return true;
  }

  async fetchSignals(): Promise<DiscoveryResult> {
    const signals = this.topics.map((t, idx) => ({
      source: 'FIXTURE' as const,
      sourceId: `mock-top-${idx + 1}`,
      rawQuery: t.topic,
      timestamp: new Date().toISOString(),
      category: t.pillar,
      sourceUrl: `https://example.com/topic-${idx + 1}`,
      metrics: {
        relativeInterest: t.score,
        searchVolume: 12000,
        visualPotentialScore: 90,
      },
      metadata: {
        mockIdx: idx + 1,
      },
    }));

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals,
      fetchedAt: new Date().toISOString(),
    };
  }
}

// Helper to create an isolated temporary Git and content repository
async function createTempWorkspace(): Promise<{
  repoDir: string;
  contentDir: string;
  cleanup: () => Promise<void>;
}> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-daily-test-'));
  const contentDir = path.join(repoDir, 'src', 'content');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'travel'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'life'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'money'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'wellbeing'), { recursive: true });

  await execFileAsync('git', ['init', '-b', 'master'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 'LifeMode Daily Tester'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 'daily-tester@lifemode.local'], { cwd: repoDir });

  const readmePath = path.join(repoDir, 'README.md');
  await fs.writeFile(readmePath, '# Test Repo', 'utf-8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoDir });
  await execFileAsync('git', ['commit', '-m', 'chore: initial commit'], { cwd: repoDir });

  const cleanup = async () => {
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  };

  return { repoDir, contentDir, cleanup };
}

test('1. Successful article + image generation: Generates article, creates master image, uploads to R2, and persists markdown with image frontmatter', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({ defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir } });
    const imageProvider = new MockImageProvider('Mock Cloudflare Workers AI', 'cloudflare-workers-ai', true);
    const storageProvider = new MockStorageProvider(true, 'https://assets.lifemode.life/editorial/travel/nordic-sauna.png');

    const discoveryAdapter = new MockTopicDiscoveryAdapter([
      {
        topic: 'Nordic Sauna Culture and Architecture',
        pillar: 'travel',
        score: 95,
        searchVolume: 'high',
      },
    ]);

    const result = await runDailyEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      providerMode: 'fixture',
      storagePath: path.join(repoDir, 'candidates.json'),
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      imageConfig: {
        enabled: true,
        strategy: 'cloudflare',
        cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: true },
        bfl: { model: 'flux-pro-1.1', configured: false },
        targetWidth: 1536,
        targetHeight: 864,
        aspectRatio: '16:9',
        maxRetries: 1,
        costGuard: {
          enabled: true,
          dailyLimit: 5,
          monthlyLimit: 120,
        },
      },
      imagePrimaryProvider: imageProvider,
      imageStorageProvider: storageProvider,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 1);
    assert.equal(result.failedCount, 0);

    // Verify structured daily article result
    assert.ok(result.articles && result.articles.length === 1);
    const article = result.articles[0];
    assert.equal(article.success, true);
    assert.equal(article.pillar, 'travel');
    assert.equal(article.imageGenerated, true);
    assert.equal(article.imageUrl, 'https://assets.lifemode.life/editorial/travel/nordic-sauna.png');
    assert.equal(article.imageProvider, 'cloudflare-workers-ai');
    assert.equal(article.skippedReason, undefined);

    // Verify image provider was called
    assert.equal(imageProvider.generateCalls.length, 1);

    // Verify markdown persistence in content directory
    const storedArticles = await repository.list();
    assert.equal(storedArticles.length, 1);
    const stored = storedArticles[0];
    assert.equal(stored.pillar, 'travel');
    assert.equal(stored.frontmatter.image, 'https://assets.lifemode.life/editorial/travel/nordic-sauna.png');
  } finally {
    await cleanup();
  }
});

test('2. Successful article without image: Publishes article cleanly when image generation is disabled', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({ defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir } });
    const imageProvider = new MockImageProvider('Mock Primary', 'cloudflare', true);
    const storageProvider = new MockStorageProvider(true);

    const discoveryAdapter = new MockTopicDiscoveryAdapter([
      {
        topic: 'Mindful Morning Routines for Focus',
        pillar: 'wellbeing',
        score: 92,
        searchVolume: 'high',
      },
    ]);

    const result = await runDailyEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      providerMode: 'fixture',
      storagePath: path.join(repoDir, 'candidates.json'),
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      imageConfig: {
        enabled: false, // Disabled
        strategy: 'cloudflare',
        cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: false },
        bfl: { model: 'flux-pro-1.1', configured: false },
        targetWidth: 1536,
        targetHeight: 864,
        aspectRatio: '16:9',
        maxRetries: 1,
        costGuard: {
          enabled: false,
          dailyLimit: 5,
          monthlyLimit: 120,
        },
      },
      imagePrimaryProvider: imageProvider,
      imageStorageProvider: storageProvider,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 1);

    // Verify structured article result indicates image skipped
    assert.ok(result.articles && result.articles.length === 1);
    const article = result.articles[0];
    assert.equal(article.success, true);
    assert.equal(article.imageGenerated, false);
    assert.equal(article.imageUrl, undefined);
    assert.equal(article.skippedReason, 'disabled');

    // Verify image provider was never called
    assert.equal(imageProvider.generateCalls.length, 0);

    // Verify article was still stored successfully
    const storedArticles = await repository.list();
    assert.equal(storedArticles.length, 1);
    assert.equal(storedArticles[0].frontmatter.image, undefined);
  } finally {
    await cleanup();
  }
});

test('3. Cost Guard blocking image: Reached quota blocks image generation and continues article publishing without failing', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({ defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir } });
    const imageProvider = new MockImageProvider('Mock Primary', 'cloudflare', true);
    const storageProvider = new MockStorageProvider(true);

    // Pre-populate in-memory cost guard store at daily limit
    const inMemoryStore = new InMemoryCostGuardStore();
    const costGuard = new EditorialImageCostGuard(
      {
        enabled: true,
        dailyLimit: 2,
        monthlyLimit: 10,
        store: inMemoryStore,
      }
    );

    // Artificially record 2 generations to reach limit
    await costGuard.recordGeneration();
    await costGuard.recordGeneration();

    const discoveryAdapter = new MockTopicDiscoveryAdapter([
      {
        topic: 'Architectural Heritage of Kyoto',
        pillar: 'travel',
        score: 94,
        searchVolume: 'high',
      },
    ]);

    const result = await runDailyEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      providerMode: 'fixture',
      storagePath: path.join(repoDir, 'candidates.json'),
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      costGuard,
      imageConfig: {
        enabled: true,
        strategy: 'cloudflare',
        cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: true },
        bfl: { model: 'flux-pro-1.1', configured: false },
        targetWidth: 1536,
        targetHeight: 864,
        aspectRatio: '16:9',
        maxRetries: 1,
        costGuard: {
          enabled: true,
          dailyLimit: 2,
          monthlyLimit: 10,
        },
      },
      imagePrimaryProvider: imageProvider,
      imageStorageProvider: storageProvider,
    });

    // Workflow must succeed overall
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 1);

    // Structured article result indicates cost-guard-blocked
    assert.ok(result.articles && result.articles.length === 1);
    const article = result.articles[0];
    assert.equal(article.success, true);
    assert.equal(article.imageGenerated, false);
    assert.equal(article.skippedReason, 'cost-guard-blocked');

    // Provider was NOT invoked due to Cost Guard block
    assert.equal(imageProvider.generateCalls.length, 0);

    // Article was stored
    const storedArticles = await repository.list();
    assert.equal(storedArticles.length, 1);
  } finally {
    await cleanup();
  }
});

test('4. Image provider failure fallback: Primary fails, fallback succeeds -> URL persisted', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({ defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir } });

    const failingPrimary = new MockImageProvider('Failing Cloudflare', 'cloudflare', false);
    const succeedingFallback = new MockImageProvider('Working BFL', 'bfl-flux-2-pro', true);
    const storageProvider = new MockStorageProvider(true, 'https://assets.lifemode.life/editorial/bfl-image.jpg');

    const discoveryAdapter = new MockTopicDiscoveryAdapter([
      {
        topic: 'The Quiet Luxury of Slow Architecture',
        pillar: 'life',
        score: 90,
        searchVolume: 'high',
      },
    ]);

    const result = await runDailyEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      providerMode: 'fixture',
      storagePath: path.join(repoDir, 'candidates.json'),
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      imageConfig: {
        enabled: true,
        strategy: 'cloudflare',
        cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: true },
        bfl: { model: 'flux-pro-1.1', configured: true },
        targetWidth: 1536,
        targetHeight: 864,
        aspectRatio: '16:9',
        maxRetries: 0,
        costGuard: {
          enabled: true,
          dailyLimit: 5,
          monthlyLimit: 120,
        },
      },
      imagePrimaryProvider: failingPrimary,
      imageFallbackProvider: succeedingFallback,
      imageStorageProvider: storageProvider,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 1);

    // Verify fallback image was persisted
    assert.ok(result.articles && result.articles.length === 1);
    const article = result.articles[0];
    assert.equal(article.success, true);
    assert.equal(article.imageGenerated, true);
    assert.equal(article.imageUrl, 'https://assets.lifemode.life/editorial/bfl-image.jpg');
    assert.equal(article.imageProvider, 'bfl-flux-2-pro');

    assert.equal(failingPrimary.generateCalls.length, 1);
    assert.equal(succeedingFallback.generateCalls.length, 1);
  } finally {
    await cleanup();
  }
});

test('5. Multiple article execution limit: Respects dailyArticleLimit / maxOpportunities (processes exactly 3 articles)', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({ defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir } });
    const imageProvider = new MockImageProvider('Mock Primary', 'cloudflare', true);
    const storageProvider = new MockStorageProvider(true);

    const discoveryAdapter = new MockTopicDiscoveryAdapter([
      { topic: 'Topic 1: Spatial Design', pillar: 'life', score: 98, searchVolume: 'high' },
      { topic: 'Topic 2: Alpine Retreats', pillar: 'travel', score: 96, searchVolume: 'high' },
      { topic: 'Topic 3: Sustainable Investing', pillar: 'money', score: 94, searchVolume: 'high' },
      { topic: 'Topic 4: Circadian Rhythm Lighting', pillar: 'wellbeing', score: 92, searchVolume: 'high' },
      { topic: 'Topic 5: Sovereign Edge Computing', pillar: 'tech-ai', score: 90, searchVolume: 'high' },
    ]);

    const result = await runDailyEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowUnrelatedChanges: true,
      dailyArticleLimit: 3, // Target daily limit: 3
      minScoreThreshold: 70,
      providerMode: 'fixture',
      storagePath: path.join(repoDir, 'candidates.json'),
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      imageConfig: {
        enabled: true,
        strategy: 'cloudflare',
        cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: true },
        bfl: { model: 'flux-pro-1.1', configured: false },
        targetWidth: 1536,
        targetHeight: 864,
        aspectRatio: '16:9',
        maxRetries: 1,
        costGuard: {
          enabled: true,
          dailyLimit: 5,
          monthlyLimit: 120,
        },
      },
      imagePrimaryProvider: imageProvider,
      imageStorageProvider: storageProvider,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.processedCount, 3);
    assert.equal(result.succeededCount, 3);
    assert.equal(result.failedCount, 0);

    // Verify all 3 articles are returned in structured result
    assert.ok(result.articles && result.articles.length === 3);
    for (const art of result.articles) {
      assert.equal(art.success, true);
      assert.ok(art.articleId);
      assert.ok(art.slug);
      assert.equal(art.imageGenerated, true);
    }

    // Verify 3 markdown files were written to content repo
    const storedArticles = await repository.list();
    assert.equal(storedArticles.length, 3);
  } finally {
    await cleanup();
  }
});
