import { resolve } from 'node:path';
import type {
  AutomationRequest,
  AutomationResult,
  OpportunityRunResult,
  AutomationStage,
  AutomationStageResult,
} from './types.ts';
import type { EditorialTopic, PriorityTier, OpportunityType } from '../types.ts';
import { loadAutomationConfig } from './config.ts';
import { runDiscoveryPipeline } from '../discovery/runner.ts';
import { loadCandidates } from '../discovery/storage.ts';
import { selectEditorialCandidates } from '../selection.ts';
import { slugify } from '../normalization.ts';
import { buildContentBrief } from '../brief.ts';
import { briefToGenerationRequest } from '../generation/brief-adapter.ts';
import { runGenerationPipeline } from '../generation/runner.ts';
import { FixtureGenerationProvider } from '../generation/providers/fixture.ts';
import { AIRouterGenerationProvider } from '../generation/providers/ai-router.ts';
import { runReviewPipeline } from '../review/runner.ts';
import { FixtureReviewProvider } from '../review/providers/fixture.ts';
import { AIRouterReviewProvider } from '../review/providers/ai-router.ts';
import { runPublishingPipeline } from '../publishing/runner.ts';
import { FixturePublishingProvider } from '../publishing/providers/fixture.ts';
import { FilesystemContentRepository } from '../storage/repository.ts';
import { storePublishPackage } from '../storage/publishing-adapter.ts';
import { AstroGitPublisher } from '../git-publisher/publisher.ts';
import { GitCli } from '../git-publisher/git-cli.ts';
import { defaultAIRouter } from '../../ai/router.ts';
import type { ReviewRequest } from '../review/types.ts';
import type { PublishingRequest } from '../publishing/types.ts';

function createPendingStageResults(): Record<AutomationStage, AutomationStageResult> {
  const stages: AutomationStage[] = [
    'DISCOVERY',
    'SELECTION',
    'BRIEF',
    'GENERATION',
    'VALIDATION',
    'REVIEW',
    'PUBLISHING_GATE',
    'STORAGE',
    'GIT_PUBLICATION',
  ];

  const results = {} as Record<AutomationStage, AutomationStageResult>;
  for (const s of stages) {
    results[s] = {
      stage: s,
      status: 'PENDING',
      durationMs: 0,
    };
  }
  return results;
}

/**
 * Formats a concise, human-readable run summary from an AutomationResult.
 */
export function formatAutomationSummary(result: AutomationResult): string {
  const lines: string[] = [
    'Editorial Automation Run',
    '------------------------',
    `Run ID:      ${result.runId}`,
    `Status:      ${result.status}`,
    `Dry-Run:     ${result.dryRun ? 'YES (No commits / pushes)' : 'NO (Live publication)'}`,
    `Duration:    ${result.durationMs}ms`,
    `Discovered:  ${result.discoveredCount}`,
    `Candidates:  ${result.candidateCount}`,
    `Selected:    ${result.selectedCount}`,
    `Processed:   ${result.processedCount}`,
    `Succeeded:   ${result.succeededCount}`,
    `Failed:      ${result.failedCount}`,
    '',
  ];

  if (result.opportunities.length === 0) {
    lines.push('No opportunities were processed in this run.');
  } else {
    for (const opp of result.opportunities) {
      lines.push(`[${opp.pillar.toUpperCase()}] ${opp.canonicalTopic} (${opp.topicId})`);
      lines.push(`  Overall: ${opp.status}${opp.failedStage ? ` (Failed at: ${opp.failedStage})` : ''}`);

      const stageKeys: AutomationStage[] = [
        'BRIEF',
        'GENERATION',
        'VALIDATION',
        'REVIEW',
        'PUBLISHING_GATE',
        'STORAGE',
        'GIT_PUBLICATION',
      ];

      for (const k of stageKeys) {
        const sr = opp.stageResults[k];
        let label = sr?.status as string || 'PENDING';
        if (k === 'REVIEW' && opp.review) {
          label = `${opp.review.decision} (${opp.review.overallScore}/100)`;
        } else if (k === 'GIT_PUBLICATION' && sr?.status === 'DRY_RUN') {
          label = 'DRY_RUN (Safe)';
        }
        lines.push(`  ${k.padEnd(16)}: ${label}`);
      }

      if (opp.error) {
        lines.push(`  Error [${opp.error.stage}]: ${opp.error.message}`);
      }
      lines.push('');
    }
  }

  lines.push(`Run Result: ${result.status}`);
  return lines.join('\n');
}

/**
 * Executes the complete LifeMode Editorial Automation Pipeline.
 *
 * Flow:
 * 1. Discovery (multi-source signal ingestion)
 * 2. Deduplication & Selection (scored ranking against stored content)
 * 3. Content Brief Construction (with target word counts)
 * 4. Content Generation (offline fixture or managed AI Router)
 * 5. Deterministic Validation (word count, structure, placeholders)
 * 6. AI Quality Review (independent editorial review)
 * 7. Publishing Gate (safety, quality, and eligibility)
 * 8. Content Storage (versioned canonical Markdown)
 * 9. Git Publication (safe dry-run or local commit)
 */
export async function runEditorialAutomation(
  request: AutomationRequest = {}
): Promise<AutomationResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const runId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // 1. Load and merge configuration
  const config = loadAutomationConfig({
    enabled: request.enabled,
    maxOpportunities: request.maxOpportunities,
    dryRun: request.dryRun,
    minScoreThreshold: request.minScoreThreshold,
    providerMode: request.providerMode,
  });

  // Safe opt-in check: If disabled, abort immediately
  if (!config.enabled && request.enabled !== true) {
    const durationMs = Math.max(1, Date.now() - startTime);
    const result: AutomationResult = {
      runId,
      status: 'DISABLED',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: config.dryRun,
      discoveredCount: 0,
      candidateCount: 0,
      selectedCount: 0,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
      opportunities: [],
      summary: 'Editorial Automation is currently disabled (EDITORIAL_AUTOMATION_ENABLED=false).',
    };
    return result;
  }

  // Initialize repositories and services
  const defaultContentRoot = resolve(request.contentRoot || process.cwd(), 'src', 'content');
  const repository = request.contentRepository || new FilesystemContentRepository({
    contentRoot: defaultContentRoot,
  });

  const gitPublisher = request.gitPublisher || new AstroGitPublisher({
    gitCli: new GitCli(),
    defaultOptions: {
      gitRepoRoot: request.gitRepoRoot || process.cwd(),
      contentRoot: defaultContentRoot,
      allowUnrelatedChanges: request.allowUnrelatedChanges,
      commitAuthor: request.commitAuthor,
    },
  });

  const aiRouter = request.aiRouter || defaultAIRouter;

  // Provider resolution based on providerMode
  const isRouterModule = config.providerMode === 'router';
  const genProvider = request.generationProvider || (
    isRouterModule
      ? new AIRouterGenerationProvider(aiRouter)
      : new FixtureGenerationProvider()
  );

  const reviewProvider = request.reviewProvider || (
    isRouterModule
      ? new AIRouterReviewProvider(aiRouter)
      : new FixtureReviewProvider({ outcome: 'PASS' })
  );

  const publishingProvider = request.publishingProvider || new FixturePublishingProvider();

  // 2. DISCOVERY: Execute Discovery Pipeline
  let discoveryReport;
  try {
    discoveryReport = await runDiscoveryPipeline(request.discoveryAdapters, {
      storagePath: request.storagePath,
      saveToDisk: true,
      minScoreThreshold: config.minScoreThreshold,
    });
  } catch (err: any) {
    const durationMs = Math.max(1, Date.now() - startTime);
    const result: AutomationResult = {
      runId,
      status: 'FAILED',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: config.dryRun,
      discoveredCount: 0,
      candidateCount: 0,
      selectedCount: 0,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
      opportunities: [],
      summary: `Discovery stage execution failed: ${err?.message || 'Unknown error'}`,
      error: {
        code: 'DISCOVERY_FAILED',
        message: err?.message || 'Unknown discovery error occurred.',
      },
    };
    return result;
  }

  const discoveredCount = discoveryReport.totalSignalsReceived;
  const rawSummary = discoveryReport.candidatesSummary || [];

  // Load candidate topics from storage or summary
  let candidateTopics: EditorialTopic[] = [];
  try {
    candidateTopics = await loadCandidates(request.storagePath);
  } catch {
    candidateTopics = [];
  }

  // If storage path was not used or load yielded empty, fallback to summary mapping
  if (candidateTopics.length === 0 && rawSummary.length > 0) {
    candidateTopics = rawSummary.map((c) => ({
      id: c.id,
      canonicalTopic: c.canonicalTopic,
      slug: slugify(c.canonicalTopic),
      pillar: c.pillar,
      sourceSignals: [],
      queryVariants: [c.canonicalTopic],
      scoring: {
        searchPotential: c.totalScore,
        pinterestPotential: c.pinterestScore || 80,
        socialPotential: 75,
        lifeModeRelevance: 90,
        commercialPotential: 60,
        freshness: 80,
        competitionOpportunity: 70,
        originalityPotential: 80,
      },
      totalScore: c.totalScore,
      pinterestScore: c.pinterestScore,
      priorityTier: (c.priorityTier as PriorityTier) || 'CANDIDATE',
      opportunityType: (c.opportunityType as OpportunityType) || 'ARTICLE',
      status: 'BRIEF_READY' as const,
      freshnessScore: 80,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [c.pillar, 'editorial'],
    }));
  }

  const candidateCount = candidateTopics.length;

  if (candidateCount === 0) {
    const durationMs = Math.max(1, Date.now() - startTime);
    const result: AutomationResult = {
      runId,
      status: 'NO_OPPORTUNITIES',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: config.dryRun,
      discoveryReport,
      discoveredCount,
      candidateCount: 0,
      selectedCount: 0,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
      opportunities: [],
      summary: 'No discovery candidates were identified.',
    };
    return result;
  }

  // 3. SELECTION & DEDUPLICATION against stored repository
  // Filter out candidates that already exist on disk
  const existingArticles = await repository.list();
  const existingTopicIds = new Set(
    existingArticles
      .map((a) => a.frontmatter.topicId || a.identity?.topicId)
      .filter(Boolean)
  );
  const existingSlugs = new Set(
    existingArticles.map((a) => `${a.pillar}/${a.slug}`)
  );
  const existingTitles = new Set(
    existingArticles.map((a) => a.frontmatter.title.toLowerCase().trim())
  );

  const unPublishedCandidates: EditorialTopic[] = [];
  for (const topic of candidateTopics) {
    const topicSlug = topic.slug || slugify(topic.canonicalTopic);
    const isTopicIdPublished = existingTopicIds.has(topic.id);
    const isSlugPublished = existingSlugs.has(`${topic.pillar}/${topicSlug}`);
    const isCanonicalTitlePublished = existingTitles.has(topic.canonicalTopic.toLowerCase().trim());
    const isDirectMatch = await repository.exists(topic.pillar, topicSlug);

    const isMatchedInPillar = existingArticles.some(
      (a) => a.pillar === topic.pillar && (
        a.frontmatter.topicId === topic.id ||
        a.slug === topicSlug ||
        a.slug.startsWith(topicSlug) ||
        topicSlug.startsWith(a.slug)
      )
    );

    if (
      !isTopicIdPublished &&
      !isSlugPublished &&
      !isCanonicalTitlePublished &&
      !isDirectMatch &&
      !isMatchedInPillar
    ) {
      unPublishedCandidates.push({
        ...topic,
        slug: topicSlug,
      });
    }
  }

  const { approved } = selectEditorialCandidates(unPublishedCandidates, {
    minScoreThreshold: config.minScoreThreshold,
    totalLimit: config.maxOpportunities,
  });

  const selectedCount = approved.length;

  if (selectedCount === 0) {
    const durationMs = Math.max(1, Date.now() - startTime);
    const result: AutomationResult = {
      runId,
      status: 'NO_OPPORTUNITIES',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs,
      dryRun: config.dryRun,
      discoveryReport,
      discoveredCount,
      candidateCount,
      selectedCount: 0,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: candidateCount,
      opportunities: [],
      summary: `Discovered ${discoveredCount} signals (${candidateCount} candidates), but 0 un-published candidates met selection criteria.`,
    };
    return result;
  }

  // 4. PROCESS SELECTED OPPORTUNITIES
  const opportunityResults: OpportunityRunResult[] = [];
  let succeededCount = 0;
  let failedCount = 0;

  for (const topic of approved) {
    const stageResults = createPendingStageResults();
    stageResults.DISCOVERY = { stage: 'DISCOVERY', status: 'SUCCESS', durationMs: 0 };
    stageResults.SELECTION = { stage: 'SELECTION', status: 'SUCCESS', durationMs: 0 };

    const oppResult: OpportunityRunResult = {
      topicId: topic.id,
      canonicalTopic: topic.canonicalTopic,
      pillar: topic.pillar,
      status: 'DRY_RUN',
      stageResults,
    };

    try {
      // Stage 3: BRIEF
      const briefStart = Date.now();
      const brief = buildContentBrief(topic, request.briefOptions);
      oppResult.brief = brief;
      stageResults.BRIEF = {
        stage: 'BRIEF',
        status: 'SUCCESS',
        durationMs: Math.max(1, Date.now() - briefStart),
        data: brief,
      };

      // Convert to Generation Request
      const generationRequest = briefToGenerationRequest(brief);

      // Stage 4: GENERATION
      const genStart = Date.now();
      const generationResult = await runGenerationPipeline({
        request: generationRequest,
        provider: genProvider,
        validationOptions: request.validationOptions,
      });

      oppResult.generation = generationResult;

      if (!generationResult.success) {
        if (generationResult.errorCode === 'VALIDATION_FAILED') {
          stageResults.GENERATION = {
            stage: 'GENERATION',
            status: 'SUCCESS',
            durationMs: Math.max(1, Date.now() - genStart),
          };
          stageResults.VALIDATION = {
            stage: 'VALIDATION',
            status: 'FAILED',
            durationMs: 1,
            error: {
              code: 'VALIDATION_FAILED',
              message: generationResult.errorMessage,
            },
          };
          oppResult.failedStage = 'VALIDATION';
          oppResult.error = {
            stage: 'VALIDATION',
            code: 'VALIDATION_FAILED',
            message: generationResult.errorMessage,
          };
        } else {
          stageResults.GENERATION = {
            stage: 'GENERATION',
            status: 'FAILED',
            durationMs: Math.max(1, Date.now() - genStart),
            error: {
              code: generationResult.errorCode || 'PROVIDER_ERROR',
              message: generationResult.errorMessage,
            },
          };
          oppResult.failedStage = 'GENERATION';
          oppResult.error = {
            stage: 'GENERATION',
            code: generationResult.errorCode || 'PROVIDER_ERROR',
            message: generationResult.errorMessage,
          };
        }
        oppResult.status = 'FAILED';
        failedCount++;
        opportunityResults.push(oppResult);
        continue;
      }

      // Generation succeeded
      stageResults.GENERATION = {
        stage: 'GENERATION',
        status: 'SUCCESS',
        durationMs: generationResult.metadata.durationMs,
        data: generationResult,
      };

      // Stage 5: VALIDATION
      stageResults.VALIDATION = {
        stage: 'VALIDATION',
        status: 'SUCCESS',
        durationMs: 1,
        data: generationResult.validation,
      };

      // Stage 6: REVIEW
      const reviewStart = Date.now();
      const reviewRequest: ReviewRequest = {
        topicId: topic.id,
        title: generationResult.article.title,
        description: generationResult.article.description,
        excerpt: generationResult.article.excerpt,
        content: generationResult.article.content,
        pillar: topic.pillar,
        format: brief.format,
        audience: brief.audience,
        primaryIntent: brief.primaryIntent,
        secondaryIntent: brief.secondaryIntent,
        riskLevel: brief.riskLevel,
        affiliateIntent: brief.affiliateOpportunities.hasAffiliateIntent,
        sources: generationResult.article.sources,
        internalLinks: generationResult.article.internalLinks,
        estimatedWordCount: brief.estimatedWordCount,
        deterministicValidation: generationResult.validation,
      };

      const reviewResult = await runReviewPipeline({
        request: reviewRequest,
        provider: reviewProvider,
      });

      oppResult.review = reviewResult;

      if (reviewResult.decision !== 'PASS') {
        stageResults.REVIEW = {
          stage: 'REVIEW',
          status: 'FAILED',
          durationMs: Math.max(1, Date.now() - reviewStart),
          error: {
            code: 'REVIEW_REJECTED',
            message: `Review decision was ${reviewResult.decision} (score: ${reviewResult.overallScore}) with issues: ${reviewResult.criticalIssues.join('; ') || 'Threshold not met'}`,
          },
        };
        oppResult.failedStage = 'REVIEW';
        oppResult.error = {
          stage: 'REVIEW',
          code: 'REVIEW_REJECTED',
          message: `Review decision was ${reviewResult.decision} (score: ${reviewResult.overallScore})`,
        };
        oppResult.status = 'FAILED';
        failedCount++;
        opportunityResults.push(oppResult);
        continue;
      }

      stageResults.REVIEW = {
        stage: 'REVIEW',
        status: 'SUCCESS',
        durationMs: reviewResult.metadata.durationMs,
        data: reviewResult,
      };

      // Stage 7: PUBLISHING_GATE
      const pubStart = Date.now();
      const pubRequest: PublishingRequest = {
        article: generationResult.article,
        review: reviewResult,
        context: {
          topicId: topic.id,
          pillar: topic.pillar,
          format: brief.format,
          audience: brief.audience,
          primaryIntent: brief.primaryIntent,
          secondaryIntent: brief.secondaryIntent,
          riskLevel: brief.riskLevel,
          affiliateIntent: brief.affiliateOpportunities.hasAffiliateIntent,
          affiliateCategories: brief.affiliateOpportunities.productCategories,
          tags: topic.tags,
          estimatedWordCount: brief.estimatedWordCount,
        },
        options: {
          dryRun: config.dryRun,
        },
      };

      const publishingResult = await runPublishingPipeline({
        request: pubRequest,
        provider: publishingProvider,
      });

      oppResult.publishing = publishingResult;

      if (publishingResult.status === 'BLOCKED' || !publishingResult.gateResult?.eligible) {
        stageResults.PUBLISHING_GATE = {
          stage: 'PUBLISHING_GATE',
          status: 'FAILED',
          durationMs: Math.max(1, Date.now() - pubStart),
          error: {
            code: 'GATE_BLOCKED',
            message: publishingResult.error?.message || 'Publishing gate ineligible.',
          },
        };
        oppResult.failedStage = 'PUBLISHING_GATE';
        oppResult.error = {
          stage: 'PUBLISHING_GATE',
          code: 'GATE_BLOCKED',
          message: publishingResult.error?.message || 'Publishing gate blocked publication.',
        };
        oppResult.status = 'FAILED';
        failedCount++;
        opportunityResults.push(oppResult);
        continue;
      }

      stageResults.PUBLISHING_GATE = {
        stage: 'PUBLISHING_GATE',
        status: 'SUCCESS',
        durationMs: Math.max(1, Date.now() - pubStart),
        data: publishingResult.gateResult,
      };

      // Stage 8: STORAGE
      const storageStart = Date.now();
      let storageResult;

      // Handle repository storage
      if (publishingResult.publishPackage) {
        storageResult = await storePublishPackage(repository, publishingResult.publishPackage);
      } else {
        storageResult = {
          status: 'INVALID' as const,
          operation: 'create' as const,
          timestamp: new Date().toISOString(),
          error: {
            code: 'MISSING_PACKAGE',
            message: 'PublishingResult did not contain a valid PublishPackage.',
          },
        };
      }

      oppResult.storage = storageResult;

      if (storageResult.status === 'FAILED' || storageResult.status === 'INVALID' || !storageResult.article) {
        stageResults.STORAGE = {
          stage: 'STORAGE',
          status: 'FAILED',
          durationMs: Math.max(1, Date.now() - storageStart),
          error: {
            code: storageResult.error?.code || 'STORAGE_FAILED',
            message: storageResult.error?.message || 'Content storage failed.',
          },
        };
        oppResult.failedStage = 'STORAGE';
        oppResult.error = {
          stage: 'STORAGE',
          code: storageResult.error?.code || 'STORAGE_FAILED',
          message: storageResult.error?.message || 'Content storage persistence failed.',
        };
        oppResult.status = 'FAILED';
        failedCount++;
        opportunityResults.push(oppResult);
        continue;
      }

      stageResults.STORAGE = {
        stage: 'STORAGE',
        status: 'SUCCESS',
        durationMs: Math.max(1, Date.now() - storageStart),
        data: storageResult,
      };

      // Stage 9: GIT_PUBLICATION
      const gitStart = Date.now();
      const gitResult = await gitPublisher.publish(storageResult.article, {
        dryRun: config.dryRun,
        allowCommit: request.allowCommit,
        gitRepoRoot: request.gitRepoRoot,
        contentRoot: request.contentRoot,
        allowUnrelatedChanges: request.allowUnrelatedChanges,
        commitAuthor: request.commitAuthor,
      });

      oppResult.gitPublication = gitResult;

      if (gitResult.status === 'BLOCKED' || gitResult.status === 'FAILED') {
        stageResults.GIT_PUBLICATION = {
          stage: 'GIT_PUBLICATION',
          status: 'FAILED',
          durationMs: Math.max(1, Date.now() - gitStart),
          error: {
            code: gitResult.error?.code || 'GIT_PUBLICATION_FAILED',
            message: gitResult.error?.message || 'Git publication failed.',
          },
        };
        oppResult.failedStage = 'GIT_PUBLICATION';
        oppResult.error = {
          stage: 'GIT_PUBLICATION',
          code: gitResult.error?.code || 'GIT_PUBLICATION_FAILED',
          message: gitResult.error?.message || 'Git publication stage failed.',
        };
        oppResult.status = 'FAILED';
        failedCount++;
        opportunityResults.push(oppResult);
        continue;
      }

      const gitStageStatus = config.dryRun ? 'DRY_RUN' : 'SUCCESS';
      stageResults.GIT_PUBLICATION = {
        stage: 'GIT_PUBLICATION',
        status: gitStageStatus,
        durationMs: Math.max(1, Date.now() - gitStart),
        data: gitResult,
      };

      oppResult.status = config.dryRun ? 'DRY_RUN' : 'COMPLETED';
      succeededCount++;
      opportunityResults.push(oppResult);
    } catch (err: any) {
      // Unhandled stage exception safety boundary
      oppResult.status = 'FAILED';
      oppResult.error = {
        stage: oppResult.failedStage || 'GENERATION',
        code: 'UNHANDLED_EXCEPTION',
        message: err?.message || 'Unexpected exception occurred during opportunity processing.',
      };
      failedCount++;
      opportunityResults.push(oppResult);
    }
  }

  // 5. Overall Run Result Calculation
  const durationMs = Math.max(1, Date.now() - startTime);
  const processedCount = opportunityResults.length;

  let finalStatus: AutomationResult['status'] = 'SUCCESS';
  if (failedCount > 0 && succeededCount === 0) {
    finalStatus = 'FAILED';
  } else if (failedCount > 0 && succeededCount > 0) {
    finalStatus = 'PARTIAL_SUCCESS';
  }

  const automationResult: AutomationResult = {
    runId,
    status: finalStatus,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    dryRun: config.dryRun,
    discoveryReport,
    discoveredCount,
    candidateCount,
    selectedCount,
    processedCount,
    succeededCount,
    failedCount,
    skippedCount: candidateCount - processedCount,
    opportunities: opportunityResults,
    summary: '',
  };

  automationResult.summary = formatAutomationSummary(automationResult);
  return automationResult;
}
