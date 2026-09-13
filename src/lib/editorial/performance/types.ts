import type { PillarSlug, ArticleFormat, SearchIntent, CommercialIntentType } from '../types.ts';

/**
 * Observed engagement, traffic, and conversion metrics for a published article.
 * All metrics are optional to support partial data without assuming 0 for unmeasured channels.
 */
export interface PerformanceMetrics {
  views?: number;
  clicks?: number;
  ctr?: number; // Click-through rate (0.0 to 1.0 or percentage)
  engagement?: number; // Engagement score or average time on page / scroll depth (0 to 100)
  conversions?: number;
  affiliateClicks?: number;
  socialInteractions?: number; // Likes, shares, pins, comments
}

/**
 * Canonical record capturing performance history and editorial metadata for a published article.
 */
export interface ArticlePerformanceRecord {
  articleSlug: string; // e.g. "tech-ai/quantum-computing-breakthrough"
  topicId: string;
  pillar: PillarSlug;
  format?: ArticleFormat;
  publicationDate: string; // ISO 8601 or YYYY-MM-DD
  targetAudience?: string;
  primaryIntent?: SearchIntent;
  affiliateIntent?: CommercialIntentType;
  sourceScore?: number; // Discovery / research evidence score
  editorialScore?: number; // AI review / quality score at publication
  metrics: PerformanceMetrics;
  measuredAt: string; // ISO 8601 timestamp of last measurement
  measurementPeriod?: '7d' | '30d' | '90d' | 'all-time' | string;
  providerId?: string; // Originating provider (e.g. 'manual', 'fixture', 'internal')
  tags?: string[];
}

/**
 * Diagnostic breakdown of a calculated performance score.
 */
export interface PerformanceScoreBreakdown {
  overallScore: number; // Normalized bounded score (0 to 100)
  evaluatedDimensions: Array<{
    dimension: keyof PerformanceMetrics;
    rawMetric: number;
    normalizedScore: number;
    weight: number;
  }>;
  confidence: number; // Confidence level based on data completeness (0.0 to 1.0)
  reasons: string[];
}

/**
 * Aggregated category performance statistics used to derive feedback signals.
 */
export interface CategoryPerformanceStat {
  sampleSize: number;
  averageScore: number;
  scoreStdDev?: number;
  status: 'HIGH_PERFORMING' | 'AVERAGE' | 'LOW_PERFORMING' | 'INSUFFICIENT_DATA';
}

/**
 * Global summary of aggregated editorial feedback signals.
 */
export interface FeedbackSignalSummary {
  generatedAt: string;
  totalRecordsAnalyzed: number;
  byPillar: Partial<Record<PillarSlug, CategoryPerformanceStat>>;
  byFormat: Partial<Record<ArticleFormat, CategoryPerformanceStat>>;
  byIntent: Partial<Record<SearchIntent, CategoryPerformanceStat>>;
  byAffiliateIntent: Partial<Record<CommercialIntentType, CategoryPerformanceStat>>;
  byTag: Record<string, CategoryPerformanceStat>;
  topPerformingTopics: string[]; // Slugs or canonical titles with score > 80 and n >= minSample
  lowPerformingTopics: string[]; // Slugs or canonical titles with score < 40 and n >= minSample
}

/**
 * Performance feedback attached to an individual candidate topic during selection.
 */
export interface TopicPerformanceFeedback {
  scoreAdjustment: number; // Bounded modifier (-10 to +10)
  confidence: number; // Confidence level (0.0 to 1.0)
  reasons: string[];
  appliedSignals: {
    pillarStat?: CategoryPerformanceStat;
    formatStat?: CategoryPerformanceStat;
    intentStat?: CategoryPerformanceStat;
    tagStats?: Array<{ tag: string; stat: CategoryPerformanceStat }>;
  };
}
