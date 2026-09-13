import type { EditorialTopic, PillarSlug } from '../editorial/types.ts';
import type { SocialOpportunity, SocialPlatform } from './types.ts';
import type { ISocialHistoryRepository } from './storage/repository.ts';
import type { IContentRepository } from '../editorial/storage/types.ts';

export interface SocialSelectionOptions {
  maxOpportunities?: number; // default 3
  minScoreThreshold?: number; // default 80
  historyRepository?: ISocialHistoryRepository;
  baseUrl?: string;
  categoryFilter?: PillarSlug[];
  contentRepository?: IContentRepository;
  contentRoot?: string;
  publishedOnly?: boolean; // default true in production
}

/**
 * Calculates a composite social ranking score for a candidate topic.
 */
export function calculateSocialScore(topic: EditorialTopic): number {
  const socialPot = topic.scoring?.socialPotential ?? 70;
  const pinPot = topic.scoring?.pinterestPotential ?? 70;
  const totalScore = topic.totalScore ?? 80;
  const freshness = topic.freshnessScore ?? 80;

  return Math.round(
    socialPot * 0.35 +
    pinPot * 0.25 +
    totalScore * 0.25 +
    freshness * 0.15
  );
}

/**
 * Determines target platforms based on topic scoring strengths.
 */
export function determineTargetPlatforms(topic: EditorialTopic): SocialPlatform[] {
  const platforms: SocialPlatform[] = [];
  const pinScore = topic.scoring?.pinterestPotential ?? 0;
  const socialScore = topic.scoring?.socialPotential ?? 0;

  // Visual/Design heavy topics naturally excel on Pinterest and Instagram
  if (pinScore >= 70 || topic.pillar === 'discover' || topic.pillar === 'travel' || topic.pillar === 'life') {
    platforms.push('pinterest');
  }

  // High discussion / community engagement works great on Facebook & Instagram
  if (socialScore >= 65 || platforms.length === 0) {
    platforms.push('instagram');
    platforms.push('facebook');
  }

  // Ensure unique list
  return Array.from(new Set(platforms));
}

/**
 * Deterministically selects the top social opportunities from published articles.
 */
export async function selectSocialOpportunities(
  candidates: EditorialTopic[],
  options: SocialSelectionOptions = {}
): Promise<SocialOpportunity[]> {
  const max = options.maxOpportunities ?? 3;
  const minScore = options.minScoreThreshold ?? 80;
  const baseUrl = (options.baseUrl || 'https://lifemode.life').replace(/\/+$/, '');
  const historyRepo = options.historyRepository;
  const publishedOnly = options.publishedOnly ?? false;

  // 1. Filter eligible candidates/articles
  const eligible: Array<{
    topic: EditorialTopic;
    socialScore: number;
    activePlatforms: SocialPlatform[];
  }> = [];

  for (const topic of candidates) {
    // Quality Gate: Total score must meet or exceed minimum threshold (if scoring exists)
    const effectiveTotalScore = topic.totalScore ?? 80;
    if (effectiveTotalScore < minScore) continue;

    // In published-only mode, only consider topics that are actually published
    if (publishedOnly && topic.status !== 'PUBLISHED') {
      continue;
    }

    // Must not be rejected or archived
    if (topic.status === 'REJECTED' || topic.priorityTier === 'REJECT') continue;

    // Must be classified as ARTICLE_AND_SOCIAL, SOCIAL_ONLY, or high-scoring ARTICLE
    if (
      topic.opportunityType &&
      topic.opportunityType !== 'ARTICLE_AND_SOCIAL' &&
      topic.opportunityType !== 'SOCIAL_ONLY' &&
      topic.opportunityType !== 'ARTICLE'
    ) {
      continue;
    }

    if (topic.opportunityType === 'ARTICLE' && (topic.scoring?.socialPotential ?? 0) < 75 && (topic.scoring?.pinterestPotential ?? 0) < 75) {
      continue;
    }

    // Filter by pillar if specified
    if (options.categoryFilter && options.categoryFilter.length > 0) {
      if (!options.categoryFilter.includes(topic.pillar)) continue;
    }

    // Determine target platforms based on scoring & strengths
    const allPlatforms = determineTargetPlatforms(topic);
    let activePlatforms = [...allPlatforms];

    // Check per-platform publication history: only target unfulfilled platforms
    if (historyRepo) {
      const remainingPlatforms: SocialPlatform[] = [];
      for (const p of allPlatforms) {
        const isPublished = await historyRepo.isPlatformPublished(topic.id, p);
        if (!isPublished) {
          remainingPlatforms.push(p);
        }
      }

      // If all target platforms have already been successfully published for this article, skip
      if (remainingPlatforms.length === 0) {
        continue;
      }

      // If recently published and no remaining platforms, skip
      const recentlyPublished = await historyRepo.isTopicRecentlyPublished(topic.id, 14);
      if (recentlyPublished && remainingPlatforms.length === 0) {
        continue;
      }

      activePlatforms = remainingPlatforms;
    }

    const socialScore = calculateSocialScore(topic);
    eligible.push({ topic, socialScore, activePlatforms });
  }

  // 2. Sort by composite social score descending
  eligible.sort((a, b) => b.socialScore - a.socialScore);

  // 3. Apply pillar diversity balancing
  const selected: SocialOpportunity[] = [];
  const pillarCounts: Partial<Record<PillarSlug, number>> = {};

  for (const item of eligible) {
    if (selected.length >= max) break;

    const topic = item.topic;
    const currentPillarCount = pillarCounts[topic.pillar] || 0;

    // Avoid dominating with more than 1 per pillar unless candidate pool is small
    if (currentPillarCount >= 1 && selected.length + (eligible.length - selected.length) > max && eligible.length >= max * 2) {
      continue;
    }

    const destinationUrl = `${baseUrl}/${topic.pillar}/${topic.slug}`;

    selected.push({
      topicId: topic.id,
      canonicalTopic: topic.canonicalTopic,
      pillar: topic.pillar,
      slug: topic.slug,
      totalScore: topic.totalScore ?? 80,
      socialPotential: topic.scoring?.socialPotential ?? 80,
      pinterestPotential: topic.scoring?.pinterestPotential ?? 80,
      opportunityType: topic.opportunityType || 'ARTICLE_AND_SOCIAL',
      targetPlatforms: item.activePlatforms,
      destinationUrl,
      evidence: topic.evidence?.map((e) => ({
        title: e.title,
        url: e.url,
        publisher: e.publisher,
      })),
      tags: topic.tags || [topic.pillar, 'lifestyle'],
      articleTitle: (topic as any).articleTitle || topic.canonicalTopic,
      articleDescription: (topic as any).articleDescription,
      publishedAt: (topic as any).publishedAt || topic.updatedAt,
      articleImage: (topic as any).articleImage,
    });

    pillarCounts[topic.pillar] = (pillarCounts[topic.pillar] || 0) + 1;
  }

  // If diversity pass fell short of max, fill with remaining highest-scoring eligible items
  if (selected.length < max && eligible.length > selected.length) {
    for (const item of eligible) {
      if (selected.length >= max) break;
      if (selected.some((s) => s.topicId === item.topic.id)) continue;

      const topic = item.topic;
      const destinationUrl = `${baseUrl}/${topic.pillar}/${topic.slug}`;

      selected.push({
        topicId: topic.id,
        canonicalTopic: topic.canonicalTopic,
        pillar: topic.pillar,
        slug: topic.slug,
        totalScore: topic.totalScore ?? 80,
        socialPotential: topic.scoring?.socialPotential ?? 80,
        pinterestPotential: topic.scoring?.pinterestPotential ?? 80,
        opportunityType: topic.opportunityType || 'ARTICLE_AND_SOCIAL',
        targetPlatforms: item.activePlatforms,
        destinationUrl,
        evidence: topic.evidence?.map((e) => ({
          title: e.title,
          url: e.url,
          publisher: e.publisher,
        })),
        tags: topic.tags || [topic.pillar, 'lifestyle'],
        articleTitle: (topic as any).articleTitle || topic.canonicalTopic,
        articleDescription: (topic as any).articleDescription,
        publishedAt: (topic as any).publishedAt || topic.updatedAt,
        articleImage: (topic as any).articleImage,
      });
    }
  }

  return selected;
}

