import type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel } from '../types.ts';
import type { StoredArticle, ArticleLifecycleStatus } from '../storage/types.ts';

export type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel, StoredArticle, ArticleLifecycleStatus };

/**
 * Status lifecycle of a Git publication execution.
 */
export type GitPublisherStatus =
  | 'READY'
  | 'BLOCKED'
  | 'DRY_RUN'
  | 'COMMITTED'
  | 'PUSHED'
  | 'FAILED'
  | 'SKIPPED';

/**
 * Publication operation type.
 */
export type PublicationOperation = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * Detailed status of a local Git repository.
 */
export interface GitRepoStatus {
  isGitRepo: boolean;
  repoRoot: string;
  currentBranch: string;
  isDetachedHead: boolean;
  isClean: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
  hasUnrelatedChanges: boolean;
  unrelatedFiles: string[];
}

/**
 * Structured publication plan for Git/Astro content deployment.
 * Deterministic and inspectable without performing any Git mutation.
 */
export interface PublicationPlan {
  articleId: string; // e.g. `tech-ai/minimalist-workspaces-2026`
  topicId?: string;
  slug: string;
  pillar: PillarSlug;
  targetFilePath: string; // Absolute path
  relativeFilePath: string; // Relative to gitRepoRoot, e.g. `src/content/tech-ai/article.md`
  operation: PublicationOperation;
  contentRepositoryStatus: ArticleLifecycleStatus;
  gitRepoRoot: string;
  currentBranch: string;
  filesToAdd: string[];
  filesToChange: string[];
  filesToRemove: string[];
  validationStatus: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  dryRun: boolean;
  commitMessage: string;
  publicationKey: string;
  generatedAt: string; // ISO 8601
}

/**
 * Astro content validation summary.
 */
export interface AstroValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Configuration options passed into the Git publisher.
 */
export interface GitPublisherOptions {
  dryRun?: boolean; // default: true
  allowCommit?: boolean; // default: false (explicit opt-in for local commit)
  allowUnrelatedChanges?: boolean; // default: false (conservative blocking)
  gitRepoRoot?: string;
  contentRoot?: string;
  commitAuthor?: {
    name: string;
    email: string;
  };
  customCommitMessage?: string;
}

/**
 * Complete structured result from a Git publication action.
 */
export interface GitPublisherResult {
  status: GitPublisherStatus;
  articleId: string;
  plan: PublicationPlan;
  dryRun: boolean;
  committed: boolean;
  commitHash?: string;
  pushed: boolean; // Always false in V1
  repoStatus?: GitRepoStatus;
  executedAt: string; // ISO 8601
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Provider-independent interface for Git-based article publication.
 */
export interface IGitPublisher {
  inspectRepo(repoRoot?: string, targetRelativePath?: string): Promise<GitRepoStatus>;
  createPlan(article: StoredArticle, options?: GitPublisherOptions): Promise<PublicationPlan>;
  publish(article: StoredArticle, options?: GitPublisherOptions): Promise<GitPublisherResult>;
}
