
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type {
  SocialPlatform,
  SocialBrief,
  GeneratedSocialContent,
  SocialVisualAsset,
  SocialManifestEntry,
  SocialPlatformPublishResult,
} from './types.ts';
import { loadSocialConfig, type SocialAutomationConfig } from './config.ts';
import { resolveDestinationUrl, selectSocialOpportunities } from './selection.ts';
import {
  FilesystemSocialHistoryRepository,
  type ISocialHistoryRepository,
  hashString,
} from './storage/repository.ts';
import type { ISocialPlatformAdapter } from './platforms/contracts.ts';
import { FacebookPlatformAdapter } from './platforms/facebook.ts';
import { InstagramPlatformAdapter } from './platforms/instagram.ts';
import { PinterestPlatformAdapter } from './platforms/pinterest.ts';
import { ThreadsPlatformAdapter } from './platforms/threads.ts';
import { FilesystemContentRepository } from '../editorial/storage/repository.ts';
import type { IContentRepository, StoredArticle } from '../editorial/storage/types.ts';
import { resolveGuideRouting } from '../editorial/normalization.ts';
import type { EditorialTopic } from '../editorial/types.ts';
import type { ISocialGenerationProvider } from './generation/contracts.ts';
import { FixtureSocialGenerationProvider } from './generation/providers/fixture.ts';
import { AIRouterSocialGenerationProvider } from './generation/providers/ai-router.ts';
import type { ISocialImageProvider } from './images/contracts.ts';
import { FixtureSocialImageProvider } from './images/providers/fixture.ts';
import { PexelsSocialImageProvider } from './images/providers/pexels.ts';
import type { ISocialAssetStorageProvider } from './images/storage/contracts.ts';
import { FixtureSocialAssetStorageProvider } from './images/storage/fixture.ts';
import { CloudflareR2SocialAssetStorageProvider } from './images/storage/r2.ts';
import type { ISocialReviewProvider } from './review/contracts.ts';
import { FixtureSocialReviewProvider } from './review/providers/fixture.ts';
import { AIRouterSocialReviewProvider } from './review/providers/ai-router.ts';

export interface GuideSocialPipelineRunOptions {
  config?: Partial<SocialAutomationConfig>;
  contentRoot?: string;
  storageDir?: string;
  historyRepository?: ISocialHistoryRepository;
  contentRepository?: IContentRepository;
  platformAdapters?: Map<SocialPlatform, ISocialPlatformAdapter>;
  genProvider?: ISocialGenerationProvider;
  imageProvider?: ISocialImageProvider;
  reviewProvider?: ISocialReviewProvider;
  storageProvider?: ISocialAssetStorageProvider;
  dryRun?: boolean;
  allowPublish?: boolean;
  guides?: StoredArticle[];
  maxFreshnessDays?: number;
  referenceDate?: Date | string;
}

export interface GuideSocialAutomationResult {
  runId: string;
  status: 'COMPLETED' | 'DRY_RUN' | 'FAILED' | 'SKIPPED';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  dryRun: boolean;
  discoveredGuidesCount: number;
  publishedCount: number;
  platformSummary: Record<SocialPlatform, { published: number; failed: number; skipped: number }>;
  manifestEntries: SocialManifestEntry[];
  summary: string;
  error?: string;
}

interface GuideRunArtifact {
  topicId: string;
  title: string;
  destinationUrl: string;
  captions: Partial<Record<SocialPlatform, string>>;
  image: {
    url: string;
    assetHash: string;
    mimeType: string;
    width: number;
    height: number;
    status: string;
    provider: string;
    error?: string;
  };
  imageBuffer?: Uint8Array;
}

/**
 * Runs the separate Guide social publishing pipeline.
 *
 * Writes result.json, manifest.json, platform captions, and available image
 * buffers into GUIDE_SOCIAL_ARTIFACT_DIR when that environment variable is set.
 *
 * Safe mode does not publish externally or write publication history.
 */
export async function runGuideSocialPipeline(
  options: GuideSocialPipelineRunOptions = {}
): Promise<GuideSocialAutomationResult> {
  const startTime = Date.now();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const runId = `lm-guide-soc-run-${dateStr}-${Date.now().toString().slice(-4)}`;
  const startedAt = new Date(startTime).toISOString();

  const artifactDir = process.env.GUIDE_SOCIAL_ARTIFACT_DIR
    ? path.resolve(process.env.GUIDE_SOCIAL_ARTIFACT_DIR)
    : '';

  const runAssets: GuideRunArtifact[] = [];

  const platformSummary: Record<
    SocialPlatform,
    { published: number; failed: number; skipped: number }
  > = {
    facebook: { published: 0, failed: 0, skipped: 0 },
    instagram: { published: 0, failed: 0, skipped: 0 },
    pinterest: { published: 0, failed: 0, skipped: 0 },
    'pinterest-everyday': { published: 0, failed: 0, skipped: 0 },
    threads: { published: 0, failed: 0, skipped: 0 },
  };

  function safeFileName(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function extensionForMimeType(mimeType: string): string {
    switch (mimeType.toLowerCase().split(';')[0].trim()) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/gif':
        return 'gif';
      case 'image/avif':
        return 'avif';
      default:
        return 'jpg';
    }
  }

  async function writeRunArtifacts(
    result: GuideSocialAutomationResult
  ): Promise<void> {
    if (!artifactDir) return;

    const assetsDir = path.join(artifactDir, 'assets');
    const captionsDir = path.join(artifactDir, 'captions');

    await fs.mkdir(assetsDir, { recursive: true });
    await fs.mkdir(captionsDir, { recursive: true });

    const entries = result.manifestEntries.map((entry) => {
      const runAsset = runAssets.find((item) => item.topicId === entry.topicId);
      const safeId = safeFileName(entry.topicId);
      const extension = runAsset
        ? extensionForMimeType(runAsset.image.mimeType)
        : 'jpg';

      return {
        ...entry,
        title: runAsset?.title ?? entry.canonicalTopic,
        destinationUrl: runAsset?.destinationUrl ?? null,
        captions: runAsset?.captions ?? {},
        image: runAsset
          ? {
              url: runAsset.image.url,
              assetHash: runAsset.image.assetHash,
              mimeType: runAsset.image.mimeType,
              width: runAsset.image.width,
              height: runAsset.image.height,
              status: runAsset.image.status,
              provider: runAsset.image.provider,
              error: runAsset.image.error ?? null,
              localFile: runAsset.imageBuffer
                ? `assets/${safeId}.${extension}`
                : null,
            }
          : null,
      };
    });

    for (const item of runAssets) {
      const safeId = safeFileName(item.topicId);

      for (const [platform, caption] of Object.entries(item.captions)) {
        if (typeof caption !== 'string' || caption.length === 0) continue;

        await fs.writeFile(
          path.join(captionsDir, `${safeId}-${platform}.txt`),
          caption,
          'utf8'
        );
      }

      if (item.imageBuffer) {
        const extension = extensionForMimeType(item.image.mimeType);
        await fs.writeFile(
          path.join(assetsDir, `${safeId}.${extension}`),
          item.imageBuffer
        );
      }
    }

    await fs.writeFile(
      path.join(artifactDir, 'manifest.json'),
      JSON.stringify(
        {
          runId: result.runId,
          status: result.status,
          dryRun: result.dryRun,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          discoveredGuidesCount: result.discoveredGuidesCount,
          publishedCount: result.publishedCount,
          platformSummary: result.platformSummary,
          entries,
          summary: result.summary,
        },
        null,
        2
      ),
      'utf8'
    );

    await fs.writeFile(
      path.join(artifactDir, 'result.json'),
      JSON.stringify(result, null, 2),
      'utf8'
    );
  }

  async function finish(
    result: GuideSocialAutomationResult
  ): Promise<GuideSocialAutomationResult> {
    await writeRunArtifacts(result);
    return result;
  }

  // Safe defaults: dry_run=true, allowPublish=false unless explicitly enabled.
  const config = loadSocialConfig(options.config);
  const isDryRun = options.dryRun ?? (config.dryRun || !config.allowPublish);

  // Platform adapters.
  const defaultAdapters = new Map<SocialPlatform, ISocialPlatformAdapter>([
    ['facebook', new FacebookPlatformAdapter()],
    ['instagram', new InstagramPlatformAdapter()],
    ['pinterest', new PinterestPlatformAdapter(undefined, 'lifemode')],
    ['threads', new ThreadsPlatformAdapter()],
  ]);

  if (config.credentials.everydayPinterest?.configured) {
    defaultAdapters.set(
      'pinterest-everyday',
      new PinterestPlatformAdapter(undefined, 'everyday')
    );
  }

  const platformAdapters = options.platformAdapters || defaultAdapters;

  // Dependencies.
  const storageDir = options.storageDir || config.storageDir;
  const historyRepo =
    options.historyRepository ||
    new FilesystemSocialHistoryRepository(storageDir);

  const contentRepo =
    options.contentRepository ||
    new FilesystemContentRepository({
      contentRoot: options.contentRoot || path.resolve(process.cwd(), 'src/content'),
    });

  const genProvider =
    options.genProvider ||
    (config.providerMode === 'router'
      ? new AIRouterSocialGenerationProvider()
      : new FixtureSocialGenerationProvider());

  const imageProvider =
    options.imageProvider ||
    (options.config?.imageProviderMode === 'fixture'
      ? new FixtureSocialImageProvider()
      : new PexelsSocialImageProvider());

  const storageProvider =
    options.storageProvider ||
    (config.storageConfig.configured
      ? new CloudflareR2SocialAssetStorageProvider(config.storageConfig)
      : new FixtureSocialAssetStorageProvider(config.storageConfig.publicBaseUrl));

  // Discover eligible Guides.
  let allGuides: StoredArticle[];

  if (options.guides) {
    allGuides = options.guides;
  } else if (typeof contentRepo.listGuides === 'function') {
    allGuides = await contentRepo.listGuides();
  } else {
    allGuides = await new FilesystemContentRepository({
      contentRoot: options.contentRoot || path.resolve(process.cwd(), 'src/content'),
    }).listGuides();
  }

  const eligibleGuides = allGuides.filter((guide) => {
    if (guide.frontmatter.draft) return false;

    const status = guide.frontmatter.lifecycleStatus;
    return status === 'PUBLISHED' || status === 'STORED' || !status;
  });

  if (eligibleGuides.length === 0) {
    const completedAt = new Date().toISOString();
    return finish({
      runId,
      status: 'SKIPPED',
      startedAt,
      completedAt,
      durationMs: Math.max(1, Date.now() - startTime),
      dryRun: isDryRun,
      discoveredGuidesCount: 0,
      publishedCount: 0,
      platformSummary,
      manifestEntries: [],
      summary: 'No eligible published guides found in guides collection.',
    });
  }

  // Convert eligible guides to candidate EditorialTopic objects.
  const guideCandidates: EditorialTopic[] = [];
  const guideByTopicId = new Map<string, StoredArticle>();

  for (const guide of eligibleGuides) {
    const rawCategory =
      (guide.frontmatter as any).category || (guide as any).category;
    const routing = resolveGuideRouting(
      rawCategory,
      guide.frontmatter.title,
      guide.slug
    );
    const topicId =
      guide.identity?.topicId ||
      guide.frontmatter.topicId ||
      `lm-guide-${guide.slug}`;

    const publicationDate =
      guide.frontmatter.pubDate ||
      (guide.frontmatter as any).publishedDate;

    const publicationDateIsDateOnly =
      typeof publicationDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(publicationDate);

    let pubDateStr = '';

    if (publicationDate) {
      if (publicationDateIsDateOnly) {
        // A date-only publication date represents that entire calendar day.
        pubDateStr = `${publicationDate}T23:59:59.999Z`;
      } else {
        const parsedPublicationDate = new Date(publicationDate);

        if (!Number.isNaN(parsedPublicationDate.getTime())) {
          pubDateStr = parsedPublicationDate.toISOString();
        }
      }
    }

    const description =
      guide.frontmatter.description ||
      (guide.frontmatter as any).seoDescription ||
      guide.frontmatter.title;

    guideByTopicId.set(topicId, guide);

    guideCandidates.push({
      id: topicId,
      canonicalTopic: guide.frontmatter.title,
      pillar: routing.pillar,
      slug: guide.slug,
      totalScore: 90,
      status: 'PUBLISHED',
      opportunityType: 'ARTICLE_AND_SOCIAL',
      scoring: {
        socialPotential: 85,
        pinterestPotential: 85,
        searchPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 50,
        freshness: 90,
        competitionOpportunity: 80,
        originalityPotential: 85,
      },
      tags: guide.frontmatter.tags || [routing.pillar, 'guide', 'lifestyle'],
      sourceSignals: [],
      queryVariants: [],
      freshnessScore: 90,
      createdAt: pubDateStr,
      updatedAt: guide.frontmatter.updatedDate
        ? new Date(guide.frontmatter.updatedDate).toISOString()
        : pubDateStr,
      articleTitle: guide.frontmatter.title,
      articleDescription: description,
      publishedAt: pubDateStr,
      articleImage: (guide.frontmatter as any).image,
      publicRoute: routing.publicRoute,
      publicSection: routing.publicSection,
      isGuide: true,
    } as any);
  }

  // Select one opportunity within the configured freshness window.
  const configuredPlatforms: SocialPlatform[] = (
    Array.from(platformAdapters.keys()) as SocialPlatform[]
  ).filter((platform) => config.platforms[platform] !== false);

  const maxFreshnessDays =
    options.maxFreshnessDays ?? config.maxFreshnessDays ?? 1;

  const opportunities = await selectSocialOpportunities(guideCandidates, {
    maxOpportunities: 1,
    minScoreThreshold: config.minScoreThreshold ?? 80,
    maxFreshnessDays,
    referenceDate: options.referenceDate,
    historyRepository: historyRepo,
    baseUrl: config.baseUrl,
    configuredPlatforms,
    publishedOnly: true,
  });

  if (opportunities.length === 0) {
    const completedAt = new Date().toISOString();

    return finish({
      runId,
      status: 'SKIPPED',
      startedAt,
      completedAt,
      durationMs: Math.max(1, Date.now() - startTime),
      dryRun: isDryRun,
      discoveredGuidesCount: eligibleGuides.length,
      publishedCount: 0,
      platformSummary,
      manifestEntries: [],
      summary:
        'No eligible guides published within the 24-hour freshness window (or all target platforms already published).',
    });
  }

  const manifestEntries: SocialManifestEntry[] = [];
  let totalPublishedCount = 0;

  // Process the selected Guide.
  for (const opportunity of opportunities) {
    const guide = guideByTopicId.get(opportunity.topicId);
    if (!guide) continue;

    const rawCategory =
      (guide.frontmatter as any).category || (guide as any).category;
    const routing = resolveGuideRouting(
      rawCategory,
      guide.frontmatter.title,
      guide.slug
    );

    const destinationUrl =
      opportunity.destinationUrl ||
      resolveDestinationUrl(config.baseUrl, {
        pillar: routing.pillar,
        slug: guide.slug,
        publicRoute: routing.publicRoute,
        publicSection: routing.publicSection,
        isGuide: true,
      });

    const topicId = opportunity.topicId;
    const description =
      guide.frontmatter.description ||
      (guide.frontmatter as any).seoDescription ||
      guide.frontmatter.title;

    const assignedPlatforms = opportunity.targetPlatforms.filter(
      (platform) =>
        platformAdapters.has(platform) && config.platforms[platform] !== false
    );

    if (assignedPlatforms.length === 0) continue;

    const brief: SocialBrief = {
      briefId: `brief-${topicId}-${Date.now()}`,
      topicId,
      pillar: routing.pillar,
      canonicalTopic: guide.frontmatter.title,
      destinationUrl,
      publicRoute: routing.publicRoute,
      publicSection: routing.publicSection,
      isGuide: true,
      coreConcept: description,
      editorialHook: description,
      targetAudience: 'Readers seeking actionable, step-by-step guidance',
      targetPlatforms: assignedPlatforms,
      keyTakeaways: [guide.frontmatter.title],
      hashtagsHint: [`#${routing.pillar}`, '#LifeMode', '#EverydayGuide'],
      suggestedHashtags: [`#${routing.pillar}`, '#LifeMode', '#Guide'],
    };

    // Generate social content, falling back to deterministic copy on errors.
    const fallbackContent = (): GeneratedSocialContent => ({
      topicId,
      pillar: routing.pillar,
      title: guide.frontmatter.title,
      shortCaption: description,
      fullPost: `${guide.frontmatter.title}\n\n${description}\n\nRead the full guide: ${destinationUrl}`,
      platformCopy: {
        facebook: `${guide.frontmatter.title}\n\n${description}\n\n${destinationUrl}`,
        instagram: `${guide.frontmatter.title}\n\n${description}\n\nLink in bio.`,
        pinterest: `${guide.frontmatter.title}\n\n${description}`,
        'pinterest-everyday': `${guide.frontmatter.title}\n\n${description}`,
        threads: `${guide.frontmatter.title}\n\n${description}\n\n${destinationUrl}`,
      },
      hashtags: [`#${routing.pillar}`, '#LifeMode', '#Guide'],
      suggestedMediaTypes: ['image'],
      imagePrompt: `Clean, editorial photograph representing ${guide.frontmatter.title}`,
      destinationUrl,
    });

    let content: GeneratedSocialContent;

    try {
      const generationResult = await genProvider.generateSocialContent(brief);
      content = generationResult.content || fallbackContent();
    } catch {
      content = fallbackContent();
    }

    if (!Array.isArray(content.hashtags)) {
      content.hashtags = [`#${routing.pillar}`, '#LifeMode', '#EverydayGuide'];
    }

    // Generate the visual asset.
    let asset: SocialVisualAsset;

    let imageSelectionInfo: {
      provider: string;
      status: 'STOCK_PHOTO' | 'BRANDED_FALLBACK' | 'FAILED';
      error?: string;
    } = {
      provider: imageProvider.name,
      status: 'BRANDED_FALLBACK',
    };

    try {
      const imageResult = await imageProvider.generateImage({
        topicId,
        pillar: routing.pillar,
        prompt: content.imagePrompt || guide.frontmatter.title,
        format: '1080x1350',
        headlineOverlay: undefined,
        articleTitle: guide.frontmatter.title,
        category: routing.pillar,
        ctaText: 'Read the complete guide on lifemode.life',
      });

      if (!imageResult.success || !imageResult.asset) {
        throw new Error(imageResult.error || 'Image generation unsuccessful');
      }

      asset = imageResult.asset;

      imageSelectionInfo = {
        provider: imageResult.provider,
        status: imageResult.error ? 'BRANDED_FALLBACK' : 'STOCK_PHOTO',
        error: imageResult.error,
      };
    } catch (imageError: unknown) {
      const errorMessage =
        imageError instanceof Error ? imageError.message : String(imageError);
      const fallbackHash = hashString(`${topicId}-asset`);

      imageSelectionInfo = {
        provider: imageProvider.name,
        status: 'FAILED',
        error: errorMessage,
      };

      asset = {
        assetId: `asset-${topicId}-${fallbackHash.slice(0, 8)}`,
        assetHash: fallbackHash,
        url: `${config.storageConfig.publicBaseUrl || 'https://pub-assets.lifemode.life'}/social/guides/${guide.slug}.jpg`,
        width: 1080,
        height: 1350,
        format: '1080x1350',
        mimeType: 'image/jpeg',
      };
    }

    // Upload the asset when actual image bytes are available.
    if (asset.buffer) {
      try {
        const uploadResult = await storageProvider.uploadAsset({
          topicId,
          pillar: routing.pillar,
          assetHash: asset.assetHash,
          buffer: asset.buffer,
          mimeType: asset.mimeType,
          format: asset.format,
        });

        if (uploadResult.success && uploadResult.publicUrl) {
          asset.url = uploadResult.publicUrl;
        }
      } catch {
        // Keep the original URL if storage upload fails.
      }
    }

    const captions: Partial<Record<SocialPlatform, string>> = {};

    for (const platform of assignedPlatforms) {
      captions[platform] =
        content.platformCopy?.[platform] ||
        content.fullPost ||
        content.shortCaption ||
        content.title;
    }

    runAssets.push({
      topicId,
      title: guide.frontmatter.title,
      destinationUrl,
      captions,
      image: {
        url: asset.url,
        assetHash: asset.assetHash,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        status: imageSelectionInfo.status,
        provider: imageSelectionInfo.provider,
        error: imageSelectionInfo.error,
      },
      imageBuffer: asset.buffer
        ? new Uint8Array(asset.buffer)
        : undefined,
    });

    const platformResults: Partial<
      Record<SocialPlatform, SocialPlatformPublishResult>
    > = {};

    for (const platform of assignedPlatforms) {
      const adapter = platformAdapters.get(platform);
      if (!adapter) continue;

      try {
        const preparedPackage = await adapter.prepare(content, asset, {
          destinationUrl,
        });

        const publishResult = await adapter.publish(preparedPackage, {
          dryRun: isDryRun,
        });

        platformResults[platform] = publishResult;

        if (
          publishResult.status === 'PUBLISHED' ||
          publishResult.status === 'DRY_RUN'
        ) {
          platformSummary[platform].published++;
          totalPublishedCount++;
        } else if (publishResult.status === 'NOT_CONFIGURED') {
          platformSummary[platform].skipped++;
        } else {
          platformSummary[platform].failed++;
        }
      } catch (error: unknown) {
        platformResults[platform] = {
          platform,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
          publishedAt: new Date().toISOString(),
          idempotencyKey: `lm-guide-${topicId}-${platform}`,
        };

        platformSummary[platform].failed++;
      }
    }

    const anySuccess = Object.values(platformResults).some(
      (result) =>
        result?.status === 'PUBLISHED' || result?.status === 'DRY_RUN'
    );

    const contentHash = hashString(`${content.title}-${content.shortCaption}`);
    const idempotencyKey = `lm-guide-soc-${topicId}-${contentHash.slice(0, 8)}`;

    const manifestEntry: SocialManifestEntry = {
      runId,
      topicId,
      pillar: routing.pillar,
      canonicalTopic: guide.frontmatter.title,
      contentHash,
      assetHash: asset.assetHash,
      idempotencyKey,
      targetPlatforms: assignedPlatforms,
      platformResults,
      reviewScore: 90,
      imageSelection: imageSelectionInfo,
      overallStatus: isDryRun
        ? 'DRY_RUN'
        : anySuccess
          ? 'COMPLETED'
          : 'FAILED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Never write publication history during a dry run.
    if (!isDryRun) {
      await historyRepo.recordEntry(manifestEntry);
    }

    manifestEntries.push(manifestEntry);
  }

  const durationMs = Math.max(1, Date.now() - startTime);
  const anyPublished = totalPublishedCount > 0;
  const overallStatus = isDryRun
    ? 'DRY_RUN'
    : anyPublished
      ? 'COMPLETED'
      : 'FAILED';

  const summary = [
    '====================================================',
    ` LifeMode Guide Social Publishing [${overallStatus}]`,
    '====================================================',
    `* Run ID:            ${runId}`,
    `* Mode:              ${isDryRun ? 'DRY_RUN (Safe Mode)' : 'LIVE PUBLISH'}`,
    `* Eligible Guides:   ${eligibleGuides.length}`,
    `* Assigned Posts:    ${totalPublishedCount}`,
    `* Facebook:          ${platformSummary.facebook.published} published, ${platformSummary.facebook.failed} failed`,
    `* Instagram:         ${platformSummary.instagram.published} published, ${platformSummary.instagram.failed} failed`,
    `* Pinterest:         ${platformSummary.pinterest.published} published, ${platformSummary.pinterest.failed} failed`,
    `* Everyday Pinterest:${platformSummary['pinterest-everyday'].published} published, ${platformSummary['pinterest-everyday'].failed} failed`,
    `* Threads:           ${platformSummary.threads.published} published, ${platformSummary.threads.failed} failed`,
    '====================================================',
  ].join('\n');

  const result: GuideSocialAutomationResult = {
    runId,
    status: overallStatus,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    dryRun: isDryRun,
    discoveredGuidesCount: eligibleGuides.length,
    publishedCount: totalPublishedCount,
    platformSummary,
    manifestEntries,
    summary,
  };

  return finish(result);
}
