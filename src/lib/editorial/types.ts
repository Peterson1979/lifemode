import type { PillarSlug } from '../../config/site.ts';

export type { PillarSlug };

/**
 * Editorial format classification.
 */
export type ArticleFormat =
  | 'standard'
  | 'guide'
  | 'listicle'
  | 'deep-dive'
  | 'dispatch'
  | 'curation';

/**
 * Primary user search / content intent.
 */
export type SearchIntent =
  | 'informational'
  | 'commercial'
  | 'navigational'
  | 'transactional'
  | 'inspirational';

/**
 * Risk classification for sensitive topics (health, finance, compliance).
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Opportunity classification determined by editorial scoring.
 */
export type OpportunityType =
  | 'ARTICLE'
  | 'SOCIAL_ONLY'
  | 'ARTICLE_AND_SOCIAL'
  | 'SEASONAL_ARTICLE'
  | 'UPDATE_EXISTING'
  | 'REJECT'
  | 'DEFER';

/**
 * Priority tier based on total weighted editorial score.
 */
export type PriorityTier =
  | 'REJECT' // 0–59
  | 'LOW_PRIORITY' // 60–79
  | 'CANDIDATE' // 80–87
  | 'PRIORITY' // 88–92
  | 'IMMEDIATE_OPPORTUNITY'; // 93–100

/**
 * Lifecycle status of an editorial topic.
 */
export type TopicStatus =
  | 'DISCOVERED'
  | 'NORMALIZED'
  | 'SCORED'
  | 'CANDIDATE'
  | 'APPROVED'
  | 'REJECTED'
  | 'DEFERRED'
  | 'BRIEF_READY'
  | 'IN_PRODUCTION'
  | 'PUBLISHED'
  | 'ARCHIVED';

/**
 * Supported signal source types.
 */
export type SignalSourceType =
  | 'PINTEREST_TRENDS'
  | 'GOOGLE_TRENDS'
  | 'GOOGLE_SEARCH_CONSOLE'
  | 'BING_WEBMASTER'
  | 'REDDIT_SOCIAL'
  | 'YOUTUBE_TRENDS'
  | 'SEASONAL_CALENDAR'
  | 'INTERNAL_ANALYTICS';

/**
 * Normalized external signal attached to a topic.
 */
export interface SourceSignal {
  source: SignalSourceType;
  sourceId?: string;
  query: string;
  volumeOrGrowth?: number;
  recordedAt: string;
  metadata?: Record<string, any>;
}

/**
 * 8 Core Scoring Dimensions (Each 0–100).
 * Total weights must sum exactly to 1.00 (100%).
 */
export interface TopicScoringDimensions {
  searchPotential: number; // 20% (0.20)
  pinterestPotential: number; // 15% (0.15)
  socialPotential: number; // 15% (0.15)
  lifeModeRelevance: number; // 15% (0.15)
  commercialPotential: number; // 10% (0.10)
  freshness: number; // 10% (0.10)
  competitionOpportunity: number; // 5%  (0.05)
  originalityPotential: number; // 10% (0.10)
}

/**
 * 5 Pinterest Scoring Dimensions (Each 0–100).
 * Total weights must sum exactly to 1.00 (100%).
 */
export interface PinterestScoringDimensions {
  trendGrowth: number; // 30% (0.30)
  searchRelevance: number; // 20% (0.20)
  seasonalRelevance: number; // 15% (0.15)
  visualPotential: number; // 20% (0.20)
  categoryFit: number; // 15% (0.15)
}

/**
 * Normalized, scored LifeMode editorial topic entity.
 */
export interface EditorialTopic {
  id: string;
  canonicalTopic: string;
  slug: string;
  pillar: PillarSlug;
  sourceSignals: SourceSignal[];
  queryVariants: string[];
  scoring: TopicScoringDimensions;
  totalScore: number;
  pinterestScore?: number;
  priorityTier: PriorityTier;
  opportunityType: OpportunityType;
  status: TopicStatus;
  freshnessScore: number;
  createdAt: string;
  updatedAt: string;
  targetAudience?: string;
  primaryIntent?: SearchIntent;
  secondaryIntent?: string;
  rejectionReason?: string;
  deferReason?: string;
  tags: string[];
}

/**
 * Content Brief structure produced from an approved topic.
 */
export interface ContentBrief {
  topicId: string;
  titleAngle: string;
  slug: string;
  pillar: PillarSlug;
  format: ArticleFormat;
  primaryIntent: SearchIntent;
  secondaryIntent?: string;
  audience: string;
  searchTargets: {
    primaryKeyword: string;
    secondaryKeywords: string[];
    targetSearchVolumeTier?: 'low' | 'medium' | 'high' | 'breakout';
  };
  pinterestAngle: {
    visualTheme: string;
    pinTitleAngle: string;
    pinDescriptionAngle: string;
    aestheticKeywords: string[];
  };
  socialAngle: {
    hookAngle: string;
    keyTakeaways: string[];
  };
  affiliateOpportunities: {
    hasAffiliateIntent: boolean;
    productCategories: string[];
    suggestedPlacements: string[];
  };
  internalLinkTargets: string[];
  requiredSources: Array<{
    name: string;
    url?: string;
    citationType: 'authority' | 'study' | 'official' | 'benchmark';
  }>;
  riskLevel: RiskLevel;
  estimatedWordCount: {
    min: number;
    target: number;
    max: number;
  };
  outlineSections: Array<{
    heading: string;
    keyPoints: string[];
  }>;
  createdAt: string;
}

/**
 * Deterministic quality and validation states for article generation.
 */
export type QualityState =
  | 'GENERATED'
  | 'DETERMINISTIC_VALIDATION'
  | 'AI_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'DEFERRED'
  | 'GENERATION_FAILED';

/**
 * Quality validation issue item.
 */
export interface QualityValidationIssue {
  field: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Quality validation result.
 */
export interface QualityValidationResult {
  passed: boolean;
  state: QualityState;
  score: number; // 0-100
  issues: QualityValidationIssue[];
  validatedAt: string;
}

/**
 * Editorial Memory structure for historical performance feedback.
 */
export interface EditorialMemory {
  successfulTopics: Array<{
    topicId: string;
    canonicalTopic: string;
    pillar: PillarSlug;
    performanceScore: number;
    recordedAt: string;
  }>;
  underperformingTopics: Array<{
    topicId: string;
    canonicalTopic: string;
    pillar: PillarSlug;
    performanceScore: number;
    reason?: string;
    recordedAt: string;
  }>;
  successfulFormats: Record<ArticleFormat, number>;
  underperformingFormats: Record<ArticleFormat, number>;
  highPerformingPinterestThemes: string[];
  affiliateWinners: string[];
  contentGaps: Array<{
    pillar: PillarSlug;
    theme: string;
    urgency: 'low' | 'medium' | 'high';
    identifiedAt: string;
  }>;
  lastUpdated: string;
}
