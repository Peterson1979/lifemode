import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  runEditorialAutomation,
  formatAutomationSummary,
  type AutomationResult,
  type IGenerationProvider,
  type IAIReviewProvider,
  type IDiscoveryAdapter,
  type DiscoveryResult,
  FilesystemContentRepository,
  AstroGitPublisher,
  GitCli,
  FixtureReviewProvider,
} from '../src/lib/editorial/index.ts';

const execFileAsync = promisify(execFile);

// Helper to create an isolated temporary Git and content repository
async function createTempWorkspace(): Promise<{
  repoDir: string;
  contentDir: string;
  cleanup: () => Promise<void>;
}> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-auto-test-'));
  const contentDir = path.join(repoDir, 'src', 'content');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'travel'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'life'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'money'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'wellbeing'), { recursive: true });

  // Initialize git repo with test user config
  await execFileAsync('git', ['init', '-b', 'master'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 'LifeMode Automation Tester'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 'auto-tester@lifemode.local'], { cwd: repoDir });

  // Create initial commit with a dummy readme
  const readmePath = path.join(repoDir, 'README.md');
  await fs.writeFile(readmePath, '# Test Repo', 'utf-8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoDir });
  await execFileAsync('git', ['commit', '-m', 'chore: initial commit'], { cwd: repoDir });

  const cleanup = async () => {
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  };

  return { repoDir, contentDir, cleanup };
}

test('1. Happy path: End-to-end editorial automation pipeline in fixture dry-run mode', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-1.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      minScoreThreshold: 80,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.dryRun, true);
    assert.equal(result.processedCount, 1);
    assert.equal(result.succeededCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.opportunities.length, 1);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'DRY_RUN');
    assert.equal(opp.stageResults.BRIEF.status, 'SUCCESS');
    assert.equal(opp.stageResults.GENERATION.status, 'SUCCESS');
    assert.equal(opp.stageResults.VALIDATION.status, 'SUCCESS');
    assert.equal(opp.stageResults.REVIEW.status, 'SUCCESS');
    assert.equal(opp.stageResults.PUBLISHING_GATE.status, 'SUCCESS');
    assert.equal(opp.stageResults.STORAGE.status, 'SUCCESS');
    assert.equal(opp.stageResults.GIT_PUBLICATION.status, 'DRY_RUN');

    // Verify article was stored in repository
    assert.ok(opp.storage?.article?.filePath);
    const stored = await repository.get(opp.pillar, opp.storage!.article!.slug);
    assert.ok(stored);
    assert.equal(stored?.frontmatter.lifecycleStatus, 'STORED');

    // Verify dry-run did not create any new git commits
    const commitCount = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoDir });
    assert.equal(commitCount.stdout.trim(), '1');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('2. Quality failure: Severely undersized generated content fails validation and halts progression', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-2.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    // Custom provider generating undersized content (50 words for 800+ word requirement)
    const undersizedProvider: IGenerationProvider = {
      name: 'Undersized Test Provider',
      model: 'test-undersized',
      generate: async (req) => ({
        article: {
          title: req.titleAngle,
          slug: req.titleAngle.toLowerCase().replace(/\s+/g, '-'),
          description: 'A short description.',
          excerpt: 'Short excerpt.',
          content: '## 1. Minimal Content\n\nThis article is intentionally far too short to satisfy the brief target word count requirement.',
          faq: [],
          sources: [],
          internalLinks: [],
          affiliateIntents: [],
          socialHooks: [],
        },
        metadata: {
          provider: 'Undersized Test Provider',
          model: 'test-undersized',
          generatedAt: new Date().toISOString(),
          inputTokenEstimate: 100,
          outputTokenEstimate: 50,
          durationMs: 10,
        },
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      generationProvider: undersizedProvider,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.failedCount, 1);
    assert.equal(result.succeededCount, 0);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'FAILED');
    assert.equal(opp.failedStage, 'VALIDATION');
    assert.equal(opp.stageResults.VALIDATION.status, 'FAILED');
    assert.equal(opp.stageResults.REVIEW.status, 'PENDING');
    assert.equal(opp.stageResults.STORAGE.status, 'PENDING');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('3. Review rejection: Rejected review prevents publishing, storage, and Git publication without failing the run', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-3.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    const rejectingReviewProvider: IAIReviewProvider = new FixtureReviewProvider({
      outcome: 'REJECT',
    });

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      reviewProvider: rejectingReviewProvider,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.rejectedCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.succeededCount, 0);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'REJECTED');
    assert.equal(opp.failedStage, 'REVIEW');
    assert.equal(opp.stageResults.REVIEW.status, 'SUCCESS');
    assert.equal(opp.stageResults.PUBLISHING_GATE.status, 'PENDING');
    assert.equal(opp.stageResults.STORAGE.status, 'PENDING');

    // Verify nothing was stored
    const stored = await repository.get(opp.pillar, opp.topicId);
    assert.equal(stored, null);
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('4. Provider failure: Generation provider exception is isolated and reports clean stage failure', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-4.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    const failingGenProvider: IGenerationProvider = {
      name: 'Crashing Provider',
      model: 'crash-v1',
      generate: async () => {
        throw new Error('Simulated upstream network timeout');
      },
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      generationProvider: failingGenProvider,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.failedCount, 1);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'FAILED');
    assert.equal(opp.failedStage, 'GENERATION');
    assert.equal(opp.stageResults.GENERATION.status, 'FAILED');
    assert.ok(opp.error?.message.includes('Simulated upstream network timeout'));
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('5. No candidates: Returns clean NO_OPPORTUNITIES result when discovery produces no signals', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-5.json`);

  try {
    const emptyDiscoveryAdapter: IDiscoveryAdapter = {
      name: 'Empty Adapter',
      sourceType: 'FIXTURE',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Empty Adapter',
        sourceType: 'FIXTURE',
        status: 'AVAILABLE',
        signals: [],
        fetchedAt: new Date().toISOString(),
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      discoveryAdapters: [emptyDiscoveryAdapter],
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'NO_OPPORTUNITIES');
    assert.equal(result.processedCount, 0);
    assert.equal(result.discoveredCount, 0);
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('6. Idempotency: Pre-existing article on disk is skipped during topic selection', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-6.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    // Run first automation run to store an article
    const firstRun = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
      allowUnrelatedChanges: true,
    });

    assert.equal(firstRun.status, 'SUCCESS');
    const publishedTopicId = firstRun.opportunities[0].topicId;

    // Run second automation run; the previously stored topic should be skipped
    const secondRun = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
      allowUnrelatedChanges: true,
    });

    assert.equal(secondRun.status, 'SUCCESS');
    const secondTopicId = secondRun.opportunities[0].topicId;
    assert.notEqual(secondTopicId, publishedTopicId, 'Second run must not re-select the already published topic');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('7. Safety: Disabled configuration halts execution immediately', async () => {
  const result = await runEditorialAutomation({
    enabled: false,
  });

  assert.equal(result.status, 'DISABLED');
  assert.equal(result.processedCount, 0);
  assert.ok(result.summary.includes('disabled'));
});

test('8. Multi-opportunity isolation: First review rejection allows second opportunity to succeed', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-8.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    const rejectProvider = new FixtureReviewProvider({ outcome: 'REJECT' });
    const passProvider = new FixtureReviewProvider({ outcome: 'PASS' });

    let callCount = 0;
    const alternatingReviewProvider: IAIReviewProvider = {
      name: 'Alternating Reviewer',
      model: 'alt-v1',
      review: async (req) => {
        callCount++;
        // Reject both first-pass and revision for candidate 1
        if (callCount <= 2) {
          return rejectProvider.review(req);
        }
        return passProvider.review(req);
      },
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 2,
      reviewProvider: alternatingReviewProvider,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'PARTIAL_SUCCESS');
    assert.equal(result.processedCount, 2);
    assert.equal(result.rejectedCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.succeededCount, 1);

    assert.equal(result.opportunities[0].status, 'REJECTED');
    assert.equal(result.opportunities[0].failedStage, 'REVIEW');

    assert.equal(result.opportunities[1].status, 'DRY_RUN');
    assert.equal(result.opportunities[1].stageResults.STORAGE.status, 'SUCCESS');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('9. Summary formatting produces clear, structured human-readable text', () => {
  const mockResult: AutomationResult = {
    runId: 'auto-test-123',
    status: 'SUCCESS',
    startedAt: '2026-09-09T18:00:00.000Z',
    completedAt: '2026-09-09T18:00:01.000Z',
    durationMs: 1000,
    dryRun: true,
    discoveredCount: 10,
    candidateCount: 8,
    selectedCount: 1,
    processedCount: 1,
    succeededCount: 1,
    rejectedCount: 0,
    failedCount: 0,
    skippedCount: 7,
    opportunities: [
      {
        topicId: 'lm-life-01',
        canonicalTopic: 'Calm Morning Routines',
        pillar: 'life',
        status: 'DRY_RUN',
        stageResults: {
          DISCOVERY: { stage: 'DISCOVERY', status: 'SUCCESS', durationMs: 10 },
          SELECTION: { stage: 'SELECTION', status: 'SUCCESS', durationMs: 5 },
          BRIEF: { stage: 'BRIEF', status: 'SUCCESS', durationMs: 2 },
          RESEARCH: { stage: 'RESEARCH', status: 'SUCCESS', durationMs: 5 },
          GENERATION: { stage: 'GENERATION', status: 'SUCCESS', durationMs: 50 },
          VALIDATION: { stage: 'VALIDATION', status: 'SUCCESS', durationMs: 1 },
          REVIEW: { stage: 'REVIEW', status: 'SUCCESS', durationMs: 20 },
          PUBLISHING_GATE: { stage: 'PUBLISHING_GATE', status: 'SUCCESS', durationMs: 1 },
          STORAGE: { stage: 'STORAGE', status: 'SUCCESS', durationMs: 5 },
          GIT_PUBLICATION: { stage: 'GIT_PUBLICATION', status: 'DRY_RUN', durationMs: 5 },
        },
      },
    ],
    summary: '',
  };

  const summary = formatAutomationSummary(mockResult);
  assert.ok(summary.includes('Editorial Automation Run'));
  assert.ok(summary.includes('auto-test-123'));
  assert.ok(summary.includes('Calm Morning Routines'));
  assert.ok(summary.includes('DRY_RUN (Safe)'));
  assert.ok(summary.includes('Run Result: SUCCESS'));
});

test('10. Multi-opportunity isolation: First provider generation crash allows second opportunity to succeed', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-10.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    const normalGenProvider = new (await import('../src/lib/editorial/generation/providers/fixture.ts')).FixtureGenerationProvider();
    let genCount = 0;
    const alternatingGenProvider: IGenerationProvider = {
      name: 'Alternating Generation Provider',
      model: 'alt-gen-v1',
      generate: async (req) => {
        genCount++;
        if (genCount === 1) {
          throw new Error('Simulated upstream network timeout on first candidate');
        }
        return normalGenProvider.generate(req);
      },
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 2,
      generationProvider: alternatingGenProvider,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'PARTIAL_SUCCESS');
    assert.equal(result.processedCount, 2);
    assert.equal(result.failedCount, 1);
    assert.equal(result.succeededCount, 1);

    assert.equal(result.opportunities[0].status, 'FAILED');
    assert.equal(result.opportunities[0].failedStage, 'GENERATION');

    assert.equal(result.opportunities[1].status, 'DRY_RUN');
    assert.equal(result.opportunities[1].stageResults.STORAGE.status, 'SUCCESS');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('11. Candidate rejection persistence: Rejected candidate is marked in storage and not re-selected', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-11.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    const rejectingReviewProvider = new FixtureReviewProvider({ outcome: 'REJECT' });

    // Run 1: Candidate is selected, reviewed, and REJECTED
    const run1 = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      reviewProvider: rejectingReviewProvider,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(run1.status, 'SUCCESS');
    assert.equal(run1.rejectedCount, 1);
    const rejectedTopicId = run1.opportunities[0].topicId;

    // Run 2: With passing reviewer, the rejected topic must not be re-selected
    const passReviewProvider = new FixtureReviewProvider({ outcome: 'PASS' });
    const run2 = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      reviewProvider: passReviewProvider,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(run2.status, 'SUCCESS');
    assert.equal(run2.succeededCount, 1);
    const run2TopicId = run2.opportunities[0].topicId;
    assert.notEqual(run2TopicId, rejectedTopicId, 'Run 2 must select a different candidate than the previously rejected topic');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('12. Bounded quality revision: First-pass PASS does not trigger revision', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-12.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    const passReviewProvider = new FixtureReviewProvider({ outcome: 'PASS' });
    let genCount = 0;
    const trackingGenProvider: IGenerationProvider = {
      name: 'Tracking Provider',
      model: 'track-v1',
      generate: async (req) => {
        genCount++;
        const fixtureGen = new (await import('../src/lib/editorial/generation/providers/fixture.ts')).FixtureGenerationProvider();
        return fixtureGen.generate(req);
      },
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      generationProvider: trackingGenProvider,
      reviewProvider: passReviewProvider,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 1);
    assert.equal(genCount, 1, 'Initial PASS should generate exactly once without revision');
    assert.equal(result.opportunities[0].revisionPerformed, undefined);
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('13. Bounded quality revision: First-pass REVISE triggers exactly one revision and publishes on revised PASS', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-13.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    // Sequence: First review is REVISE, second review on revised content is PASS
    const sequenceReviewer = new FixtureReviewProvider({ outcomes: ['REVISE', 'PASS'] });
    let genCalls = 0;
    const trackingGenProvider: IGenerationProvider = {
      name: 'Tracking Provider',
      model: 'track-v1',
      generate: async (req) => {
        genCalls++;
        if (genCalls === 2) {
          assert.ok(req.revisionContext, 'Second generation call must include revisionContext');
          assert.equal(req.revisionContext.revisionAttempt, 1);
        }
        const fixtureGen = new (await import('../src/lib/editorial/generation/providers/fixture.ts')).FixtureGenerationProvider();
        return fixtureGen.generate(req);
      },
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      generationProvider: trackingGenProvider,
      reviewProvider: sequenceReviewer,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.succeededCount, 1);
    assert.equal(genCalls, 2, 'Must execute exactly 1 revision (total 2 generation calls)');
    const opp = result.opportunities[0];
    assert.equal(opp.revisionPerformed, true);
    assert.equal(opp.review?.decision, 'REVISE');
    assert.equal(opp.revisedReview?.decision, 'PASS');
    assert.equal(opp.stageResults.STORAGE.status, 'SUCCESS');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('14. Bounded quality revision: Revised article still failing review results in REJECTED outcome without infinite loop', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-14.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    // Both first pass and revised pass return REJECT
    const alwaysRejectReviewer = new FixtureReviewProvider({ outcome: 'REJECT' });
    let genCalls = 0;
    const trackingGenProvider: IGenerationProvider = {
      name: 'Tracking Provider',
      model: 'track-v1',
      generate: async (req) => {
        genCalls++;
        const fixtureGen = new (await import('../src/lib/editorial/generation/providers/fixture.ts')).FixtureGenerationProvider();
        return fixtureGen.generate(req);
      },
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 1,
      generationProvider: trackingGenProvider,
      reviewProvider: alwaysRejectReviewer,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.rejectedCount, 1);
    assert.equal(genCalls, 2, 'Must stop at exactly 1 revision attempt and not retry infinitely');
    const opp = result.opportunities[0];
    assert.equal(opp.status, 'REJECTED');
    assert.equal(opp.revisionPerformed, true);
    assert.equal(opp.failedStage, 'REVIEW');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

test('15. Revision provider error is isolated to candidate and allows remaining batch to continue', async () => {
  const { repoDir, contentDir, cleanup } = await createTempWorkspace();
  const storagePath = path.join(os.tmpdir(), `auto-cand-${Date.now()}-15.json`);

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir },
    });

    // Sequence: First candidate reviews REVISE then revision generation crashes.
    // Second candidate reviews PASS directly.
    const sequenceReviewer = new FixtureReviewProvider({ outcomes: ['REVISE', 'PASS'] });
    let genCalls = 0;
    const normalGen = new (await import('../src/lib/editorial/generation/providers/fixture.ts')).FixtureGenerationProvider();
    const failingRevisionGenProvider: IGenerationProvider = {
      name: 'Failing Revision Provider',
      model: 'fail-rev-v1',
      generate: async (req) => {
        genCalls++;
        if (req.revisionContext) {
          throw new Error('Revision generation provider timeout');
        }
        return normalGen.generate(req);
      },
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 2,
      generationProvider: failingRevisionGenProvider,
      reviewProvider: sequenceReviewer,
      contentRepository: repository,
      gitPublisher,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
    });

    assert.equal(result.status, 'PARTIAL_SUCCESS');
    assert.equal(result.processedCount, 2);
    assert.equal(result.rejectedCount, 1);
    assert.equal(result.succeededCount, 1);

    assert.equal(result.opportunities[0].status, 'REJECTED');
    assert.equal(result.opportunities[0].revisionError?.code, 'PROVIDER_ERROR');

    assert.equal(result.opportunities[1].status, 'DRY_RUN');
    assert.equal(result.opportunities[1].stageResults.STORAGE.status, 'SUCCESS');
  } finally {
    try { await fs.unlink(storagePath); } catch {}
    await cleanup();
  }
});

