import { relative, resolve } from 'node:path';
import { GitCli } from '../git-publisher/git-cli.ts';

export interface ApprovalReleaseRequest {
  articlePath: string;
  queuePath: string;
  route: string;
  title: string;
}

export interface ApprovalReleaseResult {
  commitHash: string;
  url: string;
}

function cleanError(error: unknown): string {
  return String((error as any)?.message || error || 'Release failed.')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://***:***@')
    .slice(0, 1000);
}

async function verifyLive(url: string, title: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'No response received.';
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(10_000, Math.max(1_000, deadline - Date.now())));
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } });
      const body = await response.text();
      if (response.ok && body.toLowerCase().includes(title.toLowerCase())) return;
      lastError = `Live verification returned HTTP ${response.status} or did not contain the approved title.`;
    } catch (error) {
      lastError = cleanError(error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(5_000, Math.max(250, deadline - Date.now()))));
  }
  throw new Error(`Live verification timed out for ${url}: ${lastError}`);
}

/** Commits only the approved article and queue, pushes master, then verifies Cloudflare Pages output. */
export async function releaseApprovedArticle(
  request: ApprovalReleaseRequest,
  options: { gitCli?: GitCli; repoRoot?: string; remote?: string; branch?: string; baseUrl?: string; verify?: (url: string, title: string) => Promise<void>; timeoutMs?: number } = {},
): Promise<ApprovalReleaseResult> {
  const git = options.gitCli || new GitCli();
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const articlePath = resolve(request.articlePath);
  const queuePath = resolve(request.queuePath);
  const targets = [relative(repoRoot, articlePath), relative(repoRoot, queuePath)].map((target) => target.replace(/\\/g, '/'));
  if (targets.some((target) => !target || target.startsWith('../') || target.includes('..\\'))) {
    throw new Error('Release refused an article or queue path outside the repository.');
  }

  try {
    const status = await git.getRepoStatus(repoRoot);
    if (status.stagedFiles.length > 0) throw new Error('Release refused because the working tree already contains staged changes.');
    await git.runGit(['add', '--', ...targets], repoRoot);
    const cached = (await git.runGit(['diff', '--cached', '--name-only'], repoRoot)).stdout
      .split('\n').map((entry) => entry.trim().replace(/\\/g, '/')).filter(Boolean).sort();
    if (cached.length !== targets.length || cached.some((entry, index) => entry !== [...targets].sort()[index])) {
      throw new Error('Release staging safety check failed; only the approved article and queue may be committed.');
    }
    const commitHash = await git.createCommit(repoRoot, `feat: publish approved article "${request.title.replace(/[\r\n"]+/g, ' ').slice(0, 160)}"`);
    await git.push(repoRoot, options.remote || process.env.LIFEMODE_APPROVAL_GIT_REMOTE || 'origin', options.branch || process.env.LIFEMODE_APPROVAL_GIT_BRANCH || 'master');
    const baseUrl = (options.baseUrl || process.env.LIFEMODE_BASE_URL || 'https://lifemode.life').replace(/\/$/, '');
    const url = `${baseUrl}${request.route.startsWith('/') ? request.route : `/${request.route}`}`;
    await (options.verify || ((target, title) => verifyLive(target, title, options.timeoutMs ?? 120_000)))(url, request.title);
    return { commitHash, url };
  } catch (error) {
    try { await git.runGit(['reset', 'HEAD', '--', ...targets], repoRoot); } catch { /* preserve original failure */ }
    throw new Error(cleanError(error));
  }
}
