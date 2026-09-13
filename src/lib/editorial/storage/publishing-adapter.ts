import type { PublishPackage, PublishingResult } from '../publishing/types.ts';
import type { IContentRepository, StoredArticleInput, StorageResult } from './types.ts';
import { sanitizeArticleContent } from '../sanitization.ts';

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
      author: pkg.publicationMetadata?.author || 'LifeMode Editorial',
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
