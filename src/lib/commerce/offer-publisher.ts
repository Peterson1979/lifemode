import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GitCli } from '../editorial/git-publisher/git-cli.ts';

export interface PublishResult {
  status: 'success' | 'no-changes';
  message: string;
  commitHash?: string;
}

export interface PublishOptions {
  repoRoot?: string;
  gitCli?: GitCli;
  remote?: string;
  branch?: string;
  targetFile?: string;
}

const DEFAULT_REMOTE = 'origin';
const DEFAULT_BRANCH = 'master';

function filterStagedPaths(stdout: string, git: GitCli): string[] {
  return stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => git.normalizeGitPath(f))
    .filter((f) => f && f !== '.');
}

export async function publishOffers(options: PublishOptions = {}): Promise<PublishResult> {
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const git = options.gitCli || new GitCli();
  const remote = options.remote || DEFAULT_REMOTE;
  const branch = options.branch || DEFAULT_BRANCH;
  const defaultTarget = existsSync(resolve(repoRoot, 'data/commerce/products.json'))
    ? 'data/commerce/products.json'
    : 'data/commerce/offers.json';
  const targetFile = git.normalizeGitPath(options.targetFile || defaultTarget);

  const isAvailable = await git.isGitAvailable();
  if (!isAvailable) {
    throw new Error('Git executable is not available in the runtime environment.');
  }

  const isRepo = await git.isGitRepo(repoRoot);
  if (!isRepo) {
    throw new Error(`Target path is not a Git repository: ${repoRoot}`);
  }

  const isDetached = await git.isDetachedHead(repoRoot);
  if (isDetached) {
    throw new Error('Git repository is in a detached HEAD state. Cannot publish to a detached HEAD.');
  }

  const currentBranch = await git.getCurrentBranch(repoRoot);
  if (currentBranch !== branch) {
    throw new Error(`Current branch "${currentBranch}" does not match target publishing branch "${branch}".`);
  }

  // 1. Safety check: inspect pre-existing staged files
  const { stdout: initialStagedStdout } = await git.runGit(['diff', '--name-only', '--cached'], repoRoot);
  const initialStaged = filterStagedPaths(initialStagedStdout, git);

  const unrelatedStaged = initialStaged.filter((f) => f !== targetFile);
  if (unrelatedStaged.length > 0) {
    throw new Error(
      `Publish aborted: Git index already contains unrelated staged files: ${unrelatedStaged.join(', ')}. Unstage them before publishing.`
    );
  }

  // 2. Check working tree status for target file
  const { stdout: worktreeDiff } = await git.runGit(['diff', '--name-only', '--', targetFile], repoRoot);
  const isWorktreeModified = Boolean(worktreeDiff.trim());

  if (isWorktreeModified) {
    await git.stageSingleFile(repoRoot, targetFile);
  }

  // 3. Verify exactly target file is staged
  const { stdout: postStagedStdout } = await git.runGit(['diff', '--name-only', '--cached'], repoRoot);
  const stagedFiles = filterStagedPaths(postStagedStdout, git);

  if (stagedFiles.length === 1 && stagedFiles[0] === targetFile) {
    const commitHash = await git.createCommit(
      repoRoot,
      'feat: publish updated Daily Ideas Store products'
    );
    await git.push(repoRoot, remote, branch);
    return {
      status: 'success',
      commitHash,
      message: `Published commit ${commitHash.slice(0, 7)} to ${remote}/${branch}. Cloudflare Pages build and deployment has been initiated.`,
    };
  }

  if (stagedFiles.length === 0) {
    // Check if HEAD is ahead of remote touching targetFile
    try {
      const { stdout: unpushed } = await git.runGit(
        ['log', `${remote}/${branch}..HEAD`, '--oneline', '--', targetFile],
        repoRoot
      );
      if (unpushed.trim()) {
        await git.push(repoRoot, remote, branch);
        const headHash = await git.getHeadCommitHash(repoRoot);
        return {
          status: 'success',
          commitHash: headHash,
          message: `Pushed pending commit ${headHash.slice(0, 7)} to ${remote}/${branch}. Cloudflare Pages build and deployment has been initiated.`,
        };
      }
    } catch {
      // If remote tracking ref cannot be read, continue to no-changes check
    }

    return {
      status: 'no-changes',
      message: 'No changes to publish. Daily Ideas Store offers are already up to date with origin/master.',
    };
  }

  throw new Error(`Safety check failed: unexpected staged files found: ${stagedFiles.join(', ')}`);
}
