import type { PublishingRequest, PublishingOptions, PublishPackage } from './types.ts';
import { sanitizeArticleContent } from '../sanitization.ts';

/**
 * Builds a canonical normalized PublishPackage from an eligible article draft,
 * review result, and editorial context.
 *
 * Pure function: does NOT mutate source input objects.
 */
export function buildPublishPackage(
  request: PublishingRequest,
  options: PublishingOptions = {}
): PublishPackage {
  const { article, review, context } = request;

  const targetDate = options.targetDate || new Date().toISOString();
  const author = options.author || 'LifeMode Editorial';
  const id = `pub-${context.topicId}-${article.slug}`;

  const { cleanContent, extractedMetadata } = sanitizeArticleContent(article.content || '');

  const tags = context.tags && context.tags.length > 0
    ? [...context.tags]
    : [context.pillar];

  const affiliateIntent = context.affiliateIntent !== undefined
    ? context.affiliateIntent
    : ((article.affiliateIntents && article.affiliateIntents.length > 0) || extractedMetadata.affiliateIntents.length > 0);

  const affiliateCategories = context.affiliateCategories || (
    Array.isArray(article.affiliateIntents) && article.affiliateIntents.length > 0
      ? [...article.affiliateIntents]
      : (extractedMetadata.affiliateIntents.length > 0 ? [...extractedMetadata.affiliateIntents] : undefined)
  );

  const internalLinks = article.internalLinks && article.internalLinks.length > 0
    ? [...article.internalLinks]
    : extractedMetadata.internalLinks;

  const socialHooks = article.socialHooks && article.socialHooks.length > 0
    ? [...article.socialHooks]
    : extractedMetadata.socialHooks;

  return {
    id,
    topicId: context.topicId,
    slug: article.slug,
    title: article.title,
    description: article.description,
    excerpt: article.excerpt,
    content: cleanContent,
    pillar: context.pillar,
    format: context.format,
    audience: context.audience,
    primaryIntent: context.primaryIntent,
    secondaryIntent: context.secondaryIntent,
    riskLevel: context.riskLevel,
    tags,
    sources: article.sources?.map((s) => ({ ...s })) || [],
    internalLinks,
    affiliateIntent,
    affiliateCategories,
    faq: article.faq?.map((f) => ({ ...f })) || [],
    socialHooks,
    imageMetadata: context.imageMetadata ? { ...context.imageMetadata } : undefined,
    publicationMetadata: {
      targetDate,
      version: 1,
      author,
    },
    qualitySummary: {
      overallScore: review?.overallScore ?? 0,
      safetyScore: review?.dimensions?.safety?.score ?? 0,
      factualityScore: review?.dimensions?.factuality?.score ?? 0,
      reviewedAt: review?.metadata?.reviewedAt || new Date().toISOString(),
      reviewer: review?.reviewer || 'unknown',
      decision: review?.decision || 'PASS',
    },
  };
}
