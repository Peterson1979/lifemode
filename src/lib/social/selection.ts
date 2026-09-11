import type { EditorialTopic, PillarSlug } from '../editorial/types.ts';
import type { SocialOpportunity, SocialPlatform } from './types.ts';
import type { ISocialHistoryRepository } from './storage/repository.ts';

export interface SocialSelectionOptions {
  maxOpportunities?: number; // default 3
  minScoreThreshold?: number; // default 80
  historyRepository?: ISocialHistoryRepository;
  baseUrl?: string;
  categoryFilter?: PillarSlug[];
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
 * Deterministically selects the top social opportunities from the candidates pool.
 */
export async function selectSocialOpportunities(
  candidates: EditorialTopic[],
  options: SocialSelectionOptions = {}
): Promise<SocialOpportunity[]> {
  const max = options.maxOpportunities ?? 3;
  const minScore = options.minScoreThreshold ?? 80;
  const baseUrl = options.baseUrl || 'https://lifemode.life';
  const historyRepo = options.historyRepository;

  // 1. Filter eligible candidates
  const eligible: Array<{ topic: EditorialTopic; socialScore: number }> = [];

  for (const topic of candidates) {
    // Quality Gate: Total score must meet or exceed minimum threshold
    if (topic.totalScore < minScore) continue;

    // Must be classified as ARTICLE_AND_SOCIAL or SOCIAL_ONLY
    if (
      topic.opportunityType !== 'ARTICLE_AND_SOCIAL' &&
      topic.opportunityType !== 'SOCIAL_ONLY' &&
      topic.opportunityType !== 'ARTICLE' // High-scoring articles can be considered if opportunityType is ARTICLE and social potential is high (>=75)
    ) {
      continue;
    }

    if (topic.opportunityType === 'ARTICLE' && (topic.scoring?.socialPotential ?? 0) < 75 && (topic.scoring?.pinterestPotential ?? 0) < 75) {
      continue;
    }

    // Must not be rejected or archived
    if (topic.status === 'REJECTED' || topic.priorityTier === 'REJECT') continue;

    // Filter by pillar if specified
    if (options.categoryFilter && options.categoryFilter.length > 0) {
      if (!options.categoryFilter.includes(topic.pillar)) continue;
    }

    // Check history: topic must not have been recently published on social
    if (historyRepo) {
      const recentlyPublished = await historyRepo.isTopicRecentlyPublished(topic.id, 14);
      if (recentlyPublished) continue;
    }

    const socialScore = calculateSocialScore(topic);
    eligible.push({ topic, socialScore });
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

    const targetPlatforms = determineTargetPlatforms(topic);
    const destinationUrl = `${baseUrl}/${topic.pillar}/${topic.slug}`;

    selected.push({
      topicId: topic.id,
      canonicalTopic: topic.canonicalTopic,
      pillar: topic.pillar,
      slug: topic.slug,
      totalScore: topic.totalScore,
      socialPotential: topic.scoring.socialPotential,
      pinterestPotential: topic.scoring.pinterestPotential,
      opportunityType: topic.opportunityType,
      targetPlatforms,
      destinationUrl,
      evidence: topic.evidence?.map((e) => ({
        title: e.title,
        url: e.url,
        publisher: e.publisher,
      })),
      tags: topic.tags || [topic.pillar, 'lifestyle'],
    });

    pillarCounts[topic.pillar] = (pillarCounts[topic.pillar] || 0) + 1;
  }

  // If diversity pass fell short of max, fill with remaining highest-scoring eligible items
  if (selected.length < max && eligible.length > selected.length) {
    for (const item of eligible) {
      if (selected.length >= max) break;
      if (selected.some((s) => s.topicId === item.topic.id)) continue;

      const topic = item.topic;
      const targetPlatforms = determineTargetPlatforms(topic);
      const destinationUrl = `${baseUrl}/${topic.pillar}/${topic.slug}`;

      selected.push({
        topicId: topic.id,
        canonicalTopic: topic.canonicalTopic,
        pillar: topic.pillar,
        slug: topic.slug,
        totalScore: topic.totalScore,
        socialPotential: topic.scoring.socialPotential,
        pinterestPotential: topic.scoring.pinterestPotential,
        opportunityType: topic.opportunityType,
        targetPlatforms,
        destinationUrl,
        evidence: topic.evidence?.map((e) => ({
          title: e.title,
          url: e.url,
          publisher: e.publisher,
        })),
        tags: topic.tags || [topic.pillar, 'lifestyle'],
      });
    }
  }

  return selected;
}
