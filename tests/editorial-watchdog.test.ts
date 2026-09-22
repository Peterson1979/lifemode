import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  checkDailyRunStatus,
  runEditorialWatchdog,
  getUtcDateString,
  acquireLock,
  FilesystemContentRepository,
  type IDiscoveryAdapter,
  type DiscoveryResult,
} from '../src/lib/editorial/index.ts';

const execFileAsync = promisify(execFile);

async function createTempWorkspace(prefix = 'lifemode-watchdog-test-'): Promise<{
  repoDir: string;
  contentDir: string;
  lockPath: string;
  storagePath: string;
  cleanup: () => Promise<void>;
}> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const contentDir = path.join(repoDir, 'src', 'content');
  const lockPath = path.join(repoDir, '.automation.lock');
  const storagePath = path.join(repoDir, 'candidates.json');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'travel'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'life'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'money'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'wellbeing'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'food-drink'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'culture'), { recursive: true });

  await execFileAsync('git', ['init', '-b', 'master'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 'LifeMode Watchdog Tester'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 'watchdog-tester@lifemode.local'], { cwd: repoDir });

  const readmePath = path.join(repoDir, 'README.md');
  await fs.writeFile(readmePath, '# Test Repo\n', 'utf-8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoDir });
  await execFileAsync('git', ['commit', '-m', 'chore: initial commit'], { cwd: repoDir });

  const cleanup = async () => {
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
    } catch {}
  };

  return { repoDir, contentDir, lockPath, storagePath, cleanup };
}

class MockSignalAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'RSS_FEEDS' as const;
  readonly name = 'Mock Signal Adapter';
  private queries: Array<{ query: string; pillar: string; score: number }>;

  constructor(queryOrQueries: string | Array<{ query: string; pillar: string; score: number }>, pillar = 'life', score = 95) {
    if (typeof queryOrQueries === 'string') {
      this.queries = [{ query: queryOrQueries, pillar, score }];
    } else {
      this.queries = queryOrQueries;
    }
  }

  async fetchSignals(): Promise<DiscoveryResult> {
    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals: this.queries.map((q, idx) => ({
        source: 'RSS_FEEDS',
        sourceId: `mock-${idx}-${Math.random().toString(36).slice(2)}`,
        rawQuery: q.query,
        timestamp: new Date().toISOString(),
        category: q.pillar,
        sourceUrl: `https://example.com/source/${idx}`,
        metrics: {
          growthRate: q.score,
          searchVolume: 18000,
          relativeInterest: q.score,
          visualPotentialScore: 90,
        },
        metadata: {
          isFixture: true,
          publisher: 'LifeMode Test Publisher',
        },
      })),
      fetchedAt: new Date().toISOString(),
    };
  }
}

test('1. checkDailyRunStatus: Correctly distinguishes empty vs completed daily publication states', async () => {
  const { contentDir, cleanup } = await createTempWorkspace('watchdog-status-');
  const repository = new FilesystemContentRepository({ contentRoot: contentDir });
  const today = getUtcDateString();

  try {
    // Empty content state -> status = NEEDS_EXECUTION, remaining quota = 3 (default production limit)
    const reportEmpty = await checkDailyRunStatus({
      contentRepository: repository,
      targetDate: today,
    });

    assert.equal(reportEmpty.status, 'NEEDS_EXECUTION');
    assert.equal(reportEmpty.publishedTodayCount, 0);
    assert.equal(reportEmpty.dailyLimit, 3);
    assert.equal(reportEmpty.remainingQuota, 3);
    assert.equal(reportEmpty.isQuotaMet, false);
    assert.equal(reportEmpty.publishedArticles.length, 0);

    // Create 3 articles to satisfy the production daily limit of 3
    for (let i = 1; i <= 3; i++) {
      await repository.create({
        pillar: 'life',
        slug: `mindful-morning-rituals-${i}`,
        frontmatter: {
          title: `Mindful Morning Rituals ${i}`,
          description: `Exploring mindful daily rituals ${i}.`,
          pubDate: `${today}T0${6 + i}:00:00Z`,
        },
        content: `## 1. Context\n\nDaily ritual article ${i}.`,
      });
    }

    const reportFilled = await checkDailyRunStatus({
      contentRepository: repository,
      targetDate: today,
    });

    assert.equal(reportFilled.status, 'COMPLETED');
    assert.equal(reportFilled.publishedTodayCount, 3);
    assert.equal(reportFilled.dailyLimit, 3);
    assert.equal(reportFilled.remainingQuota, 0);
    assert.equal(reportFilled.isQuotaMet, true);
    assert.equal(reportFilled.publishedArticles.length, 3);
  } finally {
    await cleanup();
  }
});

test('2. Watchdog NO-OP: Normal scheduled run already published 3 articles today -> watchdog does nothing', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace('watchdog-noop-');
  const repository = new FilesystemContentRepository({ contentRoot: contentDir });
  const today = getUtcDateString();

  try {
    // Pre-populate 3 articles (simulating completed 3-article daily quota)
    for (let i = 1; i <= 3; i++) {
      await repository.create({
        pillar: 'travel',
        slug: `nordic-sauna-architecture-${i}`,
        frontmatter: {
          title: `Nordic Sauna Architecture ${i}`,
          description: 'Exploring traditional wooden saunas.',
          pubDate: `${today}T06:0${i}:00Z`,
        },
        content: '## 1. Context\n\nTraditional saunas in Scandinavia.',
      });
    }

    await execFileAsync('git', ['add', '-A'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'feat: publish prior articles'], { cwd: repoDir });

    // Run watchdog
    const watchdogResult = await runEditorialWatchdog({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      targetDate: today,
      discoveryAdapters: [new MockSignalAdapter('Another Topic That Should Not Run')],
    });

    assert.equal(watchdogResult.status, 'SKIPPED');
    assert.equal(watchdogResult.action, 'NO_ACTION_REQUIRED');
    assert.ok(watchdogResult.reason.includes('already met'));
    assert.equal(watchdogResult.report.publishedTodayCount, 3);
    assert.equal(watchdogResult.report.dailyLimit, 3);
    assert.equal(watchdogResult.scheduledResult, undefined);

    // Verify git commit count remains 2 (1 initial + 1 pre-populated, 0 added by watchdog)
    const commitCount = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoDir });
    assert.equal(commitCount.stdout.trim(), '2');
  } finally {
    await cleanup();
  }
});

test('3. Watchdog Recovery: Scheduled run was missed -> watchdog detects 0 articles and triggers recovery for full quota of 3', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace('watchdog-recovery-');
  const repository = new FilesystemContentRepository({ contentRoot: contentDir });
  const today = getUtcDateString();

  try {
    // 0 articles exist for today -> Watchdog recovers up to daily limit
    const watchdogResult = await runEditorialWatchdog({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      allowNoImageFallback: true,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      targetDate: today,
      discoveryAdapters: [
        new MockSignalAdapter([
          { query: 'Biophilic Workstation Architecture', pillar: 'tech-ai', score: 98 },
          { query: 'Passive House Heating Systems', pillar: 'life', score: 96 },
          { query: 'Solar Microgrid Resilience', pillar: 'travel', score: 94 },
        ]),
      ],
    });

    assert.equal(watchdogResult.status, 'SUCCESS');
    assert.equal(watchdogResult.action, 'EXECUTED_RECOVERY');
    assert.ok(watchdogResult.scheduledResult);
    assert.equal(watchdogResult.scheduledResult.publishedCount, 3);
    assert.equal(watchdogResult.report.dailyLimit, 3);

    // Verify 3 articles were stored and committed to git
    const stored = await repository.list();
    assert.equal(stored.length, 3);

    const commitLog = await execFileAsync('git', ['log', '--oneline'], { cwd: repoDir });
    assert.ok(commitLog.stdout.includes('feat: publish article'));
  } finally {
    await cleanup();
  }
});

test('4. Partial Day Recovery: 1 article published earlier -> watchdog recovers remaining 2 articles up to daily limit of 3', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace('watchdog-partial-');
  const repository = new FilesystemContentRepository({ contentRoot: contentDir });
  const today = getUtcDateString();

  try {
    // 1 article published earlier at 06:00 UTC
    await repository.create({
      pillar: 'money',
      slug: 'ethical-impact-investing-trends',
      frontmatter: {
        title: 'Ethical Impact Investing Trends',
        description: 'Sustainable finance strategies.',
        pubDate: `${today}T06:00:00Z`,
      },
      content: '## 1. Context\n\nESG finance guide.',
    });

    await execFileAsync('git', ['add', '-A'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'feat: publish morning article'], { cwd: repoDir });

    // Watchdog runs at 12:00 UTC -> should detect 1 published, remaining quota = 2, and publish 2 more
    const watchdogResult = await runEditorialWatchdog({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      allowNoImageFallback: true,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      targetDate: today,
      discoveryAdapters: [
        new MockSignalAdapter([
          { query: 'Modern Mass Timber Architecture', pillar: 'travel', score: 97 },
          { query: 'Geothermal Energy in Residential Architecture', pillar: 'tech-ai', score: 95 },
          { query: 'Surplus Topic Should Not Publish', pillar: 'life', score: 90 },
        ]),
      ],
    });

    assert.equal(watchdogResult.status, 'SUCCESS');
    assert.equal(watchdogResult.action, 'EXECUTED_RECOVERY');
    assert.equal(watchdogResult.report.publishedTodayCount, 1);
    assert.equal(watchdogResult.report.remainingQuota, 2);
    assert.equal(watchdogResult.scheduledResult?.publishedCount, 2);

    const totalStored = await repository.list();
    assert.equal(totalStored.length, 3);
  } finally {
    await cleanup();
  }
});

test('5. Stale/incomplete run recovery: Watchdog safely breaks stale lock and recovers publication', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace('watchdog-stale-');
  const today = getUtcDateString();

  // Create a 2-hour-old stale lock
  const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await fs.writeFile(
    lockPath,
    JSON.stringify({ pid: 88888, hostname: 'crashed-runner', acquiredAt: staleTime }),
    'utf-8'
  );

  try {
    const watchdogResult = await runEditorialWatchdog({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      allowNoImageFallback: true,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      targetDate: today,
      dailyArticleLimit: 1,
      staleLockTimeoutMs: 30 * 60 * 1000,
      discoveryAdapters: [new MockSignalAdapter('Calm Technology Design', 'life', 95)],
    });

    assert.equal(watchdogResult.status, 'SUCCESS');
    assert.equal(watchdogResult.action, 'EXECUTED_RECOVERY');
    assert.equal(watchdogResult.scheduledResult?.publishedCount, 1);
  } finally {
    await cleanup();
  }
});

test('6. Active concurrent lock: Watchdog halts safely when active lock is held by another worker', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace('watchdog-locked-');
  const today = getUtcDateString();

  // Acquire active lock
  const activeLock = await acquireLock({ lockPath });
  assert.equal(activeLock.acquired, true);

  try {
    const watchdogResult = await runEditorialWatchdog({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      targetDate: today,
      discoveryAdapters: [new MockSignalAdapter('Concurrent Topic Test', 'life', 95)],
    });

    assert.equal(watchdogResult.status, 'FAILED');
    assert.equal(watchdogResult.action, 'BLOCKED');
    assert.ok(watchdogResult.reason.includes('active execution lock held'));
    assert.equal(watchdogResult.scheduledResult, undefined);
  } finally {
    await activeLock.release();
    await cleanup();
  }
});

test('7. Repeated watchdog execution: Second run detects completed state with ZERO duplicate publications', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace('watchdog-repeat-');
  const repository = new FilesystemContentRepository({ contentRoot: contentDir });
  const today = getUtcDateString();

  try {
    // First watchdog run: Missed run recovered -> 1 article published with explicit daily limit 1
    const firstRun = await runEditorialWatchdog({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      allowNoImageFallback: true,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      targetDate: today,
      dailyArticleLimit: 1,
      discoveryAdapters: [new MockSignalAdapter('First Daily Topic', 'money', 95)],
    });

    assert.equal(firstRun.status, 'SUCCESS');
    assert.equal(firstRun.action, 'EXECUTED_RECOVERY');
    assert.equal(firstRun.scheduledResult?.publishedCount, 1);

    const articlesAfterFirst = await repository.list();
    assert.equal(articlesAfterFirst.length, 1);

    // Second watchdog run (e.g. at 09:00 or 12:00 UTC catch-up window)
    const secondRun = await runEditorialWatchdog({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      allowNoImageFallback: true,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      targetDate: today,
      dailyArticleLimit: 1,
      discoveryAdapters: [new MockSignalAdapter('Second Topic Attempt', 'money', 95)],
    });

    assert.equal(secondRun.status, 'SKIPPED');
    assert.equal(secondRun.action, 'NO_ACTION_REQUIRED');
    assert.equal(secondRun.report.publishedTodayCount, 1);
    assert.equal(secondRun.scheduledResult, undefined);

    // Verify repository still has exactly 1 article (zero duplicates)
    const articlesAfterSecond = await repository.list();
    assert.equal(articlesAfterSecond.length, 1);
  } finally {
    await cleanup();
  }
});

test('8. Force override: force: true allows manual execution even when quota is met', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace('watchdog-force-');
  const repository = new FilesystemContentRepository({ contentRoot: contentDir });
  const today = getUtcDateString();

  try {
    // Pre-populate article
    await repository.create({
      pillar: 'life',
      slug: 'existing-article-today',
      frontmatter: {
        title: 'Existing Article Today',
        description: 'Already published.',
        pubDate: today,
      },
      content: '## 1. Section\n\nContent.',
    });

    await execFileAsync('git', ['add', '-A'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'feat: publish prior article'], { cwd: repoDir });

    // Forced watchdog run
    const forcedRun = await runEditorialWatchdog({
      enabled: true,
      force: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      allowNoImageFallback: true,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      targetDate: today,
      dailyArticleLimit: 1,
      discoveryAdapters: [new MockSignalAdapter('Forced Additional Topic', 'travel', 95)],
    });

    assert.equal(forcedRun.status, 'SUCCESS');
    assert.equal(forcedRun.action, 'EXECUTED_RECOVERY');
    assert.equal(forcedRun.scheduledResult?.publishedCount, 1);

    const stored = await repository.list();
    assert.equal(stored.length, 2);
  } finally {
    await cleanup();
  }
});
