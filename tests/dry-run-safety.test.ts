import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  runEditorialAutomation,
  FilesystemContentRepository,
  AstroGitPublisher,
  GitCli,
  FixtureGenerationProvider,
  FixtureReviewProvider,
  FixtureEditorialResearchProvider,
  FixturePublishingProvider,
  type IDiscoveryAdapter,
  type DiscoveryResult,
} from '../src/lib/editorial/index.ts';
import { storePublishPackage } from '../src/lib/editorial/storage/publishing-adapter.ts';
import type { PublishPackage } from '../src/lib/editorial/publishing/types.ts';
import { runScheduledEditorialAutomation } from '../src/lib/editorial/automation/index.ts';

const execFileAsync = promisify(execFile);

async function createTempWorkspace(prefix = 'lifemode-dryrun-safe-'): Promise<{
  repoDir: string;
  contentDir: string;
  topicDir: string;
  cleanup: () => Promise<void>;
}> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const contentDir = path.join(repoDir, 'src', 'content');
  const topicDir = path.join(repoDir, 'data', 'topics');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'life'), { recursive: true });
  await fs.mkdir(topicDir, { recursive: true });

  await execFileAsync('git', ['init', '-b', 'master'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 'DryRun Tester'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 'dryrun@lifemode.local'], { cwd: repoDir });

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

  return { repoDir, contentDir, topicDir, cleanup };
}

const mockDiscoveryAdapter: IDiscoveryAdapter = {
  name: 'Safe DryRun Mock Adapter',
  sourceType: 'RSS_FEEDS',
  fetchSignals: async (): Promise<DiscoveryResult> => ({
    provider: 'Safe DryRun Mock Adapter',
    sourceType: 'RSS_FEEDS',
    status: 'AVAILABLE',
    signals: [
      {
        source: 'RSS_FEEDS',
        sourceId: 'mock-dryrun-signal-01',
        rawQuery: 'How to Automate Workflows with AI: Practical Guide for 2026',
        timestamp: new Date().toISOString(),
        category: 'tech-ai',
        sourceUrl: 'https://example.com/ai-guide',
        metrics: { relativeInterest: 95, searchVolume: 10000, visualPotentialScore: 90 },
      },
    ],
    fetchedAt: new Date().toISOString(),
  }),
};

test('1. Dry-run safety: does not write article files to disk and does not mutate candidates.json', async () => {
  const { repoDir, contentDir, topicDir, cleanup } = await createTempWorkspace('lm-dryrun-nowrite-');
  const candidatesPath = path.join(topicDir, 'candidates.json');
  const approvedPath = path.join(topicDir, 'approved.json');
  const publishedPath = path.join(topicDir, 'published.json');
  const rejectedPath = path.join(topicDir, 'rejected.json');

  const initialCandidates = JSON.stringify([{ id: 'existing-topic-1', canonicalTopic: 'Existing Topic' }], null, 2);
  const initialApproved = JSON.stringify([], null, 2);
  const initialPublished = JSON.stringify([], null, 2);
  const initialRejected = JSON.stringify([], null, 2);

  await fs.writeFile(candidatesPath, initialCandidates, 'utf-8');
  await fs.writeFile(approvedPath, initialApproved, 'utf-8');
  await fs.writeFile(publishedPath, initialPublished, 'utf-8');
  await fs.writeFile(rejectedPath, initialRejected, 'utf-8');

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir, allowUnrelatedChanges: true },
    });

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      allowUnrelatedChanges: true,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      storagePath: candidatesPath,
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      discoveryAdapters: [mockDiscoveryAdapter],
      researchProvider: new FixtureEditorialResearchProvider(),
      generationProvider: new FixtureGenerationProvider(),
      reviewProvider: new FixtureReviewProvider({ outcome: 'PASS' }),
      publishingProvider: new FixturePublishingProvider(),
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.dryRun, true);
    assert.equal(result.succeededCount, 1);

    const opp = result.opportunities[0];
    assert.equal(opp.status, 'DRY_RUN');
    assert.equal(opp.stageResults.STORAGE.status, 'SUCCESS');
    assert.equal(opp.stageResults.GIT_PUBLICATION.status, 'DRY_RUN');

    // 1. Simulated storage result is populated with valid metadata
    assert.ok(opp.storage?.article);
    assert.equal(opp.storage?.status, 'STORED');
    assert.equal(opp.storage?.article?.frontmatter.lifecycleStatus, 'STORED');
    assert.ok(opp.storage?.article?.filePath);

    // 2. CRITICAL: No file is created on disk in content repository
    const storedOnDisk = await repository.get('tech-ai', opp.storage!.article!.slug);
    assert.equal(storedOnDisk, null, 'Repository.get must return null in dry-run mode (no Markdown written to disk)');
    const allStored = await repository.list();
    assert.equal(allStored.length, 0, 'No articles must be written to contentRoot in dry-run mode');

    // 3. CRITICAL: Topic state files remain completely unmodified
    const afterCandidates = await fs.readFile(candidatesPath, 'utf-8');
    const afterApproved = await fs.readFile(approvedPath, 'utf-8');
    const afterPublished = await fs.readFile(publishedPath, 'utf-8');
    const afterRejected = await fs.readFile(rejectedPath, 'utf-8');

    assert.equal(afterCandidates, initialCandidates, 'candidates.json must NOT be modified in dry-run mode');
    assert.equal(afterApproved, initialApproved, 'approved.json must NOT be modified in dry-run mode');
    assert.equal(afterPublished, initialPublished, 'published.json must NOT be modified in dry-run mode');
    assert.equal(afterRejected, initialRejected, 'rejected.json must NOT be modified in dry-run mode');

    // 4. CRITICAL: Git repository remains clean and uncommitted
    const commitCount = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoDir });
    assert.equal(commitCount.stdout.trim(), '1', 'Zero Git commits must be created in dry-run mode');
  } finally {
    await cleanup();
  }
});

test('2. Dry-run safety: review rejection does NOT mutate candidate storage on disk', async () => {
  const { repoDir, contentDir, topicDir, cleanup } = await createTempWorkspace('lm-dryrun-rejection-');
  const candidatesPath = path.join(topicDir, 'candidates.json');
  const initialCandidates = JSON.stringify([{ id: 'test-topic-reject', canonicalTopic: 'Reject Topic' }], null, 2);
  await fs.writeFile(candidatesPath, initialCandidates, 'utf-8');

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const gitPublisher = new AstroGitPublisher({
      gitCli: new GitCli(),
      defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir, allowUnrelatedChanges: true },
    });

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      maxOpportunities: 1,
      minScoreThreshold: 70,
      storagePath: candidatesPath,
      contentRepository: repository,
      gitPublisher,
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      discoveryAdapters: [mockDiscoveryAdapter],
      researchProvider: new FixtureEditorialResearchProvider(),
      generationProvider: new FixtureGenerationProvider(),
      reviewProvider: new FixtureReviewProvider({ outcome: 'REJECT' }),
      publishingProvider: new FixturePublishingProvider(),
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.rejectedCount, 1);

    // CRITICAL: candidates.json must NOT be updated with rejected state in dry-run mode
    const afterCandidates = await fs.readFile(candidatesPath, 'utf-8');
    assert.equal(afterCandidates, initialCandidates, 'candidates.json must remain unchanged on dry-run rejection');
  } finally {
    await cleanup();
  }
});

test('3. Scheduled runner dry-run safety: does not stage, commit, push, or run social automation', async () => {
  const { repoDir, contentDir, topicDir, cleanup } = await createTempWorkspace('lm-dryrun-sched-');
  const candidatesPath = path.join(topicDir, 'candidates.json');
  const initialCandidates = JSON.stringify([], null, 2);
  await fs.writeFile(candidatesPath, initialCandidates, 'utf-8');

  try {
    const result = await runScheduledEditorialAutomation({
      enabled: true,
      dryRun: true,
      allowCommit: false,
      allowPush: false,
      socialEnabled: false,
      providerMode: 'fixture',
      gitRepoRoot: repoDir,
      contentRoot: contentDir,
      storagePath: candidatesPath,
      minScoreThreshold: 70,
      maxOpportunities: 1,
      discoveryAdapters: [mockDiscoveryAdapter],
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.pushedToRemote, false);
    assert.equal(result.socialResult, undefined);

    // Confirm no commits created
    const commitCount = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoDir });
    assert.equal(commitCount.stdout.trim(), '1');

    // Confirm no articles in content directory
    const repo = new FilesystemContentRepository({ contentRoot: contentDir });
    const stored = await repo.list();
    assert.equal(stored.length, 0);

    // Confirm candidates.json not mutated
    const afterCandidates = await fs.readFile(candidatesPath, 'utf-8');
    assert.equal(afterCandidates, initialCandidates);
  } finally {
    await cleanup();
  }
});

test('4. Publishing adapter isolation: storePublishPackage dryRun vs non-dryRun', async () => {
  const { contentDir, cleanup } = await createTempWorkspace('lm-dryrun-adapter-');

  try {
    const repository = new FilesystemContentRepository({ contentRoot: contentDir });

    const samplePackage: PublishPackage = {
      id: 'pub-lm-tech-ai-01-sample-dryrun-article',
      topicId: 'lm-tech-ai-01',
      pillar: 'tech-ai',
      slug: 'sample-dryrun-article',
      title: 'Sample DryRun Article',
      description: 'A test article verifying simulated storage result.',
      excerpt: 'Sample excerpt for testing.',
      content: '## Heading\n\nThis is a sample article body with more than enough content.',
      tags: ['ai', 'testing'],
      format: 'guide',
      audience: 'General readers',
      primaryIntent: 'informational',
      riskLevel: 'low',
      sources: [{ name: 'Test Source', url: 'https://example.com' }],
      internalLinks: [],
      affiliateIntent: false,
      faq: [],
      socialHooks: [],
      imageMetadata: {
        url: 'https://assets.lifemode.life/editorial/hero.png',
        alt: 'Sample hero image',
      },
      publicationMetadata: {
        targetDate: '2026-10-10',
        version: 1,
        author: 'LifeMode',
      },
      qualitySummary: {
        overallScore: 90,
        safetyScore: 95,
        factualityScore: 90,
        reviewedAt: '2026-10-10T12:00:00.000Z',
        reviewer: 'fixture',
        decision: 'PASS',
      },
    };

    // A. Dry-run call: returns STORED status and StoredArticle without writing file
    const dryRunResult = await storePublishPackage(repository, samplePackage, { dryRun: true });
    assert.equal(dryRunResult.status, 'STORED');
    assert.equal(dryRunResult.operation, 'create');
    assert.equal(dryRunResult.articleId, 'tech-ai/sample-dryrun-article');
    assert.ok(dryRunResult.article);
    assert.equal(dryRunResult.article?.slug, 'sample-dryrun-article');
    assert.equal(dryRunResult.article?.pillar, 'tech-ai');

    const fileExistsAfterDryRun = await repository.exists('tech-ai', 'sample-dryrun-article');
    assert.equal(fileExistsAfterDryRun, false, 'File must NOT exist on disk after dry-run');

    // B. Non-dry-run call: physically creates and writes the article file
    const liveResult = await storePublishPackage(repository, samplePackage, { dryRun: false });
    assert.equal(liveResult.status, 'STORED');
    assert.equal(liveResult.articleId, 'tech-ai/sample-dryrun-article');

    const fileExistsAfterLive = await repository.exists('tech-ai', 'sample-dryrun-article');
    assert.equal(fileExistsAfterLive, true, 'File MUST exist on disk after live non-dry-run storage');

    const liveArticle = await repository.get('tech-ai', 'sample-dryrun-article');
    assert.ok(liveArticle);
    assert.equal(liveArticle?.frontmatter.title, 'Sample DryRun Article');
  } finally {
    await cleanup();
  }
});
