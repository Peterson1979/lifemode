import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  runScheduledEditorialAutomation,
  acquireLock,
  FixtureReviewProvider,
  type IDiscoveryAdapter,
  type DiscoveryResult,
  type IAIReviewProvider,
} from '../src/lib/editorial/index.ts';

const execFileAsync = promisify(execFile);

// Helper to create an isolated temporary Git and content workspace
async function createTempWorkspace(): Promise<{
  repoDir: string;
  contentDir: string;
  lockPath: string;
  storagePath: string;
  cleanup: () => Promise<void>;
}> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-sched-test-'));
  const contentDir = path.join(repoDir, 'src', 'content');
  const lockPath = path.join(repoDir, '.automation.lock');
  const storagePath = path.join(repoDir, 'candidates.json');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'travel'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'life'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'money'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'wellbeing'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'now'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'discover'), { recursive: true });

  // Initialize git repo with test user config
  await execFileAsync('git', ['init', '-b', 'master'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 'LifeMode Test Runner'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 'test-runner@lifemode.local'], { cwd: repoDir });

  // Create initial commit with a dummy readme
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

// Custom mock adapter for precise candidate injection
class MockDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'FIXTURE' as const;
  readonly name = 'Mock Signals';
  private query: string;
  private score: number;
  private pillar: string;

  constructor(query: string, score = 95, pillar = 'life') {
    this.query = query;
    this.score = score;
    this.pillar = pillar;
  }

  async fetchSignals(): Promise<DiscoveryResult> {
    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals: [
        {
          source: 'FIXTURE',
          sourceId: `mock-${Math.random().toString(36).slice(2)}`,
          rawQuery: this.query,
          timestamp: new Date().toISOString(),
          metrics: {
            growthRate: this.score,
            searchVolume: 20000,
            relativeInterest: 90,
            isBreakout: true,
            visualPotentialScore: 90,
          },
          category: this.pillar,
          metadata: {
            isFixture: true,
            suggestedPillar: this.pillar,
            curatedTags: ['mindful', 'lifestyle'],
          },
        },
      ],
      fetchedAt: new Date().toISOString(),
    };
  }
}

test('1. Disabled automation exits safely with SUCCESS_NO_PUBLICATION', async () => {
  const result = await runScheduledEditorialAutomation({
    enabled: false,
  });

  assert.equal(result.status, 'SUCCESS_NO_PUBLICATION');
  assert.equal(result.processedCount, 0);
  assert.equal(result.publishedCount, 0);
  assert.equal(result.pushedToRemote, false);
  assert.ok(result.summary.includes('disabled'));
});

test('2. Dry-run never publishes or commits to Git', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      allowPush: false,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.dryRun, true);
    assert.equal(result.publishedCount, 0);
    assert.equal(result.pushedToRemote, false);

    // Verify no new commit was created in git
    const commitCount = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoDir });
    assert.equal(commitCount.stdout.trim(), '1');
  } finally {
    await cleanup();
  }
});

test('3. Production configuration enables publishing and produces SUCCESS', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 1);
    assert.equal(result.publishedCount, 1);
    assert.equal(result.rejectedCount, 0);
    assert.equal(result.failedCount, 0);

    // Verify git commit was created for article + candidate state
    const commitLog = await execFileAsync('git', ['log', '--oneline'], { cwd: repoDir });
    assert.ok(commitLog.stdout.includes('feat: publish article'));
  } finally {
    await cleanup();
  }
});

test('4. Successful publication produces clean machine-readable telemetry', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    assert.ok(result.jsonResult);
    assert.equal(result.jsonResult.status, 'SUCCESS');
    assert.equal(result.jsonResult.counts.published, 1);
    assert.equal(result.jsonResult.counts.succeeded, 1);
    assert.equal(result.jsonResult.pushedToRemote, false);
    assert.ok(result.jsonResult.durationMs >= 0);
  } finally {
    await cleanup();
  }
});

test('5. Successful + rejected candidates produces PARTIAL_SUCCESS', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  // Multi-signal adapter with 2 candidates
  class MultiSignalAdapter implements IDiscoveryAdapter {
    readonly sourceType = 'FIXTURE' as const;
    readonly name = 'Multi Signals';
    async fetchSignals(): Promise<DiscoveryResult> {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'AVAILABLE',
        signals: [
          {
            source: 'FIXTURE',
            sourceId: 'mock-1',
            rawQuery: 'First Good Topic For Review Pass',
            timestamp: new Date().toISOString(),
            metrics: { growthRate: 95, searchVolume: 20000, relativeInterest: 95, isBreakout: true, visualPotentialScore: 90 },
            category: 'life',
            metadata: { isFixture: true, suggestedPillar: 'life', curatedTags: ['lifestyle'] },
          },
          {
            source: 'FIXTURE',
            sourceId: 'mock-2',
            rawQuery: 'Second Topic Destined For Rejection',
            timestamp: new Date().toISOString(),
            metrics: { growthRate: 90, searchVolume: 15000, relativeInterest: 90, isBreakout: true, visualPotentialScore: 85 },
            category: 'travel',
            metadata: { isFixture: true, suggestedPillar: 'travel', curatedTags: ['travel'] },
          },
        ],
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  let reviewCount = 0;
  const alternatingReviewProvider: IAIReviewProvider = {
    name: 'Alternating Review Provider',
    model: 'fixture-model',
    review: async (req: any) => {
      reviewCount++;
      if (reviewCount === 1) {
        return new FixtureReviewProvider({ outcome: 'PASS' }).review(req);
      }
      return new FixtureReviewProvider({ outcome: 'REJECT' }).review(req);
    },
  };

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      maxOpportunities: 2,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MultiSignalAdapter()],
      reviewProvider: alternatingReviewProvider,
    });

    assert.equal(result.status, 'PARTIAL_SUCCESS');
    assert.equal(result.succeededCount, 1);
    assert.equal(result.rejectedCount, 1);
    assert.equal(result.publishedCount, 1);
  } finally {
    await cleanup();
  }
});

test('6. No publishable candidate produces SUCCESS_NO_PUBLICATION without failure', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  const rejectingReviewProvider = new FixtureReviewProvider({ outcome: 'REJECT' });

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      maxOpportunities: 1,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Topic Failing AI Review', 95)],
      reviewProvider: rejectingReviewProvider,
    });

    assert.equal(result.status, 'SUCCESS_NO_PUBLICATION');
    assert.equal(result.succeededCount, 0);
    assert.equal(result.rejectedCount, 1);
    assert.equal(result.publishedCount, 0);
  } finally {
    await cleanup();
  }
});

test('7. Infrastructure failure produces FAILED status', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  const crashingRepo = {
    root: contentDir,
    get: async () => null,
    exists: async () => false,
    create: async () => { throw new Error('Fatal filesystem IO corruption error'); },
    update: async () => { throw new Error('Fatal filesystem IO corruption error'); },
    list: async () => [],
    remove: async () => false,
  };

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      contentRepository: crashingRepo as any,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.failedCount, 1);
  } finally {
    await cleanup();
  }
});

test('8. Dirty unrelated Git working tree blocks unsafe live publication', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  // Create an uncommitted modified file in the repo
  await fs.writeFile(path.join(repoDir, 'unrelated.txt'), 'Uncommitted changes\n', 'utf-8');

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      allowUnrelatedChanges: false,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.fatalError, 'DIRTY_WORKING_TREE');
    assert.equal(result.publishedCount, 0);
  } finally {
    await cleanup();
  }
});

test('9. Lock prevents overlapping execution', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  // Acquire lock manually
  const firstLock = await acquireLock({ lockPath });
  assert.equal(firstLock.acquired, true);

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: true,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    assert.equal(result.status, 'FAILED');
    assert.ok(result.summary.includes('Active lock held'));
  } finally {
    await firstLock.release();
    await cleanup();
  }
});

test('10. Stale lock can be recovered safely', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  // Write a simulated stale lock file (2 hours old)
  const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await fs.writeFile(
    lockPath,
    JSON.stringify({ pid: 99999, hostname: 'old-host', acquiredAt: staleTime }),
    'utf-8'
  );

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: true,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    // Should break stale lock and succeed
    assert.equal(result.status, 'SUCCESS');
  } finally {
    await cleanup();
  }
});

test('11. Scheduled runner delegates to the existing automation pipeline', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: true,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    assert.ok(result.automationResult);
    assert.equal(result.automationResult.opportunities.length, 1);
    const opp = result.automationResult.opportunities[0];
    assert.equal(opp.stageResults.BRIEF.status, 'SUCCESS');
    assert.equal(opp.stageResults.RESEARCH.status, 'SUCCESS');
    assert.equal(opp.stageResults.GENERATION.status, 'SUCCESS');
    assert.equal(opp.stageResults.REVIEW.status, 'SUCCESS');
  } finally {
    await cleanup();
  }
});

test('12. No duplicate publication when the same topic is encountered twice', async () => {
  const { repoDir, contentDir, lockPath, storagePath, cleanup } = await createTempWorkspace();

  try {
    // Run 1: Publish article
    const result1 = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });
    assert.equal(result1.status, 'SUCCESS');
    assert.equal(result1.publishedCount, 1);

    // Run 2: Same topic encountered again
    const result2 = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: false,
      allowCommit: true,
      allowPush: false,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      lockPath,
      storagePath,
      discoveryAdapters: [new MockDiscoveryAdapter('Mindful Minimalist Morning Rituals', 95)],
    });

    // Second run should recognize existing article on disk, select 0, and finish with SUCCESS_NO_PUBLICATION
    assert.equal(result2.status, 'SUCCESS_NO_PUBLICATION');
    assert.equal(result2.publishedCount, 0);
    assert.equal(result2.succeededCount, 0);
  } finally {
    await cleanup();
  }
});
