import type { IContentRepository } from '../storage/types.ts';
import type { StoredArticle } from '../storage/types.ts';
import type { PublishPackage } from '../publishing/types.ts';
import type { IEditorialImageProvider } from './contracts.ts';
import type { EditorialImageConfig } from './config.ts';
import { loadEditorialImageConfig } from './config.ts';
import { EditorialImageCostGuard } from './cost-guard.ts';
import { orchestrateEditorialImage } from './orchestrator.ts';
import type { ISocialAssetStorageProvider } from '../../social/images/storage/contracts.ts';
import type { IGitPublisher } from '../git-publisher/types.ts';

export interface BackfillCandidateSelectionOptions {
  limit?: number;
}

export interface BackfillExecutionOptions {
  contentRepository: IContentRepository;
  gitPublisher?: IGitPublisher;
  dryRun?: boolean;
  allowCommit?: boolean;
  gitRepoRoot?: string;
  contentRoot?: string;
  allowUnrelatedChanges?: boolean;
  commitAuthor?: { name: string; email: string };
  newImagesGeneratedCount?: number;
  dailyImageLimit?: number;
  imageConfig?: EditorialImageConfig;
  imagePrimaryProvider?: IEditorialImageProvider;
  imageFallbackProvider?: IEditorialImageProvider;
  imageStorageProvider?: ISocialAssetStorageProvider;
  costGuard?: EditorialImageCostGuard;
  logger?: (message: string) => void;
}

export interface BackfillArticleResult {
  articleId: string;
  pillar: string;
  slug: string;
  title: string;
  success: boolean;
  skipped: boolean;
  imageUrl?: string;
  imageProvider?: string;
  reason?: string;
  error?: string;
  committed?: boolean;
}

export interface BackfillRunResult {
  eligibleCount: number;
  capacity: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  results: BackfillArticleResult[];
}

/**
 * Calculates remaining daily image capacity after new article generation.
 * Formula: Math.max(0, dailyLimit - newImagesGenerated)
 */
export function calculateRemainingImageCapacity(
  dailyLimit: number,
  newImagesGenerated: number
): number {
  return Math.max(0, dailyLimit - Math.max(0, newImagesGenerated));
}

/**
 * Selects and sorts published articles that are missing an image.
 *
 * Priority order:
 * 1. Featured articles missing an image (highest exposure)
 * 2. Newer published articles (pubDate descending)
 * 3. Stable slug tie-breaker
 */
export function selectBackfillCandidates(
  articles: StoredArticle[],
  options: BackfillCandidateSelectionOptions = {}
): StoredArticle[] {
  // Filter only valid, non-archived, published articles without an image
  const eligible = articles.filter((article) => {
    const fm = article.frontmatter;
    if (!fm) return false;
    if (fm.draft) return false;
    if (fm.lifecycleStatus === 'ARCHIVED') return false;
    // Exclude if already has a valid non-empty image URL
    if (fm.image && typeof fm.image === 'string' && fm.image.trim().length > 0) {
      return false;
    }
    return true;
  });

  // Sort by priority: featured first, then newest pubDate desc, then slug
  const sorted = eligible.sort((a, b) => {
    const aFeatured = Boolean(a.frontmatter?.featured);
    const bFeatured = Boolean(b.frontmatter?.featured);
    if (aFeatured !== bFeatured) {
      return aFeatured ? -1 : 1;
    }

    const aTime = new Date(a.frontmatter?.pubDate || 0).getTime();
    const bTime = new Date(b.frontmatter?.pubDate || 0).getTime();
    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return (a.slug || '').localeCompare(b.slug || '');
  });

  if (options.limit !== undefined && options.limit >= 0) {
    return sorted.slice(0, options.limit);
  }

  return sorted;
}

/**
 * Executes the editorial image backfill pipeline for existing articles without images.
 *
 * Respects daily limits (default 5 total images/day) and Cost Guard quotas.
 * New article image generation always takes precedence.
 */
export async function runImageBackfill(
  options: BackfillExecutionOptions
): Promise<BackfillRunResult> {
  const log = options.logger || console.log;
  const config = options.imageConfig || loadEditorialImageConfig();
  const costGuard =
    options.costGuard ||
    new EditorialImageCostGuard({
      enabled: config.costGuard.enabled,
      dailyLimit: config.costGuard.dailyLimit,
      monthlyLimit: config.costGuard.monthlyLimit,
    });

  const dailyLimit = options.dailyImageLimit ?? config.costGuard.dailyLimit ?? 5;
  const newImagesGenerated = options.newImagesGeneratedCount ?? 0;
  const remainingCapacity = calculateRemainingImageCapacity(dailyLimit, newImagesGenerated);

  // If no capacity remains or image generation is disabled
  if (!config.enabled) {
    log('[BACKFILL] status=skipped reason=images-disabled');
    return {
      eligibleCount: 0,
      capacity: remainingCapacity,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [],
    };
  }

  // Load stored articles
  const allArticles = await options.contentRepository.list();
  const candidates = selectBackfillCandidates(allArticles);
  const eligibleCount = candidates.length;

  if (eligibleCount === 0) {
    log('[BACKFILL] status=completed reason=no-candidates-needing-images');
    return {
      eligibleCount: 0,
      capacity: remainingCapacity,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [],
    };
  }

  if (remainingCapacity <= 0) {
    log(`[BACKFILL] status=skipped reason=daily-capacity-exhausted capacity=0 new_images=${newImagesGenerated}`);
    return {
      eligibleCount,
      capacity: 0,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: eligibleCount,
      results: [],
    };
  }

  // Select up to remaining capacity
  const targetArticles = candidates.slice(0, remainingCapacity);
  const results: BackfillArticleResult[] = [];
  let succeededCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const article of targetArticles) {
    const articleId = `${article.pillar}/${article.slug}`;

    // Check Cost Guard quota before each generation
    const guardDecision = await costGuard.canGenerateImage();
    if (!guardDecision.allowed) {
      log(`[BACKFILL] article=${articleId} status=skipped reason=cost-guard-limit-reached`);
      results.push({
        articleId,
        pillar: article.pillar,
        slug: article.slug,
        title: article.frontmatter.title,
        success: false,
        skipped: true,
        reason: 'cost-guard-limit-reached',
        error: `Cost guard quota exceeded: ${guardDecision.reason}`,
      });
      skippedCount++;
      break; // Stop further attempts once cost guard daily/monthly quota is reached
    }

    // Prepare package for image orchestrator
    const prompt =
      article.frontmatter.imagePrompt ||
      `Editorial documentary photography for ${article.frontmatter.title}.`;

    const pkg: PublishPackage = {
      id: articleId,
      topicId: article.frontmatter.topicId || article.slug,
      slug: article.slug,
      title: article.frontmatter.title,
      description: article.frontmatter.description,
      excerpt: article.frontmatter.description,
      content: article.content,
      pillar: article.pillar,
      format: (article.frontmatter.format as any) || 'standard',
      audience: article.frontmatter.audience || 'general',
      primaryIntent: (article.frontmatter.primaryIntent as any) || 'informational',
      secondaryIntent: article.frontmatter.secondaryIntent,
      riskLevel: (article.frontmatter.riskLevel as any) || 'low',
      tags: article.frontmatter.tags || [],
      sources: article.frontmatter.sources || [],
      internalLinks: [],
      affiliateIntent: Boolean(article.frontmatter.affiliateIntent),
      faq: [],
      socialHooks: [],
      imageMetadata: {
        prompt,
      },
      publicationMetadata: {
        targetDate: article.frontmatter.pubDate || new Date().toISOString(),
        version: article.frontmatter.version || 1,
        author: article.frontmatter.author || 'LifeMode Editorial',
      },
      qualitySummary: {
        overallScore: 90,
        safetyScore: 95,
        factualityScore: 90,
        decision: 'PASS',
        reviewedAt: new Date().toISOString(),
        reviewer: 'automated-backfill',
      },
    };

    try {
      const imageResult = await orchestrateEditorialImage(pkg, {
        dryRun: options.dryRun,
        config,
        primaryProvider: options.imagePrimaryProvider,
        fallbackProvider: options.imageFallbackProvider,
        storageProvider: options.imageStorageProvider,
        costGuard,
        logger: log,
      });

      if (imageResult.success && imageResult.publicUrl) {
        // Update article in storage repository with new image URL
        const updatedFrontmatter = {
          ...article.frontmatter,
          image: imageResult.publicUrl,
          imageAlt: article.frontmatter.imageAlt || article.frontmatter.title,
          imagePrompt: prompt,
          imageSource: imageResult.provider,
        };

        const updateResult = await options.contentRepository.update({
          pillar: article.pillar,
          slug: article.slug,
          frontmatter: updatedFrontmatter,
          content: article.content,
        });

        let committed = false;
        // If git publishing and committing is enabled and not dry run
        if (
          options.allowCommit &&
          !options.dryRun &&
          options.gitPublisher &&
          updateResult.article
        ) {
          const gitRes = await options.gitPublisher.publish(updateResult.article, {
            dryRun: false,
            allowCommit: true,
            gitRepoRoot: options.gitRepoRoot,
            contentRoot: options.contentRoot,
            allowUnrelatedChanges: options.allowUnrelatedChanges,
            commitAuthor: options.commitAuthor,
          });
          committed = gitRes.committed;
        }

        results.push({
          articleId,
          pillar: article.pillar,
          slug: article.slug,
          title: article.frontmatter.title,
          success: true,
          skipped: false,
          imageUrl: imageResult.publicUrl,
          imageProvider: imageResult.provider,
          committed,
        });
        succeededCount++;
        log(`[BACKFILL] article=${articleId} status=success url=${imageResult.publicUrl}`);
      } else {
        results.push({
          articleId,
          pillar: article.pillar,
          slug: article.slug,
          title: article.frontmatter.title,
          success: false,
          skipped: imageResult.skipped,
          reason: imageResult.reason || 'generation-failed',
          error: imageResult.error || 'Failed to generate image',
        });
        if (imageResult.skipped) {
          skippedCount++;
        } else {
          failedCount++;
        }
        log(`[BACKFILL] article=${articleId} status=failed reason=${imageResult.reason || 'unknown'}`);
      }
    } catch (err: any) {
      results.push({
        articleId,
        pillar: article.pillar,
        slug: article.slug,
        title: article.frontmatter.title,
        success: false,
        skipped: false,
        reason: 'unexpected-error',
        error: err?.message || String(err),
      });
      failedCount++;
      log(`[BACKFILL] article=${articleId} status=failed error=${err?.message}`);
    }
  }

  return {
    eligibleCount,
    capacity: remainingCapacity,
    processedCount: results.length,
    succeededCount,
    failedCount,
    skippedCount,
    results,
  };
}
