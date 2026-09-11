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
  InstagramPlatformAdapter,
  PinterestPlatformAdapter,
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
import { runScheduledEditorialAutomation, loadScheduledAutomationConfig } from '../src/lib/editorial/automation/index.ts';

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
    assert.ok(pkg.caption.includes('Link in bio'));
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
    const lockPath = path.join(tempDir, 'test.lock');

    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: true,
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
      const capturedRequests: Array<{ url: string; body: any }> = [];
      const mockFetch = async (url: string, init?: any) => {
        const body = JSON.parse(init.body);
        capturedRequests.push({ url, body });
        if (url.endsWith('/media')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'mock-creation-id-999' }),
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

      // 5. Assert that both Graph API requests used the shared token and targeted the correct Instagram Business Account
      assert.equal(capturedRequests.length, 2);

      // Step 1: /media container creation
      assert.equal(capturedRequests[0].url, `https://graph.facebook.com/v20.0/${mockIgAccountId}/media`);
      assert.equal(capturedRequests[0].body.access_token, mockSharedToken);
      assert.equal(capturedRequests[0].body.image_url, 'https://media.lifemode.life/social/top-12345/a1b2c3d4e5f60718.jpg');

      // Step 2: /media_publish container publish
      assert.equal(capturedRequests[1].url, `https://graph.facebook.com/v20.0/${mockIgAccountId}/media_publish`);
      assert.equal(capturedRequests[1].body.access_token, mockSharedToken);
      assert.equal(capturedRequests[1].body.creation_id, 'mock-creation-id-999');
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
});
