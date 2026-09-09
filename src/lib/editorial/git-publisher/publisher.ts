import { resolve, relative } from 'node:path';
import type {
  IGitPublisher,
  StoredArticle,
  PublicationPlan,
  GitPublisherOptions,
  GitPublisherResult,
  GitRepoStatus,
} from './types.ts';
import { GitCli } from './git-cli.ts';
import { loadGitPublisherConfig } from './config.ts';
import { validateAstroArticle } from './validator.ts';
import { buildPublicationPlan } from './plan-builder.ts';

export interface AstroGitPublisherOptions {
  gitCli?: GitCli;
  defaultOptions?: GitPublisherOptions;
}

/**
 * Astro/Git Publisher V1 for coordinating local Git publication workflows
 * for approved and stored LifeMode articles.
 */
export class AstroGitPublisher implements IGitPublisher {
  private readonly gitCli: GitCli;
  private readonly defaultOptions?: GitPublisherOptions;

  constructor(options?: AstroGitPublisherOptions) {
    this.gitCli = options?.gitCli || new GitCli();
    this.defaultOptions = options?.defaultOptions;
  }

  /**
   * Inspects repository status and working tree safety.
   */
  async inspectRepo(repoRoot?: string, targetRelativePath?: string): Promise<GitRepoStatus> {
    const config = loadGitPublisherConfig();
    const root = resolve(repoRoot || this.defaultOptions?.gitRepoRoot || config.gitRepoRoot);
    return this.gitCli.getRepoStatus(root, targetRelativePath);
  }

  /**
   * Constructs an inspectable, deterministic PublicationPlan without any filesystem or Git mutations.
   */
  async createPlan(article: StoredArticle, options?: GitPublisherOptions): Promise<PublicationPlan> {
    const config = loadGitPublisherConfig();
    const mergedOptions: GitPublisherOptions = {
      ...this.defaultOptions,
      ...options,
    };

    const repoRoot = resolve(mergedOptions.gitRepoRoot || config.gitRepoRoot);
    const contentRoot = resolve(mergedOptions.contentRoot || config.contentRoot);

    const relativeTarget = article?.filePath
      ? relative(repoRoot, article.filePath).replace(/\\/g, '/')
      : undefined;

    const repoStatus = await this.gitCli.getRepoStatus(repoRoot, relativeTarget);
    const validationResult = validateAstroArticle(article, {
      gitRepoRoot: repoRoot,
      contentRoot,
    });

    return buildPublicationPlan(article, repoStatus, validationResult, mergedOptions);
  }

  /**
   * Executes the Git publication process in safe dry-run mode (or explicit local commit mode if requested).
   * Never pushes to remote repositories.
   */
  async publish(article: StoredArticle, options?: GitPublisherOptions): Promise<GitPublisherResult> {
    const executedAt = new Date().toISOString();
    const config = loadGitPublisherConfig();

    const mergedOptions: GitPublisherOptions = {
      dryRun: config.dryRun,
      allowCommit: false,
      allowUnrelatedChanges: false,
      ...this.defaultOptions,
      ...options,
    };

    const isDryRun = mergedOptions.dryRun !== undefined ? mergedOptions.dryRun : true;
    const repoRoot = resolve(mergedOptions.gitRepoRoot || config.gitRepoRoot);
    const contentRoot = resolve(mergedOptions.contentRoot || config.contentRoot);

    const articleId = article?.pillar && article?.slug
      ? `${article.pillar}/${article.slug}`
      : 'unknown-article';

    // 1. Validate article structure
    const validationResult = validateAstroArticle(article, {
      gitRepoRoot: repoRoot,
      contentRoot,
    });

    const relativeTarget = article?.filePath
      ? relative(repoRoot, article.filePath).replace(/\\/g, '/')
      : undefined;

    // 2. Inspect Git repository
    const isGitAvailable = await this.gitCli.isGitAvailable();
    if (!isGitAvailable) {
      const dummyRepoStatus: GitRepoStatus = {
        isGitRepo: false,
        repoRoot,
        currentBranch: 'UNKNOWN',
        isDetachedHead: false,
        isClean: true,
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        hasUnrelatedChanges: false,
        unrelatedFiles: [],
      };
      const plan = buildPublicationPlan(article, dummyRepoStatus, validationResult, mergedOptions);
      return {
        status: 'FAILED',
        articleId,
        plan,
        dryRun: isDryRun,
        committed: false,
        pushed: false,
        repoStatus: dummyRepoStatus,
        executedAt,
        error: {
          code: 'GIT_UNAVAILABLE',
          message: 'Git executable is not available in current environment.',
        },
      };
    }

    const isRepo = await this.gitCli.isGitRepo(repoRoot);
    if (!isRepo) {
      const dummyRepoStatus: GitRepoStatus = {
        isGitRepo: false,
        repoRoot,
        currentBranch: 'UNKNOWN',
        isDetachedHead: false,
        isClean: true,
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        hasUnrelatedChanges: false,
        unrelatedFiles: [],
      };
      const plan = buildPublicationPlan(article, dummyRepoStatus, validationResult, mergedOptions);
      return {
        status: 'FAILED',
        articleId,
        plan,
        dryRun: isDryRun,
        committed: false,
        pushed: false,
        repoStatus: dummyRepoStatus,
        executedAt,
        error: {
          code: 'NOT_A_GIT_REPO',
          message: `Target path "${repoRoot}" is not an initialized Git repository.`,
        },
      };
    }

    const repoStatus = await this.gitCli.getRepoStatus(repoRoot, relativeTarget);
    const plan = buildPublicationPlan(article, repoStatus, validationResult, mergedOptions);

    // 3. Check for Astro validation errors
    if (!validationResult.isValid) {
      return {
        status: 'BLOCKED',
        articleId,
        plan,
        dryRun: isDryRun,
        committed: false,
        pushed: false,
        repoStatus,
        executedAt,
        error: {
          code: 'VALIDATION_FAILED',
          message: `Article validation failed: ${validationResult.errors.join('; ')}`,
        },
      };
    }

    // 4. Check for detached HEAD
    if (repoStatus.isDetachedHead) {
      return {
        status: 'BLOCKED',
        articleId,
        plan,
        dryRun: isDryRun,
        committed: false,
        pushed: false,
        repoStatus,
        executedAt,
        error: {
          code: 'DETACHED_HEAD',
          message: 'Repository is in a detached HEAD state. Publication blocked.',
        },
      };
    }

    // 5. Check for unrelated dirty working tree changes
    if (repoStatus.hasUnrelatedChanges && !mergedOptions.allowUnrelatedChanges) {
      return {
        status: 'BLOCKED',
        articleId,
        plan,
        dryRun: isDryRun,
        committed: false,
        pushed: false,
        repoStatus,
        executedAt,
        error: {
          code: 'DIRTY_WORKING_TREE',
          message: `Working tree contains unrelated uncommitted changes in: ${repoStatus.unrelatedFiles.slice(0, 3).join(', ')}. Publication blocked to prevent accidental commits.`,
        },
      };
    }

    // 6. Dry run mode (Safe Default)
    if (isDryRun) {
      return {
        status: 'DRY_RUN',
        articleId,
        plan,
        dryRun: true,
        committed: false,
        pushed: false,
        repoStatus,
        executedAt,
      };
    }

    // 7. Explicit Local Commit Mode (Opt-in only)
    if (mergedOptions.allowCommit) {
      try {
        // Stage ONLY the single article file
        await this.gitCli.stageSingleFile(repoRoot, plan.relativeFilePath);

        // Commit with deterministic commit message
        const commitHash = await this.gitCli.createCommit(
          repoRoot,
          plan.commitMessage,
          mergedOptions.commitAuthor
        );

        return {
          status: 'COMMITTED',
          articleId,
          plan,
          dryRun: false,
          committed: true,
          commitHash,
          pushed: false, // Never push in V1
          repoStatus: await this.gitCli.getRepoStatus(repoRoot, relativeTarget),
          executedAt,
        };
      } catch (err: any) {
        return {
          status: 'FAILED',
          articleId,
          plan,
          dryRun: false,
          committed: false,
          pushed: false,
          repoStatus,
          executedAt,
          error: {
            code: 'COMMIT_FAILED',
            message: err?.message || 'Failed to create local commit.',
          },
        };
      }
    }

    // Non-dry-run without commit (READY for external Git tooling)
    return {
      status: 'READY',
      articleId,
      plan,
      dryRun: false,
      committed: false,
      pushed: false,
      repoStatus,
      executedAt,
    };
  }
}
