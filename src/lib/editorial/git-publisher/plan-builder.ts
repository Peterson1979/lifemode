import { relative, resolve, normalize } from 'node:path';
import type {
  StoredArticle,
  PublicationPlan,
  PublicationOperation,
  GitRepoStatus,
  AstroValidationResult,
  GitPublisherOptions,
} from './types.ts';

/**
 * Builds a deterministic PublicationPlan inspecting repository changes and formatting commit metadata.
 */
export function buildPublicationPlan(
  article: StoredArticle,
  repoStatus: GitRepoStatus,
  validationResult: AstroValidationResult,
  options?: GitPublisherOptions
): PublicationPlan {
  const generatedAt = new Date().toISOString();
  const repoRoot = resolve(repoStatus.repoRoot || options?.gitRepoRoot || process.cwd());
  const normalizedFilePath = resolve(normalize(article.filePath));

  const rawRelativePath = relative(repoRoot, normalizedFilePath);
  const relativeFilePath = rawRelativePath.replace(/\\/g, '/');

  const articleId = `${article.pillar}/${article.slug}`;
  const topicId = article.identity?.topicId || article.frontmatter?.topicId;

  // Determine operation based on article version and git status
  const version = article.frontmatter?.version || 1;
  const isUpdate = version > 1 || repoStatus.modifiedFiles.includes(relativeFilePath);
  const operation: PublicationOperation = isUpdate ? 'UPDATE' : 'CREATE';

  const filesToAdd: string[] = [];
  const filesToChange: string[] = [];

  if (operation === 'CREATE') {
    filesToAdd.push(relativeFilePath);
  } else {
    filesToChange.push(relativeFilePath);
  }

  const commitMessage =
    options?.customCommitMessage ||
    (operation === 'UPDATE'
      ? `feat: update article "${article.frontmatter?.title || article.slug}"`
      : `feat: publish article "${article.frontmatter?.title || article.slug}"`);

  const publicationKey = `git-pub-${article.pillar}-${article.slug}-v${version}`;
  const dryRun = options?.dryRun !== undefined ? options.dryRun : true;

  return {
    articleId,
    topicId,
    slug: article.slug,
    pillar: article.pillar,
    targetFilePath: normalizedFilePath,
    relativeFilePath,
    operation,
    contentRepositoryStatus: article.frontmatter?.lifecycleStatus || 'STORED',
    gitRepoRoot: repoRoot,
    currentBranch: repoStatus.currentBranch || 'UNKNOWN',
    filesToAdd,
    filesToChange,
    filesToRemove: [],
    validationStatus: validationResult,
    dryRun,
    commitMessage,
    publicationKey,
    generatedAt,
  };
}
