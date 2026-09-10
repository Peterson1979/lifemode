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
    (config.imageProviderMode === 'fixture' || config.dryRun
      ? new FixtureSocialImageProvider()
      : new APISocialImageProvider());

  const storageProvider: ISocialAssetStorageProvider =
    options.storageProvider ||
    (config.storageConfig.provider === 'r2' && config.storageConfig.configured
      ? new CloudflareR2SocialAssetStorageProvider()
      : config.dryRun || config.storageConfig.provider === 'fixture'
        ? new FixtureSocialAssetStorageProvider(config.storageConfig.publicBaseUrl)
        : new CloudflareR2SocialAssetStorageProvider());

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
  const opportunities = await selectSocialOpportunities(candidatePool, {
    maxOpportunities: config.maxOpportunities,
    minScoreThreshold: config.minScoreThreshold,
    historyRepository: historyRepo,
    baseUrl: config.baseUrl,
  });

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

  // 3. Process Each Opportunity Sequentially with Failure Isolation
  for (const opp of opportunities) {
    try {
      // Step A: Build Brief
      const brief = buildSocialBrief(opp);

      // Step B: Generate Content
      const genResult = await genProvider.generateSocialContent(brief);
      if (!genResult.success || !genResult.content) {
        failedCount++;
        continue;
      }

      let content: GeneratedSocialContent = genResult.content;

      // Step C: Content Validation
      const validationResult = validateSocialContent(content);
      if (!validationResult.valid) {
        rejectedCount++;
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
        // If image provider is unconfigured, report cleanly
        failedCount++;
        continue;
      }

      const asset: SocialVisualAsset = imageResult.asset;

      // Step G: Asset Validation
      const assetValidation = validateSocialVisualAsset(asset);
      if (!assetValidation.valid) {
        rejectedCount++;
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
          continue;
        }

        asset.url = uploadResult.publicUrl;
      }

      // Guard: Ensure platform preparation never receives an undefined or non-HTTPS image URL
      if (!asset.url || !asset.url.startsWith('https://')) {
        failedCount++;
        continue;
      }

      const contentHash = hashString(`${content.title}-${content.shortCaption}`);
      const assetHash = asset.assetHash;
      const idempotencyKey = `lm-soc-${opp.topicId}-${contentHash.slice(0, 8)}`;

      const platformResults: Partial<Record<SocialPlatform, SocialPlatformPublishResult>> = {};

      // Step H: Platform Preparation & Publication
      for (const platform of opp.targetPlatforms) {
        const adapter = platformAdapters.get(platform);
        if (!adapter) continue;

        try {
          // Check if already published on this platform
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

          const pkg: SocialPlatformPackage = await adapter.prepare(content, asset, {
            destinationUrl: opp.destinationUrl,
          });

          const pkgValidation = adapter.validate(pkg);
          if (!pkgValidation.valid) {
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

      // Step I: Record Manifest Entry
      const anySuccess = Object.values(platformResults).some(
        (r) => r?.status === 'PUBLISHED' || r?.status === 'DRY_RUN'
      );

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

      if (anySuccess) {
        succeededCount++;
      } else {
        failedCount++;
      }
    } catch (oppErr: any) {
      failedCount++;
    }
  }

  const durationMs = Math.max(1, Date.now() - startTime);

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
