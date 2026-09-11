import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  AstroGitPublisher,
  GitCli,
  validateAstroArticle,
  buildPublicationPlan,
  type StoredArticle,
  type GitRepoStatus,
} from '../src/lib/editorial/index.ts';

const execFileAsync = promisify(execFile);

// Helper to create an isolated temporary Git repository for testing
async function createTempGitRepo(): Promise<{ repoDir: string; contentDir: string }> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-git-test-'));
  const contentDir = path.join(repoDir, 'src', 'content');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'travel'), { recursive: true });

  // Initialize git repo with test user config
  await execFileAsync('git', ['init', '-b', 'master'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 'LifeMode Tester'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 'tester@lifemode.local'], { cwd: repoDir });

  // Create initial commit with a dummy readme
  const readmePath = path.join(repoDir, 'README.md');
  await fs.writeFile(readmePath, '# Test Repo', 'utf-8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoDir });
  await execFileAsync('git', ['commit', '-m', 'chore: initial commit'], { cwd: repoDir });

  return { repoDir, contentDir };
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
}

function createSampleStoredArticle(overrides: Partial<StoredArticle> = {}): StoredArticle {
  return {
    identity: {
      topicId: 'lm-tech-001',
      slug: 'minimalist-workspaces-2026',
      pillar: 'tech-ai',
    },
    pillar: 'tech-ai',
    slug: 'minimalist-workspaces-2026',
    filePath: '/dummy/src/content/tech-ai/minimalist-workspaces-2026.md',
    frontmatter: {
      title: 'Minimalist Workspaces and Local AI in 2026',
      description: 'An editorial guide on configuring intentional workstations with quiet local AI hardware.',
      pubDate: '2026-09-09',
      author: 'LifeMode Editorial',
      tags: ['workspaces', 'minimalism', 'hardware'],
      featured: true,
      draft: false,
      format: 'guide',
      topicId: 'lm-tech-001',
      audience: 'Digital creators and minimalist technologists',
      primaryIntent: 'informational',
      secondaryIntent: 'commercial',
      affiliateIntent: false,
      riskLevel: 'low',
      sources: [{ name: 'LifeMode Standards', url: 'https://lifemode.life/editorial-standards' }],
      version: 1,
      lifecycleStatus: 'STORED',
    },
    content: [
      '## 1. Introduction: Calm Workspaces',
      '',
      'Designing an intentional workspace begins with reducing acoustic and visual clutter.',
    ].join('\n'),
    ...overrides,
  };
}

test('Astro Content Validation', async (t) => {
  await t.test('valid article passes validation', () => {
    const article = createSampleStoredArticle({
      filePath: path.join(process.cwd(), 'src/content/tech-ai/minimalist-workspaces-2026.md'),
    });
    const res = validateAstroArticle(article, { gitRepoRoot: process.cwd() });
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.errors.length, 0);
  });

  await t.test('unsupported pillar fails validation', () => {
    const article = createSampleStoredArticle({ pillar: 'invalid-pillar' as any });
    const res = validateAstroArticle(article);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes('unsupported pillar')));
  });

  await t.test('malformed slug with traversal fails validation', () => {
    const article = createSampleStoredArticle({ slug: '../secret-slug' });
    const res = validateAstroArticle(article);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes('path traversal')));
  });

  await t.test('unresolved placeholders in content body fail validation', () => {
    const article = createSampleStoredArticle({
      content: '## Title\n\nSome text [TODO: add more details] here.',
    });
    const res = validateAstroArticle(article);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes('unresolved placeholder')));
  });

  await t.test('missing frontmatter title or description fails validation', () => {
    const article = createSampleStoredArticle({
      frontmatter: {
        ...createSampleStoredArticle().frontmatter,
        title: '',
      },
    });
    const res = validateAstroArticle(article);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes('title is required')));
  });

  await t.test('ARCHIVED lifecycle status fails validation', () => {
    const article = createSampleStoredArticle({
      frontmatter: {
        ...createSampleStoredArticle().frontmatter,
        lifecycleStatus: 'ARCHIVED',
      },
    });
    const res = validateAstroArticle(article);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes('ARCHIVED')));
  });
});

test('Publication Plan Builder', async (t) => {
  const repoStatus: GitRepoStatus = {
    isGitRepo: true,
    repoRoot: 'C:/fake/lifemode',
    currentBranch: 'master',
    isDetachedHead: false,
    isClean: true,
    modifiedFiles: [],
    untrackedFiles: [],
    stagedFiles: [],
    hasUnrelatedChanges: false,
    unrelatedFiles: [],
  };

  await t.test('builds CREATE plan for version 1 article', () => {
    const article = createSampleStoredArticle({
      filePath: 'C:/fake/lifemode/src/content/tech-ai/minimalist-workspaces-2026.md',
    });
    const validation = { isValid: true, errors: [], warnings: [] };
    const plan = buildPublicationPlan(article, repoStatus, validation, {
      gitRepoRoot: 'C:/fake/lifemode',
      dryRun: true,
    });

    assert.strictEqual(plan.operation, 'CREATE');
    assert.strictEqual(plan.pillar, 'tech-ai');
    assert.strictEqual(plan.slug, 'minimalist-workspaces-2026');
    assert.strictEqual(plan.relativeFilePath, 'src/content/tech-ai/minimalist-workspaces-2026.md');
    assert.deepStrictEqual(plan.filesToAdd, ['src/content/tech-ai/minimalist-workspaces-2026.md']);
    assert.strictEqual(plan.commitMessage, 'feat: publish article "Minimalist Workspaces and Local AI in 2026"');
    assert.strictEqual(plan.publicationKey, 'git-pub-tech-ai-minimalist-workspaces-2026-v1');
    assert.strictEqual(plan.dryRun, true);
  });

  await t.test('builds UPDATE plan for version > 1 article', () => {
    const article = createSampleStoredArticle({
      filePath: 'C:/fake/lifemode/src/content/tech-ai/minimalist-workspaces-2026.md',
      frontmatter: {
        ...createSampleStoredArticle().frontmatter,
        version: 2,
      },
    });
    const validation = { isValid: true, errors: [], warnings: [] };
    const plan = buildPublicationPlan(article, repoStatus, validation, {
      gitRepoRoot: 'C:/fake/lifemode',
    });

    assert.strictEqual(plan.operation, 'UPDATE');
    assert.deepStrictEqual(plan.filesToChange, ['src/content/tech-ai/minimalist-workspaces-2026.md']);
    assert.strictEqual(plan.commitMessage, 'feat: update article "Minimalist Workspaces and Local AI in 2026"');
    assert.strictEqual(plan.publicationKey, 'git-pub-tech-ai-minimalist-workspaces-2026-v2');
  });
});

test('AstroGitPublisher with Temporary Git Repository', async (t) => {
  const { repoDir, contentDir } = await createTempGitRepo();
  const gitCli = new GitCli();
  const publisher = new AstroGitPublisher({ gitCli });

  try {
    const articleFilePath = path.join(contentDir, 'tech-ai', 'minimalist-workspaces-2026.md');
    await fs.writeFile(
      articleFilePath,
      [
        '---',
        'title: "Minimalist Workspaces and Local AI in 2026"',
        'description: "Guide on configuring intentional workstations."',
        'pubDate: "2026-09-09"',
        'author: "LifeMode Editorial"',
        'tags: ["workspaces"]',
        'featured: true',
        'draft: false',
        'format: "guide"',
        'primaryIntent: "informational"',
        'riskLevel: "low"',
        'sources: []',
        'version: 1',
        'lifecycleStatus: "STORED"',
        '---',
        '',
        '## Workstations',
        'Content here.',
      ].join('\n'),
      'utf-8'
    );

    const storedArticle = createSampleStoredArticle({
      filePath: articleFilePath,
    });

    await t.test('dry-run: generates plan, detects expected changes, and does NOT stage or commit', async () => {
      const result = await publisher.publish(storedArticle, {
        gitRepoRoot: repoDir,
        dryRun: true,
      });

      assert.strictEqual(result.status, 'DRY_RUN');
      assert.strictEqual(result.dryRun, true);
      assert.strictEqual(result.committed, false);
      assert.strictEqual(result.pushed, false);
      assert.strictEqual(result.plan.operation, 'CREATE');
      assert.strictEqual(result.plan.relativeFilePath, 'src/content/tech-ai/minimalist-workspaces-2026.md');
      assert.strictEqual(result.plan.commitMessage, 'feat: publish article "Minimalist Workspaces and Local AI in 2026"');

      // Verify no changes were staged in Git
      const status = await gitCli.getRepoStatus(repoDir);
      assert.strictEqual(status.stagedFiles.length, 0);
      assert.ok(status.untrackedFiles.includes('src/content/tech-ai/minimalist-workspaces-2026.md'));
    });

    await t.test('dirty working tree: blocks publication if unrelated uncommitted changes exist', async () => {
      // Create an unrelated untracked file
      const unrelatedFile = path.join(repoDir, 'unrelated-scratch.txt');
      await fs.writeFile(unrelatedFile, 'random draft', 'utf-8');

      const result = await publisher.publish(storedArticle, {
        gitRepoRoot: repoDir,
        dryRun: true,
      });

      assert.strictEqual(result.status, 'BLOCKED');
      assert.strictEqual(result.error?.code, 'DIRTY_WORKING_TREE');
      assert.ok(result.error?.message.includes('unrelated-scratch.txt'));

      // Clean up the unrelated file
      await fs.unlink(unrelatedFile);
    });

    await t.test('non-git directory: returns structured FAILED result', async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'non-git-'));
      try {
        const result = await publisher.publish(storedArticle, {
          gitRepoRoot: nonGitDir,
          dryRun: true,
        });

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.error?.code, 'NOT_A_GIT_REPO');
      } finally {
        await cleanupTempDir(nonGitDir);
      }
    });

    await t.test('explicit local commit mode: stages strictly intended file and commits', async () => {
      const result = await publisher.publish(storedArticle, {
        gitRepoRoot: repoDir,
        dryRun: false,
        allowCommit: true,
        commitAuthor: {
          name: 'LifeMode Publisher',
          email: 'publisher@lifemode.local',
        },
      });

      assert.strictEqual(result.status, 'COMMITTED');
      assert.strictEqual(result.dryRun, false);
      assert.strictEqual(result.committed, true);
      assert.strictEqual(result.pushed, false);
      assert.ok(result.commitHash);

      // Verify repo is now clean with the commit applied
      const status = await gitCli.getRepoStatus(repoDir);
      assert.strictEqual(status.isClean, true);

      // Verify commit message
      const { stdout: logMsg } = await gitCli.runGit(['log', '-1', '--pretty=%B'], repoDir);
      assert.ok(logMsg.includes('feat: publish article "Minimalist Workspaces and Local AI in 2026"'));
    });

    await t.test('update after commit: creates UPDATE plan and version 2 commit', async () => {
      // Modify the article
      await fs.writeFile(
        articleFilePath,
        [
          '---',
          'title: "Minimalist Workspaces and Local AI in 2026 (Updated)"',
          'description: "Guide on configuring intentional workstations."',
          'pubDate: "2026-09-09"',
          'author: "LifeMode Editorial"',
          'tags: ["workspaces"]',
          'featured: true',
          'draft: false',
          'format: "guide"',
          'primaryIntent: "informational"',
          'riskLevel: "low"',
          'sources: []',
          'version: 2',
          'lifecycleStatus: "STORED"',
          '---',
          '',
          '## Workstations 2026',
          'Updated content.',
        ].join('\n'),
        'utf-8'
      );

      const updatedArticle = createSampleStoredArticle({
        filePath: articleFilePath,
        frontmatter: {
          ...createSampleStoredArticle().frontmatter,
          title: 'Minimalist Workspaces and Local AI in 2026 (Updated)',
          version: 2,
        },
      });

      const updateResult = await publisher.publish(updatedArticle, {
        gitRepoRoot: repoDir,
        dryRun: false,
        allowCommit: true,
      });

      assert.strictEqual(updateResult.status, 'COMMITTED');
      assert.strictEqual(updateResult.plan.operation, 'UPDATE');
      assert.strictEqual(
        updateResult.plan.commitMessage,
        'feat: update article "Minimalist Workspaces and Local AI in 2026 (Updated)"'
      );
    });
  } finally {
    await cleanupTempDir(repoDir);
  }
});
