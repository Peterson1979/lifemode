import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { EditorialTopic } from '../src/lib/editorial/types.ts';
import {
  selectSocialOpportunities,
  calculateSocialScore,
  determineTargetPlatforms,
  buildSocialBrief,
  validateSocialContent,
  validateSocialVisualAsset,
  runSocialPipeline,
  FilesystemSocialHistoryRepository,
  hashString,
  createIdempotencyKey,
  FacebookPlatformAdapter,
  resolveFacebookPageAccessToken,
  InstagramPlatformAdapter,
  PinterestPlatformAdapter,
  FixtureSocialImageProvider,
  isValidJpegBuffer,
  FixtureSocialGenerationProvider,
  FixtureSocialAssetStorageProvider,
  CloudflareR2SocialAssetStorageProvider,
  loadSocialConfig,
  type ISocialAssetStorageProvider,
  type GeneratedSocialContent,
  type SocialVisualAsset,
  type SocialPlatformPackage,
  type ISocialGenerationProvider,
  type ISocialPlatformAdapter,
  type SocialPlatform,
} from '../src/lib/social/index.ts';
import { AIRouterSocialGenerationProvider } from '../src/lib/social/generation/providers/ai-router.ts';
import { loadAIConfig } from '../src/lib/ai/config.ts';
import { parseGroqRetryDuration } from '../src/lib/ai/providers/groq.ts';
import type { AIRouter } from '../src/lib/ai/router.ts';
import {
  runScheduledEditorialAutomation,
  runEditorialWatchdog,
  loadScheduledAutomationConfig,
} from '../src/lib/editorial/automation/index.ts';
import { FilesystemContentRepository } from '../src/lib/editorial/storage/repository.ts';

function createMockTopic(overrides: Partial<EditorialTopic> = {}): EditorialTopic {
  return {
    id: `top-${Math.random().toString(36).slice(2, 8)}`,
    slug: 'calm-workspace-design-principles',
    canonicalTopic: 'Calm Workspace Design Principles',
    pillar: 'life',
    totalScore: 88,
    freshnessScore: 90,
    opportunityType: 'ARTICLE_AND_SOCIAL',
    priorityTier: 'PRIORITY',
    status: 'CANDIDATE',
    sourceSignals: [],
    queryVariants: ['calm workspace', 'minimalist desk setup'],
    scoring: {
      searchPotential: 80,
      pinterestPotential: 85,
      socialPotential: 90,
      lifeModeRelevance: 95,
      commercialPotential: 75,
      freshness: 85,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    evidence: [
      {
        title: 'Calm Technology Research',
        url: 'https://example.com/research',
        publisher: 'Design Institute',
        accessedAt: new Date().toISOString(),
        claimSummary: 'Design spaces that foster cognitive clarity.',
        sourceType: 'academic',
        reliability: 'high',
      },
    ],
    tags: ['interior', 'design', 'minimalism'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockValidSocialContent(overrides: Partial<GeneratedSocialContent> = {}): GeneratedSocialContent {
  return {
    topicId: 'top-12345',
    pillar: 'life',
    concept: 'Creating intentional calm workspaces through minimal tactile essentials.',
    hook: 'How your physical desk setup dictates your daily cognitive clarity.',
    title: 'Calm Workspace Design Principles',
    shortCaption: 'Designing a calm workspace is not about aesthetics—it is a cognitive ritual that restores focus and calm everyday.',
    extendedCaption: 'Designing a calm workspace is not about aesthetics—it is a cognitive ritual. By curating tactile oak materials and warm diffuse lighting, LifeMode explores how physical space shapes clear thinking.',
    callToAction: 'Read the full guide on LifeMode.',
    hashtags: ['#LifeMode', '#IntentionalLiving', '#WorkspaceDesign', '#CalmTech'],
    visualConcept: 'Serene minimalist oak desk with soft morning ambient lighting and tactile ceramic mug.',
    imageText: {
      headline: 'The Architecture of Calm Workspaces',
      subheadline: 'LifeMode Life Guide',
    },
    targetPlatforms: ['facebook', 'instagram', 'pinterest'],
    destinationUrl: 'https://lifemode.life/life/calm-workspace-design-principles',
    ...overrides,
  };
}

function createMockValidVisualAsset(overrides: Partial<SocialVisualAsset> = {}): SocialVisualAsset {
  return {
    assetId: 'asset-12345',
    format: '1080x1350',
    mimeType: 'image/svg+xml',
    width: 1080,
    height: 1350,
    assetHash: hashString('mock-svg-data-12345'),
    altText: 'Calm Workspace Design Principles visual on LifeMode',
    headlineOverlay: 'The Architecture of Calm Workspaces',
    buffer: Buffer.from('<svg width="1080" height="1350"></svg>'),
    url: 'https://images.lifemode.life/social/asset-12345.svg',
    ...overrides,
  };
}

test('LifeMode Social Automation V1 Test Suite', async (t) => {

  await t.test('1. Social opportunity selection filters by score, opportunityType, and diversity', async () => {
    const topic1 = createMockTopic({ id: 't1', totalScore: 92, scoring: { ...createMockTopic().scoring, socialPotential: 95, pinterestPotential: 90 } });
    const topicLowScore = createMockTopic({ id: 't2', totalScore: 72 });
    const topicArticleOnly = createMockTopic({ id: 't3', totalScore: 85, opportunityType: 'ARTICLE', scoring: { ...createMockTopic().scoring, socialPotential: 40, pinterestPotential: 40 } });
    const topicSocialOnly = createMockTopic({ id: 't4', totalScore: 84, opportunityType: 'SOCIAL_ONLY', pillar: 'travel', slug: 'kyoto-tea-gardens' });

    assert.ok(calculateSocialScore(topic1) >= 80);
    assert.ok(determineTargetPlatforms(topic1).length > 0);

    const selected = await selectSocialOpportunities([topic1, topicLowScore, topicArticleOnly, topicSocialOnly], {
      maxOpportunities: 2,
      minScoreThreshold: 80,
    });

    assert.equal(selected.length, 2);
    assert.equal(selected[0].topicId, 't1');
    assert.equal(selected[1].topicId, 't4');
    assert.ok(selected.every((s) => s.totalScore >= 80));
  });

  await t.test('2. Social brief schema builds structured brief preserving pillar aesthetic and evidence', () => {
    const opp = {
      topicId: 't-brief-1',
      canonicalTopic: 'Slow Architectural Travel in Kyoto',
      pillar: 'travel' as const,
      slug: 'slow-architectural-travel-kyoto',
      totalScore: 90,
      socialPotential: 88,
      pinterestPotential: 95,
      opportunityType: 'ARTICLE_AND_SOCIAL' as const,
      targetPlatforms: ['pinterest' as const, 'instagram' as const],
      destinationUrl: 'https://lifemode.life/travel/slow-architectural-travel-kyoto',
      evidence: [{ title: 'Kyoto Heritage Studies', url: 'https://example.com/kyoto', publisher: 'Travel Institute' }],
      tags: ['kyoto', 'architecture', 'slowtravel'],
    };

    const brief = buildSocialBrief(opp);
    assert.equal(brief.topicId, 't-brief-1');
    assert.equal(brief.pillar, 'travel');
    assert.ok(brief.targetAudience.includes('Slow travelers'));
    assert.ok(brief.visualGuidelines.aestheticStyle.includes('Architectural landscape'));
    assert.ok(brief.hashtagsHint.some((h) => h.toLowerCase() === '#lifemode'));
    assert.equal(brief.evidence?.length, 1);
  });

  await t.test('3. AI response parsing extracts structured JSON correctly', async () => {
    const provider = new FixtureSocialGenerationProvider();
    const brief = buildSocialBrief({
      topicId: 't-gen-1',
      canonicalTopic: 'Calm Computing Interfaces',
      pillar: 'tech-ai',
      slug: 'calm-computing-interfaces',
      totalScore: 89,
      socialPotential: 85,
      pinterestPotential: 80,
      opportunityType: 'ARTICLE_AND_SOCIAL',
      targetPlatforms: ['facebook', 'instagram'],
      destinationUrl: 'https://lifemode.life/tech-ai/calm-computing-interfaces',
      tags: ['calmtech', 'interfaces'],
    });

    const result = await provider.generateSocialContent(brief);
    assert.equal(result.success, true);
    assert.ok(result.content);
    assert.equal(result.content.topicId, 't-gen-1');
    assert.equal(result.content.pillar, 'tech-ai');
    assert.ok(result.content.title.length > 0);
    assert.ok(result.content.shortCaption.length >= 30);
    assert.ok(result.content.hashtags.length >= 2);
  });

  await t.test('4. Malformed AI response fails gracefully without unhandled crashes', async () => {
    const failingProvider: ISocialGenerationProvider = {
      name: 'Failing Provider',
      generateSocialContent: async () => {
        return {
          success: false,
          durationMs: 5,
          provider: 'Failing Provider',
          error: {
            code: 'MALFORMED',
            message: 'AI Provider returned malformed non-JSON payload.',
          },
        };
      },
    };

    const res = await failingProvider.generateSocialContent({} as any);
    assert.equal(res.success, false);
    assert.ok(res.error?.message.includes('malformed'));
  });

  await t.test('5. Validation detects missing required fields and excessive caption lengths', () => {
    const invalidShortContent = createMockValidSocialContent({
      shortCaption: 'Too short',
    });
    const result1 = validateSocialContent(invalidShortContent);
    assert.equal(result1.valid, false);
    assert.ok(result1.errors.some((e) => e.includes('too brief')));

    const validContent = createMockValidSocialContent();
    const result2 = validateSocialContent(validContent);
    assert.equal(result2.valid, true);
    assert.equal(result2.errors.length, 0);
  });

  await t.test('6. Internal metadata leakage is strictly rejected by validation', () => {
    const leakedContent = createMockValidSocialContent({
      extendedCaption: 'LifeMode exploration. Social Hooks: High engagement. Affiliate Intents: none. Topic ID: top-12345.',
    });
    const result = validateSocialContent(leakedContent);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Internal editorial planning metadata leaked') || e.includes('Forbidden internal metadata pattern')));
  });

  await t.test('7. Brand spelling must strictly be LifeMode, rejecting variants', () => {
    const badBrandVariants = [
      'Life Mode is rethinking modern workspaces.',
      'Lifemode gives you clean insights.',
      'LifeMode Media announced a new report.',
    ];

    for (const badVariant of badBrandVariants) {
      const content = createMockValidSocialContent({
        shortCaption: badVariant + ' A great and intentional lifestyle perspective for everyone.',
      });
      const res = validateSocialContent(content);
      assert.equal(res.valid, false, `Expected failure for variant: ${badVariant}`);
      assert.ok(res.errors.some((e) => e.includes('Forbidden brand spelling') || e.includes('LifeMode')));
    }
  });

  await t.test('8. Duplicate detection detects duplicate content hashes and recent topics in history', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-social-hist-'));
    const repo = new FilesystemSocialHistoryRepository(tempDir);

    const hash = hashString('Calm Workspace Design Principles-Designing a calm workspace...');
    await repo.recordEntry({
      runId: 'r1',
      topicId: 'top-dup-1',
      pillar: 'life',
      canonicalTopic: 'Calm Workspace Design Principles',
      contentHash: hash,
      assetHash: 'asset-hash-1',
      idempotencyKey: 'lm-soc-top-dup-1-fb-12345',
      targetPlatforms: ['facebook'],
      platformResults: {
        facebook: {
          platform: 'facebook',
          status: 'PUBLISHED',
          postId: 'fb-post-1',
          publishedAt: new Date().toISOString(),
          idempotencyKey: 'lm-soc-top-dup-1-fb-12345',
        },
      },
      reviewScore: 92,
      overallStatus: 'COMPLETED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const isDupContent = await repo.isContentDuplicate(hash);
    assert.equal(isDupContent, true);

    const isRecentTopic = await repo.isTopicRecentlyPublished('top-dup-1', 14);
    assert.equal(isRecentTopic, true);

    const isOtherTopicRecent = await repo.isTopicRecentlyPublished('top-other', 14);
    assert.equal(isOtherTopicRecent, false);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('9. Idempotency creates deterministic idempotency keys', () => {
    const key1 = createIdempotencyKey('top-100', 'instagram', 'abcdef1234567890');
    const key2 = createIdempotencyKey('top-100', 'instagram', 'abcdef1234567890');
    assert.equal(key1, key2);
    assert.equal(key1, 'lm-soc-top-100-instagram-abcdef123456');
  });

  await t.test('10. Image dimension validation accepts 1080x1350 and 1080x1080, rejecting invalid sizes', () => {
    const validPortrait = createMockValidVisualAsset({ format: '1080x1350', width: 1080, height: 1350 });
    assert.equal(validateSocialVisualAsset(validPortrait).valid, true);

    const validSquare = createMockValidVisualAsset({ format: '1080x1080', width: 1080, height: 1080 });
    assert.equal(validateSocialVisualAsset(validSquare).valid, true);

    const invalidDims = createMockValidVisualAsset({ format: '1080x1350', width: 800, height: 600 });
    assert.equal(validateSocialVisualAsset(invalidDims).valid, false);
  });

  await t.test('11. Platform capability detection identifies configured vs unconfigured platforms', () => {
    const fbAdapter = new FacebookPlatformAdapter();
    const igAdapter = new InstagramPlatformAdapter();
    const pinAdapter = new PinterestPlatformAdapter();

    assert.equal(typeof fbAdapter.isConfigured(), 'boolean');
    assert.equal(typeof igAdapter.isConfigured(), 'boolean');
    assert.equal(typeof pinAdapter.isConfigured(), 'boolean');
  });

  await t.test('12. Missing credentials result in clean NOT_CONFIGURED status without crashing', async () => {
    const fbAdapter = new FacebookPlatformAdapter();
    const pkg: SocialPlatformPackage = {
      platform: 'facebook',
      topicId: 't-test',
      contentHash: 'hash-123',
      caption: 'Test caption on LifeMode.',
      hashtags: ['#LifeMode'],
      mediaAsset: createMockValidVisualAsset(),
      preparedPayload: {},
      idempotencyKey: 'lm-test-key',
    };

    // If unconfigured and dryRun is false, publish returns NOT_CONFIGURED cleanly
    const result = await fbAdapter.publish(pkg, { dryRun: false });
    assert.ok(result.status === 'NOT_CONFIGURED' || result.status === 'DRY_RUN');
  });

  await t.test('13. Facebook preparation formats caption, CTA, link, and hashtags', async () => {
    const fbAdapter = new FacebookPlatformAdapter();
    const content = createMockValidSocialContent();
    const asset = createMockValidVisualAsset();

    const pkg = await fbAdapter.prepare(content, asset);
    assert.equal(pkg.platform, 'facebook');
    assert.ok(pkg.caption.includes('Calm Workspace Design Principles'));
    assert.ok(pkg.caption.includes('Read the full guide on LifeMode.'));
    assert.ok(pkg.caption.includes('#LifeMode'));
    assert.ok(pkg.idempotencyKey.startsWith('lm-soc-top-12345-facebook-'));
  });

  await t.test('14. Instagram preparation formats caption with bio link and enforces character limits', async () => {
    const igAdapter = new InstagramPlatformAdapter();
    const content = createMockValidSocialContent();
    const asset = createMockValidVisualAsset();

    const pkg = await igAdapter.prepare(content, asset);
    assert.equal(pkg.platform, 'instagram');
    assert.ok(pkg.caption.toLowerCase().includes('link in'));
    assert.ok(pkg.caption.length <= 2200);
    assert.equal(igAdapter.validate(pkg).valid, true);
  });

  await t.test('15. Pinterest preparation enforces title <= 100 and description <= 500 characters', async () => {
    const pinAdapter = new PinterestPlatformAdapter();
    const longTitle = 'A'.repeat(120);
    const content = createMockValidSocialContent({ title: longTitle });
    const asset = createMockValidVisualAsset();

    const pkg = await pinAdapter.prepare(content, asset);
    assert.equal(pkg.platform, 'pinterest');
    assert.ok(pkg.title && pkg.title.length <= 100);
    assert.ok(pkg.caption.length <= 500);
    assert.ok(pkg.destinationUrl?.startsWith('http'));
  });

  await t.test('16. Platform isolation: failure in Pinterest does not break Facebook or Instagram', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-isol-'));
    const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

    const topic = createMockTopic({ id: 'top-isol-1' });

    // Custom mock pinterest adapter that always throws
    const failingPinterest = new PinterestPlatformAdapter();
    failingPinterest.publish = async () => {
      throw new Error('Pinterest API Gateway Timeout (504)');
    };

    const customAdapters = new Map<SocialPlatform, ISocialPlatformAdapter>([
      ['facebook', new FacebookPlatformAdapter()],
      ['instagram', new InstagramPlatformAdapter()],
      ['pinterest', failingPinterest],
    ]);

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: true,
        storageDir: tempDir,
      },
      historyRepository: historyRepo,
      platformAdapters: customAdapters,
    });

    assert.equal(result.succeededCount, 1);
    assert.equal(result.platformSummary.facebook.published, 1);
    assert.equal(result.platformSummary.instagram.published, 1);
    assert.equal(result.platformSummary.pinterest.failed, 1);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('17. Dry-run exercises full pipeline end-to-end with zero real external publish', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-dry-'));
    const historyRepo = new FilesystemSocialHistoryRepository(tempDir);
    const topic = createMockTopic({ id: 'top-dry-1' });

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: true,
        allowPublish: false,
        storageDir: tempDir,
      },
      historyRepository: historyRepo,
    });

    assert.equal(result.status, 'DRY_RUN');
    assert.equal(result.dryRun, true);
    assert.equal(result.selectedCount, 1);
    assert.equal(result.succeededCount, 1);
    assert.equal(result.manifestEntries.length, 1);
    assert.equal(result.manifestEntries[0].overallStatus, 'DRY_RUN');

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('18. Scheduler integration integrates social automation cleanly', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-sched-soc-'));
    const contentDir = path.join(tempDir, 'content');
    const storagePath = path.join(tempDir, 'candidates.json');
    const lockPath = path.join(tempDir, 'test.lock');

    await fs.mkdir(contentDir, { recursive: true });

    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: true,
      providerMode: 'fixture',
      gitRepoRoot: tempDir,
      contentRoot: contentDir,
      storagePath,
      lockPath,
      socialEnabled: true,
      socialOptions: {
        enabled: true,
        dryRun: true,
        storageDir: path.join(tempDir, 'social'),
      },
    });

    assert.ok(result.status);
    assert.equal(result.dryRun, true);
    assert.ok(result.summary.includes('Scheduled Editorial Run'));

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('19. Failed provider isolation records failure without aborting pipeline', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-fail-'));
    const historyRepo = new FilesystemSocialHistoryRepository(tempDir);
    const topic = createMockTopic({ id: 'top-fail-1' });

    const brokenGenProvider: ISocialGenerationProvider = {
      name: 'Broken Provider',
      generateSocialContent: async () => {
        throw new Error('OpenAI / Groq API rate limit exceeded');
      },
    };

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: true,
        storageDir: tempDir,
      },
      generationProvider: brokenGenProvider,
      historyRepository: historyRepo,
    });

    assert.equal(result.failedCount, 1);
    assert.equal(result.succeededCount, 0);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('20. Repeated run produces no duplicate publication via manifest history', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-rep-'));
    const historyRepo = new FilesystemSocialHistoryRepository(tempDir);
    const topic = createMockTopic({ id: 'top-rep-1' });

    // Run 1: Live publish simulation
    const result1 = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: false,
        allowPublish: true,
        storageDir: tempDir,
      },
      historyRepository: historyRepo,
    });

    assert.ok(result1);

    // Manually mark as COMPLETED/PUBLISHED in manifest to simulate live publication
    const history = await historyRepo.loadHistory();
    if (history.length > 0) {
      history[0].overallStatus = 'COMPLETED';
      for (const p of Object.keys(history[0].platformResults)) {
        (history[0].platformResults as any)[p] = {
          platform: p,
          status: 'PUBLISHED',
          postId: `pub-${p}-1`,
          publishedAt: new Date().toISOString(),
          idempotencyKey: `idemp-${p}`,
        };
      }
      await historyRepo.saveHistory(history);
    }

    // Run 2: Re-run with the same topic candidate
    const result2 = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: false,
        allowPublish: true,
        storageDir: tempDir,
      },
      historyRepository: historyRepo,
    });

    // Topic is filtered out during opportunity selection because it was published recently
    assert.equal(result2.selectedCount, 0);
    assert.equal(result2.publishedCount, 0);
    assert.equal(result2.status, 'SUCCESS_NO_PUBLICATION');

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('21. Storage contract is satisfied by Fixture and R2 providers', () => {
    const fixtureProvider = new FixtureSocialAssetStorageProvider();
    assert.equal(typeof fixtureProvider.name, 'string');
    assert.equal(typeof fixtureProvider.isConfigured, 'function');
    assert.equal(typeof fixtureProvider.getObjectKey, 'function');
    assert.equal(typeof fixtureProvider.uploadAsset, 'function');
    assert.equal(fixtureProvider.isConfigured(), true);

    const r2Provider = new CloudflareR2SocialAssetStorageProvider();
    assert.equal(typeof r2Provider.name, 'string');
    assert.equal(typeof r2Provider.isConfigured, 'function');
    assert.equal(typeof r2Provider.getObjectKey, 'function');
    assert.equal(typeof r2Provider.uploadAsset, 'function');
  });

  await t.test('22. Deterministic object key generation adheres to social/<topicId>/<hash>.<ext>', () => {
    const provider = new FixtureSocialAssetStorageProvider();
    const key1 = provider.getObjectKey('calm-desk-principles', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'image/jpeg');
    assert.equal(key1, 'social/calm-desk-principles/e3b0c44298fc1c14.jpg');

    const keyPng = provider.getObjectKey('calm-desk-principles', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'image/png');
    assert.equal(keyPng, 'social/calm-desk-principles/e3b0c44298fc1c14.png');
  });

  await t.test('23. Successful Cloudflare R2 upload with SigV4 signing returns public HTTPS URL', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedHeaders: any = {};

    const mockFetch = async (url: string, init?: any) => {
      capturedUrl = url;
      capturedMethod = init.method;
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        text: async () => '',
      } as any;
    };

    const r2Provider = new CloudflareR2SocialAssetStorageProvider({
      accountId: 'cf-acc-12345',
      accessKeyId: 'cf-key-67890',
      secretAccessKey: 'cf-secret-abcdef123456',
      bucketName: 'lifemode-assets',
      publicBaseUrl: 'https://media.lifemode.life',
      customFetch: mockFetch as any,
    });

    assert.equal(r2Provider.isConfigured(), true);

    const buffer = Buffer.from('mock-image-bytes');
    const result = await r2Provider.uploadAsset({
      topicId: 'calm-desk-principles',
      pillar: 'life',
      assetHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      buffer,
      mimeType: 'image/jpeg',
      format: '1080x1350',
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.publicUrl, 'https://media.lifemode.life/social/calm-desk-principles/a1b2c3d4e5f60718.jpg');
    assert.equal(result.objectKey, 'social/calm-desk-principles/a1b2c3d4e5f60718.jpg');
    assert.equal(result.contentType, 'image/jpeg');
    assert.equal(result.sizeBytes, buffer.length);
    assert.ok(capturedUrl.includes('cf-acc-12345.r2.cloudflarestorage.com/lifemode-assets/social/calm-desk-principles/'));
    assert.equal(capturedMethod, 'PUT');
    assert.ok(capturedHeaders['Authorization']?.startsWith('AWS4-HMAC-SHA256'));
    assert.ok(capturedHeaders['x-amz-date']);
  });

  await t.test('24. Missing storage configuration returns NOT_CONFIGURED structured result without throwing', async () => {
    const unconfiguredProvider = new CloudflareR2SocialAssetStorageProvider({
      accountId: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined,
      bucketName: undefined,
      publicBaseUrl: undefined,
    });

    assert.equal(unconfiguredProvider.isConfigured(), false);

    const result = await unconfiguredProvider.uploadAsset({
      topicId: 'top-1',
      pillar: 'life',
      assetHash: '1234567890abcdef',
      buffer: Buffer.from('test'),
      mimeType: 'image/jpeg',
      format: '1080x1350',
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 'NOT_CONFIGURED');
    assert.ok(result.error?.includes('not configured'));
  });

  await t.test('25. Storage upload failure returns structured FAILED result with error details', async () => {
    const failingFetch = async () => {
      return {
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      } as any;
    };

    const r2Provider = new CloudflareR2SocialAssetStorageProvider({
      accountId: 'acc-1',
      accessKeyId: 'key-1',
      secretAccessKey: 'sec-1',
      bucketName: 'bucket-1',
      publicBaseUrl: 'https://media.lifemode.life',
      customFetch: failingFetch as any,
    });

    const result = await r2Provider.uploadAsset({
      topicId: 'top-fail',
      pillar: 'life',
      assetHash: 'failhash12345678',
      buffer: Buffer.from('test-bytes'),
      mimeType: 'image/jpeg',
      format: '1080x1350',
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 'FAILED');
    assert.ok(result.error?.includes('503'));
  });

  await t.test('26. Public HTTPS URL validation rejects packages with missing or non-HTTPS URLs', async () => {
    const fb = new FacebookPlatformAdapter();
    const ig = new InstagramPlatformAdapter();
    const pin = new PinterestPlatformAdapter();

    const content = createMockValidSocialContent();
    const invalidAsset = createMockValidVisualAsset({ url: undefined });

    const fbPkg = await fb.prepare(content, invalidAsset);
    const igPkg = await ig.prepare(content, invalidAsset);
    const pinPkg = await pin.prepare(content, invalidAsset);

    const fbVal = fb.validate(fbPkg);
    assert.equal(fbVal.valid, false);
    assert.ok(fbVal.errors.some(e => e.includes('HTTPS image URL')));

    const igVal = ig.validate(igPkg);
    assert.equal(igVal.valid, false);
    assert.ok(igVal.errors.some(e => e.includes('HTTPS image URL')));

    const pinVal = pin.validate(pinPkg);
    assert.equal(pinVal.valid, false);
    assert.ok(pinVal.errors.some(e => e.includes('HTTPS image URL')));
  });

  await t.test('27. Runner uploads asset to storage before platform preparation', async () => {
    let storageUploadCalled = false;
    let preparedUrlInFb = '';

    const mockStorage: ISocialAssetStorageProvider = {
      name: 'Mock Storage Provider',
      isConfigured: () => true,
      getObjectKey: () => 'social/test/mock.jpg',
      uploadAsset: async (req) => {
        storageUploadCalled = true;
        return {
          success: true,
          status: 'SUCCESS',
          publicUrl: 'https://media.lifemode.life/social/test/uploaded-123.jpg',
          objectKey: 'social/test/uploaded-123.jpg',
          contentType: req.mimeType,
          sizeBytes: req.buffer.length,
          assetHash: req.assetHash,
          provider: 'Mock Storage Provider',
          durationMs: 5,
        };
      },
    };

    const customFbAdapter = new FacebookPlatformAdapter();
    const origPrepare = customFbAdapter.prepare.bind(customFbAdapter);
    customFbAdapter.prepare = async (content, asset, options) => {
      preparedUrlInFb = asset.url || '';
      return origPrepare(content, asset, options);
    };

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-order-'));
    const topic = createMockTopic({ id: 'top-order-1' });

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: true,
        storageDir: tempDir,
      },
      storageProvider: mockStorage,
      platformAdapters: new Map([['facebook', customFbAdapter]]),
    });

    assert.equal(storageUploadCalled, true);
    assert.equal(preparedUrlInFb, 'https://media.lifemode.life/social/test/uploaded-123.jpg');
    assert.equal(result.succeededCount, 1);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('28. Facebook receives public HTTPS URL in prepared payload', async () => {
    const fb = new FacebookPlatformAdapter();
    const content = createMockValidSocialContent();
    const asset = createMockValidVisualAsset({
      url: 'https://media.lifemode.life/social/top-1/img-abc.jpg',
    });

    const pkg = await fb.prepare(content, asset);
    assert.equal(pkg.preparedPayload.url, 'https://media.lifemode.life/social/top-1/img-abc.jpg');
    assert.equal(pkg.mediaAsset.url, 'https://media.lifemode.life/social/top-1/img-abc.jpg');
    assert.equal(fb.validate(pkg).valid, true);
  });

  await t.test('29. Instagram receives public HTTPS URL in prepared payload', async () => {
    const ig = new InstagramPlatformAdapter();
    const content = createMockValidSocialContent();
    const asset = createMockValidVisualAsset({
      url: 'https://media.lifemode.life/social/top-1/img-abc.jpg',
    });

    const pkg = await ig.prepare(content, asset);
    assert.equal(pkg.preparedPayload.image_url, 'https://media.lifemode.life/social/top-1/img-abc.jpg');
    assert.equal(pkg.mediaAsset.url, 'https://media.lifemode.life/social/top-1/img-abc.jpg');
    assert.equal(ig.validate(pkg).valid, true);
  });

  await t.test('30. Pinterest receives public HTTPS URL in prepared payload', async () => {
    const pin = new PinterestPlatformAdapter();
    const content = createMockValidSocialContent();
    const asset = createMockValidVisualAsset({
      url: 'https://media.lifemode.life/social/top-1/img-abc.jpg',
    });

    const pkg = await pin.prepare(content, asset);
    assert.equal(pkg.preparedPayload.media_source.url, 'https://media.lifemode.life/social/top-1/img-abc.jpg');
    assert.equal(pkg.mediaAsset.url, 'https://media.lifemode.life/social/top-1/img-abc.jpg');
    assert.equal(pin.validate(pkg).valid, true);
  });

  await t.test('31. Repeated identical asset uses same deterministic key', () => {
    const provider = new FixtureSocialAssetStorageProvider();
    const topicId = 'minimalist-desk-setup';
    const hash = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';

    const key1 = provider.getObjectKey(topicId, hash, 'image/jpeg');
    const key2 = provider.getObjectKey(topicId, hash, 'image/jpeg');
    const key3 = provider.getObjectKey(topicId, hash, 'image/jpeg');

    assert.equal(key1, key2);
    assert.equal(key2, key3);
    assert.equal(key1, 'social/minimalist-desk-setup/4f53cda18c2baa0c.jpg');
  });

  await t.test('32. Fixture / dry-run remains completely offline without external network calls', async () => {
    const fixtureStorage = new FixtureSocialAssetStorageProvider();
    const res = await fixtureStorage.uploadAsset({
      topicId: 'offline-test',
      pillar: 'travel',
      assetHash: 'fedcba9876543210',
      buffer: Buffer.from('<svg></svg>'),
      mimeType: 'image/svg+xml',
      format: '1080x1350',
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.publicUrl, 'https://media.lifemode.life/social/offline-test/fedcba9876543210.svg');
  });

  await t.test('33. No fabricated URL when storage is unavailable in live mode', async () => {
    const unconfiguredStorage = new CloudflareR2SocialAssetStorageProvider({});
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-nofake-'));
    const topic = createMockTopic({ id: 'top-nofake-1' });

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: false,
        allowPublish: true,
        storageDir: tempDir,
      },
      storageProvider: unconfiguredStorage,
    });

    // Pipeline should fail cleanly without fabricating a fake URL or publishing
    assert.equal(result.failedCount, 1);
    assert.equal(result.publishedCount, 0);
    assert.equal(result.succeededCount, 0);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('34. Instagram authentication correctly inherits shared FACEBOOK_PAGE_ACCESS_TOKEN when INSTAGRAM_ACCESS_TOKEN is absent', async () => {
    const savedFbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const savedIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const savedIgAccount = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    try {
      // 1. Configure shared Meta system-user token & Instagram business account ID, omitting INSTAGRAM_ACCESS_TOKEN
      const mockSharedToken = 'EAAGmockSystemUserTokenForMetaPortfolio12345';
      const mockIgAccountId = '17841400123456789';

      process.env.FACEBOOK_PAGE_ACCESS_TOKEN = mockSharedToken;
      delete process.env.INSTAGRAM_ACCESS_TOKEN;
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = mockIgAccountId;

      // 2. Verify loadSocialConfig resolves Instagram credentials using the shared token
      const config = loadSocialConfig();
      assert.equal(config.credentials.instagram.configured, true);
      assert.equal(config.credentials.instagram.accessToken, mockSharedToken);
      assert.equal(config.credentials.instagram.businessAccountId, mockIgAccountId);

      // 3. Verify Instagram adapter isConfigured() reports true
      const capturedRequests: Array<{ url: string; method?: string; body?: any }> = [];
      const mockFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(init.body) : undefined;
        capturedRequests.push({ url, method, body });
        if (url.endsWith('/media')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'mock-creation-id-999' }),
          } as any;
        }
        if (url.includes('mock-creation-id-999')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'mock-creation-id-999', status_code: 'FINISHED' }),
          } as any;
        }
        if (url.endsWith('/media_publish')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'mock-ig-post-id-888' }),
          } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter = new InstagramPlatformAdapter(mockFetch as any);
      assert.equal(adapter.isConfigured(), true);

      // 4. Execute publication and verify both container creation and publication use the shared token
      const content = createMockValidSocialContent();
      const asset = createMockValidVisualAsset({
        url: 'https://media.lifemode.life/social/top-12345/a1b2c3d4e5f60718.jpg',
      });
      const pkg = await adapter.prepare(content, asset);
      const publishResult = await adapter.publish(pkg, { dryRun: false });

      assert.equal(publishResult.status, 'PUBLISHED');
      assert.equal(publishResult.postId, 'mock-ig-post-id-888');
      assert.equal(publishResult.postUrl, 'https://instagram.com/p/mock-ig-post-id-888');

      // 5. Assert that all 3 Graph API requests used the shared token and targeted the correct Instagram Business Account
      assert.equal(capturedRequests.length, 3);

      // Step 1: /media container creation
      assert.equal(capturedRequests[0].url, `https://graph.facebook.com/v20.0/${mockIgAccountId}/media`);
      assert.equal(capturedRequests[0].body.access_token, mockSharedToken);
      assert.equal(capturedRequests[0].body.image_url, 'https://media.lifemode.life/social/top-12345/a1b2c3d4e5f60718.jpg');

      // Step 2: container readiness check
      assert.ok(capturedRequests[1].url.includes(`https://graph.facebook.com/v20.0/mock-creation-id-999?fields=status_code,status&access_token=${mockSharedToken}`));

      // Step 3: /media_publish container publish
      assert.equal(capturedRequests[2].url, `https://graph.facebook.com/v20.0/${mockIgAccountId}/media_publish`);
      assert.equal(capturedRequests[2].body.access_token, mockSharedToken);
      assert.equal(capturedRequests[2].body.creation_id, 'mock-creation-id-999');
    } finally {
      // Restore previous environment
      if (savedFbToken !== undefined) process.env.FACEBOOK_PAGE_ACCESS_TOKEN = savedFbToken;
      else delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

      if (savedIgToken !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = savedIgToken;
      else delete process.env.INSTAGRAM_ACCESS_TOKEN;

      if (savedIgAccount !== undefined) process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgAccount;
      else delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }
  });

  await t.test('34b. Instagram configuration resolves INSTAGRAM_ACCOUNT_ID as fallback alias when INSTAGRAM_BUSINESS_ACCOUNT_ID is unset', async () => {
    const savedIgBusinessAccount = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    const savedIgAccount = process.env.INSTAGRAM_ACCOUNT_ID;
    const savedIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    try {
      delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
      process.env.INSTAGRAM_ACCOUNT_ID = '17841499988877766';
      process.env.INSTAGRAM_ACCESS_TOKEN = 'mock-ig-token-alias';

      const config = loadSocialConfig();
      assert.equal(config.credentials.instagram.configured, true);
      assert.equal(config.credentials.instagram.businessAccountId, '17841499988877766');
      assert.equal(config.credentials.instagram.accessToken, 'mock-ig-token-alias');
    } finally {
      if (savedIgBusinessAccount !== undefined) process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgBusinessAccount;
      else delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

      if (savedIgAccount !== undefined) process.env.INSTAGRAM_ACCOUNT_ID = savedIgAccount;
      else delete process.env.INSTAGRAM_ACCOUNT_ID;

      if (savedIgToken !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = savedIgToken;
      else delete process.env.INSTAGRAM_ACCESS_TOKEN;
    }
  });

  await t.test('35. Controlled storage-test mode executes real R2 provider upload, verifies HTTPS URL, runs Facebook, Instagram, and Pinterest preparation, and strictly bypasses publish()', async () => {
    let r2UploadCalled = false;
    let r2PutEndpoint = '';
    let r2Headers: Record<string, string> = {};

    const mockR2Fetch = async (url: string, init?: any) => {
      r2UploadCalled = true;
      r2PutEndpoint = url;
      r2Headers = init?.headers || {};
      return {
        ok: true,
        status: 200,
        text: async () => '',
      } as any;
    };

    let fbPublishCalled = false;
    let igPublishCalled = false;
    let pinPublishCalled = false;

    const fbAdapter = new FacebookPlatformAdapter();
    fbAdapter.publish = async () => {
      fbPublishCalled = true;
      throw new Error('Facebook publish() should NEVER be called in storage-test mode');
    };

    const igAdapter = new InstagramPlatformAdapter();
    igAdapter.publish = async () => {
      igPublishCalled = true;
      throw new Error('Instagram publish() should NEVER be called in storage-test mode');
    };

    const pinAdapter = new PinterestPlatformAdapter();
    pinAdapter.publish = async () => {
      pinPublishCalled = true;
      throw new Error('Pinterest publish() should NEVER be called in storage-test mode');
    };

    const customR2Provider = new CloudflareR2SocialAssetStorageProvider({
      accountId: 'mock-account-id',
      accessKeyId: 'mock-access-key',
      secretAccessKey: 'mock-secret-key',
      bucketName: 'lifemode-assets',
      publicBaseUrl: 'https://pub-8fcd679c40fd4aaa851f6ee7cdd4d083.r2.dev',
      customFetch: mockR2Fetch as any,
    });

    const topic = createMockTopic({ id: 'top-storage-test-1' });

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        storageTest: true,
        storageConfig: {
          provider: 'r2',
          accountId: 'mock-account-id',
          accessKeyId: 'mock-access-key',
          secretAccessKey: 'mock-secret-key',
          bucketName: 'lifemode-assets',
          publicBaseUrl: 'https://pub-8fcd679c40fd4aaa851f6ee7cdd4d083.r2.dev',
          configured: true,
        },
      },
      storageProvider: customR2Provider,
      platformAdapters: new Map<SocialPlatform, ISocialPlatformAdapter>([
        ['facebook', fbAdapter],
        ['instagram', igAdapter],
        ['pinterest', pinAdapter],
      ]),
    });

    // Verify R2 upload was executed via real R2 provider
    assert.equal(r2UploadCalled, true);
    assert.ok(r2PutEndpoint.includes('lifemode-assets'));
    assert.ok(r2PutEndpoint.includes('mock-account-id.r2.cloudflarestorage.com'));
    assert.ok(r2Headers['Authorization']?.includes('AWS4-HMAC-SHA256'));

    // Verify all 3 platform publish methods were NEVER called
    assert.equal(fbPublishCalled, false);
    assert.equal(igPublishCalled, false);
    assert.equal(pinPublishCalled, false);

    // Verify result details and report
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.publishedCount, 0);
    assert.equal(result.succeededCount, 1);
    assert.equal(result.failedCount, 0);
    assert.ok(result.storageTestDetails);
    assert.equal(result.storageTestDetails?.r2ProviderUsed, 'REAL');
    assert.equal(result.storageTestDetails?.facebookPreparation, 'SUCCESS');
    assert.equal(result.storageTestDetails?.instagramPreparation, 'SUCCESS');
    assert.equal(result.storageTestDetails?.pinterestPreparation, 'SUCCESS');
    assert.equal(result.storageTestDetails?.externalPublication, 'SKIPPED');
    assert.equal(result.storageTestDetails?.gitCommitPush, 'SKIPPED');
    assert.ok(result.storageTestDetails?.publicUrl?.startsWith('https://pub-8fcd679c40fd4aaa851f6ee7cdd4d083.r2.dev'));

    // Check summary includes exact required lines
    assert.ok(result.summary.includes('* R2 provider used:       REAL'));
    assert.ok(result.summary.includes('* Facebook preparation:   SUCCESS'));
    assert.ok(result.summary.includes('* Instagram preparation:  SUCCESS'));
    assert.ok(result.summary.includes('* Pinterest preparation:  SUCCESS'));
    assert.ok(result.summary.includes('* external publication:   SKIPPED'));
    assert.ok(result.summary.includes('* git commit/push:        SKIPPED'));
  });

  await t.test('36. Storage-test mode fails fast with structured error when R2 credentials are not configured', async () => {
    const unconfiguredR2Provider = new CloudflareR2SocialAssetStorageProvider({
      accountId: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined,
      bucketName: undefined,
      publicBaseUrl: undefined,
    });

    const result = await runSocialPipeline({
      config: {
        storageTest: true,
        storageConfig: {
          provider: 'r2',
          configured: false,
        },
      },
      storageProvider: unconfiguredR2Provider,
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.failedCount, 1);
    assert.ok(result.error?.includes('R2_ACCOUNT_ID'));
    assert.ok(result.summary.includes('* Facebook preparation:   FAIL'));
  });

  await t.test('37. Storage-test mode fails cleanly when R2 bucket upload fails', async () => {
    const failingR2Fetch = async () => {
      return {
        ok: false,
        status: 403,
        text: async () => 'Access Denied: Invalid S3 Signature',
      } as any;
    };

    const failingR2Provider = new CloudflareR2SocialAssetStorageProvider({
      accountId: 'mock-acc',
      accessKeyId: 'bad-key',
      secretAccessKey: 'bad-sec',
      bucketName: 'lifemode-assets',
      publicBaseUrl: 'https://pub-8fcd679c40fd4aaa851f6ee7cdd4d083.r2.dev',
      customFetch: failingR2Fetch as any,
    });

    const topic = createMockTopic({ id: 'top-fail-upload' });

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        storageTest: true,
        storageConfig: {
          provider: 'r2',
          accountId: 'mock-acc',
          accessKeyId: 'bad-key',
          secretAccessKey: 'bad-sec',
          bucketName: 'lifemode-assets',
          publicBaseUrl: 'https://pub-8fcd679c40fd4aaa851f6ee7cdd4d083.r2.dev',
          configured: true,
        },
      },
      storageProvider: failingR2Provider,
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.failedCount, 1);
    assert.ok(result.error?.includes('403') || result.error?.includes('upload failed'));
  });

  await t.test('38. Storage-test mode fails cleanly when storage returns a non-HTTPS URL', async () => {
    const mockStorageReturningHttp: ISocialAssetStorageProvider = {
      name: 'Insecure Storage Provider',
      isConfigured: () => true,
      getObjectKey: () => 'social/test/img.jpg',
      uploadAsset: async () => ({
        success: true,
        status: 'SUCCESS',
        publicUrl: 'http://insecure-http-url.com/social/test/img.jpg',
        objectKey: 'social/test/img.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
        assetHash: 'mockhash123',
        provider: 'Insecure Storage Provider',
        durationMs: 2,
      }),
    };

    const topic = createMockTopic({ id: 'top-http-insecure' });

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        storageTest: true,
        storageConfig: {
          provider: 'r2',
          configured: true,
        },
      },
      storageProvider: mockStorageReturningHttp,
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.failedCount, 1);
    assert.ok(result.error?.includes('non-HTTPS') || result.error?.includes('HTTPS'));
  });

  await t.test('39. Scheduled automation loads and propagates LIFEMODE_SOCIAL_ENABLED, LIFEMODE_SOCIAL_PUBLISH, and LIFEMODE_SOCIAL_DRY_RUN from environment variables', async () => {
    const savedSocialEnabled = process.env.LIFEMODE_SOCIAL_ENABLED;
    const savedSocialPublish = process.env.LIFEMODE_SOCIAL_PUBLISH;
    const savedSocialDryRun = process.env.LIFEMODE_SOCIAL_DRY_RUN;

    try {
      process.env.LIFEMODE_SOCIAL_ENABLED = 'true';
      process.env.LIFEMODE_SOCIAL_PUBLISH = 'true';
      process.env.LIFEMODE_SOCIAL_DRY_RUN = 'false';

      // 1. Verify loadScheduledAutomationConfig loads socialEnabled = true from env
      const schedConfig = loadScheduledAutomationConfig();
      assert.equal(schedConfig.socialEnabled, true);

      // 2. Verify loadSocialConfig resolves allowPublish = true, dryRun = false
      const socialConfig = loadSocialConfig({
        ...schedConfig.socialOptions,
        enabled: schedConfig.socialEnabled ?? schedConfig.socialOptions?.enabled,
      });
      assert.equal(socialConfig.enabled, true);
      assert.equal(socialConfig.allowPublish, true);
      assert.equal(socialConfig.dryRun, false);
    } finally {
      if (savedSocialEnabled !== undefined) process.env.LIFEMODE_SOCIAL_ENABLED = savedSocialEnabled;
      else delete process.env.LIFEMODE_SOCIAL_ENABLED;

      if (savedSocialPublish !== undefined) process.env.LIFEMODE_SOCIAL_PUBLISH = savedSocialPublish;
      else delete process.env.LIFEMODE_SOCIAL_PUBLISH;

      if (savedSocialDryRun !== undefined) process.env.LIFEMODE_SOCIAL_DRY_RUN = savedSocialDryRun;
      else delete process.env.LIFEMODE_SOCIAL_DRY_RUN;
    }
  });

  await t.test('40. Published article selection strictly derives canonical https://lifemode.life URLs and targets published repository content', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-pubsel-'));
    const contentDir = path.join(tempDir, 'content');
    const contentRepo = new FilesystemContentRepository({ contentRoot: contentDir });

    const todayStr = new Date().toISOString().split('T')[0];
    await contentRepo.create({
      pillar: 'travel',
      slug: 'serene-nordic-sauna-architecture',
      content: 'Exploring minimalist woodcraft and thermal bathing rituals in Norway.',
      frontmatter: {
        title: 'Serene Nordic Sauna Architecture',
        description: 'Exploring minimalist woodcraft and thermal bathing rituals in Norway.',
        pubDate: todayStr,
        author: 'LifeMode',
        tags: ['travel', 'architecture', 'nordic'],
        featured: false,
        draft: false,
        format: 'standard',
        primaryIntent: 'informational',
        affiliateIntent: false,
        riskLevel: 'low',
        sources: [{ name: 'Nordic Architecture Review', url: 'https://example.com/nordic' }],
        version: 1,
        lifecycleStatus: 'PUBLISHED',
      },
    });

    const result = await runSocialPipeline({
      contentRepository: contentRepo,
      contentRoot: contentDir,
      config: {
        enabled: true,
        dryRun: true,
        storageDir: path.join(tempDir, 'social'),
        baseUrl: 'https://lifemode.life',
      },
    });

    assert.equal(result.selectedCount, 1);
    assert.equal(result.succeededCount, 1);
    assert.equal(result.manifestEntries[0].pillar, 'travel');
    assert.equal(result.manifestEntries[0].canonicalTopic, 'Serene Nordic Sauna Architecture');

    const fbResult = result.manifestEntries[0].platformResults.facebook;
    assert.ok(fbResult);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('41. Platform publication retry idempotency merges results across runs without re-publishing succeeded platforms', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-retry-'));
    const historyRepo = new FilesystemSocialHistoryRepository(tempDir);
    const topic = createMockTopic({ id: 'top-retry-test-1' });

    let pinCallCount = 0;
    let fbCallCount = 0;
    let igCallCount = 0;

    const customFb = new FacebookPlatformAdapter();
    customFb.publish = async (pkg) => {
      fbCallCount++;
      return {
        platform: 'facebook',
        status: 'PUBLISHED',
        postId: 'fb-post-1',
        publishedAt: new Date().toISOString(),
        idempotencyKey: pkg.idempotencyKey,
      };
    };

    const customIg = new InstagramPlatformAdapter();
    customIg.publish = async (pkg) => {
      igCallCount++;
      return {
        platform: 'instagram',
        status: 'PUBLISHED',
        postId: 'ig-post-1',
        publishedAt: new Date().toISOString(),
        idempotencyKey: pkg.idempotencyKey,
      };
    };

    const customPin = new PinterestPlatformAdapter();
    customPin.publish = async (pkg) => {
      pinCallCount++;
      if (pinCallCount === 1) {
        throw new Error('Temporary Pinterest 503 Service Unavailable');
      }
      return {
        platform: 'pinterest',
        status: 'PUBLISHED',
        postId: 'pin-post-2',
        publishedAt: new Date().toISOString(),
        idempotencyKey: pkg.idempotencyKey,
      };
    };

    const adapters = new Map<SocialPlatform, ISocialPlatformAdapter>([
      ['facebook', customFb],
      ['instagram', customIg],
      ['pinterest', customPin],
    ]);

    // Run 1: FB and IG succeed, Pinterest fails
    const run1 = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: false,
        allowPublish: true,
        storageDir: tempDir,
      },
      historyRepository: historyRepo,
      platformAdapters: adapters,
    });

    assert.equal(fbCallCount, 1);
    assert.equal(igCallCount, 1);
    assert.equal(pinCallCount, 1);
    assert.equal(run1.platformSummary.facebook.published, 1);
    assert.equal(run1.platformSummary.instagram.published, 1);
    assert.equal(run1.platformSummary.pinterest.failed, 1);

    // Verify history recorded partial status
    const histAfterRun1 = await historyRepo.loadHistory();
    assert.equal(histAfterRun1.length, 1);
    assert.equal(histAfterRun1[0].platformResults.facebook?.status, 'PUBLISHED');
    assert.equal(histAfterRun1[0].platformResults.instagram?.status, 'PUBLISHED');
    assert.equal(histAfterRun1[0].platformResults.pinterest?.status, 'FAILED');
    assert.equal(histAfterRun1[0].overallStatus, 'PARTIAL');

    // Run 2: Re-run. Should target ONLY Pinterest and merge results!
    const run2 = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: false,
        allowPublish: true,
        storageDir: tempDir,
      },
      historyRepository: historyRepo,
      platformAdapters: adapters,
    });

    // FB and IG must NOT be called again
    assert.equal(fbCallCount, 1);
    assert.equal(igCallCount, 1);
    // Pinterest called second time and succeeded
    assert.equal(pinCallCount, 2);
    assert.equal(run2.platformSummary.pinterest.published, 1);

    // Verify history is merged and completed
    const histAfterRun2 = await historyRepo.loadHistory();
    assert.equal(histAfterRun2.length, 1);
    assert.equal(histAfterRun2[0].platformResults.facebook?.status, 'PUBLISHED');
    assert.equal(histAfterRun2[0].platformResults.instagram?.status, 'PUBLISHED');
    assert.equal(histAfterRun2[0].platformResults.pinterest?.status, 'PUBLISHED');
    assert.equal(histAfterRun2[0].overallStatus, 'COMPLETED');

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('42. Editorial watchdog operates decoupled from social pipeline without invoking social publishing', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-watchdog-soc-'));
    const contentDir = path.join(tempDir, 'content');
    const contentRepo = new FilesystemContentRepository({ contentRoot: contentDir });

    const todayStr = new Date().toISOString().split('T')[0];

    // Seed 3 published articles for today to meet quota (3/3)
    for (let i = 1; i <= 3; i++) {
      await contentRepo.create({
        pillar: 'life',
        slug: `daily-published-article-${i}`,
        content: `Body for article ${i}`,
        frontmatter: {
          title: `Daily Published Article ${i}`,
          description: `Description for article ${i}`,
          pubDate: todayStr,
          author: 'LifeMode',
          tags: ['life', 'design'],
          featured: false,
          draft: false,
          format: 'standard',
          primaryIntent: 'informational',
          affiliateIntent: false,
          riskLevel: 'low',
          sources: [],
          version: 1,
          lifecycleStatus: 'PUBLISHED',
        },
      });
    }

    const watchdogResult = await runEditorialWatchdog({
      contentRepository: contentRepo,
      contentRoot: contentDir,
      dailyArticleLimit: 3,
    });

    assert.equal(watchdogResult.action, 'NO_ACTION_REQUIRED');
    assert.equal(watchdogResult.status, 'SKIPPED');
    assert.equal(watchdogResult.report.isQuotaMet, true);
    assert.equal((watchdogResult as any).socialResult, undefined);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('43. Social automation summary and manifest retain platform publication identifiers and URLs for observability', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-obs-'));
    const historyRepo = new FilesystemSocialHistoryRepository(tempDir);
    const topic = createMockTopic({ id: 'top-obs-test' });

    const customFb = new FacebookPlatformAdapter();
    customFb.publish = async (pkg) => ({
      platform: 'facebook',
      status: 'PUBLISHED',
      postId: 'fb-post-id-123456',
      postUrl: 'https://facebook.com/123456',
      publishedAt: new Date().toISOString(),
      idempotencyKey: pkg.idempotencyKey,
    });

    const customIg = new InstagramPlatformAdapter();
    customIg.publish = async (pkg) => ({
      platform: 'instagram',
      status: 'PUBLISHED',
      postId: 'ig-media-id-789012',
      postUrl: 'https://instagram.com/p/789012',
      publishedAt: new Date().toISOString(),
      idempotencyKey: pkg.idempotencyKey,
    });

    const adapters = new Map<SocialPlatform, ISocialPlatformAdapter>([
      ['facebook', customFb],
      ['instagram', customIg],
      ['pinterest', new PinterestPlatformAdapter()],
    ]);

    const runResult = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: false,
        allowPublish: true,
        storageDir: tempDir,
      },
      historyRepository: historyRepo,
      platformAdapters: adapters,
    });

    assert.equal(runResult.succeededCount, 1);
    assert.ok(runResult.summary.includes('Dispatched Social Opportunities'));
    assert.ok(runResult.summary.includes('FACEBOOK: [PUBLISHED] | ID: fb-post-id-123456 | URL: https://facebook.com/123456'));
    assert.ok(runResult.summary.includes('INSTAGRAM: [PUBLISHED] | ID: ig-media-id-789012 | URL: https://instagram.com/p/789012'));
    assert.ok(runResult.summary.includes('PINTEREST: [NOT_CONFIGURED]'));

    // Check persisted manifest
    const history = await historyRepo.loadHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].platformResults.facebook?.postId, 'fb-post-id-123456');
    assert.equal(history[0].platformResults.facebook?.postUrl, 'https://facebook.com/123456');
    assert.equal(history[0].platformResults.instagram?.postId, 'ig-media-id-789012');
    assert.equal(history[0].platformResults.instagram?.postUrl, 'https://instagram.com/p/789012');

    // Confirm no secrets or tokens are stored in the manifest
    const manifestJson = JSON.stringify(history);
    assert.equal(manifestJson.includes('access_token'), false);
    assert.equal(manifestJson.includes('secret'), false);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('44. Facebook Page token resolution recognizes when supplied token is already a Page Access Token', async () => {
    const mockFetch = async (url: string) => {
      if (url.includes('/me?fields=id,name')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '1234567890', name: 'LifeMode Page' }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    };

    const res = await resolveFacebookPageAccessToken('1234567890', 'EAA_direct_page_token', mockFetch as any);
    assert.equal(res.valid, true);
    assert.equal(res.isPageToken, true);
    assert.equal(res.pageId, '1234567890');
    assert.equal(res.pageName, 'LifeMode Page');
    assert.equal(res.pageAccessToken, 'EAA_direct_page_token');
  });

  await t.test('45. Facebook Page token resolution exchanges System/User token for Page Access Token via /{pageId}?fields=access_token', async () => {
    const mockFetch = async (url: string) => {
      if (url.includes('/me?fields=id,name')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '9999999999', name: 'System User Portfolio' }),
        } as any;
      }
      if (url.includes('/1234567890?fields=id,name,access_token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: '1234567890',
            name: 'LifeMode Page',
            access_token: 'EAA_exchanged_page_token_via_page_node',
          }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    };

    const res = await resolveFacebookPageAccessToken('1234567890', 'EAA_system_user_token', mockFetch as any);
    assert.equal(res.valid, true);
    assert.equal(res.isPageToken, true);
    assert.equal(res.pageId, '1234567890');
    assert.equal(res.pageName, 'LifeMode Page');
    assert.equal(res.pageAccessToken, 'EAA_exchanged_page_token_via_page_node');
  });

  await t.test('46. Facebook Page token resolution exchanges System/User token for Page Access Token via /me/accounts', async () => {
    const mockFetch = async (url: string) => {
      if (url.includes('/me?fields=id,name')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '9999999999', name: 'System User Portfolio' }),
        } as any;
      }
      if (url.includes('/1234567890?fields=id,name,access_token')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Cannot query directly', code: 200 } }),
        } as any;
      }
      if (url.includes('/me/accounts?fields=id,name,access_token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { id: 'other_page_id', name: 'Other Page', access_token: 'EAA_other_page_token' },
              { id: '1234567890', name: 'LifeMode Page', access_token: 'EAA_accounts_page_token' },
            ],
          }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    };

    const res = await resolveFacebookPageAccessToken('1234567890', 'EAA_system_user_token', mockFetch as any);
    assert.equal(res.valid, true);
    assert.equal(res.isPageToken, true);
    assert.equal(res.pageId, '1234567890');
    assert.equal(res.pageName, 'LifeMode Page');
    assert.equal(res.pageAccessToken, 'EAA_accounts_page_token');
  });

  await t.test('47. Facebook Page token resolution fails cleanly without exposing token strings when unauthorized', async () => {
    const sensitiveRawToken = 'SUPER_SECRET_RAW_TOKEN_9876543210';
    const mockFetch = async (url: string) => {
      if (url.includes('/me?fields=id,name')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '9999999999', name: 'System User Without Page Access' }),
        } as any;
      }
      if (url.includes('/1234567890?fields=id,name,access_token')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { message: 'Permission denied', code: 200 } }),
        } as any;
      }
      if (url.includes('/me/accounts?fields=id,name,access_token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    };

    const res = await resolveFacebookPageAccessToken('1234567890', sensitiveRawToken, mockFetch as any);
    assert.equal(res.valid, false);
    assert.equal(res.isPageToken, false);
    assert.ok(res.error?.includes('Facebook Page token resolution failed for Page \'1234567890\''));
    assert.equal(res.error?.includes(sensitiveRawToken), false);
  });

  await t.test('48. Facebook publish executes complete flow using resolved Page Access Token and Graph API v21.0', async () => {
    const savedFbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const savedFbPageId = process.env.FACEBOOK_PAGE_ID;

    try {
      const mockRawToken = 'EAAGmockSystemUserTokenForLifeMode';
      const mockResolvedPageToken = 'EAAGmockResolvedPageTokenForLifeModePage';
      const mockPageId = '10009876543210';

      process.env.FACEBOOK_PAGE_ACCESS_TOKEN = mockRawToken;
      process.env.FACEBOOK_PAGE_ID = mockPageId;

      const capturedRequests: Array<{ url: string; method?: string; body?: any }> = [];

      const mockFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(init.body) : undefined;
        capturedRequests.push({ url, method, body });

        if (url.includes('/me?fields=id,name')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'system_user_portfolio_id', name: 'LifeMode System User' }),
          } as any;
        }

        if (url.includes(`/${mockPageId}?fields=id,name,access_token`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: mockPageId,
              name: 'LifeMode Official Page',
              access_token: mockResolvedPageToken,
            }),
          } as any;
        }

        if (url.includes(`/${mockPageId}/photos`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'fb_photo_post_id_99999' }),
          } as any;
        }

        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter = new FacebookPlatformAdapter(mockFetch as any);
      assert.equal(adapter.isConfigured(), true);

      const content = createMockValidSocialContent();
      const asset = createMockValidVisualAsset({
        url: 'https://media.lifemode.life/social/calm-workspace/img-123.jpg',
      });
      const pkg = await adapter.prepare(content, asset);

      const result = await adapter.publish(pkg, { dryRun: false });

      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.postId, 'fb_photo_post_id_99999');
      assert.equal(result.postUrl, 'https://facebook.com/fb_photo_post_id_99999');

      // Verify captured API calls:
      // 1. Identity check /me
      assert.ok(capturedRequests[0].url.includes('https://graph.facebook.com/v21.0/me?fields=id,name'));
      // 2. Token exchange /{pageId}
      assert.ok(capturedRequests[1].url.includes(`https://graph.facebook.com/v21.0/${mockPageId}?fields=id,name,access_token`));
      // 3. Publish POST /{pageId}/photos using the RESOLVED page token
      assert.equal(capturedRequests[2].url, `https://graph.facebook.com/v21.0/${mockPageId}/photos`);
      assert.equal(capturedRequests[2].method, 'POST');
      assert.equal(capturedRequests[2].body.access_token, mockResolvedPageToken);
      assert.equal(capturedRequests[2].body.url, 'https://media.lifemode.life/social/calm-workspace/img-123.jpg');
    } finally {
      if (savedFbToken !== undefined) process.env.FACEBOOK_PAGE_ACCESS_TOKEN = savedFbToken;
      else delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

      if (savedFbPageId !== undefined) process.env.FACEBOOK_PAGE_ID = savedFbPageId;
      else delete process.env.FACEBOOK_PAGE_ID;
    }
  });

  await t.test('49. Fixture image provider generates valid JPEG buffer with correct dimensions, MIME type, and magic bytes', async () => {
    const provider = new FixtureSocialImageProvider();
    const result = await provider.generateImage({
      topicId: 'calm-living-spaces',
      pillar: 'life',
      prompt: 'The Architecture of Calm Workspaces',
      format: '1080x1350',
      headlineOverlay: 'The Architecture of Calm Workspaces',
      subheadlineOverlay: 'LIFEMODE LIFE',
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'SUCCESS');
    assert.ok(result.asset);
    assert.equal(result.asset.mimeType, 'image/jpeg');
    assert.equal(result.asset.format, '1080x1350');
    assert.equal(result.asset.width, 1080);
    assert.equal(result.asset.height, 1350);

    const buf = result.asset.buffer;
    assert.ok(buf);
    assert.ok(buf.length > 5000, `Expected JPEG buffer > 5KB, got ${buf.length}`);

    // Verify JPEG magic bytes: 0xFF, 0xD8, 0xFF
    assert.equal(isValidJpegBuffer(buf), true);
    assert.equal(buf[0], 0xff);
    assert.equal(buf[1], 0xd8);
    assert.equal(buf[2], 0xff);

    // Verify buffer is NOT raw SVG XML
    const str = buf.toString('utf-8', 0, 50);
    assert.equal(str.includes('<svg'), false);
    assert.equal(str.includes('<?xml'), false);
  });

  await t.test('50. Cloudflare R2 storage uploads genuine JPEG buffer with Content-Type image/jpeg and retains .jpg key extension', async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Uint8Array | undefined;
    let capturedUrl = '';

    const mockFetch = async (url: string, init?: any) => {
      capturedUrl = url;
      capturedHeaders = init?.headers || {};
      capturedBody = init?.body;
      return {
        ok: true,
        status: 200,
        text: async () => '',
      } as any;
    };

    const imageProvider = new FixtureSocialImageProvider();
    const imageRes = await imageProvider.generateImage({
      topicId: 'kyoto-gardens',
      pillar: 'travel',
      prompt: 'Quiet Architecture in Kyoto',
      format: '1080x1350',
      headlineOverlay: 'Quiet Architecture in Kyoto',
    });

    assert.equal(imageRes.success, true);
    const asset = imageRes.asset!;

    const r2Provider = new CloudflareR2SocialAssetStorageProvider({
      accountId: 'test-account-id',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      bucketName: 'lifemode-assets',
      publicBaseUrl: 'https://media.lifemode.life',
      customFetch: mockFetch as any,
    });

    const uploadRes = await r2Provider.uploadAsset({
      topicId: 'kyoto-gardens',
      pillar: 'travel',
      assetHash: asset.assetHash,
      buffer: asset.buffer!,
      mimeType: asset.mimeType,
      format: asset.format,
    });

    assert.equal(uploadRes.success, true);
    assert.equal(uploadRes.contentType, 'image/jpeg');
    assert.ok(uploadRes.objectKey?.endsWith('.jpg'));
    assert.ok(uploadRes.publicUrl?.endsWith('.jpg'));
    assert.equal(uploadRes.publicUrl, `https://media.lifemode.life/social/kyoto-gardens/${asset.assetHash.slice(0, 16)}.jpg`);
    assert.ok(capturedUrl.includes('test-account-id.r2.cloudflarestorage.com'));

    // Verify PUT request headers & body
    assert.equal(capturedHeaders['Content-Type'], 'image/jpeg');
    assert.ok(capturedBody);
    assert.equal(isValidJpegBuffer(Buffer.from(capturedBody)), true);
  });

  await t.test('51. End-to-end pipeline produces raster JPEG asset and passes genuine image/jpeg URL to platform adapters', async () => {
    let receivedFbUrl = '';
    let storageContentType = '';

    const mockStorage: ISocialAssetStorageProvider = {
      name: 'Mock Storage',
      isConfigured: () => true,
      getObjectKey: (topicId, hash) => `social/${topicId}/${hash.slice(0, 16)}.jpg`,
      uploadAsset: async (req) => {
        storageContentType = req.mimeType;
        assert.equal(isValidJpegBuffer(req.buffer), true);
        return {
          success: true,
          status: 'SUCCESS',
          publicUrl: `https://media.lifemode.life/social/${req.topicId}/${req.assetHash.slice(0, 16)}.jpg`,
          objectKey: `social/${req.topicId}/${req.assetHash.slice(0, 16)}.jpg`,
          contentType: req.mimeType,
          sizeBytes: req.buffer.length,
          assetHash: req.assetHash,
          provider: 'Mock Storage',
          durationMs: 5,
        };
      },
    };

    const customFbAdapter = new FacebookPlatformAdapter();
    const origPrepare = customFbAdapter.prepare.bind(customFbAdapter);
    customFbAdapter.prepare = async (content, asset, options) => {
      receivedFbUrl = asset.url || '';
      return origPrepare(content, asset, options);
    };

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-soc-jpeg-'));
    const topic = createMockTopic({ id: 'top-jpeg-flow' });

    const result = await runSocialPipeline({
      candidates: [topic],
      config: {
        enabled: true,
        dryRun: true,
        storageDir: tempDir,
      },
      imageProvider: new FixtureSocialImageProvider(),
      storageProvider: mockStorage,
      platformAdapters: new Map([['facebook', customFbAdapter]]),
    });

    assert.equal(result.succeededCount, 1);
    assert.equal(storageContentType, 'image/jpeg');
    assert.ok(receivedFbUrl.startsWith('https://media.lifemode.life/social/top-jpeg-flow/'));
    assert.ok(receivedFbUrl.endsWith('.jpg'));

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('52. Groq configuration defaults tokensPerMinute to 8,000 and preserves env overrides', () => {
    const origEnv = process.env.GROQ_TPM_LIMIT;
    try {
      delete process.env.GROQ_TPM_LIMIT;
      const defaultConfig = loadAIConfig();
      assert.equal(defaultConfig.groq.tokensPerMinute, 8_000);

      process.env.GROQ_TPM_LIMIT = '15000';
      const customConfig = loadAIConfig();
      assert.equal(customConfig.groq.tokensPerMinute, 15_000);
    } finally {
      if (origEnv !== undefined) {
        process.env.GROQ_TPM_LIMIT = origEnv;
      } else {
        delete process.env.GROQ_TPM_LIMIT;
      }
    }
  });

  await t.test('53. parseGroqRetryDuration accurately parses seconds retry durations and headers', () => {
    // Header seconds
    assert.equal(parseGroqRetryDuration('Rate limit reached', '17.145'), 17145);
    assert.equal(parseGroqRetryDuration('', '30'), 30000);

    // Message with float/int seconds
    assert.equal(parseGroqRetryDuration('Rate limit reached. Please try again in 17.145s.'), 17145);
    assert.equal(parseGroqRetryDuration('Limit 8000, Used 0. Please try again in 45s.'), 45000);
    assert.equal(parseGroqRetryDuration('try again in 0.5s'), 500);
  });

  await t.test('54. parseGroqRetryDuration accurately parses minute/second composite retry durations', () => {
    // Minute + Second: 1m15s -> (60 + 15) * 1000 = 75,000ms
    assert.equal(
      parseGroqRetryDuration('Rate limit reached for model openai/gpt-oss-20b on tokens per minute (TPM): Limit 8000, Used 0, Requested 6120. Please try again in 1m15s.'),
      75000
    );
    assert.equal(parseGroqRetryDuration('Please try again in 1m15.5s.'), 75500);

    // Pure minutes: 2m -> 120,000ms
    assert.equal(parseGroqRetryDuration('Rate limit reached. Please try again in 2m.'), 120000);
    assert.equal(parseGroqRetryDuration('try again in 1m'), 60000);
  });

  await t.test('55. parseGroqRetryDuration returns bounded fallback when retry duration is absent', () => {
    // Absent header and message without duration pattern
    assert.equal(parseGroqRetryDuration('Groq API returned HTTP 429: Rate limit reached.', null, 5000), 5000);
    assert.equal(parseGroqRetryDuration('Unknown rate limit error', undefined, 10000), 10000);
    assert.equal(parseGroqRetryDuration('', null, 5000), 5000);
  });

  await t.test('56. Social AI generation falls back to FixtureSocialGenerationProvider when AI Router fails', async () => {
    const brief = buildSocialBrief({
      topicId: 'top-fallback-test',
      canonicalTopic: 'Mindful Morning Rituals for Remote Professionals',
      pillar: 'life',
      slug: 'mindful-morning-rituals',
      totalScore: 88,
      socialPotential: 90,
      pinterestPotential: 85,
      opportunityType: 'ARTICLE_AND_SOCIAL',
      targetPlatforms: ['facebook', 'instagram'],
      destinationUrl: 'https://lifemode.life/life/mindful-morning-rituals',
      tags: ['life', 'mindfulness'],
    });

    // Mock router simulating total failure / 429 rate limit exhaustion
    const mockFailingRouter = {
      route: async () => ({
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: 'Groq API returned HTTP 429: TPM limit 8000 exceeded. Requested 6120.',
          provider: 'groq',
          retryable: true,
        },
        attemptedProviders: ['groq'],
        attempts: [],
      }),
    } as unknown as AIRouter;

    const provider = new AIRouterSocialGenerationProvider(mockFailingRouter);
    const result = await provider.generateSocialContent(brief);

    assert.equal(result.success, true);
    assert.ok(result.content);
    assert.equal(result.content.topicId, 'top-fallback-test');
    assert.equal(result.content.pillar, 'life');
    assert.ok(result.content.shortCaption.length > 20);

    // Validate the resulting content passes full LifeMode validation
    const validation = validateSocialContent(result.content);
    assert.equal(validation.valid, true);
    assert.equal(validation.errors.length, 0);
  });

  await t.test('57. AI-generated social content is strictly preferred when AI Router succeeds', async () => {
    const brief = buildSocialBrief({
      topicId: 'top-ai-pref-test',
      canonicalTopic: 'Architectural Silence in Minimalist Homes',
      pillar: 'life',
      slug: 'architectural-silence',
      totalScore: 92,
      socialPotential: 95,
      pinterestPotential: 90,
      opportunityType: 'ARTICLE_AND_SOCIAL',
      targetPlatforms: ['facebook', 'instagram', 'pinterest'],
      destinationUrl: 'https://lifemode.life/life/architectural-silence',
      tags: ['design', 'architecture'],
    });

    const aiGeneratedJson = JSON.stringify({
      topicId: 'top-ai-pref-test',
      pillar: 'life',
      concept: 'Acoustic calm and spatial purity',
      hook: 'How silence transforms modern architecture',
      title: 'Architectural Silence in Minimalist Homes',
      shortCaption: 'Exploring acoustic calm and intentional living in modern design.',
      extendedCaption: 'The quietest rooms are designed with intention. Our latest design dispatch explores spatial acoustic purity.',
      callToAction: 'Read the full design dispatch on LifeMode.',
      hashtags: ['#minimalism', '#architecture', '#lifemode'],
      visualConcept: 'Monolithic concrete interior with soft diffuse daylight',
      imageText: {
        headline: 'Architectural Silence',
        subheadline: 'LIFEMODE DESIGN',
      },
      targetPlatforms: ['facebook', 'instagram', 'pinterest'],
      destinationUrl: 'https://lifemode.life/design/architectural-silence',
    });

    const mockSuccessRouter = {
      route: async () => ({
        success: true,
        provider: 'groq',
        response: {
          text: aiGeneratedJson,
          provider: 'groq',
          model: 'openai/gpt-oss-20b',
          inputTokens: 350,
          outputTokens: 250,
          totalTokens: 600,
          durationMs: 420,
        },
        attempts: [],
      }),
    } as unknown as AIRouter;

    const provider = new AIRouterSocialGenerationProvider(mockSuccessRouter);
    const result = await provider.generateSocialContent(brief);

    assert.equal(result.success, true);
    assert.equal(result.provider, 'groq');
    assert.equal(result.model, 'openai/gpt-oss-20b');
    assert.equal(result.content?.concept, 'Acoustic calm and spatial purity');
    assert.equal(result.content?.visualConcept, 'Monolithic concrete interior with soft diffuse daylight');
    assert.equal(result.rawResponse, aiGeneratedJson);
  });

  await t.test('58. Instagram publishing polls container status until FINISHED (IN_PROGRESS -> IN_PROGRESS -> FINISHED) before publishing', async () => {
    const savedIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const savedIgAccount = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    try {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'mock-ig-token-58';
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17841400000000058';

      let statusPollCount = 0;
      let sleepCallCount = 0;
      const capturedRequests: Array<{ url: string; method: string; body?: any }> = [];

      const mockFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(init.body) : undefined;
        capturedRequests.push({ url, method, body });

        if (url.endsWith('/media') && method === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'ig-container-58' }),
          } as any;
        }

        if (url.includes('ig-container-58') && method === 'GET') {
          statusPollCount++;
          if (statusPollCount < 3) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ id: 'ig-container-58', status_code: 'IN_PROGRESS' }),
            } as any;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'ig-container-58', status_code: 'FINISHED' }),
          } as any;
        }

        if (url.endsWith('/media_publish') && method === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'ig-published-58' }),
          } as any;
        }

        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter = new InstagramPlatformAdapter(mockFetch as any, {
        pollIntervalMs: 10,
        maxPollAttempts: 10,
        sleepFn: async () => {
          sleepCallCount++;
        },
      });

      const content = createMockValidSocialContent();
      const asset = createMockValidVisualAsset({
        url: 'https://media.lifemode.life/social/top-58/asset.jpg',
      });
      const pkg = await adapter.prepare(content, asset);
      const res = await adapter.publish(pkg, { dryRun: false });

      assert.equal(res.status, 'PUBLISHED');
      assert.equal(res.postId, 'ig-published-58');
      assert.equal(res.postUrl, 'https://instagram.com/p/ig-published-58');

      // Verify polling sequence
      assert.equal(statusPollCount, 3);
      assert.equal(sleepCallCount, 2);
      assert.equal(capturedRequests.length, 5); // 1 create + 3 polls + 1 publish
      assert.equal(capturedRequests[0].method, 'POST');
      assert.equal(capturedRequests[1].method, 'GET');
      assert.equal(capturedRequests[2].method, 'GET');
      assert.equal(capturedRequests[3].method, 'GET');
      assert.equal(capturedRequests[4].method, 'POST');
      assert.equal(capturedRequests[4].body.creation_id, 'ig-container-58');
    } finally {
      if (savedIgToken !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = savedIgToken;
      else delete process.env.INSTAGRAM_ACCESS_TOKEN;
      if (savedIgAccount !== undefined) process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgAccount;
      else delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }
  });

  await t.test('59. Instagram publishing publishes immediately when container is FINISHED on initial status check', async () => {
    const savedIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const savedIgAccount = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    try {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'mock-ig-token-59';
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17841400000000059';

      let pollCount = 0;
      let sleepCalled = false;

      const mockFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/media') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ id: 'ig-container-59' }) } as any;
        }
        if (url.includes('ig-container-59') && method === 'GET') {
          pollCount++;
          return { ok: true, status: 200, json: async () => ({ id: 'ig-container-59', status_code: 'FINISHED' }) } as any;
        }
        if (url.endsWith('/media_publish') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ id: 'ig-published-59' }) } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter = new InstagramPlatformAdapter(mockFetch as any, {
        sleepFn: async () => {
          sleepCalled = true;
        },
      });

      const content = createMockValidSocialContent();
      const asset = createMockValidVisualAsset({
        url: 'https://media.lifemode.life/social/top-59/asset.jpg',
      });
      const pkg = await adapter.prepare(content, asset);
      const res = await adapter.publish(pkg, { dryRun: false });

      assert.equal(res.status, 'PUBLISHED');
      assert.equal(res.postId, 'ig-published-59');
      assert.equal(pollCount, 1);
      assert.equal(sleepCalled, false);
    } finally {
      if (savedIgToken !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = savedIgToken;
      else delete process.env.INSTAGRAM_ACCESS_TOKEN;
      if (savedIgAccount !== undefined) process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgAccount;
      else delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }
  });

  await t.test('60. Instagram publishing fails cleanly and halts before publication when container status returns ERROR', async () => {
    const savedIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const savedIgAccount = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    try {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'mock-ig-token-60';
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17841400000000060';

      let publishCalled = false;

      const mockFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/media') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ id: 'ig-container-60-err' }) } as any;
        }
        if (url.includes('ig-container-60-err') && method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'ig-container-60-err',
              status_code: 'ERROR',
              status: 'Media processing failed: Invalid aspect ratio 3:1',
            }),
          } as any;
        }
        if (url.endsWith('/media_publish')) {
          publishCalled = true;
          return { ok: true, status: 200, json: async () => ({ id: 'should-not-reach-here' }) } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter = new InstagramPlatformAdapter(mockFetch as any);
      const content = createMockValidSocialContent();
      const asset = createMockValidVisualAsset({
        url: 'https://media.lifemode.life/social/top-60/asset.jpg',
      });
      const pkg = await adapter.prepare(content, asset);
      const res = await adapter.publish(pkg, { dryRun: false });

      assert.equal(res.status, 'FAILED');
      assert.ok(res.error?.includes('ERROR: Media processing failed: Invalid aspect ratio 3:1'));
      assert.equal(publishCalled, false);
    } finally {
      if (savedIgToken !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = savedIgToken;
      else delete process.env.INSTAGRAM_ACCESS_TOKEN;
      if (savedIgAccount !== undefined) process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgAccount;
      else delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }
  });

  await t.test('61. Instagram publishing fails with timeout when container stays IN_PROGRESS beyond max attempts', async () => {
    const savedIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const savedIgAccount = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    try {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'mock-ig-token-61';
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17841400000000061';

      let pollCount = 0;
      let publishCalled = false;

      const mockFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/media') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ id: 'ig-container-61-stuck' }) } as any;
        }
        if (url.includes('ig-container-61-stuck') && method === 'GET') {
          pollCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'ig-container-61-stuck', status_code: 'IN_PROGRESS' }),
          } as any;
        }
        if (url.endsWith('/media_publish')) {
          publishCalled = true;
          return { ok: true, status: 200, json: async () => ({ id: 'should-not-reach-here' }) } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter = new InstagramPlatformAdapter(mockFetch as any, {
        pollIntervalMs: 50,
        maxPollAttempts: 4,
        sleepFn: async () => {},
      });

      const content = createMockValidSocialContent();
      const asset = createMockValidVisualAsset({
        url: 'https://media.lifemode.life/social/top-61/asset.jpg',
      });
      const pkg = await adapter.prepare(content, asset);
      const res = await adapter.publish(pkg, { dryRun: false });

      assert.equal(res.status, 'FAILED');
      assert.ok(res.error?.includes('processing timed out after 4 attempts'));
      assert.ok(res.error?.includes('with status IN_PROGRESS'));
      assert.equal(pollCount, 4);
      assert.equal(publishCalled, false);
    } finally {
      if (savedIgToken !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = savedIgToken;
      else delete process.env.INSTAGRAM_ACCESS_TOKEN;
      if (savedIgAccount !== undefined) process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgAccount;
      else delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }
  });

  await t.test('62. Instagram publishing strictly redacts access tokens and secrets from all error messages and logs', async () => {
    const sensitiveToken = 'EAA_SUPER_SECRET_IG_ACCESS_TOKEN_XYZ_987654321';
    const savedIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const savedIgAccount = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    try {
      process.env.INSTAGRAM_ACCESS_TOKEN = sensitiveToken;
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17841400000000062';

      const content = createMockValidSocialContent();
      const asset = createMockValidVisualAsset({
        url: 'https://media.lifemode.life/social/top-62/asset.jpg',
      });

      // Case 1: /media creation fails with token in error response body
      const failingMediaFetch = async (url: string) => {
        if (url.endsWith('/media')) {
          return {
            ok: false,
            status: 400,
            text: async () => `OAuthException: Invalid access token ${sensitiveToken} for account.`,
          } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter1 = new InstagramPlatformAdapter(failingMediaFetch as any);
      const pkg1 = await adapter1.prepare(content, asset);
      const res1 = await adapter1.publish(pkg1, { dryRun: false });
      assert.equal(res1.status, 'FAILED');
      assert.equal(res1.error?.includes(sensitiveToken), false);
      assert.ok(res1.error?.includes('[REDACTED]'));

      // Case 2: Status check returns HTTP error with token in error response body
      const failingStatusFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/media') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ id: 'ig-cont-62-status-fail' }) } as any;
        }
        if (url.includes('ig-cont-62-status-fail')) {
          return {
            ok: false,
            status: 500,
            text: async () => `Internal Server Error: token query failed for ${sensitiveToken}`,
          } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter2 = new InstagramPlatformAdapter(failingStatusFetch as any);
      const pkg2 = await adapter2.prepare(content, asset);
      const res2 = await adapter2.publish(pkg2, { dryRun: false });
      assert.equal(res2.status, 'FAILED');
      assert.equal(res2.error?.includes(sensitiveToken), false);
      assert.ok(res2.error?.includes('[REDACTED]'));

      // Case 3: Container status check returns ERROR with token in status string
      const errorStatusFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/media') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ id: 'ig-cont-62-error-code' }) } as any;
        }
        if (url.includes('ig-cont-62-error-code')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'ig-cont-62-error-code',
              status_code: 'ERROR',
              status: `Download failed with credentials for ${sensitiveToken}`,
            }),
          } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter3 = new InstagramPlatformAdapter(errorStatusFetch as any);
      const pkg3 = await adapter3.prepare(content, asset);
      const res3 = await adapter3.publish(pkg3, { dryRun: false });
      assert.equal(res3.status, 'FAILED');
      assert.equal(res3.error?.includes(sensitiveToken), false);
      assert.ok(res3.error?.includes('[REDACTED]'));

      // Case 4: /media_publish fails with token in error body
      const failingPublishFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/media') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ id: 'ig-cont-62-pub-fail' }) } as any;
        }
        if (url.includes('ig-cont-62-pub-fail')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'ig-cont-62-pub-fail', status_code: 'FINISHED' }),
          } as any;
        }
        if (url.endsWith('/media_publish')) {
          return {
            ok: false,
            status: 400,
            text: async () => `Publish rejected for token ${sensitiveToken}`,
          } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter4 = new InstagramPlatformAdapter(failingPublishFetch as any);
      const pkg4 = await adapter4.prepare(content, asset);
      const res4 = await adapter4.publish(pkg4, { dryRun: false });
      assert.equal(res4.status, 'FAILED');
      assert.equal(res4.error?.includes(sensitiveToken), false);
      assert.ok(res4.error?.includes('[REDACTED]'));
    } finally {
      if (savedIgToken !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = savedIgToken;
      else delete process.env.INSTAGRAM_ACCESS_TOKEN;
      if (savedIgAccount !== undefined) process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgAccount;
      else delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }
  });

  await t.test('63. Instagram publishing handles EXPIRED container status explicitly without calling media_publish', async () => {
    const savedIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const savedIgAccount = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    try {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'mock-ig-token-63';
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17841400000000063';

      let publishCalled = false;

      const mockFetch = async (url: string, init?: any) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/media') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ id: 'ig-container-63-exp' }) } as any;
        }
        if (url.includes('ig-container-63-exp') && method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'ig-container-63-exp', status_code: 'EXPIRED' }),
          } as any;
        }
        if (url.endsWith('/media_publish')) {
          publishCalled = true;
          return { ok: true, status: 200, json: async () => ({ id: 'should-not-reach-here' }) } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not Found' } as any;
      };

      const adapter = new InstagramPlatformAdapter(mockFetch as any);
      const content = createMockValidSocialContent();
      const asset = createMockValidVisualAsset({
        url: 'https://media.lifemode.life/social/top-63/asset.jpg',
      });
      const pkg = await adapter.prepare(content, asset);
      const res = await adapter.publish(pkg, { dryRun: false });

      assert.equal(res.status, 'FAILED');
      assert.ok(res.error?.includes('has EXPIRED'));
      assert.equal(publishCalled, false);
    } finally {
      if (savedIgToken !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = savedIgToken;
      else delete process.env.INSTAGRAM_ACCESS_TOKEN;
      if (savedIgAccount !== undefined) process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgAccount;
      else delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }
  });

  await t.test('64. Freshly published article is eligible and prioritized over older articles under 24-hour window', async () => {
    const refDate = new Date('2026-09-15T12:00:00.000Z');
    const freshArticle = createMockTopic({
      id: 'lm-life-20260915-fresh-topic',
      slug: 'fresh-morning-rituals',
      status: 'PUBLISHED',
      createdAt: '2026-09-15T06:00:00.000Z',
      updatedAt: '2026-09-15T06:00:00.000Z',
      publishedAt: '2026-09-15T06:00:00.000Z', // 6 hours old
      totalScore: 88,
    });
    const oldArticle = createMockTopic({
      id: 'lm-tech-ai-20260910-old-topic',
      slug: 'old-tech-article',
      status: 'PUBLISHED',
      createdAt: '2026-09-10T06:00:00.000Z',
      updatedAt: '2026-09-10T06:00:00.000Z',
      publishedAt: '2026-09-10T06:00:00.000Z',
      totalScore: 95, // higher score, but stale
    });

    const selected = await selectSocialOpportunities([freshArticle, oldArticle], {
      maxOpportunities: 1,
      // Default maxFreshnessDays is 1 (24 hours)
      referenceDate: refDate,
      publishedOnly: true,
    });

    assert.equal(selected.length, 1);
    assert.equal(selected[0].topicId, 'lm-life-20260915-fresh-topic');
  });

  await t.test('65. Already-PUBLISHED article/platform combination is excluded from automatic reposting', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-idempotency-test-'));
    const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

    const topicId = 'lm-life-20260915-already-published';
    const topic = createMockTopic({
      id: topicId,
      status: 'PUBLISHED',
      publishedAt: '2026-09-15T06:00:00.000Z',
    });

    // Record that Facebook and Instagram are already PUBLISHED
    await historyRepo.recordEntry({
      runId: 'srun-prev-1',
      topicId,
      pillar: 'life',
      canonicalTopic: 'Already Published Topic',
      contentHash: 'hash-abc',
      assetHash: 'hash-xyz',
      idempotencyKey: `lm-soc-${topicId}-hash-abc`,
      targetPlatforms: ['facebook', 'instagram'],
      platformResults: {
        facebook: {
          platform: 'facebook',
          status: 'PUBLISHED',
          postId: 'fb-post-12345',
          publishedAt: '2026-09-15T07:00:00.000Z',
          idempotencyKey: `lm-soc-${topicId}-fb`,
        },
        instagram: {
          platform: 'instagram',
          status: 'PUBLISHED',
          postId: 'ig-post-12345',
          publishedAt: '2026-09-15T07:00:00.000Z',
          idempotencyKey: `lm-soc-${topicId}-ig`,
        },
      },
      reviewScore: 90,
      overallStatus: 'COMPLETED',
      createdAt: '2026-09-15T07:00:00.000Z',
      updatedAt: '2026-09-15T07:00:00.000Z',
    });

    const isFbPub = await historyRepo.isPlatformPublished(topicId, 'facebook');
    const isIgPub = await historyRepo.isPlatformPublished(topicId, 'instagram');
    assert.equal(isFbPub, true);
    assert.equal(isIgPub, true);

    const selected = await selectSocialOpportunities([topic], {
      maxOpportunities: 1,
      historyRepository: historyRepo,
      configuredPlatforms: ['facebook', 'instagram'],
      publishedOnly: true,
      referenceDate: '2026-09-15T12:00:00.000Z',
    });

    // Since all configured target platforms are already PUBLISHED, topic is excluded
    assert.equal(selected.length, 0);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('66. Content published more than 24 hours ago is strictly excluded when no fresh content exists', async () => {
    const refDate = new Date('2026-09-15T18:00:00.000Z');

    // Reproducing scenario: articles published 30 hours, 54 hours, and 5 days prior
    const old1 = createMockTopic({
      id: 'lm-life-20260914-yesterday-noon',
      status: 'PUBLISHED',
      publishedAt: '2026-09-14T11:00:00.000Z', // 31 hours old (> 24 hours)
    });
    const old2 = createMockTopic({
      id: 'lm-tech-ai-20260913-apple-tv-last-seen-series',
      status: 'PUBLISHED',
      publishedAt: '2026-09-13T12:54:45.409Z',
    });
    const old3 = createMockTopic({
      id: 'lm-now-20260910-tommy-mcmillen',
      status: 'PUBLISHED',
      publishedAt: '2026-09-10T08:00:00.000Z',
    });

    const selected = await selectSocialOpportunities([old1, old2, old3], {
      maxOpportunities: 1,
      // Default maxFreshnessDays = 1 (24h)
      referenceDate: refDate,
      publishedOnly: true,
    });

    assert.equal(selected.length, 0);
  });

  await t.test('67. Editorial failure with zero new publications does not cause social fallback to old content', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-fallback-isolation-'));
    const contentDir = path.join(tempDir, 'content');
    const contentRepo = new FilesystemContentRepository({ contentRoot: contentDir });

    // Seed only older articles in the content repository (simulating failed today editorial run)
    await contentRepo.create({
      pillar: 'tech-ai',
      slug: 'apple-tv-last-seen-series-what-to-know',
      content: 'Sample content',
      frontmatter: {
        title: 'Apple Tv Last Seen Series: what to know',
        description: 'A practical overview',
        pubDate: '2026-09-13T12:54:45.409Z',
        author: 'LifeMode',
        tags: ['tech-ai'],
        featured: false,
        draft: false,
        format: 'standard',
        primaryIntent: 'informational',
        affiliateIntent: false,
        riskLevel: 'low',
        sources: [],
        version: 1,
        lifecycleStatus: 'PUBLISHED',
      },
    });

    const result = await runSocialPipeline({
      contentRepository: contentRepo,
      contentRoot: contentDir,
      referenceDate: '2026-09-15T18:00:00.000Z',
      // Uses default maxFreshnessDays = 1
      config: {
        dryRun: true,
        allowPublish: false,
        storageDir: path.join(tempDir, 'social'),
      },
    });

    assert.equal(result.status, 'SUCCESS_NO_PUBLICATION');
    assert.equal(result.selectedCount, 0);
    assert.equal(result.publishedCount, 0);
    assert.ok(result.summary.includes('No eligible fresh published content found'));

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('68. Scheduled editorial automation and watchdog do not invoke the social pipeline', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-sched-decouple-'));
    const contentDir = path.join(tempDir, 'content');
    const contentRepo = new FilesystemContentRepository({ contentRoot: contentDir });

    const schedResult = await runScheduledEditorialAutomation({
      contentRepository: contentRepo,
      contentRoot: contentDir,
      enabled: false,
    });

    assert.equal(schedResult.status, 'SUCCESS_NO_PUBLICATION');
    assert.equal((schedResult as any).socialResult, undefined);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('69. Platform retry only targets previously FAILED platforms while preserving PUBLISHED ones', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-retry-plat-'));
    const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

    const topicId = 'lm-life-20260915-partial-topic';
    const topic = createMockTopic({
      id: topicId,
      status: 'PUBLISHED',
      publishedAt: '2026-09-15T06:00:00.000Z',
    });

    // Run 1: Facebook succeeds, Instagram fails
    await historyRepo.recordEntry({
      runId: 'srun-retry-1',
      topicId,
      pillar: 'life',
      canonicalTopic: topic.canonicalTopic,
      contentHash: 'hash-abc',
      assetHash: 'hash-xyz',
      idempotencyKey: `lm-soc-${topicId}-hash-abc`,
      targetPlatforms: ['facebook', 'instagram'],
      platformResults: {
        facebook: {
          platform: 'facebook',
          status: 'PUBLISHED',
          postId: 'fb-retry-post-1',
          publishedAt: '2026-09-15T07:00:00.000Z',
          idempotencyKey: `lm-soc-${topicId}-fb`,
        },
        instagram: {
          platform: 'instagram',
          status: 'FAILED',
          error: 'Rate limit / network error',
          publishedAt: '2026-09-15T07:00:00.000Z',
          idempotencyKey: `lm-soc-${topicId}-ig`,
        },
      },
      reviewScore: 88,
      overallStatus: 'PARTIAL',
      createdAt: '2026-09-15T07:00:00.000Z',
      updatedAt: '2026-09-15T07:00:00.000Z',
    });

    // Verify selection only targets Instagram
    const selected = await selectSocialOpportunities([topic], {
      maxOpportunities: 1,
      historyRepository: historyRepo,
      configuredPlatforms: ['facebook', 'instagram'],
      referenceDate: '2026-09-15T12:00:00.000Z',
    });

    assert.equal(selected.length, 1);
    assert.deepEqual(selected[0].targetPlatforms, ['instagram']);

    // Now simulate Run 2 (retry): Instagram succeeds
    await historyRepo.recordEntry({
      runId: 'srun-retry-2',
      topicId,
      pillar: 'life',
      canonicalTopic: topic.canonicalTopic,
      contentHash: 'hash-abc',
      assetHash: 'hash-xyz',
      idempotencyKey: `lm-soc-${topicId}-hash-abc`,
      targetPlatforms: ['instagram'],
      platformResults: {
        instagram: {
          platform: 'instagram',
          status: 'PUBLISHED',
          postId: 'ig-retry-post-2',
          publishedAt: '2026-09-15T12:00:00.000Z',
          idempotencyKey: `lm-soc-${topicId}-ig`,
        },
      },
      reviewScore: 88,
      overallStatus: 'COMPLETED',
      createdAt: '2026-09-15T12:00:00.000Z',
      updatedAt: '2026-09-15T12:00:00.000Z',
    });

    // Verify history now holds PUBLISHED for both Facebook and Instagram
    const isFb = await historyRepo.isPlatformPublished(topicId, 'facebook');
    const isIg = await historyRepo.isPlatformPublished(topicId, 'instagram');
    assert.equal(isFb, true);
    assert.equal(isIg, true);

    // Run 3: Verify topic is now completely ineligible for further automatic posting
    const selectedAfter = await selectSocialOpportunities([topic], {
      maxOpportunities: 1,
      historyRepository: historyRepo,
      configuredPlatforms: ['facebook', 'instagram'],
      referenceDate: '2026-09-15T13:00:00.000Z',
    });
    assert.equal(selectedAfter.length, 0);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('70. Maximum 1 article per scheduled Social Run is strictly enforced', async () => {
    const freshArticles: EditorialTopic[] = [];
    for (let i = 1; i <= 5; i++) {
      freshArticles.push(
        createMockTopic({
          id: `lm-life-20260915-fresh-${i}`,
          slug: `fresh-article-${i}`,
          canonicalTopic: `Fresh Article ${i}`,
          status: 'PUBLISHED',
          publishedAt: `2026-09-15T0${i}:00:00.000Z`,
          totalScore: 80 + i,
        })
      );
    }

    const selected = await selectSocialOpportunities(freshArticles, {
      maxOpportunities: 1, // standard default
      referenceDate: '2026-09-15T12:00:00.000Z',
      publishedOnly: true,
    });

    assert.equal(selected.length, 1);
    // Should be newest published article (article 5)
    assert.equal(selected[0].topicId, 'lm-life-20260915-fresh-5');
  });

  await t.test('71. Facebook and Instagram publishing adapters maintain valid package and dryRun mechanics', async () => {
    const fbAdapter = new FacebookPlatformAdapter();
    const igAdapter = new InstagramPlatformAdapter();

    const content = createMockValidSocialContent();
    const asset = createMockValidVisualAsset({
      url: 'https://media.lifemode.life/social/test-71/visual.jpg',
    });

    const fbPkg = await fbAdapter.prepare(content, asset);
    const fbVal = fbAdapter.validate(fbPkg);
    assert.equal(fbVal.valid, true);

    const fbRes = await fbAdapter.publish(fbPkg, { dryRun: true });
    assert.equal(fbRes.status, 'DRY_RUN');

    const igPkg = await igAdapter.prepare(content, asset);
    const igVal = igAdapter.validate(igPkg);
    assert.equal(igVal.valid, true);

    const igRes = await igAdapter.publish(igPkg, { dryRun: true });
    assert.equal(igRes.status, 'DRY_RUN');
  });

  await t.test('72. 24-hour freshness boundary strictly includes 23h-old content and excludes 25h-old content', async () => {
    const refDate = new Date('2026-09-15T12:00:00.000Z');
    const within24h = createMockTopic({
      id: 'lm-life-20260914-23h-old',
      status: 'PUBLISHED',
      publishedAt: '2026-09-14T13:00:00.000Z', // 23 hours prior -> ELIGIBLE
      totalScore: 85,
    });
    const beyond24h = createMockTopic({
      id: 'lm-life-20260914-25h-old',
      status: 'PUBLISHED',
      publishedAt: '2026-09-14T11:00:00.000Z', // 25 hours prior -> INELIGIBLE
      totalScore: 92, // higher score, but stale
    });

    const selected = await selectSocialOpportunities([within24h, beyond24h], {
      maxOpportunities: 1,
      referenceDate: refDate,
      publishedOnly: true,
    });

    assert.equal(selected.length, 1);
    assert.equal(selected[0].topicId, 'lm-life-20260914-23h-old');
  });
});
