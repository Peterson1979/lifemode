import * as path from 'node:path';
import type { IContentRepository, StoredArticle, PillarSlug } from '../storage/types.ts';
import { FilesystemContentRepository } from '../storage/repository.ts';
import { runScheduledEditorialAutomation } from './scheduler.ts';
import { acquireLock } from './lock.ts';
import { loadScheduledAutomationConfig } from './config.ts';
import type {
  ScheduledAutomationOptions,
  ScheduledAutomationResult,
} from './types.ts';
import { loadSocialConfig, runSocialPipeline, type SocialAutomationResult } from '../../social/index.ts';

export interface DailyArticleSummary {
  pillar: PillarSlug;
  slug: string;
  title: string;
  pubDate: string;
  topicId?: string;
  filePath?: string;
}

export interface DailyRunStatusReport {
  targetDate: string; // YYYY-MM-DD
  publishedTodayCount: number;
  dailyLimit: number;
  remainingQuota: number;
  isQuotaMet: boolean;
  status: 'COMPLETED' | 'NEEDS_EXECUTION' | 'LOCKED';
  publishedArticles: DailyArticleSummary[];
  lockInfo?: {
    isLocked: boolean;
    reason?: string;
  };
}

export interface WatchdogOptions extends ScheduledAutomationOptions {
  /**
   * Target date to verify for daily publication in UTC (format: YYYY-MM-DD).
   * Defaults to current UTC date.
   */
  targetDate?: string;

  /**
   * If true, bypasses the daily completion check and forces an automation run.
   */
  force?: boolean;
}

export interface WatchdogResult {
  runId: string;
  targetDate: string;
  action: 'NO_ACTION_REQUIRED' | 'EXECUTED_RECOVERY' | 'BLOCKED';
  status: 'SKIPPED' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'SUCCESS_NO_PUBLICATION';
  reason: string;
  durationMs: number;
  report: DailyRunStatusReport;
  scheduledResult?: ScheduledAutomationResult;
  socialResult?: SocialAutomationResult;
}

/**
 * Gets the current UTC date string in YYYY-MM-DD format.
 */
export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Inspects repository state to determine whether today's scheduled editorial run has completed.
 * Checks canonical Markdown articles in `src/content/` for `pubDate` matching the target date.
 */
export async function checkDailyRunStatus(
  options: {
    contentRepository?: IContentRepository;
    contentRoot?: string;
    targetDate?: string;
    dailyLimit?: number;
    lockPath?: string;
    staleTimeoutMs?: number;
  } = {}
): Promise<DailyRunStatusReport> {
  const targetDate = options.targetDate || getUtcDateString();
  const config = loadScheduledAutomationConfig();
  const dailyLimit = options.dailyLimit ?? config.dailyArticleLimit ?? 3;

  let defaultContentRoot: string;
  if (options.contentRoot) {
    const normalized = options.contentRoot.replace(/[/\\]+$/, '');
    if (
      normalized.endsWith('src/content') ||
      normalized.endsWith('src\\content') ||
      path.basename(normalized) === 'content'
    ) {
      defaultContentRoot = path.resolve(normalized);
    } else {
      defaultContentRoot = path.resolve(normalized, 'src', 'content');
    }
  } else {
    defaultContentRoot = path.resolve(process.cwd(), 'src', 'content');
  }

  const repository = options.contentRepository || new FilesystemContentRepository({
    contentRoot: defaultContentRoot,
  });

  // Scan stored articles
  let storedArticles: StoredArticle[] = [];
  try {
    storedArticles = await repository.list();
  } catch {
    storedArticles = [];
  }

  // Filter articles published on targetDate
  const publishedToday = storedArticles.filter((art) => {
    const pubDate = art.frontmatter.pubDate || '';
    return pubDate.startsWith(targetDate);
  });

  const publishedSummaries: DailyArticleSummary[] = publishedToday.map((art) => ({
    pillar: art.pillar,
    slug: art.slug,
    title: art.frontmatter.title,
    pubDate: art.frontmatter.pubDate,
    topicId: art.identity?.topicId || art.frontmatter.topicId,
    filePath: art.filePath,
  }));

  const publishedTodayCount = publishedSummaries.length;
  const remainingQuota = Math.max(0, dailyLimit - publishedTodayCount);
  const isQuotaMet = publishedTodayCount >= dailyLimit;

  // Check if an active execution lock is currently held
  let lockInfo: DailyRunStatusReport['lockInfo'];
  const testLock = await acquireLock({
    lockPath: options.lockPath || config.lockPath,
    staleTimeoutMs: options.staleTimeoutMs,
  });

  if (!testLock.acquired) {
    lockInfo = {
      isLocked: true,
      reason: testLock.reason,
    };
  } else {
    // Release immediately if acquired
    await testLock.release();
    lockInfo = {
      isLocked: false,
    };
  }

  let status: DailyRunStatusReport['status'];
  if (isQuotaMet) {
    status = 'COMPLETED';
  } else if (lockInfo.isLocked) {
    status = 'LOCKED';
  } else {
    status = 'NEEDS_EXECUTION';
  }

  return {
    targetDate,
    publishedTodayCount,
    dailyLimit,
    remainingQuota,
    isQuotaMet,
    status,
    publishedArticles: publishedSummaries,
    lockInfo,
  };
}

/**
 * Executes the Editorial Watchdog & Reliability Recovery runner.
 *
 * Flow:
 * 1. Checks current daily run status via `checkDailyRunStatus()`.
 * 2. If target publication quota for today is already fulfilled (and not forced),
 *    immediately returns NO-OP result (zero commits, zero duplicate publications, zero quota consumed).
 * 3. If an active lock is held by another concurrent execution worker, safely halts.
 * 4. If today's run was missed or delayed, executes the existing `runScheduledEditorialAutomation()`
 *    pipeline for the remaining quota to fulfill today's publication requirement.
 */
export async function runEditorialWatchdog(
  options: WatchdogOptions = {}
): Promise<WatchdogResult> {
  const startTime = Date.now();
  const runId = `watchdog-${startTime}-${Math.random().toString(36).slice(2, 7)}`;
  const targetDate = options.targetDate || getUtcDateString();
  const config = loadScheduledAutomationConfig(options);

  const report = await checkDailyRunStatus({
    contentRepository: options.contentRepository,
    contentRoot: options.contentRoot,
    targetDate,
    dailyLimit: options.dailyArticleLimit ?? config.dailyArticleLimit ?? 3,
    lockPath: options.lockPath || config.lockPath,
    staleTimeoutMs: options.staleLockTimeoutMs,
  });

  // 1. Quota already satisfied for today
  if (report.isQuotaMet && !options.force) {
    let socialResult: SocialAutomationResult | undefined;
    const isSocialEnabled =
      options.socialEnabled ??
      options.socialOptions?.enabled ??
      (process.env.LIFEMODE_SOCIAL_ENABLED === 'true' || process.env.SOCIAL_AUTOMATION_ENABLED === 'true');

    const socialConfig = loadSocialConfig({
      ...options.socialOptions,
      enabled: isSocialEnabled,
    });

    if (socialConfig.enabled) {
      try {
        socialResult = await runSocialPipeline({
          config: socialConfig,
          storagePath: options.storagePath,
          contentRepository: options.contentRepository,
          contentRoot: options.contentRoot,
        });
      } catch (socialErr: any) {
        console.error('[Social Automation Pipeline Notice]', socialErr?.message || socialErr);
      }
    }

    const durationMs = Math.max(1, Date.now() - startTime);
    return {
      runId,
      targetDate,
      action: 'NO_ACTION_REQUIRED',
      status: 'SKIPPED',
      reason: `Daily editorial target already met (${report.publishedTodayCount}/${report.dailyLimit} published on ${targetDate}).`,
      durationMs,
      report,
      socialResult,
    };
  }

  // 2. Active lock held by concurrent worker
  if (report.status === 'LOCKED' && !options.force) {
    const durationMs = Math.max(1, Date.now() - startTime);
    return {
      runId,
      targetDate,
      action: 'BLOCKED',
      status: 'FAILED',
      reason: `Watchdog execution blocked: active execution lock held by another process (${report.lockInfo?.reason || 'Locked'}).`,
      durationMs,
      report,
    };
  }

  // 3. Needs recovery / execution
  const remainingNeeded = options.force
    ? (options.maxOpportunities ?? report.dailyLimit)
    : Math.max(1, report.remainingQuota);

  const scheduledResult = await runScheduledEditorialAutomation({
    ...options,
    maxOpportunities: remainingNeeded,
    dailyArticleLimit: report.dailyLimit,
  });

  const durationMs = Math.max(1, Date.now() - startTime);

  let watchdogStatus: WatchdogResult['status'] = 'SUCCESS';
  if (scheduledResult.status === 'FAILED') {
    watchdogStatus = 'FAILED';
  } else if (scheduledResult.status === 'PARTIAL_SUCCESS') {
    watchdogStatus = 'PARTIAL_SUCCESS';
  } else if (scheduledResult.status === 'SUCCESS_NO_PUBLICATION') {
    watchdogStatus = 'SUCCESS_NO_PUBLICATION';
  }

  return {
    runId,
    targetDate,
    action: 'EXECUTED_RECOVERY',
    status: watchdogStatus,
    reason: `Watchdog triggered recovery execution for ${targetDate} (Processed: ${scheduledResult.processedCount}, Published: ${scheduledResult.publishedCount}, Remaining Quota: ${Math.max(0, report.dailyLimit - (report.publishedTodayCount + scheduledResult.publishedCount))}).`,
    durationMs,
    report,
    scheduledResult,
    socialResult: scheduledResult.socialResult,
  };
}
