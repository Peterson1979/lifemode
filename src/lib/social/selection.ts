import type { EditorialTopic, PillarSlug } from '../editorial/types.ts';
import type { SocialOpportunity, SocialPlatform } from './types.ts';
import type { ISocialHistoryRepository } from './storage/repository.ts';
import type { IContentRepository } from '../editorial/storage/types.ts';

export interface SocialSelectionOptions {
  maxOpportunities?: number; // default 1
  minScoreThreshold?: number; // default 80
  historyRepository?: ISocialHistoryRepository;
  baseUrl?: string;
  categoryFilter?: PillarSlug[];
  contentRepository?: IContentRepository;
  contentRoot?: string;
  publishedOnly?: boolean; // default true in production
  maxFreshnessDays?: number; // default 1 (24 hours)
  referenceDate?: Date | string;
  configuredPlatforms?: SocialPlatform[];
}

export const RESTRICTED_SOCIAL_PILLARS: PillarSlug[] = ['tech-ai', 'money'];
export const RESTRICTED_PILLAR_COOLDOWN_DAYS = 14;

export const HIGH_FREQUENCY_SOCIAL_PILLARS: PillarSlug[] = [
  'style',
  'entertainment',
  'food-drink',
  'travel',
  'wellbeing',
];

/**
 * Calculates a composite social ranking score for a candidate topic.
 */
export function calculateSocialScore(topic: EditorialTopic): number {
  const socialPot = topic.scoring?.socialPotential ?? 70;
  const pinPot = topic.scoring?.pinterestPotential ?? 70;
  const totalScore = topic.totalScore ?? 80;
  const freshness = topic.freshnessScore ?? 80;

  const baseScore =
    socialPot * 0.35 +
    pinPot * 0.25 +
    totalScore * 0.25 +
    freshness * 0.15;

  // Strategic frequency weighting: Style, Entertainment, Food & Drink, Travel, Wellbeing
  const isHighFrequency = HIGH_FREQUENCY_SOCIAL_PILLARS.includes(topic.pillar);
  const multiplier = isHighFrequency ? 1.05 : 1.0;

  return Math.round(baseScore * multiplier);
}

/**
 * Determines target platforms based on topic scoring strengths.
 */
export function determineTargetPlatforms(topic: EditorialTopic): SocialPlatform[] {
  const platforms: SocialPlatform[] = [];
  const pinScore = topic.scoring?.pinterestPotential ?? 0;
  const socialScore = topic.scoring?.socialPotential ?? 0;

  // Visual/Design/Style heavy topics naturally excel on Pinterest and Instagram
  if (pinScore >= 70 || topic.pillar === 'style' || topic.pillar === 'entertainment' || topic.pillar === 'travel' || topic.pillar === 'food-drink') {
    platforms.push('pinterest');
  }

  // High discussion / community engagement works great on Facebook, Instagram, and Threads
  if (socialScore >= 65 || platforms.length === 0) {
    platforms.push('instagram');
    platforms.push('facebook');
    platforms.push('threads');
  } else {
    platforms.push('threads');
  }

  // Ensure unique list
  return Array.from(new Set(platforms));
}

/**
 * Resolves the canonical destination URL for a social opportunity.
 * Uses publicRoute or publicSection when provided (e.g. for discovered Guides)
 * instead of assuming the internal operational pillar is a URL segment.
 */
export function resolveDestinationUrl(
  baseUrl: string,
  topic: {
    pillar: string;
    slug: string;
    publicRoute?: string;
    publicSection?: string;
    destinationUrl?: string;
    isGuide?: boolean;
  }
): string {
  if (topic.destinationUrl) {
    return topic.destinationUrl;
  }
  const routeSegment = topic.publicRoute || topic.publicSection;
  if (routeSegment) {
    const cleanSegment = routeSegment.replace(/^\/+|\/+$/g, '');
    if (cleanSegment.endsWith(topic.slug)) {
      return `${baseUrl}/${cleanSegment}`;
    }
    return `${baseUrl}/${cleanSegment}/${topic.slug}`;
  }
  if (topic.isGuide) {
    return `${baseUrl}/guides/${topic.slug}`;
  }
  return `${baseUrl}/${topic.pillar}/${topic.slug}`;
}

/**
 * Deterministically selects the top social opportunities from published articles.
 *
 * Enforces:
 * 1. Freshness Gate: Only newly published content (< maxFreshnessDays, default 1) is eligible.
 * 2. Idempotency Gate: Excludes platforms that have already been PUBLISHED.
 * 3. Sorting: Prioritizes newly published articles descending, then composite social score.
 * 4. Frequency Limit: Returns at most `maxOpportunities` (default 1).
 */
export async function selectSocialOpportunities(
  candidates: EditorialTopic[],
  options: SocialSelectionOptions = {}
): Promise<SocialOpportunity[]> {
  const max = options.maxOpportunities ?? 1;
  const minScore = options.minScoreThreshold ?? 80;
  const baseUrl = (options.baseUrl || 'https://lifemode.life').replace(/\/+$/, '');
  const historyRepo = options.historyRepository;
  const publishedOnly = options.publishedOnly ?? false;
  const maxFreshnessDays = options.maxFreshnessDays ?? 1;
  const refTime = options.referenceDate ? new Date(options.referenceDate).getTime() : Date.now();

  // 1. Filter eligible candidates/articles
  const eligible: Array<{
    topic: EditorialTopic;
    socialScore: number;
    activePlatforms: SocialPlatform[];
    pubTime: number;
  }> = [];

  for (const topic of candidates) {
    // Quality Gate: Total score must meet or exceed minimum threshold (if scoring exists)
    const effectiveTotalScore = topic.totalScore ?? 80;
    if (effectiveTotalScore < minScore) continue;

    // Filter out inactive / removed pillars
    if ((topic.pillar as string) === 'life') continue;

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

    if (
      topic.opportunityType === 'ARTICLE' &&
      (topic.scoring?.socialPotential ?? 0) < 75 &&
      (topic.scoring?.pinterestPotential ?? 0) < 75
    ) {
      continue;
    }

    // Filter by pillar if specified
    if (options.categoryFilter && options.categoryFilter.length > 0) {
      if (!options.categoryFilter.includes(topic.pillar)) continue;
    }

    // Restricted Topics Cooldown Gate: Tech & AI and Money restricted to max 1 social appearance per rolling 14-day window
    if (RESTRICTED_SOCIAL_PILLARS.includes(topic.pillar)) {
      if (historyRepo && typeof historyRepo.isPillarRecentlyPublished === 'function') {
        const isRestrictedInCooldown = await historyRepo.isPillarRecentlyPublished(
          topic.pillar,
          RESTRICTED_PILLAR_COOLDOWN_DAYS,
          options.referenceDate
        );
        if (isRestrictedInCooldown) {
          continue;
        }
      }
    }

    // Freshness Gate: Validate publication timestamp
    const pubDateStr = (topic as any).publishedAt || topic.createdAt || topic.updatedAt;
    let pubTime = 0;
    if (pubDateStr) {
      const parsedDate = new Date(pubDateStr);
      if (!isNaN(parsedDate.getTime())) {
        pubTime = parsedDate.getTime();
        const ageInDays = (refTime - pubTime) / (1000 * 60 * 60 * 24);
        if (maxFreshnessDays > 0 && (ageInDays > maxFreshnessDays || ageInDays < -1)) {
          // Stale publication outside the freshness window -> exclude
          continue;
        }
      } else if (publishedOnly) {
        continue;
      }
    } else if (publishedOnly) {
      continue;
    }

    // Determine target platforms based on scoring & strengths
    const allPlatforms = determineTargetPlatforms(topic);
    let activePlatforms = [...allPlatforms];
    if (
      options.configuredPlatforms?.includes('pinterest-everyday') &&
      allPlatforms.includes('pinterest') &&
      !activePlatforms.includes('pinterest-everyday')
    ) {
      activePlatforms.push('pinterest-everyday');
    }

    // Check per-platform publication history: only target unfulfilled platforms
    if (historyRepo) {
      const remainingPlatforms: SocialPlatform[] = [];
      for (const p of allPlatforms) {
        // Pinterest may represent two independent configured accounts. Keep
        // the destination that still needs publication instead of letting a
        // successful LifeMode pin suppress Everyday Ideas (or vice versa).
        if (p === 'pinterest' && options.configuredPlatforms?.includes('pinterest-everyday')) {
          const lifeModePublished = await historyRepo.isPlatformPublished(topic.id, 'pinterest');
          const everydayPublished = await historyRepo.isPlatformPublished(topic.id, 'pinterest-everyday');
          if (!lifeModePublished) remainingPlatforms.push('pinterest');
          if (!everydayPublished) remainingPlatforms.push('pinterest-everyday');
          continue;
        }
        const isPublished = await historyRepo.isPlatformPublished(topic.id, p);
        if (!isPublished) {
          remainingPlatforms.push(p);
        }
      }

      // If all target platforms have already been successfully published for this article, skip
      if (remainingPlatforms.length === 0) {
        continue;
      }

      // If configured platforms are specified, ensure at least one remaining platform is configured
      if (options.configuredPlatforms && options.configuredPlatforms.length > 0) {
        const remainingConfigured = remainingPlatforms.filter((p) =>
          options.configuredPlatforms!.includes(p)
        );
        if (remainingConfigured.length === 0) {
          // All configured platforms are already PUBLISHED
          continue;
        }
        activePlatforms = remainingConfigured;
      } else {
        activePlatforms = remainingPlatforms;
      }
    }

    const socialScore = calculateSocialScore(topic);
    eligible.push({ topic, socialScore, activePlatforms, pubTime });
  }

  // 2. Sort by publication freshness descending (newest first), then by composite social score
  eligible.sort((a, b) => {
    const timeDiff = b.pubTime - a.pubTime;
    if (Math.abs(timeDiff) > 1000) {
      return timeDiff;
    }
    return b.socialScore - a.socialScore;
  });

  // 3. Apply selection limit
  const selected: SocialOpportunity[] = [];
  const pillarCounts: Partial<Record<PillarSlug, number>> = {};

  for (const item of eligible) {
    if (selected.length >= max) break;

    const topic = item.topic;
    const currentPillarCount = pillarCounts[topic.pillar] || 0;

    // Restricted pillar limit: maximum 1 appearance per run
    if (RESTRICTED_SOCIAL_PILLARS.includes(topic.pillar) && currentPillarCount >= 1) {
      continue;
    }

    // Avoid dominating with more than 1 per pillar unless candidate pool is small
    if (
      max > 1 &&
      currentPillarCount >= 1 &&
      selected.length + (eligible.length - selected.length) > max &&
      eligible.length >= max * 2
    ) {
      continue;
    }

    const destinationUrl = resolveDestinationUrl(baseUrl, topic as any);

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
      publicRoute: (topic as any).publicRoute,
      publicSection: (topic as any).publicSection,
      isGuide: (topic as any).isGuide,
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
      if (RESTRICTED_SOCIAL_PILLARS.includes(topic.pillar) && (pillarCounts[topic.pillar] || 0) >= 1) {
        continue;
      }
      const destinationUrl = resolveDestinationUrl(baseUrl, topic as any);

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
        publicRoute: (topic as any).publicRoute,
        publicSection: (topic as any).publicSection,
        isGuide: (topic as any).isGuide,
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

