import type { PublishPackage, PublishingResult } from '../publishing/types.ts';
import type {
  IContentRepository,
  StoredArticleInput,
  StorageResult,
  StoredArticle,
  StoredArticleFrontmatter,
} from './types.ts';
import { sanitizeArticleContent } from '../sanitization.ts';
import { resolveSafeArticlePath } from './path-security.ts';
import { loadStorageConfig } from './config.ts';

/**
 * Converts a validated PublishPackage into a StoredArticleInput ready for persistence.
 */
export function publishPackageToStoredArticleInput(
  pkg: PublishPackage
): StoredArticleInput {
  if (!pkg || typeof pkg !== 'object') {
    throw new Error('PublishPackage must be a valid non-null object.');
  }

  const { cleanContent } = sanitizeArticleContent(pkg.content || '');

  return {
    pillar: pkg.pillar,
    slug: pkg.slug,
    topicId: pkg.topicId,
    content: cleanContent,
    frontmatter: {
      title: pkg.title,
      description: pkg.description,
      pubDate: pkg.publicationMetadata?.targetDate || new Date().toISOString().split('T')[0],
      author: pkg.publicationMetadata?.author || 'LifeMode',
      tags: pkg.tags || [],
      featured: false,
      draft: false,
      format: pkg.format || 'standard',
      topicId: pkg.topicId,
      audience: pkg.audience,
      primaryIntent: pkg.primaryIntent || 'informational',
      secondaryIntent: pkg.secondaryIntent,
      affiliateIntent: Boolean(pkg.affiliateIntent),
      riskLevel: pkg.riskLevel || 'low',
      sources: (pkg.sources || []).map((s) => ({
        name: s.name,
        url: s.url || '',
      })),
      image: pkg.imageMetadata?.url,
      imageAlt: pkg.imageMetadata?.alt,
      imagePrompt: pkg.imageMetadata?.prompt,
      imageSource: pkg.imageMetadata?.source,
      targetProject: pkg.targetProject,
      version: pkg.publicationMetadata?.version || 1,
      lifecycleStatus: 'STORED', // Confirmed stored on filesystem (not claiming external publication)
    },
  };
}

/**
 * Persists an approved PublishPackage to the content repository.
 *
 * Enforces that blocked/ineligible publishing packages or image-less packages without fallback cannot be stored.
 */
export async function storePublishPackage(
  repository: IContentRepository,
  publishPackage: PublishPackage,
  options: { allowNoImageFallback?: boolean; dryRun?: boolean } = {}
): Promise<StorageResult> {
  const isDryRun = options.dryRun ?? false;
  const hasImageUrl = Boolean(
    publishPackage.imageMetadata?.url &&
    typeof publishPackage.imageMetadata.url === 'string' &&
    publishPackage.imageMetadata.url.trim().length > 0
  );

  if (!isDryRun && !hasImageUrl && !options.allowNoImageFallback) {
    return {
      status: 'INVALID',
      operation: 'create',
      timestamp: new Date().toISOString(),
      error: {
        code: 'IMAGE_REQUIRED',
        message: 'Cannot store published article without a valid image URL unless fallback is explicitly configured.',
      },
    };
  }

  const articleInput = publishPackageToStoredArticleInput(publishPackage);

  if (isDryRun) {
    const timestamp = new Date().toISOString();
    try {
      const contentRoot = (repository as any)?.contentRoot || loadStorageConfig().contentRoot;
      const { safePath, pillar, slug } = resolveSafeArticlePath(
        contentRoot,
        articleInput.pillar,
        articleInput.slug
      );
      const articleId = `${pillar}/${slug}`;

      const frontmatter: StoredArticleFrontmatter = {
        title: articleInput.frontmatter.title.trim(),
        description: articleInput.frontmatter.description.trim(),
        pubDate: articleInput.frontmatter.pubDate || timestamp.split('T')[0],
        updatedDate: articleInput.frontmatter.updatedDate,
        author: articleInput.frontmatter.author || 'LifeMode',
        tags: Array.isArray(articleInput.frontmatter.tags) ? [...articleInput.frontmatter.tags] : [],
        featured: Boolean(articleInput.frontmatter.featured),
        draft: Boolean(articleInput.frontmatter.draft),
        format: articleInput.frontmatter.format || 'standard',
        topicId: articleInput.topicId || articleInput.frontmatter.topicId,
        audience: articleInput.frontmatter.audience,
        primaryIntent: articleInput.frontmatter.primaryIntent || 'informational',
        secondaryIntent: articleInput.frontmatter.secondaryIntent,
        affiliateIntent: Boolean(articleInput.frontmatter.affiliateIntent),
        riskLevel: articleInput.frontmatter.riskLevel || 'low',
        sources: Array.isArray(articleInput.frontmatter.sources)
          ? articleInput.frontmatter.sources.map((s) => ({ name: s.name, url: s.url || '' }))
          : [],
        image: articleInput.frontmatter.image,
        imageAlt: articleInput.frontmatter.imageAlt,
        imagePrompt: articleInput.frontmatter.imagePrompt,
        imageSource: articleInput.frontmatter.imageSource,
        targetProject: articleInput.frontmatter.targetProject,
        readingTime: articleInput.frontmatter.readingTime,
        version: articleInput.frontmatter.version || 1,
        lifecycleStatus: articleInput.frontmatter.lifecycleStatus || 'STORED',
      };

      const storedArticle: StoredArticle = {
        identity: {
          topicId: frontmatter.topicId,
          slug,
          pillar,
        },
        pillar,
        slug,
        frontmatter,
        content: (articleInput.content || '').trim(),
        filePath: safePath,
      };

      return {
        status: 'STORED',
        articleId,
        path: safePath,
        slug,
        pillar,
        operation: 'create',
        timestamp,
        version: frontmatter.version,
        article: storedArticle,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        operation: 'create',
        timestamp,
        error: {
          code: 'DRY_RUN_SIMULATION_FAILED',
          message: err?.message || 'Failed to simulate article storage in dry-run mode.',
        },
      };
    }
  }

  return repository.create(articleInput);
}

/**
 * Stores an article directly from a successful PublishingResult.
 *
 * Throws or rejects if the gate was blocked or the publishing result was ineligible.
 */
export async function storePublishingResult(
  repository: IContentRepository,
  result: PublishingResult,
  options: { allowNoImageFallback?: boolean } = {}
): Promise<StorageResult> {
  if (!result || typeof result !== 'object') {
    throw new Error('PublishingResult must be a valid non-null object.');
  }

  if (result.status === 'BLOCKED' || result.status === 'FAILED' || !result.gateResult?.eligible || !result.publishPackage) {
    return {
      status: 'INVALID',
      operation: 'create',
      timestamp: new Date().toISOString(),
      error: {
        code: (result.error?.code as any) || 'GATE_BLOCKED',
        message: result.error?.message || 'Cannot store blocked or ineligible publishing result.',
      },
    };
  }

  return storePublishPackage(repository, result.publishPackage, {
    allowNoImageFallback: options.allowNoImageFallback,
    dryRun: result.dryRun,
  });
}
