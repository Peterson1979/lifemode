import * as path from 'node:path';
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

/**
 * Runs the separate Guide social publishing pipeline.
 *
 * Discovers eligible guides from src/content/guides/, maps canonical public routes,
 * filters through selectSocialOpportunities for 24-hour freshness and platform gating,
 * and enforces at most one Guide post per destination account/platform per execution.
 * Respects existing social publication history and deduplication.
 */
export async function runGuideSocialPipeline(
  options: GuideSocialPipelineRunOptions = {}
): Promise<GuideSocialAutomationResult> {
  const startTime = Date.now();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const runId = `lm-guide-soc-run-${dateStr}-${Date.now().toString().slice(-4)}`;

  // Safe defaults: dry_run=true, allowPublish=false unless explicitly enabled
  const config = loadSocialConfig(options.config);
  const isDryRun = options.dryRun ?? (config.dryRun || !config.allowPublish);

  const platformSummary: Record<SocialPlatform, { published: number; failed: number; skipped: number }> = {
    facebook: { published: 0, failed: 0, skipped: 0 },
    instagram: { published: 0, failed: 0, skipped: 0 },
    pinterest: { published: 0, failed: 0, skipped: 0 },
    'pinterest-everyday': { published: 0, failed: 0, skipped: 0 },
    threads: { published: 0, failed: 0, skipped: 0 },
  };

  // 1. Platform Adapters setup
  const defaultAdapters = new Map<SocialPlatform, ISocialPlatformAdapter>([
    ['facebook', new FacebookPlatformAdapter()],
    ['instagram', new InstagramPlatformAdapter()],
    ['pinterest', new PinterestPlatformAdapter(undefined, 'lifemode')],
    ['threads', new ThreadsPlatformAdapter()],
  ]);
  if (config.credentials.everydayPinterest?.configured) {
    defaultAdapters.set('pinterest-everyday', new PinterestPlatformAdapter(undefined, 'everyday'));
  }
  const platformAdapters = options.platformAdapters || defaultAdapters;

  // 2. Dependencies setup
  const storageDir = options.storageDir || config.storageDir;
  const historyRepo = options.historyRepository || new FilesystemSocialHistoryRepository(storageDir);
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

  // 3. Discover eligible Guides
  let allGuides: StoredArticle[] = [];
  if (options.guides) {
    allGuides = options.guides;
  } else if (typeof contentRepo.listGuides === 'function') {
    allGuides = await contentRepo.listGuides();
  } else {
    allGuides = await new FilesystemContentRepository({
      contentRoot: options.contentRoot || path.resolve(process.cwd(), 'src/content'),
    }).listGuides();
  }

  // Filter eligible guides based on publication status
  const eligibleGuides = allGuides.filter((g) => {
    if (g.frontmatter.draft) return false;
    const status = g.frontmatter.lifecycleStatus;
    return status === 'PUBLISHED' || status === 'STORED' || !status;
  });

  if (eligibleGuides.length === 0) {
    const durationMs = Math.max(1, Date.now() - startTime);
    return {
      runId,
      status: 'SKIPPED',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: isDryRun,
      discoveredGuidesCount: 0,
      publishedCount: 0,
      platformSummary,
      manifestEntries: [],
      summary: 'No eligible published guides found in guides collection.',
    };
  }

  // Convert eligible guides to candidate EditorialTopic objects
  const guideCandidates: EditorialTopic[] = [];
  const guideByTopicId = new Map<string, StoredArticle>();

  for (const guide of eligibleGuides) {
    const rawCategory = (guide.frontmatter as any).category || (guide as any).category;
    const routing = resolveGuideRouting(rawCategory, guide.frontmatter.title, guide.slug);
    const topicId = guide.identity?.topicId || guide.frontmatter.topicId || `lm-guide-${guide.slug}`;
    const publicationDate = guide.frontmatter.pubDate || (guide.frontmatter as any).publishedDate;
    const pubDateStr = publicationDate ? new Date(publicationDate).toISOString() : '';
    const description =
      guide.frontmatter.description || (guide.frontmatter as any).seoDescription || guide.frontmatter.title;

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
      updatedAt: guide.frontmatter.updatedDate ? new Date(guide.frontmatter.updatedDate).toISOString() : pubDateStr,
      articleTitle: guide.frontmatter.title,
      articleDescription: description,
      publishedAt: pubDateStr,
      articleImage: (guide.frontmatter as any).image,
      publicRoute: routing.publicRoute,
      publicSection: routing.publicSection,
      isGuide: true,
    } as any);
  }

  // 4. Select opportunity enforcing 24-hour freshness cutoff and platform history
  const configuredPlatforms: SocialPlatform[] = (Array.from(platformAdapters.keys()) as SocialPlatform[]).filter(
    (p) => config.platforms[p] !== false
  );

  const maxFreshnessDays = options.maxFreshnessDays ?? config.maxFreshnessDays ?? 1;

  const opportunities = await selectSocialOpportunities(guideCandidates, {
    maxOpportunities: 1, // Enforce at most one Guide post per execution
    minScoreThreshold: config.minScoreThreshold ?? 80,
    maxFreshnessDays,
    referenceDate: options.referenceDate,
    historyRepository: historyRepo,
    baseUrl: config.baseUrl,
    configuredPlatforms,
    publishedOnly: true,
  });

  if (opportunities.length === 0) {
    const durationMs = Math.max(1, Date.now() - startTime);
    return {
      runId,
      status: 'SKIPPED',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: isDryRun,
      discoveredGuidesCount: eligibleGuides.length,
      publishedCount: 0,
      platformSummary,
      manifestEntries: [],
      summary: 'No eligible guides published within the 24-hour freshness window (or all target platforms already published).',
    };
  }

  const manifestEntries: SocialManifestEntry[] = [];
  let totalPublishedCount = 0;

  // 5. Process each selected Guide and publish to its assigned platforms
  for (const opp of opportunities) {
    const guide = guideByTopicId.get(opp.topicId);
    if (!guide) continue;

    const rawCategory = (guide.frontmatter as any).category || (guide as any).category;
    const routing = resolveGuideRouting(rawCategory, guide.frontmatter.title, guide.slug);
    const destinationUrl = opp.destinationUrl || resolveDestinationUrl(config.baseUrl, {
      pillar: routing.pillar,
      slug: guide.slug,
      publicRoute: routing.publicRoute,
      publicSection: routing.publicSection,
      isGuide: true,
    });
    const topicId = opp.topicId;
    const description =
      guide.frontmatter.description || (guide.frontmatter as any).seoDescription || guide.frontmatter.title;

    const assignedPlatforms = opp.targetPlatforms.filter(
      (p) => platformAdapters.has(p) && config.platforms[p] !== false
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

    // Generate content
    let content: GeneratedSocialContent;
    try {
      const genResult = await genProvider.generateSocialContent(brief);
      content = genResult.content || {
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
      };
    } catch {
      content = {
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
      };
    }

    if (!Array.isArray(content.hashtags)) {
      content.hashtags = [`#${routing.pillar}`, '#LifeMode', '#EverydayGuide'];
    }

    // Generate Visual Asset using approved image workflow
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
      const imgResult = await imageProvider.generateImage({
        topicId,
        pillar: routing.pillar,
        prompt: content.imagePrompt || guide.frontmatter.title,
        format: '1080x1350',
        headlineOverlay: undefined,
        articleTitle: guide.frontmatter.title,
        category: routing.pillar,
        ctaText: 'Read the complete guide on lifemode.life',
      });

      if (imgResult.success && imgResult.asset) {
        asset = imgResult.asset;
        imageSelectionInfo = {
          provider: imgResult.provider,
          status: imgResult.error ? 'BRANDED_FALLBACK' : 'STOCK_PHOTO',
          error: imgResult.error,
        };
      } else {
        throw new Error(imgResult.error || 'Image generation unsuccessful');
      }
    } catch (imgErr: any) {
      imageSelectionInfo = {
        provider: imageProvider.name,
        status: 'FAILED',
        error: imgErr?.message || String(imgErr),
      };
      const fallbackHash = hashString(`${topicId}-asset`);
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

    // Upload asset via storage provider if buffer exists
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
        // Keep existing asset.url if upload fails
      }
    }

    const platformResults: Partial<Record<SocialPlatform, SocialPlatformPublishResult>> = {};

    for (const platform of assignedPlatforms) {
      const adapter = platformAdapters.get(platform);
      if (!adapter) continue;

      try {
        const pkg = await adapter.prepare(content, asset, {
          destinationUrl,
        });

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
      } catch (err: any) {
        platformResults[platform] = {
          platform,
          status: 'FAILED',
          error: err?.message || String(err),
          publishedAt: new Date().toISOString(),
          idempotencyKey: `lm-guide-${topicId}-${platform}`,
        };
        platformSummary[platform].failed++;
      }
    }

    const anySuccess = Object.values(platformResults).some(
      (r) => r?.status === 'PUBLISHED' || r?.status === 'DRY_RUN'
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
      overallStatus: isDryRun ? 'DRY_RUN' : anySuccess ? 'COMPLETED' : 'FAILED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!isDryRun) {
      await historyRepo.recordEntry(manifestEntry);
    }
    manifestEntries.push(manifestEntry);
  }

  const durationMs = Math.max(1, Date.now() - startTime);
  const anyPublished = totalPublishedCount > 0;
  const overallStatus = isDryRun ? 'DRY_RUN' : anyPublished ? 'COMPLETED' : 'FAILED';

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

  return {
    runId,
    status: overallStatus,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs,
    dryRun: isDryRun,
    discoveredGuidesCount: eligibleGuides.length,
    publishedCount: totalPublishedCount,
    platformSummary,
    manifestEntries,
    summary,
  };
}
