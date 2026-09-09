import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, normalize } from 'node:path';
import type { GitRepoStatus } from './types.ts';

const execFileAsync = promisify(execFile);

/**
 * Safe local Git CLI wrapper using `child_process.execFile`.
 * Uses argument arrays to eliminate shell injection vulnerabilities.
 */
export class GitCli {
  /**
   * Executes a git command in the target directory with timeout.
   */
  async runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execFileAsync('git', args, {
        cwd: resolve(cwd),
        timeout: 15000,
        windowsHide: true,
        env: {
          ...process.env,
          // Force deterministic English output for Git messages
          LC_ALL: 'C',
          LANG: 'C',
        },
      });
      return {
        stdout: result.stdout.trimEnd(),
        stderr: result.stderr.trimEnd(),
      };
    } catch (err: any) {
      throw new Error(`Git command failed "git ${args.join(' ')}": ${err.stderr || err.message}`);
    }
  }

  /**
   * Checks if git executable is available in the system environment.
   */
  async isGitAvailable(): Promise<boolean> {
    try {
      const { stdout } = await this.runGit(['--version'], process.cwd());
      return stdout.trim().toLowerCase().startsWith('git version');
    } catch {
      return false;
    }
  }

  /**
   * Validates that target path is inside an initialized Git worktree.
   */
  async isGitRepo(repoRoot: string): Promise<boolean> {
    try {
      const { stdout } = await this.runGit(['rev-parse', '--is-inside-work-tree'], repoRoot);
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Retrieves the top-level root directory of the Git repository.
   */
  async getTopLevel(repoRoot: string): Promise<string> {
    const { stdout } = await this.runGit(['rev-parse', '--show-toplevel'], repoRoot);
    return resolve(stdout.trim());
  }

  /**
   * Retrieves the current branch name, or 'HEAD' if detached.
   */
  async getCurrentBranch(repoRoot: string): Promise<string> {
    try {
      const { stdout } = await this.runGit(['branch', '--show-current'], repoRoot);
      if (stdout.trim()) return stdout.trim();
    } catch {
      // Fallback
    }

    try {
      const { stdout } = await this.runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
      return stdout.trim();
    } catch {
      return 'UNKNOWN';
    }
  }

  /**
   * Checks if HEAD is in a detached state.
   */
  async isDetachedHead(repoRoot: string): Promise<boolean> {
    try {
      await this.runGit(['symbolic-ref', '-q', 'HEAD'], repoRoot);
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Inspects repository status and detects modified, untracked, staged, and unrelated files.
   */
  async getRepoStatus(repoRoot: string, targetRelativePath?: string): Promise<GitRepoStatus> {
    const isRepo = await this.isGitRepo(repoRoot);
    if (!isRepo) {
      return {
        isGitRepo: false,
        repoRoot: resolve(repoRoot),
        currentBranch: 'UNKNOWN',
        isDetachedHead: false,
        isClean: true,
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        hasUnrelatedChanges: false,
        unrelatedFiles: [],
      };
    }

    const resolvedRoot = await this.getTopLevel(repoRoot);
    const currentBranch = await this.getCurrentBranch(resolvedRoot);
    const isDetached = await this.isDetachedHead(resolvedRoot);

    const { stdout } = await this.runGit(['status', '--porcelain=v1', '-uall'], resolvedRoot);

    const modifiedFiles: string[] = [];
    const untrackedFiles: string[] = [];
    const stagedFiles: string[] = [];
    const unrelatedFiles: string[] = [];

    const normalizedTarget = targetRelativePath
      ? this.normalizeGitPath(targetRelativePath)
      : null;

    if (stdout.length > 0) {
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line || line.length < 3) continue;

        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const rawFilePath = line.substring(2).trim().replace(/^"|"$/g, '');
        const normalizedFile = this.normalizeGitPath(rawFilePath);

        if (indexStatus !== ' ' && indexStatus !== '?') {
          stagedFiles.push(normalizedFile);
        }

        if (indexStatus === '?' && workTreeStatus === '?') {
          untrackedFiles.push(normalizedFile);
        } else if (workTreeStatus === 'M' || workTreeStatus === 'D' || indexStatus === 'M' || indexStatus === 'A') {
          modifiedFiles.push(normalizedFile);
        }

        if (normalizedTarget && normalizedFile !== normalizedTarget) {
          unrelatedFiles.push(normalizedFile);
        }
      }
    }

    const isClean = modifiedFiles.length === 0 && untrackedFiles.length === 0 && stagedFiles.length === 0;

    return {
      isGitRepo: true,
      repoRoot: resolvedRoot,
      currentBranch,
      isDetachedHead: isDetached,
      isClean,
      modifiedFiles,
      untrackedFiles,
      stagedFiles,
      hasUnrelatedChanges: unrelatedFiles.length > 0,
      unrelatedFiles,
    };
  }

  /**
   * Safely stages a single file. Refuses wildcards, dots, or directories.
   */
  async stageSingleFile(repoRoot: string, relativePath: string): Promise<void> {
    const normalizedTarget = this.normalizeGitPath(relativePath);

    if (!normalizedTarget || normalizedTarget === '.' || normalizedTarget.includes('*') || normalizedTarget.includes('..')) {
      throw new Error(`Unsafe stage target: "${relativePath}". Only explicit single file paths can be staged.`);
    }

    // Stage exclusively the target file
    await this.runGit(['add', '--', normalizedTarget], repoRoot);

    // Verify staged files list contains strictly the expected file
    const { stdout } = await this.runGit(['diff', '--name-only', '--cached'], repoRoot);
    const staged = stdout.split('\n').map((f) => this.normalizeGitPath(f.trim())).filter(Boolean);

    if (staged.length !== 1 || staged[0] !== normalizedTarget) {
      // Revert accidental staging before throwing
      try {
        await this.runGit(['reset', 'HEAD'], repoRoot);
      } catch {
        // Ignore reset error
      }
      throw new Error(`Staging safety check failed: Expected exclusively "${normalizedTarget}" to be staged, but found: ${JSON.stringify(staged)}`);
    }
  }

  /**
   * Creates a local commit for staged changes.
   */
  async createCommit(
    repoRoot: string,
    message: string,
    author?: { name: string; email: string }
  ): Promise<string> {
    if (!message || typeof message !== 'string' || !message.trim()) {
      throw new Error('Commit message must be a non-empty string.');
    }

    const args = ['commit', '-m', message.trim()];

    if (author?.name && author?.email) {
      args.push(`--author=${author.name} <${author.email}>`);
    }

    await this.runGit(args, repoRoot);

    const { stdout: commitHash } = await this.runGit(['rev-parse', 'HEAD'], repoRoot);
    return commitHash.trim();
  }

  /**
   * Retrieves the current HEAD commit hash.
   */
  async getHeadCommitHash(repoRoot: string): Promise<string> {
    const { stdout } = await this.runGit(['rev-parse', 'HEAD'], repoRoot);
    return stdout.trim();
  }

  /**
   * Pushes the current branch to a specified remote and branch.
   * Never force pushes.
   */
  async push(repoRoot: string, remote = 'origin', branch = 'master'): Promise<void> {
    if (!remote || !branch) {
      throw new Error('Remote and branch must be specified for Git push.');
    }
    await this.runGit(['push', remote, branch], repoRoot);
  }

  /**
   * Normalizes paths to POSIX format for uniform Git comparison.
   */
  normalizeGitPath(p: string): string {
    return normalize(p).replace(/\\/g, '/').replace(/^\/+/, '');
  }
}

