import type { EditorialTopic } from '../editorial/types.ts';
import type {
  GeneratedSocialContent,
  SocialVisualAsset,
  SocialPlatform,
  SocialPlatformPackage,
  SocialPlatformPublishResult,
  SocialManifestEntry,
  SocialAutomationResult,
} from './types.ts';
import { loadSocialConfig, type SocialAutomationConfig } from './config.ts';
import { selectSocialOpportunities } from './selection.ts';
import { buildSocialBrief } from './brief.ts';
import type { ISocialGenerationProvider } from './generation/contracts.ts';
import { AIRouterSocialGenerationProvider } from './generation/providers/ai-router.ts';
import { FixtureSocialGenerationProvider } from './generation/providers/fixture.ts';
import type { ISocialImageProvider } from './images/contracts.ts';
import { FixtureSocialImageProvider } from './images/providers/fixture.ts';
import { APISocialImageProvider } from './images/providers/api.ts';
import { validateSocialContent, validateSocialVisualAsset } from './validation.ts';
import type { ISocialReviewProvider } from './review/contracts.ts';
import { AIRouterSocialReviewProvider } from './review/providers/ai-router.ts';
import { FixtureSocialReviewProvider } from './review/providers/fixture.ts';
import type { ISocialPlatformAdapter } from './platforms/contracts.ts';
import { FacebookPlatformAdapter } from './platforms/facebook.ts';
import { InstagramPlatformAdapter } from './platforms/instagram.ts';
import { PinterestPlatformAdapter } from './platforms/pinterest.ts';
import type { ISocialAssetStorageProvider } from './images/storage/contracts.ts';
import { FixtureSocialAssetStorageProvider } from './images/storage/fixture.ts';
import { CloudflareR2SocialAssetStorageProvider } from './images/storage/r2.ts';
import {
  FilesystemSocialHistoryRepository,
  type ISocialHistoryRepository,
  hashString,
} from './storage/repository.ts';
import { loadCandidates } from '../editorial/discovery/storage.ts';

export interface SocialPipelineRunOptions {
  config?: Partial<SocialAutomationConfig>;
  candidates?: EditorialTopic[];
  storagePath?: string;
  generationProvider?: ISocialGenerationProvider;
  imageProvider?: ISocialImageProvider;
  storageProvider?: ISocialAssetStorageProvider;
  reviewProvider?: ISocialReviewProvider;
  platformAdapters?: Map<SocialPlatform, ISocialPlatformAdapter>;
  historyRepository?: ISocialHistoryRepository;
}

export const MAX_SOCIAL_REVISIONS = 1;

/**
 * Runs the end-to-end LifeMode Social Automation V1 Pipeline.
 */
export async function runSocialPipeline(options: SocialPipelineRunOptions = {}): Promise<SocialAutomationResult> {
  const startTime = Date.now();
  const runId = `srun-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const config = loadSocialConfig(options.config);

  const historyRepo = options.historyRepository || new FilesystemSocialHistoryRepository(config.storageDir);

  // Initialize providers
  const genProvider: ISocialGenerationProvider =
    options.generationProvider ||
    (config.providerMode === 'router'
      ? new AIRouterSocialGenerationProvider()
      : new FixtureSocialGenerationProvider());

  const imageProvider: ISocialImageProvider =
    options.imageProvider ||
    (config.imageProviderMode === 'fixture' || config.dryRun || config.storageTest
      ? new FixtureSocialImageProvider()
      : new APISocialImageProvider());

  const storageProvider: ISocialAssetStorageProvider =
    options.storageProvider ||
    (config.storageTest || (config.storageConfig.provider === 'r2' && config.storageConfig.configured)
      ? new CloudflareR2SocialAssetStorageProvider(config.storageConfig)
      : config.dryRun || config.storageConfig.provider === 'fixture'
        ? new FixtureSocialAssetStorageProvider(config.storageConfig.publicBaseUrl)
        : new CloudflareR2SocialAssetStorageProvider(config.storageConfig));

  const reviewProvider: ISocialReviewProvider =
    options.reviewProvider ||
    (config.providerMode === 'router'
      ? new AIRouterSocialReviewProvider()
      : new FixtureSocialReviewProvider());

  // Initialize platform adapters
  const defaultAdapters = new Map<SocialPlatform, ISocialPlatformAdapter>([
    ['facebook', new FacebookPlatformAdapter()],
    ['instagram', new InstagramPlatformAdapter()],
    ['pinterest', new PinterestPlatformAdapter()],
  ]);
  const platformAdapters = options.platformAdapters || defaultAdapters;

  const platformSummary: Record<SocialPlatform, { published: number; failed: number; skipped: number }> = {
    facebook: { published: 0, failed: 0, skipped: 0 },
    instagram: { published: 0, failed: 0, skipped: 0 },
    pinterest: { published: 0, failed: 0, skipped: 0 },
  };

  // Fail fast in storage-test mode if R2 storage is not configured
  if (config.storageTest && !storageProvider.isConfigured()) {
    const durationMs = Math.max(1, Date.now() - startTime);
    const errorMsg = 'Cloudflare R2 storage credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL) not configured.';
    const storageTestDetails = {
      r2ProviderUsed: 'REAL' as const,
      facebookPreparation: 'FAIL' as const,
      instagramPreparation: 'FAIL' as const,
      pinterestPreparation: 'FAIL' as const,
      externalPublication: 'SKIPPED' as const,
      gitCommitPush: 'SKIPPED' as const,
    };
    const summary = [
      '====================================================',
      ' LifeMode Social Storage Test Results               ',
      '====================================================',
      '* R2 provider used:       REAL',
      '* uploaded object key:    N/A',
      '* public HTTPS URL:       N/A',
      '* Facebook preparation:   FAIL',
      '* Instagram preparation:  FAIL',
      '* Pinterest preparation:  FAIL',
      '* external publication:   SKIPPED',
      '* git commit/push:        SKIPPED',
      '====================================================',
      `Error: ${errorMsg}`,
    ].join('\n');

    return {
      runId,
      status: 'FAILED',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: true,
      selectedCount: 0,
      processedCount: 0,
      succeededCount: 0,
      rejectedCount: 0,
      failedCount: 1,
      publishedCount: 0,
      platformSummary,
      manifestEntries: [],
      summary,
      error: errorMsg,
      storageTestDetails,
    };
  }

  // 1. Load Candidates Pool
  let candidatePool: EditorialTopic[] = options.candidates || [];
  if (candidatePool.length === 0) {
    try {
      candidatePool = await loadCandidates(options.storagePath);
    } catch {
      candidatePool = [];
    }
  }

  // 2. Select Social Opportunities
  let opportunities = await selectSocialOpportunities(candidatePool, {
    maxOpportunities: config.maxOpportunities,
    minScoreThreshold: config.minScoreThreshold,
    historyRepository: historyRepo,
    baseUrl: config.baseUrl,
  });

  // If storageTest is active and no candidates found, synthesize a representative test opportunity
  if (config.storageTest && opportunities.length === 0) {
    opportunities = [
      {
        topicId: 'lm-test-storage-r2-verification',
        canonicalTopic: 'The Art of Intentional Living in the Modern Era',
        pillar: 'life',
        slug: 'the-art-of-intentional-living-in-the-modern-era',
        totalScore: 90,
        socialPotential: 90,
        pinterestPotential: 90,
        opportunityType: 'ARTICLE_AND_SOCIAL',
        targetPlatforms: ['facebook', 'instagram', 'pinterest'],
        destinationUrl: `${config.baseUrl}/life/the-art-of-intentional-living-in-the-modern-era`,
        tags: ['life', 'mindfulness', 'design'],
      },
    ];
  }

  if (opportunities.length === 0) {
    const durationMs = Math.max(1, Date.now() - startTime);
    return {
      runId,
      status: 'SUCCESS_NO_PUBLICATION',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: config.dryRun,
      selectedCount: 0,
      processedCount: 0,
      succeededCount: 0,
      rejectedCount: 0,
      failedCount: 0,
      publishedCount: 0,
      platformSummary,
      manifestEntries: [],
      summary: 'No eligible social opportunities found matching score thresholds.',
    };
  }

  const manifestEntries: SocialManifestEntry[] = [];
  let succeededCount = 0;
  let rejectedCount = 0;
  let failedCount = 0;
  let totalPublishedCount = 0;

  let lastUploadedObjectKey: string | undefined;
  let lastUploadedPublicUrl: string | undefined;
  let lastStorageTestError: string | undefined;
  const storageTestPrepStatus: Record<SocialPlatform, 'SUCCESS' | 'FAIL'> = {
    facebook: 'FAIL',
    instagram: 'FAIL',
    pinterest: 'FAIL',
  };

  // 3. Process Each Opportunity Sequentially with Failure Isolation
  for (const opp of opportunities) {
    try {
      // Step A: Build Brief
      const brief = buildSocialBrief(opp);

      // Step B: Generate Content
      const genResult = await genProvider.generateSocialContent(brief);
      if (!genResult.success || !genResult.content) {
        failedCount++;
        if (config.storageTest) {
          lastStorageTestError = (typeof genResult.error === 'object' ? (genResult.error as any)?.message : genResult.error) || 'Failed to generate social content';
        }
        continue;
      }

      let content: GeneratedSocialContent = genResult.content;

      // Step C: Content Validation
      const validationResult = validateSocialContent(content);
      if (!validationResult.valid) {
        rejectedCount++;
        if (config.storageTest) lastStorageTestError = `Content validation failed: ${validationResult.errors.join(', ')}`;
        continue;
      }

      // Step D: AI Review
      let reviewResult = await reviewProvider.reviewSocialContent({ brief, content });

      // Step E: Bounded Quality Revision (Max 1)
      if (reviewResult.verdict === 'REVISE' && MAX_SOCIAL_REVISIONS > 0) {
        if (reviewResult.revisedContent) {
          content = reviewResult.revisedContent;
        }
        // Re-review revised content
        reviewResult = await reviewProvider.reviewSocialContent({ brief, content });
      }

      if (reviewResult.verdict === 'REJECT' || reviewResult.score < 80) {
        rejectedCount++;
        if (config.storageTest) lastStorageTestError = `Review rejected content with score ${reviewResult.score}`;
        continue;
      }

      // Step F: Image Asset Generation
      const headlineOverlay = content.imageText?.headline || opp.canonicalTopic.slice(0, 40);
      const imageResult = await imageProvider.generateImage({
        topicId: opp.topicId,
        pillar: opp.pillar,
        prompt: content.visualConcept,
        format: '1080x1350',
        headlineOverlay,
        subheadlineOverlay: `LIFEMODE ${opp.pillar.toUpperCase()}`,
      });

      if (!imageResult.success || !imageResult.asset) {
        failedCount++;
        if (config.storageTest) lastStorageTestError = imageResult.error || 'Image asset generation failed';
        continue;
      }

      const asset: SocialVisualAsset = imageResult.asset;

      // Step G: Asset Validation
      const assetValidation = validateSocialVisualAsset(asset);
      if (!assetValidation.valid) {
        rejectedCount++;
        if (config.storageTest) lastStorageTestError = `Asset visual validation failed: ${assetValidation.errors.join(', ')}`;
        continue;
      }

      // Step G.2: Asset Storage Upload & Public URL Assignment
      if (asset.buffer) {
        const uploadResult = await storageProvider.uploadAsset({
          topicId: opp.topicId,
          pillar: opp.pillar,
          assetHash: asset.assetHash,
          buffer: asset.buffer,
          mimeType: asset.mimeType,
          format: asset.format,
        });

        if (!uploadResult.success || !uploadResult.publicUrl) {
          failedCount++;
          if (config.storageTest) lastStorageTestError = uploadResult.error || 'R2 storage upload failed';
          continue;
        }

        lastUploadedObjectKey = uploadResult.objectKey;
        lastUploadedPublicUrl = uploadResult.publicUrl;
        asset.url = uploadResult.publicUrl;
      }

      // Guard: Ensure platform preparation never receives an undefined or non-HTTPS image URL
      if (!asset.url || !asset.url.startsWith('https://')) {
        failedCount++;
        if (config.storageTest) lastStorageTestError = `Asset URL is missing or not HTTPS: ${asset.url}`;
        continue;
      }

      const contentHash = hashString(`${content.title}-${content.shortCaption}`);
      const assetHash = asset.assetHash;
      const idempotencyKey = `lm-soc-${opp.topicId}-${contentHash.slice(0, 8)}`;

      const platformResults: Partial<Record<SocialPlatform, SocialPlatformPublishResult>> = {};
      const targetPlatforms = config.storageTest
        ? (['facebook', 'instagram', 'pinterest'] as SocialPlatform[])
        : opp.targetPlatforms;

      // Step H: Platform Preparation & Publication
      for (const platform of targetPlatforms) {
        const adapter = platformAdapters.get(platform);
        if (!adapter) continue;

        try {
          // Check if already published on this platform (skip check during storage test)
          if (!config.storageTest) {
            const alreadyPublished = await historyRepo.isPlatformPublished(opp.topicId, platform);
            if (alreadyPublished) {
              platformResults[platform] = {
                platform,
                status: 'SKIPPED',
                error: 'Topic already published on platform.',
                publishedAt: new Date().toISOString(),
                idempotencyKey: `${idempotencyKey}-${platform}`,
              };
              platformSummary[platform].skipped++;
              continue;
            }
          }

          const pkg: SocialPlatformPackage = await adapter.prepare(content, asset, {
            destinationUrl: opp.destinationUrl,
          });

          const pkgValidation = adapter.validate(pkg);
          if (!pkgValidation.valid) {
            if (config.storageTest) storageTestPrepStatus[platform] = 'FAIL';
            platformResults[platform] = {
              platform,
              status: 'FAILED',
              error: `Package validation failed: ${pkgValidation.errors.join(', ')}`,
              publishedAt: new Date().toISOString(),
              idempotencyKey: pkg.idempotencyKey,
            };
            platformSummary[platform].failed++;
            continue;
          }

          if (config.storageTest) {
            storageTestPrepStatus[platform] = 'SUCCESS';
            // In storage-test mode: strictly skip external publication API calls
            platformResults[platform] = {
              platform,
              status: 'SKIPPED',
              postId: undefined,
              postUrl: pkg.mediaAsset.url,
              publishedAt: new Date().toISOString(),
              idempotencyKey: pkg.idempotencyKey,
            };
            platformSummary[platform].skipped++;
            continue;
          }

          // Publish (respects dryRun & allowPublish)
          const isDryRun = config.dryRun || !config.allowPublish;
          const pubResult = await adapter.publish(pkg, { dryRun: isDryRun });

          platformResults[platform] = pubResult;

          if (pubResult.status === 'PUBLISHED' || pubResult.status === 'DRY_RUN') {
            platformSummary[platform].published++;
            totalPublishedCount++;
          } else if (pubResult.status === 'NOT_CONFIGURED') {
            platformSummary[platform].skipped++;
          } else {
            platformSummary[platform].failed++;
          }
        } catch (platErr: any) {
          if (config.storageTest) storageTestPrepStatus[platform] = 'FAIL';
          platformResults[platform] = {
            platform,
            status: 'FAILED',
            error: platErr?.message || String(platErr),
            publishedAt: new Date().toISOString(),
            idempotencyKey: `${idempotencyKey}-${platform}`,
          };
          platformSummary[platform].failed++;
        }
      }

      // Step I: Record Manifest Entry (only in non-storageTest mode)
      const anySuccess = Object.values(platformResults).some(
        (r) => r?.status === 'PUBLISHED' || r?.status === 'DRY_RUN'
      );

      if (!config.storageTest) {
        const entry: SocialManifestEntry = {
          runId,
          topicId: opp.topicId,
          pillar: opp.pillar,
          canonicalTopic: opp.canonicalTopic,
          contentHash,
          assetHash,
          idempotencyKey,
          targetPlatforms: opp.targetPlatforms,
          platformResults,
          reviewScore: reviewResult.score,
          overallStatus: anySuccess ? (config.dryRun ? 'DRY_RUN' : 'COMPLETED') : 'FAILED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await historyRepo.recordEntry(entry);
        manifestEntries.push(entry);
      }

      if (anySuccess || (config.storageTest && storageTestPrepStatus.facebook === 'SUCCESS' && storageTestPrepStatus.instagram === 'SUCCESS' && storageTestPrepStatus.pinterest === 'SUCCESS')) {
        succeededCount++;
      } else {
        failedCount++;
      }
    } catch (oppErr: any) {
      failedCount++;
      if (config.storageTest) lastStorageTestError = oppErr?.message || String(oppErr);
    }
  }

  const durationMs = Math.max(1, Date.now() - startTime);

  // In storage-test mode, produce the exact required CLI report
  if (config.storageTest) {
    const fbOk = storageTestPrepStatus.facebook === 'SUCCESS';
    const igOk = storageTestPrepStatus.instagram === 'SUCCESS';
    const pinOk = storageTestPrepStatus.pinterest === 'SUCCESS';
    const testPassed = fbOk && igOk && pinOk && Boolean(lastUploadedPublicUrl && lastUploadedPublicUrl.startsWith('https://'));

    const testStatus: SocialAutomationResult['status'] = testPassed ? 'SUCCESS' : 'FAILED';
    const storageTestDetails = {
      r2ProviderUsed: 'REAL' as const,
      objectKey: lastUploadedObjectKey,
      publicUrl: lastUploadedPublicUrl,
      facebookPreparation: storageTestPrepStatus.facebook,
      instagramPreparation: storageTestPrepStatus.instagram,
      pinterestPreparation: storageTestPrepStatus.pinterest,
      externalPublication: 'SKIPPED' as const,
      gitCommitPush: 'SKIPPED' as const,
    };

    const testSummary = [
      '====================================================',
      ' LifeMode Social Storage Test Results               ',
      '====================================================',
      '* R2 provider used:       REAL',
      `* uploaded object key:    ${lastUploadedObjectKey || 'N/A'}`,
      `* public HTTPS URL:       ${lastUploadedPublicUrl || 'N/A'}`,
      `* Facebook preparation:   ${storageTestPrepStatus.facebook}`,
      `* Instagram preparation:  ${storageTestPrepStatus.instagram}`,
      `* Pinterest preparation:  ${storageTestPrepStatus.pinterest}`,
      '* external publication:   SKIPPED',
      '* git commit/push:        SKIPPED',
      '====================================================',
    ];

    if (!testPassed && lastStorageTestError) {
      testSummary.push(`Error: ${lastStorageTestError}`);
    }

    return {
      runId,
      status: testStatus,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: true,
      selectedCount: opportunities.length,
      processedCount: opportunities.length,
      succeededCount: testPassed ? 1 : 0,
      rejectedCount: 0,
      failedCount: testPassed ? 0 : 1,
      publishedCount: 0,
      platformSummary,
      manifestEntries,
      summary: testSummary.join('\n'),
      error: !testPassed ? (lastStorageTestError || 'Storage test failed') : undefined,
      storageTestDetails,
    };
  }

  let status: SocialAutomationResult['status'] = 'SUCCESS';
  if (config.dryRun) {
    status = 'DRY_RUN';
  } else if (succeededCount > 0 && (failedCount > 0 || rejectedCount > 0)) {
    status = 'PARTIAL_SUCCESS';
  } else if (succeededCount === 0 && failedCount > 0) {
    status = 'FAILED';
  } else if (succeededCount === 0) {
    status = 'SUCCESS_NO_PUBLICATION';
  }

  const summary = [
    `Social Automation Run [${status}]`,
    `Selected: ${opportunities.length} | Succeeded: ${succeededCount} | Rejected: ${rejectedCount} | Failed: ${failedCount}`,
    `Platforms: Facebook (${platformSummary.facebook.published} pub, ${platformSummary.facebook.failed} fail) | Instagram (${platformSummary.instagram.published} pub, ${platformSummary.instagram.failed} fail) | Pinterest (${platformSummary.pinterest.published} pub, ${platformSummary.pinterest.failed} fail)`,
  ].join('\n');

  return {
    runId,
    status,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs,
    dryRun: config.dryRun,
    selectedCount: opportunities.length,
    processedCount: opportunities.length,
    succeededCount,
    rejectedCount,
    failedCount,
    publishedCount: totalPublishedCount,
    platformSummary,
    manifestEntries,
    summary,
  };
}
