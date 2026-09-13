import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  runEditorialAutomation,
  FilesystemContentRepository,
  AstroGitPublisher,
  GitCli,
  FixtureGenerationProvider,
  FixtureReviewProvider,
  FixtureEditorialResearchProvider,
  FixturePublishingProvider,
  type IDiscoveryAdapter,
  type DiscoveryResult,
  type IGenerationProvider,
  type IEditorialImageProvider,
  type EditorialImageResult,
  type EditorialImageGenerationInput,
} from '../src/lib/editorial/index.ts';
import type { ISocialAssetStorageProvider, AssetUploadRequest, AssetUploadResult } from '../src/lib/social/images/storage/contracts.ts';

const execFileAsync = promisify(execFile);

// 1x1 Mock PNG buffer
const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const MOCK_PNG_BUFFER = Buffer.from(FIXTURE_PNG_BASE64, 'base64');

class MockDryRunImageProvider implements IEditorialImageProvider {
  readonly name = 'Mock Dry-Run Image Provider';
  readonly providerId = 'mock-dryrun-image';
  public generateCalls: EditorialImageGenerationInput[] = [];

  isConfigured(): boolean {
    return true;
  }

  async generate(input: EditorialImageGenerationInput): Promise<EditorialImageResult> {
    this.generateCalls.push(input);
    return {
      success: true,
      status: 'SUCCESS',
      imageBuffer: MOCK_PNG_BUFFER,
      mimeType: 'image/png',
      width: 1536,
      height: 864,
      provider: this.providerId,
      model: 'mock-flux-v1',
      durationMs: 5,
    };
  }
}

class MockDryRunStorageProvider implements ISocialAssetStorageProvider {
  readonly name = 'Mock Dry-Run Storage Provider';
  public uploadCalls: AssetUploadRequest[] = [];

  isConfigured(): boolean {
    return true;
  }

  getObjectKey(topicId: string, assetHash: string, _mimeType: string): string {
    return `editorial/${topicId}/${assetHash}.png`;
  }

  async uploadAsset(request: AssetUploadRequest): Promise<AssetUploadResult> {
    this.uploadCalls.push(request);
    return {
      success: true,
      status: 'SUCCESS',
      publicUrl: `https://assets.lifemode.life/editorial/${request.topicId}/hero.png`,
      objectKey: `editorial/${request.topicId}/hero.png`,
      contentType: request.mimeType,
      sizeBytes: request.buffer.length,
      assetHash: request.assetHash,
      provider: this.name,
      durationMs: 2,
    };
  }
}

async function createIsolatedTempWorkspace(prefix = 'lifemode-e2e-dryrun-'): Promise<{
  repoDir: string;
  contentDir: string;
  cleanup: () => Promise<void>;
}> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const contentDir = path.join(repoDir, 'src', 'content');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'travel'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'life'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'money'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'wellbeing'), { recursive: true });

  await execFileAsync('git', ['init', '-b', 'master'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 'LifeMode E2E DryRun Tester'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 'e2e-dryrun@lifemode.local'], { cwd: repoDir });

  const readmePath = path.join(repoDir, 'README.md');
  await fs.writeFile(readmePath, '# Isolated Test Repository', 'utf-8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoDir });
  await execFileAsync('git', ['commit', '-m', 'chore: initial commit'], { cwd: repoDir });

  const cleanup = async () => {
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  };

  return { repoDir, contentDir, cleanup };
}

test('Controlled E2E Dry-Run: Valid article traverses all 8 pipeline stages to publication eligibility', async () => {
  const { repoDir, contentDir, cleanup } = await createIsolatedTempWorkspace('lifemode-e2e-valid-');
  const storagePath = path.join(repoDir, 'candidates.json');

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir, allowUnrelatedChanges: true },
    });

    const mockImageProvider = new MockDryRunImageProvider();
    const mockStorageProvider = new MockDryRunStorageProvider();

    const singleSignalAdapter: IDiscoveryAdapter = {
      name: 'Curated Signal Discovery Adapter',
      sourceType: 'RSS_FEEDS',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Curated Signal Discovery Adapter',
        sourceType: 'RSS_FEEDS',
        status: 'AVAILABLE',
        signals: [
          {
            source: 'RSS_FEEDS',
            sourceId: 'rss-nature-architecture-01',
            rawQuery: 'Biophilic Architectural Design for Modern Workspaces',
            timestamp: new Date().toISOString(),
            category: 'tech-ai',
            sourceUrl: 'https://nature.org/sustainable-architecture',
            metrics: {
              relativeInterest: 95,
              searchVolume: 15000,
              visualPotentialScore: 92,
            },
            metadata: {
              publisher: 'Nature Architecture Journal',
            },
          },
        ],
        fetchedAt: new Date().toISOString(),
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 75,
      providerMode: 'fixture',
      storagePath,
      discoveryAdapters: [singleSignalAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      researchProvider: new FixtureEditorialResearchProvider(),
      generationProvider: new FixtureGenerationProvider(),
      reviewProvider: new FixtureReviewProvider({ outcome: 'PASS' }),
      publishingProvider: new FixturePublishingProvider(),
      imageConfig: {
        enabled: true,
        strategy: 'cloudflare',
        cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: true },
        bfl: { model: 'flux-pro-1.1', configured: false },
        targetWidth: 1536,
        targetHeight: 864,
        aspectRatio: '16:9',
        maxRetries: 1,
        costGuard: { enabled: true, dailyLimit: 5, monthlyLimit: 120 },
      },
      imagePrimaryProvider: mockImageProvider,
      imageStorageProvider: mockStorageProvider,
    });

    // 1. Overall Pipeline Result
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.dryRun, true);
    assert.equal(result.discoveredCount, 1);
    assert.equal(result.candidateCount, 1);
    assert.equal(result.selectedCount, 1);
    assert.equal(result.processedCount, 1);
    assert.equal(result.succeededCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.rejectedCount, 0);
    assert.equal(result.opportunities.length, 1);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'DRY_RUN');

    // 2. Stage 1: Discovery & Selection
    assert.equal(opp.stageResults.DISCOVERY.status, 'SUCCESS');
    assert.equal(opp.stageResults.SELECTION.status, 'SUCCESS');

    // 3. Stage 2: Brief V2 Construction
    assert.equal(opp.stageResults.BRIEF.status, 'SUCCESS');
    assert.ok(opp.brief, 'Brief V2 must be attached to opportunity');
    assert.equal(opp.brief.pillar, 'tech-ai');
    assert.ok(opp.brief.affiliateOpportunities, 'Affiliate opportunities must be present on brief');
    assert.ok(opp.brief.doNotClaim && opp.brief.doNotClaim.length > 0, 'doNotClaim constraints must be defined');

    // 4. Stage 3: Research Enhancement & Provenance
    assert.equal(opp.stageResults.RESEARCH.status, 'SUCCESS');
    assert.ok(opp.research, 'Research result must be attached');
    assert.ok(opp.research.items && opp.research.items.length > 0, 'Research items must be resolved');
    assert.ok(opp.brief.evidence && opp.brief.evidence.length > 0, 'Evidence must be enriched into brief');

    // 5. Stage 4: Generation & Affiliate Guidance
    assert.equal(opp.stageResults.GENERATION.status, 'SUCCESS');
    assert.ok(opp.generation, 'Generation result must be attached');
    assert.equal(opp.generation.success, true);
    assert.ok(opp.generation.article.content.length > 200);

    // 6. Stage 5: Unified Validation
    assert.equal(opp.stageResults.VALIDATION.status, 'SUCCESS');
    assert.ok(opp.generation.validation.isValid);
    assert.equal(opp.generation.validation.editorialValidation?.passed, true);
    assert.equal(opp.generation.validation.editorialValidation?.checks.structure, true);
    assert.equal(opp.generation.validation.editorialValidation?.checks.evidence, true);
    assert.equal(opp.generation.validation.editorialValidation?.checks.citations, true);
    assert.equal(opp.generation.validation.editorialValidation?.checks.affiliate, true);
    assert.equal(opp.generation.validation.editorialValidation?.checks.risk, true);

    // 7. Stage 6: AI Review / Review Gates
    assert.equal(opp.stageResults.REVIEW.status, 'SUCCESS');
    assert.ok(opp.review);
    assert.equal(opp.review.decision, 'PASS');
    assert.ok(opp.review.overallScore >= 80);
    assert.equal(opp.review.gatePassed, true);

    // 8. Stage 7: Image Stage & Publishing Gate
    assert.equal(opp.stageResults.PUBLISHING_GATE.status, 'SUCCESS');
    assert.ok(opp.publishing);
    assert.equal(opp.publishing.status, 'READY');
    assert.equal(opp.publishing.dryRun, true);
    assert.equal(opp.publishing.gateResult?.eligible, true);
    assert.ok(opp.publishing.publishPackage?.slug);
    assert.equal(opp.publishing.publishPackage?.slug, opp.generation?.article?.slug);

    // 9. Stage 8: Storage & Git Publication (Safe Dry-Run)
    assert.equal(opp.stageResults.STORAGE.status, 'SUCCESS');
    assert.equal(opp.stageResults.GIT_PUBLICATION.status, 'DRY_RUN');

    // Verify storage was written ONLY in isolated temp workspace, not production
    const storedArticle = await repository.get('tech-ai', opp.storage!.article!.slug);
    assert.ok(storedArticle);
    assert.equal(storedArticle.frontmatter.lifecycleStatus, 'STORED');

    // Verify dry-run safety: Git commit count in temp repo remains 1 (the initial commit)
    const commitCount = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoDir });
    assert.equal(commitCount.stdout.trim(), '1');

    // Verify dry-run safety: Zero image calls and zero storage uploads during dry-run
    assert.equal(opp.publishing.imageResult?.skipped, true);
    assert.equal(opp.publishing.imageResult?.reason, 'dry-run');
    assert.equal(mockImageProvider.generateCalls.length, 0, 'Zero image generation quota consumed during dry-run');
    assert.equal(mockStorageProvider.uploadCalls.length, 0, 'Zero storage uploads during dry-run');
  } finally {
    await cleanup();
  }
});

test('Controlled E2E Dry-Run: Negative/Invalid case is deterministically blocked at VALIDATION stage', async () => {
  const { repoDir, contentDir, cleanup } = await createIsolatedTempWorkspace('lifemode-e2e-neg-val-');
  const storagePath = path.join(repoDir, 'candidates.json');

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir, allowUnrelatedChanges: true },
    });

    const mockImageProvider = new MockDryRunImageProvider();
    const mockStorageProvider = new MockDryRunStorageProvider();

    // Custom generation provider that violates doNotClaim constraint and injects fake affiliate tracking
    const invalidGenerationProvider: IGenerationProvider = {
      name: 'Invalid Generation Provider',
      model: 'invalid-test-v1',
      generate: async (req) => ({
        article: {
          title: req.titleAngle,
          slug: req.titleAngle.toLowerCase().replace(/\s+/g, '-'),
          description: 'A test description without proper affiliate disclosure.',
          excerpt: 'Short excerpt.',
          content: [
            '## 1. Fabricated Guarantee',
            'We guarantee 100% cure for all mental fatigue instantly with this hardware setup.',
            'Buy immediately using [Partner Hub](https://unapproved-affiliate-network.com?aff_id=fake999) with promo code FAKE20.',
            '## 2. Conclusion',
            'Concluding notes.'
          ].join('\n'),
          faq: [],
          sources: [
            { name: 'Reddit Thread', url: 'https://reddit.com/r/productivity/fake' }
          ],
          internalLinks: [],
          affiliateIntents: [],
          socialHooks: [],
        },
        metadata: {
          provider: 'Invalid Generation Provider',
          model: 'invalid-test-v1',
          generatedAt: new Date().toISOString(),
          inputTokenEstimate: 100,
          outputTokenEstimate: 100,
          durationMs: 5,
        },
      }),
    };

    const discoveryAdapter: IDiscoveryAdapter = {
      name: 'Invalid Test Signal Adapter',
      sourceType: 'RSS_FEEDS',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Invalid Test Signal Adapter',
        sourceType: 'RSS_FEEDS',
        status: 'AVAILABLE',
        signals: [
          {
            source: 'RSS_FEEDS',
            sourceId: 'rss-invalid-01',
            rawQuery: 'Quick Fix Mental Fatigue Solutions',
            timestamp: new Date().toISOString(),
            category: 'wellbeing',
            sourceUrl: 'https://example.com/wellness',
            metrics: { relativeInterest: 90, searchVolume: 10000, visualPotentialScore: 80 },
          },
        ],
        fetchedAt: new Date().toISOString(),
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      storagePath,
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      generationProvider: invalidGenerationProvider,
      reviewProvider: new FixtureReviewProvider({ outcome: 'PASS' }),
      publishingProvider: new FixturePublishingProvider(),
      imagePrimaryProvider: mockImageProvider,
      imageStorageProvider: mockStorageProvider,
    });

    // Verify pipeline failed cleanly
    assert.equal(result.status, 'FAILED');
    assert.equal(result.succeededCount, 0);
    assert.equal(result.failedCount, 1);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'FAILED');
    assert.equal(opp.failedStage, 'VALIDATION');
    assert.equal(opp.stageResults.VALIDATION.status, 'FAILED');
    assert.equal(opp.stageResults.REVIEW.status, 'PENDING');
    assert.equal(opp.stageResults.PUBLISHING_GATE.status, 'PENDING');
    assert.equal(opp.stageResults.STORAGE.status, 'PENDING');
    assert.equal(opp.stageResults.GIT_PUBLICATION.status, 'PENDING');

    // Verify NO article was written to content repository
    const stored = await repository.list();
    assert.equal(stored.length, 0);

    // Verify NO image was generated for failed validation
    assert.equal(mockImageProvider.generateCalls.length, 0);
  } finally {
    await cleanup();
  }
});

test('Controlled E2E Dry-Run: Negative/Invalid case is deterministically blocked at REVIEW stage', async () => {
  const { repoDir, contentDir, cleanup } = await createIsolatedTempWorkspace('lifemode-e2e-neg-rev-');
  const storagePath = path.join(repoDir, 'candidates.json');

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir, allowUnrelatedChanges: true },
    });

    const mockImageProvider = new MockDryRunImageProvider();
    const mockStorageProvider = new MockDryRunStorageProvider();

    // Reviewer that rejects content due to editorial quality / safety
    const rejectingReviewer = new FixtureReviewProvider({ outcome: 'REJECT' });

    const discoveryAdapter: IDiscoveryAdapter = {
      name: 'Review Test Signal Adapter',
      sourceType: 'RSS_FEEDS',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Review Test Signal Adapter',
        sourceType: 'RSS_FEEDS',
        status: 'AVAILABLE',
        signals: [
          {
            source: 'RSS_FEEDS',
            sourceId: 'rss-rev-reject-01',
            rawQuery: 'Minimalist Interior Aesthetics',
            timestamp: new Date().toISOString(),
            category: 'life',
            sourceUrl: 'https://example.com/interior',
            metrics: { relativeInterest: 92, searchVolume: 12000, visualPotentialScore: 85 },
          },
        ],
        fetchedAt: new Date().toISOString(),
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      storagePath,
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      generationProvider: new FixtureGenerationProvider(),
      reviewProvider: rejectingReviewer,
      publishingProvider: new FixturePublishingProvider(),
      imagePrimaryProvider: mockImageProvider,
      imageStorageProvider: mockStorageProvider,
    });

    // Rejection results in SUCCESS overall run (safe handling) but 1 rejected opportunity
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 0);
    assert.equal(result.rejectedCount, 1);
    assert.equal(result.failedCount, 0);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'REJECTED');
    assert.equal(opp.failedStage, 'REVIEW');
    assert.equal(opp.stageResults.VALIDATION.status, 'SUCCESS');
    assert.equal(opp.stageResults.REVIEW.status, 'SUCCESS');
    assert.equal(opp.stageResults.PUBLISHING_GATE.status, 'PENDING');
    assert.equal(opp.stageResults.STORAGE.status, 'PENDING');

    // Verify NO article was written to content repository
    const stored = await repository.list();
    assert.equal(stored.length, 0);

    // Verify NO image was generated for rejected review
    assert.equal(mockImageProvider.generateCalls.length, 0);
  } finally {
    await cleanup();
  }
});

test('Controlled E2E Dry-Run: Negative case is deterministically blocked at PUBLISHING_GATE when required image is missing without fallback', async () => {
  const { repoDir, contentDir, cleanup } = await createIsolatedTempWorkspace('lifemode-e2e-neg-img-');
  const storagePath = path.join(repoDir, 'candidates.json');

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir, allowUnrelatedChanges: true },
    });

    const mockImageProvider = new MockDryRunImageProvider();
    const mockStorageProvider = new MockDryRunStorageProvider();

    const discoveryAdapter: IDiscoveryAdapter = {
      name: 'Image Gate Test Signal Adapter',
      sourceType: 'RSS_FEEDS',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Image Gate Test Signal Adapter',
        sourceType: 'RSS_FEEDS',
        status: 'AVAILABLE',
        signals: [
          {
            source: 'RSS_FEEDS',
            sourceId: 'rss-img-gate-01',
            rawQuery: 'Architectural Timber Pavilions',
            timestamp: new Date().toISOString(),
            category: 'travel',
            sourceUrl: 'https://example.com/pavilions',
            metrics: { relativeInterest: 94, searchVolume: 11000, visualPotentialScore: 95 },
          },
        ],
        fetchedAt: new Date().toISOString(),
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: false, // Live mode check to exercise production image gate requirement
      allowCommit: false,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      storagePath,
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      generationProvider: new FixtureGenerationProvider(),
      reviewProvider: new FixtureReviewProvider({ outcome: 'PASS' }),
      publishingProvider: new FixturePublishingProvider(),
      imageConfig: {
        enabled: false, // Image generation disabled
        allowNoImageFallback: false, // No fallback policy -> strict block
        strategy: 'cloudflare',
        cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: false },
        bfl: { model: 'flux-pro-1.1', configured: false },
        targetWidth: 1536,
        targetHeight: 864,
        aspectRatio: '16:9',
        maxRetries: 0,
        costGuard: { enabled: false, dailyLimit: 5, monthlyLimit: 120 },
      },
      imagePrimaryProvider: mockImageProvider,
      imageStorageProvider: mockStorageProvider,
    });

    // Verify publication is blocked at PUBLISHING_GATE
    assert.equal(result.status, 'FAILED');
    assert.equal(result.failedCount, 1);
    assert.equal(result.succeededCount, 0);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'FAILED');
    assert.equal(opp.failedStage, 'PUBLISHING_GATE');
    assert.equal(opp.stageResults.VALIDATION.status, 'SUCCESS');
    assert.equal(opp.stageResults.REVIEW.status, 'SUCCESS');
    assert.equal(opp.stageResults.PUBLISHING_GATE.status, 'FAILED');
    assert.equal(opp.stageResults.PUBLISHING_GATE.error?.code, 'IMAGE_REQUIRED');
    assert.equal(opp.stageResults.STORAGE.status, 'PENDING');
    assert.equal(opp.stageResults.GIT_PUBLICATION.status, 'PENDING');

    // Verify NO article was written to content repository
    const stored = await repository.list();
    assert.equal(stored.length, 0);
  } finally {
    await cleanup();
  }
});

test('Controlled E2E Isolated Run: Mock image provider generates and persists image frontmatter end-to-end', async () => {
  const { repoDir, contentDir, cleanup } = await createIsolatedTempWorkspace('lifemode-e2e-img-mock-');
  const storagePath = path.join(repoDir, 'candidates.json');

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir, allowUnrelatedChanges: true },
    });

    const mockImageProvider = new MockDryRunImageProvider();
    const mockStorageProvider = new MockDryRunStorageProvider();

    const discoveryAdapter: IDiscoveryAdapter = {
      name: 'Mock Image Signal Adapter',
      sourceType: 'RSS_FEEDS',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Mock Image Signal Adapter',
        sourceType: 'RSS_FEEDS',
        status: 'AVAILABLE',
        signals: [
          {
            source: 'RSS_FEEDS',
            sourceId: 'rss-img-mock-01',
            rawQuery: 'Nordic Spa Architecture and Geothermal Design',
            timestamp: new Date().toISOString(),
            category: 'travel',
            sourceUrl: 'https://example.com/nordic-spa',
            metrics: { relativeInterest: 96, searchVolume: 14000, visualPotentialScore: 98 },
          },
        ],
        fetchedAt: new Date().toISOString(),
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      storagePath,
      discoveryAdapters: [discoveryAdapter],
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      generationProvider: new FixtureGenerationProvider(),
      reviewProvider: new FixtureReviewProvider({ outcome: 'PASS' }),
      publishingProvider: new FixturePublishingProvider(),
      imageConfig: {
        enabled: true,
        strategy: 'cloudflare',
        cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: true },
        bfl: { model: 'flux-pro-1.1', configured: false },
        targetWidth: 1536,
        targetHeight: 864,
        aspectRatio: '16:9',
        maxRetries: 1,
        costGuard: { enabled: true, dailyLimit: 5, monthlyLimit: 120 },
      },
      imagePrimaryProvider: mockImageProvider,
      imageStorageProvider: mockStorageProvider,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 1);
    assert.equal(result.failedCount, 0);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'COMPLETED');
    assert.equal(opp.stageResults.PUBLISHING_GATE.status, 'SUCCESS');
    assert.equal(opp.stageResults.STORAGE.status, 'SUCCESS');
    assert.equal(opp.stageResults.GIT_PUBLICATION.status, 'SUCCESS');

    // Verify mock image provider was invoked
    assert.equal(mockImageProvider.generateCalls.length, 1);
    assert.equal(mockStorageProvider.uploadCalls.length, 1);

    // Verify stored article in isolated test repo has image URL in frontmatter
    const storedArticles = await repository.list();
    assert.equal(storedArticles.length, 1);
    assert.ok(storedArticles[0].frontmatter.image);
    assert.ok(storedArticles[0].frontmatter.image.includes('assets.lifemode.life/editorial/'));
  } finally {
    await cleanup();
  }
});

