import { resolve } from 'node:path';

export interface GitPublisherConfig {
  dryRun: boolean;
  gitRepoRoot: string;
  contentRoot: string;
}

export const DEFAULT_GIT_PUBLISH_DRY_RUN = true;
export const DEFAULT_GIT_REPOSITORY_ROOT = '.';
export const DEFAULT_GIT_PUBLISH_CONTENT_ROOT = 'src/content';

/**
 * Loads Git publisher configuration from environment variables or defaults.
 */
export function loadGitPublisherConfig(overrides?: Partial<GitPublisherConfig>): GitPublisherConfig {
  const envDryRun = process.env.LIFEMODE_GIT_PUBLISH_DRY_RUN;
  const isDryRun =
    overrides?.dryRun !== undefined
      ? overrides.dryRun
      : envDryRun !== undefined
        ? envDryRun.toLowerCase() !== 'false' && envDryRun !== '0'
        : DEFAULT_GIT_PUBLISH_DRY_RUN;

  const rawRepoRoot =
    overrides?.gitRepoRoot ||
    process.env.LIFEMODE_GIT_REPOSITORY_ROOT ||
    DEFAULT_GIT_REPOSITORY_ROOT;

  const rawContentRoot =
    overrides?.contentRoot ||
    process.env.LIFEMODE_CONTENT_ROOT ||
    DEFAULT_GIT_PUBLISH_CONTENT_ROOT;

  const gitRepoRoot = resolve(process.cwd(), rawRepoRoot);
  const contentRoot = resolve(gitRepoRoot, rawContentRoot);

  return {
    dryRun: isDryRun,
    gitRepoRoot,
    contentRoot,
  };
}
