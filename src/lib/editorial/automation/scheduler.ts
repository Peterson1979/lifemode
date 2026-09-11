import * as path from 'node:path';
import { loadScheduledAutomationConfig } from './config.ts';
import { runEditorialAutomation } from './runner.ts';
import { acquireLock } from './lock.ts';
import type {
  ScheduledAutomationOptions,
  ScheduledAutomationResult,
  ScheduledStatus,
} from './types.ts';
import { GitCli } from '../git-publisher/git-cli.ts';
import { loadGitPublisherConfig } from '../git-publisher/config.ts';
import { loadSocialConfig, runSocialPipeline, type SocialAutomationResult } from '../../social/index.ts';

/**
 * Executes a production-safe Scheduled Editorial Automation run.
 *
 * Responsibilities:
 * 1. Evaluates opt-in configuration (`LIFEMODE_AUTOMATION_ENABLED` / `EDITORIAL_AUTOMATION_ENABLED`).
 * 2. Acquires atomic file lock with stale-lock detection to prevent overlapping runs.
 * 3. Enforces pre-flight Git working tree cleanliness before live publication.
 * 4. Executes the full editorial pipeline (`discovery` -> `research` -> `generation` -> `review` -> `publishing`).
 * 5. Persists updated candidate metadata.
 * 6. Safely pushes to remote repository ONLY when a legitimate publication commit occurred.
 * 7. Produces a structured machine-readable result with classified ScheduledStatus.
 */
export async function runScheduledEditorialAutomation(
  options: ScheduledAutomationOptions = {}
): Promise<ScheduledAutomationResult> {
  const startTime = Date.now();
  const runId = `sched-${startTime}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date(startTime).toISOString();

  const config = loadScheduledAutomationConfig(options);
  const gitPublisherConfig = loadGitPublisherConfig();
  const repoRoot = path.resolve(options.gitRepoRoot || gitPublisherConfig.gitRepoRoot);

  // Helper to build default JSON output structure
  const buildResult = (
    status: ScheduledStatus,
    counts: {
      discovered: number;
      candidates: number;
      selected: number;
      processed: number;
      succeeded: number;
      rejected: number;
      failed: number;
      published: number;
      researchRequired: number;
      researchSuccess: number;
      researchFailure: number;
    },
    pushedToRemote: boolean,
    summary: string,
    fatalError?: string,
    automationResult?: any,
    socialResult?: any
  ): ScheduledAutomationResult => {
    const completedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.now() - startTime);

    return {
      runId,
      startedAt,
      completedAt,
      durationMs,
      status,
      dryRun: config.dryRun,
      discoveredCount: counts.discovered,
      candidateCount: counts.candidates,
      selectedCount: counts.selected,
      processedCount: counts.processed,
      succeededCount: counts.succeeded,
      rejectedCount: counts.rejected,
      failedCount: counts.failed,
      publishedCount: counts.published,
      pushedToRemote,
      researchRequiredCount: counts.researchRequired,
      researchSuccessCount: counts.researchSuccess,
      researchFailureCount: counts.researchFailure,
      summary,
      fatalError,
      articles: automationResult?.articles,
      automationResult,
      socialResult,
      jsonResult: {
        runId,
        startedAt,
        completedAt,
        durationMs,
        status,
        dryRun: config.dryRun,
        counts,
        pushedToRemote,
        fatalError,
        articles: automationResult?.articles,
        social: socialResult,
      },
    };
  };

  const zeroCounts = {
    discovered: 0,
    candidates: 0,
    selected: 0,
    processed: 0,
    succeeded: 0,
    rejected: 0,
    failed: 0,
    published: 0,
    researchRequired: 0,
    researchSuccess: 0,
    researchFailure: 0,
  };

  // 1. Check if automation is enabled
  if (!config.enabled) {
    return buildResult(
      'SUCCESS_NO_PUBLICATION',
      zeroCounts,
      false,
      'Scheduled editorial automation is disabled (LIFEMODE_AUTOMATION_ENABLED=false).'
    );
  }

  // 2. Acquire atomic execution lock
  const lockHandle = await acquireLock({
    lockPath: config.lockPath,
    staleTimeoutMs: options.staleLockTimeoutMs,
  });

  if (!lockHandle.acquired) {
    return buildResult(
      'FAILED',
      zeroCounts,
      false,
      `Scheduled execution blocked: ${lockHandle.reason || 'Failed to acquire atomic lock.'}`,
      lockHandle.reason || 'Execution lock acquisition failed.'
    );
  }

  const gitCli: GitCli = (options.gitPublisher as any)?.gitCli || new GitCli();

  try {
    // 3. Pre-flight Git cleanliness verification for live commit/push
    if (config.allowCommit && !config.dryRun) {
      const isGitAvailable = await gitCli.isGitAvailable();
      if (!isGitAvailable) {
        return buildResult(
          'FAILED',
          zeroCounts,
          false,
          'Git executable is not available in current system environment.',
          'GIT_UNAVAILABLE'
        );
      }

      const isRepo = await gitCli.isGitRepo(repoRoot);
      if (isRepo) {
        const repoStatus = await gitCli.getRepoStatus(repoRoot);
        const normalizedLock = config.lockPath ? gitCli.normalizeGitPath(path.relative(repoRoot, config.lockPath)) : '.automation.lock';
        const normalizedStorage = options.storagePath ? gitCli.normalizeGitPath(path.relative(repoRoot, options.storagePath)) : 'data/topics/candidates.json';

        const allDirty = [
          ...repoStatus.modifiedFiles,
          ...repoStatus.untrackedFiles,
          ...repoStatus.stagedFiles,
        ];

        const genuineUnrelated = allDirty.filter(
          (f) => f !== normalizedLock && f !== normalizedStorage && !f.endsWith('.lock') && !f.endsWith('candidates.json')
        );

        if (genuineUnrelated.length > 0 && !options.allowUnrelatedChanges) {
          return buildResult(
            'FAILED',
            zeroCounts,
            false,
            `Working tree contains unrelated uncommitted changes in: ${genuineUnrelated.slice(0, 3).join(', ')}. Publication halted to protect repository integrity.`,
            'DIRTY_WORKING_TREE'
          );
        }
      }
    }

    // 4. Execute standard editorial automation pipeline
    const automationResult = await runEditorialAutomation({
      ...options,
      enabled: config.enabled,
      dryRun: config.dryRun,
      allowCommit: config.allowCommit,
      allowUnrelatedChanges: options.allowUnrelatedChanges ?? true,
      maxOpportunities: config.maxOpportunities,
      minScoreThreshold: config.minScoreThreshold,
      providerMode: config.providerMode,
      storagePath: options.storagePath,
      contentRoot: options.contentRoot,
      gitRepoRoot: options.gitRepoRoot,
      commitAuthor: options.commitAuthor,
      discoveryAdapters: options.discoveryAdapters,
      researchProvider: options.researchProvider,
      generationProvider: options.generationProvider,
      reviewProvider: options.reviewProvider,
      publishingProvider: options.publishingProvider,
      contentRepository: options.contentRepository,
      gitPublisher: options.gitPublisher,
      aiRouter: options.aiRouter,
    });

    const opps = automationResult.opportunities || [];
    const publishedCount = opps.filter(
      (o) => o.gitPublication?.committed === true || (o.status === 'COMPLETED' && config.allowCommit && !config.dryRun)
    ).length;

    const researchRequiredCount = opps.filter((o) => o.research?.required === true).length;
    const researchSuccessCount = opps.filter((o) => o.research?.status === 'SUCCESS').length;
    const researchFailureCount = opps.filter(
      (o) => o.research && (o.research.status === 'FAILED' || o.research.status === 'NO_EVIDENCE')
    ).length;

    const counts = {
      discovered: automationResult.discoveredCount,
      candidates: automationResult.candidateCount,
      selected: automationResult.selectedCount,
      processed: automationResult.processedCount,
      succeeded: automationResult.succeededCount,
      rejected: automationResult.rejectedCount || 0,
      failed: automationResult.failedCount,
      published: publishedCount,
      researchRequired: researchRequiredCount,
      researchSuccess: researchSuccessCount,
      researchFailure: researchFailureCount,
    };

    let pushedToRemote = false;

    // 5. Post-publication candidate state commit & remote Git push
    if (counts.succeeded > 0 && config.allowCommit && !config.dryRun) {
      try {
        const isRepo = await gitCli.isGitRepo(repoRoot);
        if (isRepo) {
          const defaultStoragePath = path.join(process.cwd(), 'data', 'topics', 'candidates.json');
          const targetStorage = options.storagePath || defaultStoragePath;
          const relativeStorage = gitCli.normalizeGitPath(path.relative(repoRoot, targetStorage));

          const currentStatus = await gitCli.getRepoStatus(repoRoot, relativeStorage);
          if (currentStatus.modifiedFiles.includes(relativeStorage) || currentStatus.untrackedFiles.includes(relativeStorage)) {
            await gitCli.stageSingleFile(repoRoot, relativeStorage);
            await gitCli.createCommit(
              repoRoot,
              'chore: persist editorial candidate state',
              options.commitAuthor || {
                name: 'LifeMode Editorial Automation',
                email: 'automation@lifemode.local',
              }
            );
          }

          // Push only when explicit allowPush is set and at least one publication succeeded
          if (config.allowPush) {
            await gitCli.push(repoRoot, config.gitRemote, config.gitBranch);
            pushedToRemote = true;
          }
        }
      } catch (gitErr: any) {
        // Non-fatal if candidate state staging fails, but record error in summary
        automationResult.summary += `\n[Warning] Git persistence/push notice: ${gitErr?.message || 'Push incomplete.'}`;
      }
    }

    // 6. Optional Social Automation Pipeline stage
    let socialResult: SocialAutomationResult | undefined;
    const isSocialEnabled = options.socialEnabled ?? options.socialOptions?.enabled ?? (process.env.LIFEMODE_SOCIAL_ENABLED === 'true' || process.env.SOCIAL_AUTOMATION_ENABLED === 'true');

    const socialConfig = loadSocialConfig({
      ...options.socialOptions,
      enabled: isSocialEnabled,
    });

    if (socialConfig.enabled) {
      try {
        socialResult = await runSocialPipeline({
          config: socialConfig,
          storagePath: options.storagePath,
        });
      } catch (socialErr: any) {
        // Failure isolation: social exception does not fail the scheduled editorial run
        console.error('[Social Automation Pipeline Notice]', socialErr?.message || socialErr);
      }
    }

    // 7. Determine top-level ScheduledStatus
    let scheduledStatus: ScheduledStatus;
    if (automationResult.status === 'FAILED') {
      scheduledStatus = 'FAILED';
    } else if (counts.succeeded > 0 && counts.failed === 0 && counts.rejected === 0) {
      scheduledStatus = 'SUCCESS';
    } else if (counts.succeeded > 0 && (counts.rejected > 0 || counts.failed > 0)) {
      scheduledStatus = 'PARTIAL_SUCCESS';
    } else if (counts.succeeded === 0 && counts.failed === 0) {
      scheduledStatus = 'SUCCESS_NO_PUBLICATION';
    } else {
      scheduledStatus = 'FAILED';
    }

    const summaryParts = [
      `Scheduled Editorial Run: [${scheduledStatus}]`,
      `Duration: ${Math.max(1, Date.now() - startTime)}ms`,
      `Processed: ${counts.processed} (Succeeded: ${counts.succeeded}, Rejected: ${counts.rejected}, Published: ${counts.published})`,
      `Push to Remote: ${pushedToRemote ? 'COMPLETED' : 'SKIPPED'}`,
      `\nPipeline Details:\n${automationResult.summary}`,
    ];

    if (socialResult) {
      summaryParts.push(`\nSocial Automation Details:\n${socialResult.summary}`);
    }

    const summaryText = summaryParts.join('\n');

    return buildResult(
      scheduledStatus,
      counts,
      pushedToRemote,
      summaryText,
      automationResult.error?.message,
      automationResult,
      socialResult
    );
  } finally {
    // 8. Ensure execution lock is always released
    await lockHandle.release();
  }
}

