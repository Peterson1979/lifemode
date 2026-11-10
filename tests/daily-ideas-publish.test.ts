import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { publishOffers } from '../src/lib/commerce/offer-publisher.ts';
import { GitCli } from '../src/lib/editorial/git-publisher/git-cli.ts';

const execAsync = promisify(execFile);

async function run(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execAsync('git', args, { cwd });
  return stdout.trim();
}

test('publishOffers safety guards and lifecycle in isolated git repo', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifemode-publish-test-'));
  const remoteDir = join(baseDir, 'remote.git');
  const repoDir = join(baseDir, 'worktree');

  try {
    // 1. Setup bare remote
    await run(['init', '--bare', remoteDir], baseDir);

    // 2. Setup local repo
    await mkdir(repoDir, { recursive: true });
    await run(['init', '-b', 'master'], repoDir);
    await run(['config', 'user.name', 'Test User'], repoDir);
    await run(['config', 'user.email', 'test@example.com'], repoDir);
    await run(['remote', 'add', 'origin', remoteDir], repoDir);

    // Initial commit
    const offersDir = join(repoDir, 'data', 'commerce');
    await mkdir(offersDir, { recursive: true });
    const offersFile = join(offersDir, 'offers.json');
    await writeFile(offersFile, JSON.stringify([{ id: 'initial-offer', state: 'ACTIVE' }]), 'utf8');

    await run(['add', 'data/commerce/offers.json'], repoDir);
    await run(['commit', '-m', 'initial commit'], repoDir);
    await run(['push', '-u', 'origin', 'master'], repoDir);

    const gitCli = new GitCli();

    // Test A: No changes -> returns status 'no-changes'
    const noChangesResult = await publishOffers({ repoRoot: repoDir, gitCli });
    assert.equal(noChangesResult.status, 'no-changes');
    assert.match(noChangesResult.message, /already up to date/);

    // Test B: Unrelated file staged -> aborts and throws
    const unrelatedFile = join(repoDir, 'unrelated.txt');
    await writeFile(unrelatedFile, 'unrelated content', 'utf8');
    await run(['add', 'unrelated.txt'], repoDir);

    await assert.rejects(
      () => publishOffers({ repoRoot: repoDir, gitCli }),
      /unrelated staged files: unrelated\.txt/
    );

    // Unstage unrelated file
    await run(['reset', 'HEAD', 'unrelated.txt'], repoDir);

    // Test C: Modify offers.json -> stages, commits, and pushes successfully
    await writeFile(
      offersFile,
      JSON.stringify([{ id: 'updated-offer', state: 'ACTIVE' }]),
      'utf8'
    );

    const successResult = await publishOffers({ repoRoot: repoDir, gitCli });
    assert.equal(successResult.status, 'success');
    assert.ok(successResult.commitHash);
    assert.match(successResult.message, /Published commit/);

    // Verify remote received the commit
    const remoteLog = await run(['log', '-n', '1', '--oneline'], repoDir);
    assert.match(remoteLog, /feat: publish updated Daily Ideas Store products/);

    // Verify working tree and index are clean for offers.json
    const status = await run(['status', '--porcelain=v1'], repoDir);
    // unrelated.txt is untracked (??), but offers.json has no changes
    assert.equal(status.includes('offers.json'), false);
    assert.match(status, /\?\? unrelated\.txt/);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test('daily-ideas-store-dashboard.ts includes publish button, API endpoint, and UI handlers', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(
    new URL('../scripts/daily-ideas-store-dashboard.ts', import.meta.url),
    'utf8'
  );

  assert.equal(source.includes('Publish store updates'), true);
  assert.equal(source.includes('id="publish-btn"'), true);
  assert.equal(source.includes('id="publish-result"'), true);
  assert.equal(source.includes("api('/api/publish'"), true);
  assert.equal(source.includes("url.pathname === '/api/publish'"), true);
  assert.equal(source.includes('publishOffers'), true);
});
