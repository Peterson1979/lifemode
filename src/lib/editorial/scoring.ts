import type {
  EditorialTopic,
  OpportunityType,
  PriorityTier,
  TopicScoringDimensions,
} from './types.ts';

/**
 * Editorial scoring weights configuration.
 * Must sum to 1.00.
 */
export const SCORING_WEIGHTS = {
  searchPotential: 0.20,
  pinterestPotential: 0.15,
  socialPotential: 0.15,
  lifeModeRelevance: 0.15,
  commercialPotential: 0.10,
  freshness: 0.10,
  competitionOpportunity: 0.05,
  originalityPotential: 0.10,
} as const;

/**
 * Priority threshold bands.
 */
export const SCORE_THRESHOLDS = {
  REJECT_MAX: 59,
  LOW_PRIORITY_MAX: 79,
  CANDIDATE_MAX: 87,
  PRIORITY_MAX: 92,
  IMMEDIATE_MIN: 93,
} as const;

/**
 * Clamps a score value between 0 and 100.
 */
export function clampScore(value: number): number {
  if (isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Calculates the total weighted score (0–100) from 8 dimensions.
 */
export function calculateTotalScore(dimensions: TopicScoringDimensions): number {
  const weighted =
    clampScore(dimensions.searchPotential) * SCORING_WEIGHTS.searchPotential +
    clampScore(dimensions.pinterestPotential) * SCORING_WEIGHTS.pinterestPotential +
    clampScore(dimensions.socialPotential) * SCORING_WEIGHTS.socialPotential +
    clampScore(dimensions.lifeModeRelevance) * SCORING_WEIGHTS.lifeModeRelevance +
    clampScore(dimensions.commercialPotential) * SCORING_WEIGHTS.commercialPotential +
    clampScore(dimensions.freshness) * SCORING_WEIGHTS.freshness +
    clampScore(dimensions.competitionOpportunity) * SCORING_WEIGHTS.competitionOpportunity +
    clampScore(dimensions.originalityPotential) * SCORING_WEIGHTS.originalityPotential;

  return Math.round(weighted * 10) / 10; // 1 decimal precision
}

/**
 * Classifies a total score into its priority tier.
 */
export function classifyPriorityTier(totalScore: number): PriorityTier {
  const score = clampScore(totalScore);

  if (score <= SCORE_THRESHOLDS.REJECT_MAX) {
    return 'REJECT';
  }
  if (score <= SCORE_THRESHOLDS.LOW_PRIORITY_MAX) {
    return 'LOW_PRIORITY';
  }
  if (score <= SCORE_THRESHOLDS.CANDIDATE_MAX) {
    return 'CANDIDATE';
  }
  if (score <= SCORE_THRESHOLDS.PRIORITY_MAX) {
    return 'PRIORITY';
  }
  return 'IMMEDIATE_OPPORTUNITY';
}

/**
 * Determines the opportunity type based on scoring dimensions and total score.
 */
export function determineOpportunityType(
  dimensions: TopicScoringDimensions,
  totalScore: number
): OpportunityType {
  const tier = classifyPriorityTier(totalScore);

  if (tier === 'REJECT') {
    return 'REJECT';
  }

  const highSearch = dimensions.searchPotential >= 75;
  const highPinterest = dimensions.pinterestPotential >= 75;
  const highSocial = dimensions.socialPotential >= 75;

  // Very high social/pinterest with low search -> Social Only
  if ((highPinterest || highSocial) && dimensions.searchPotential < 45) {
    return 'SOCIAL_ONLY';
  }

  // Strong search & strong visual/social -> Article and Social combo
  if (highSearch && (highPinterest || highSocial)) {
    return 'ARTICLE_AND_SOCIAL';
  }

  // Standard high-scoring content -> Article
  if (totalScore >= 75) {
    return 'ARTICLE';
  }

  return 'DEFER';
}

/**
 * Applies full scoring to a topic.
 */
export function scoreTopicEntity(
  topicData: Omit<
    EditorialTopic,
    'scoring' | 'totalScore' | 'priorityTier' | 'opportunityType' | 'status' | 'updatedAt'
  >,
  dimensions: TopicScoringDimensions
): EditorialTopic {
  const totalScore = calculateTotalScore(dimensions);
  const priorityTier = classifyPriorityTier(totalScore);
  const opportunityType = determineOpportunityType(dimensions, totalScore);

  const status =
    priorityTier === 'REJECT'
      ? 'REJECTED'
      : totalScore >= 80
      ? 'CANDIDATE'
      : 'SCORED';

  return {
    ...topicData,
    scoring: {
      searchPotential: clampScore(dimensions.searchPotential),
      pinterestPotential: clampScore(dimensions.pinterestPotential),
      socialPotential: clampScore(dimensions.socialPotential),
      lifeModeRelevance: clampScore(dimensions.lifeModeRelevance),
      commercialPotential: clampScore(dimensions.commercialPotential),
      freshness: clampScore(dimensions.freshness),
      competitionOpportunity: clampScore(dimensions.competitionOpportunity),
      originalityPotential: clampScore(dimensions.originalityPotential),
    },
    totalScore,
    priorityTier,
    opportunityType,
    status,
    updatedAt: new Date().toISOString(),
  };
}
