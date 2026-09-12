import { resolve, join } from 'node:path';
import type { PillarSlug, EditorialTopic } from '../types.ts';
import { FilesystemContentRepository } from '../storage/repository.ts';
import { AstroGitPublisher } from '../git-publisher/publisher.ts';
import { GitCli } from '../git-publisher/git-cli.ts';
import { defaultAIRouter } from '../../ai/router.ts';
import { AIRouterGenerationProvider } from '../generation/providers/ai-router.ts';
import { FixtureGenerationProvider } from '../generation/providers/fixture.ts';
import { AIRouterReviewProvider } from '../review/providers/ai-router.ts';
import { FixtureReviewProvider } from '../review/providers/fixture.ts';
import {
  runResearchPipeline,
  WebEditorialResearchProvider,
  FixtureEditorialResearchProvider,
} from '../research/index.ts';
import { buildContentBrief } from '../brief.ts';
import { briefToGenerationRequest } from '../generation/brief-adapter.ts';
import { runGenerationPipeline } from '../generation/runner.ts';
import { validateGeneratedArticle } from '../generation/validation.ts';
import { runReviewPipeline } from '../review/runner.ts';
import type { ReviewRequest } from '../review/types.ts';
import { storePublishPackage } from '../storage/publishing-adapter.ts';
import { loadEditorialImageConfig, type EditorialImageConfig } from '../images/config.ts';
import { EditorialImageCostGuard } from '../images/cost-guard.ts';
import { orchestrateEditorialImage } from '../images/orchestrator.ts';
import type { IEditorialImageProvider } from '../images/contracts.ts';
import type { ISocialAssetStorageProvider } from '../../social/images/storage/contracts.ts';
import { auditAndMigrateTitles, type TitleMigrationReport } from './title-migration.ts';
import { findEmptyTopics, type EmptyTopicReport } from './empty-topics.ts';
import type { PublishPackage } from '../publishing/types.ts';
import { selectBackfillCandidates } from '../images/backfill.ts';

export interface MaintenanceRunOptions {
  dryRun?: boolean; // default: true
  providerMode?: 'fixture' | 'router'; // default: 'fixture'
  allowCommit?: boolean; // default: false
  contentRoot?: string;
  gitRepoRoot?: string;
  imageConfig?: EditorialImageConfig;
  imagePrimaryProvider?: IEditorialImageProvider;
  imageFallbackProvider?: IEditorialImageProvider;
  imageStorageProvider?: ISocialAssetStorageProvider;
  costGuard?: EditorialImageCostGuard;
  logger?: (msg: string) => void;
}

export interface MaintenanceRunReport {
  dryRun: boolean;
  providerMode: 'fixture' | 'router';
  titles: TitleMigrationReport;
  emptyTopics: EmptyTopicReport;
  newArticlesCreated: Array<{
    pillar: PillarSlug;
    slug: string;
    title: string;
    hasImage: boolean;
    imageUrl?: string;
  }>;
  existingArticlesMissingImages: number;
  monthlyImageCapacity: number;
  imagesGenerated: number;
  remainingImageBacklog: number;
  summary: string;
}

/**
 * Formats a clean, professional summary of the maintenance operation.
 */
export function formatMaintenanceSummary(report: MaintenanceRunReport): string {
  const lines: string[] = [
    '==================================================',
    'LIFEMODE CONTENT & IMAGE MAINTENANCE REPORT',
    '==================================================',
    `Mode:                     ${report.dryRun ? 'DRY-RUN (No changes applied)' : 'LIVE (Changes applied)'}`,
    `Provider:                 ${report.providerMode}`,
    '',
    '1. Article Titles Audit:',
    `   Total Articles Scanned:  ${report.titles.totalScanned}`,
    `   Formulaic Titles Found:  ${report.titles.formulaicCount}`,
    `   Titles Corrected:        ${report.titles.correctedCount}`,
    '',
    '2. Topic Coverage Audit:',
    `   Empty Topics (0 articles): ${report.emptyTopics.emptyPillars.length > 0 ? report.emptyTopics.emptyPillars.join(', ') : 'None (All topics covered)'}`,
    `   New Articles Planned:     ${report.emptyTopics.plannedArticles.length}`,
    `   New Articles Created:     ${report.newArticlesCreated.length}`,
    '',
    '3. Image Backfill & Budget:',
    `   Image-less Articles Found:  ${report.existingArticlesMissingImages}`,
    `   Monthly Image Allowance:    ${report.monthlyImageCapacity}`,
    `   Images Generated (This Run): ${report.imagesGenerated}`,
    `   Estimated Remaining Gap:    ${report.remainingImageBacklog}`,
    '==================================================',
  ];

  if (report.titles.results.some((r) => r.isFormulaic)) {
    lines.push('', 'Formulaic Titles Identified:');
    for (const r of report.titles.results.filter((r) => r.isFormulaic)) {
      lines.push(`  - [${r.pillar}] "${r.currentTitle}"`);
      if (r.proposedTitle) {
        lines.push(`    -> Proposed: "${r.proposedTitle}" (${r.updated ? 'APPLIED' : 'QUEUED'})`);
      }
    }
  }

  if (report.emptyTopics.emptyPillars.length > 0) {
    lines.push('', 'Empty Topic Coverage Plan:');
    for (const plan of report.emptyTopics.plannedArticles) {
      lines.push(`  - [${plan.pillar.toUpperCase()}] "${plan.canonicalTopic}" (slug: ${plan.slug})`);
    }
  }

  return lines.join('\n');
}

/**
 * Executes the targeted LifeMode content correction and one-time content/image backfill.
 */
export async function runMaintenanceBackfill(
  options: MaintenanceRunOptions = {}
): Promise<MaintenanceRunReport> {
  const dryRun = options.dryRun !== false;
  const providerMode = options.providerMode || 'fixture';
  const log = options.logger || console.log;

  const contentRoot = resolve(options.contentRoot || join(process.cwd(), 'src', 'content'));
  const gitRepoRoot = resolve(options.gitRepoRoot || process.cwd());

  const repository = new FilesystemContentRepository({ contentRoot });
  const gitPublisher = new AstroGitPublisher({
    gitCli: new GitCli(),
    defaultOptions: {
      gitRepoRoot,
      contentRoot,
    },
  });

  const imageConfig = options.imageConfig || loadEditorialImageConfig();
  const costGuard =
    options.costGuard ||
    new EditorialImageCostGuard({
      enabled: imageConfig.costGuard.enabled,
      dailyLimit: imageConfig.costGuard.dailyLimit,
      monthlyLimit: imageConfig.costGuard.monthlyLimit,
    });

  // 1. Audit and migrate formulaic titles
  const titleReport = await auditAndMigrateTitles({
    contentRoot,
    dryRun,
  });

  // 2. Discover empty topics
  const emptyTopicsReport = await findEmptyTopics({
    contentRoot,
  });

  // 3. Setup providers for generation & review
  const isRouter = providerMode === 'router';
  const genProvider = isRouter
    ? new AIRouterGenerationProvider(defaultAIRouter)
    : new FixtureGenerationProvider();

  const reviewProvider = isRouter
    ? new AIRouterReviewProvider(defaultAIRouter)
    : new FixtureReviewProvider({ outcome: 'PASS' });

  const researchProvider = isRouter
    ? new WebEditorialResearchProvider()
    : new FixtureEditorialResearchProvider();

  const newArticlesCreated: Array<{
    pillar: PillarSlug;
    slug: string;
    title: string;
    hasImage: boolean;
    imageUrl?: string;
  }> = [];

  let imagesGenerated = 0;

  // 4. Generate articles for empty topics (if not dry run)
  if (!dryRun && emptyTopicsReport.plannedArticles.length > 0) {
    for (const topic of emptyTopicsReport.plannedArticles) {
      try {
        log(`[MAINTENANCE] Generating article for empty topic [${topic.pillar}] "${topic.canonicalTopic}"...`);
        const brief = buildContentBrief(topic);
        const evidenceResult = await runResearchPipeline({
          topic,
          brief,
          provider: researchProvider,
        });

        if (evidenceResult.items && evidenceResult.items.length > 0) {
          brief.evidence = evidenceResult.items;
        }

        const genRequest = briefToGenerationRequest(brief);
        const genResult = await runGenerationPipeline({
          request: genRequest,
          provider: genProvider,
        });

        if (!genResult.success) {
          log(`[MAINTENANCE] Generation failed for topic [${topic.pillar}]: ${genResult.errorCode} - ${genResult.errorMessage}`);
          continue;
        }

        const reviewRequest: ReviewRequest = {
          topicId: topic.id,
          title: genResult.article.title,
          description: genResult.article.description,
          excerpt: genResult.article.excerpt,
          content: genResult.article.content,
          pillar: topic.pillar,
          format: brief.format,
          audience: brief.audience,
          primaryIntent: brief.primaryIntent,
          secondaryIntent: brief.secondaryIntent,
          riskLevel: brief.riskLevel,
          affiliateIntent: brief.affiliateOpportunities.hasAffiliateIntent,
          sources: genResult.article.sources,
          evidence: brief.evidence,
          internalLinks: genResult.article.internalLinks,
          estimatedWordCount: brief.estimatedWordCount,
          deterministicValidation: genResult.validation,
        };

        const reviewResult = await runReviewPipeline({
          request: reviewRequest,
          provider: reviewProvider,
        });

        if (reviewResult.decision !== 'PASS') {
          log(`[MAINTENANCE] Review failed (${reviewResult.decision}) for topic [${topic.pillar}]`);
          continue;
        }

        const publishDate = new Date().toISOString().split('T')[0];
        const publishPackage: PublishPackage = {
          id: `pub-${topic.id}-${genResult.article.slug}`,
          topicId: topic.id,
          slug: genResult.article.slug,
          title: genResult.article.title,
          description: genResult.article.description,
          excerpt: genResult.article.excerpt,
          content: genResult.article.content,
          pillar: topic.pillar,
          format: brief.format,
          audience: brief.audience,
          primaryIntent: brief.primaryIntent,
          secondaryIntent: brief.secondaryIntent,
          riskLevel: brief.riskLevel,
          tags: topic.tags,
          sources: genResult.article.sources || [],
          internalLinks: genResult.article.internalLinks || [],
          affiliateIntent: brief.affiliateOpportunities.hasAffiliateIntent,
          affiliateCategories: brief.affiliateOpportunities.productCategories,
          faq: genResult.article.faq || [],
          socialHooks: genResult.article.socialHooks || [],
          imageMetadata: {
            prompt: `Editorial documentary photography for ${genResult.article.title}.`,
          },
          publicationMetadata: {
            targetDate: publishDate,
            version: 1,
            author: 'LifeMode Editorial',
          },
          qualitySummary: {
            overallScore: reviewResult.overallScore,
            safetyScore: reviewResult.dimensions?.safety?.score || 95,
            factualityScore: reviewResult.dimensions?.factuality?.score || 95,
            decision: reviewResult.decision,
            reviewedAt: new Date().toISOString(),
            reviewer: reviewProvider.name,
          },
        };

        // Generate image for newly created article (maintenance mode = monthly budget)
        let imageUrl: string | undefined;
        if (imageConfig.enabled) {
          const imgResult = await orchestrateEditorialImage(publishPackage, {
            dryRun: false,
            maintenanceMode: true,
            config: imageConfig,
            primaryProvider: options.imagePrimaryProvider,
            fallbackProvider: options.imageFallbackProvider,
            storageProvider: options.imageStorageProvider,
            costGuard,
            logger: log,
          });

          if (imgResult.success && imgResult.publicUrl) {
            imageUrl = imgResult.publicUrl;
            imagesGenerated++;
          }
        }

        const stored = await storePublishPackage(repository, publishPackage);
        if (stored.status === 'STORED' && stored.article) {
          if (options.allowCommit) {
            await gitPublisher.publish(stored.article, {
              dryRun: false,
              allowCommit: true,
              gitRepoRoot,
              contentRoot,
            });
          }
          newArticlesCreated.push({
            pillar: topic.pillar,
            slug: stored.article.slug,
            title: stored.article.frontmatter.title,
            hasImage: Boolean(imageUrl),
            imageUrl,
          });
        }
      } catch (err: any) {
        log(`[MAINTENANCE] Error generating new article for [${topic.pillar}]: ${err?.message}`);
      }
    }
  }

  // 5. Audit all stored articles for missing images
  const allArticles = await repository.list();
  const backfillCandidates = selectBackfillCandidates(allArticles);
  const existingArticlesMissingImages = backfillCandidates.length;

  const monthlyImageCapacity = await costGuard.getRemainingMonthlyCapacity();

  // 6. Generate backfill images if live execution is requested
  if (!dryRun && existingArticlesMissingImages > 0 && monthlyImageCapacity > 0) {
    const targetArticles = backfillCandidates.slice(0, monthlyImageCapacity);

    for (const article of targetArticles) {
      const guardCheck = await costGuard.canGenerateMaintenanceImage();
      if (!guardCheck.allowed) {
        log(`[MAINTENANCE] Monthly image quota reached. Halting image backfill.`);
        break;
      }

      const prompt =
        article.frontmatter.imagePrompt ||
        `Editorial documentary photography for ${article.frontmatter.title}.`;

      const pkg: PublishPackage = {
        id: `${article.pillar}/${article.slug}`,
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
          reviewer: 'maintenance-backfill',
        },
      };

      try {
        const imgResult = await orchestrateEditorialImage(pkg, {
          dryRun: false,
          maintenanceMode: true,
          config: imageConfig,
          primaryProvider: options.imagePrimaryProvider,
          fallbackProvider: options.imageFallbackProvider,
          storageProvider: options.imageStorageProvider,
          costGuard,
          logger: log,
        });

        if (imgResult.success && imgResult.publicUrl) {
          const updatedFrontmatter = {
            ...article.frontmatter,
            image: imgResult.publicUrl,
            imageAlt: article.frontmatter.imageAlt || article.frontmatter.title,
            imagePrompt: prompt,
            imageSource: imgResult.provider,
          };

          const updateResult = await repository.update({
            pillar: article.pillar,
            slug: article.slug,
            frontmatter: updatedFrontmatter,
            content: article.content,
          });

          if (options.allowCommit && updateResult.article) {
            await gitPublisher.publish(updateResult.article, {
              dryRun: false,
              allowCommit: true,
              gitRepoRoot,
              contentRoot,
            });
          }

          imagesGenerated++;
        }
      } catch (err: any) {
        log(`[MAINTENANCE] Error backfilling image for [${article.pillar}/${article.slug}]: ${err?.message}`);
      }
    }
  }

  const remainingImageBacklog = Math.max(
    0,
    existingArticlesMissingImages +
      (dryRun ? emptyTopicsReport.plannedArticles.length : 0) -
      imagesGenerated
  );

  const report: MaintenanceRunReport = {
    dryRun,
    providerMode,
    titles: titleReport,
    emptyTopics: emptyTopicsReport,
    newArticlesCreated,
    existingArticlesMissingImages,
    monthlyImageCapacity,
    imagesGenerated,
    remainingImageBacklog,
    summary: '',
  };

  report.summary = formatMaintenanceSummary(report);
  return report;
}
