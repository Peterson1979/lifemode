import type { PillarSlug, ArticleFormat, SearchIntent, CommercialIntentType, EditorialTopic } from '../types.ts';
import type {
  ArticlePerformanceRecord,
  FeedbackSignalSummary,
  CategoryPerformanceStat,
  TopicPerformanceFeedback,
} from './types.ts';
import { calculatePerformanceScore } from './scoring.ts';

export interface FeedbackAggregationOptions {
  minSampleSize?: number; // Minimum sample size for pillar/format/intent (default: 3)
  minTagSampleSize?: number; // Minimum sample size for tags (default: 2)
  highPerformanceThreshold?: number; // Score to be considered high-performing (default: 75)
  lowPerformanceThreshold?: number; // Score to be considered low-performing (default: 45)
  maxPositiveModifier?: number; // Maximum positive score boost (default: 10)
  maxNegativeModifier?: number; // Maximum negative score penalty (default: -8)
}

const DEFAULT_OPTIONS: Required<FeedbackAggregationOptions> = {
  minSampleSize: 3,
  minTagSampleSize: 2,
  highPerformanceThreshold: 75,
  lowPerformanceThreshold: 45,
  maxPositiveModifier: 10,
  maxNegativeModifier: -8,
};

/**
 * Calculates average and status for a list of performance scores.
 */
function computeCategoryStat(
  scores: number[],
  minSampleSize: number,
  highThreshold: number,
  lowThreshold: number
): CategoryPerformanceStat {
  const sampleSize = scores.length;
  if (sampleSize < minSampleSize) {
    const avg = sampleSize > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / sampleSize) : 50;
    return {
      sampleSize,
      averageScore: avg,
      status: 'INSUFFICIENT_DATA',
    };
  }

  const sum = scores.reduce((a, b) => a + b, 0);
  const averageScore = Math.round((sum / sampleSize) * 10) / 10;

  // Compute standard deviation
  const variance = scores.reduce((sq, n) => sq + Math.pow(n - averageScore, 2), 0) / sampleSize;
  const scoreStdDev = Math.round(Math.sqrt(variance) * 10) / 10;

  let status: CategoryPerformanceStat['status'] = 'AVERAGE';
  if (averageScore >= highThreshold) {
    status = 'HIGH_PERFORMING';
  } else if (averageScore <= lowThreshold) {
    status = 'LOW_PERFORMING';
  }

  return {
    sampleSize,
    averageScore,
    scoreStdDev,
    status,
  };
}

/**
 * Aggregates article performance records into structured editorial feedback signals.
 */
export function aggregateFeedbackSignals(
  records: ArticlePerformanceRecord[],
  options: FeedbackAggregationOptions = {}
): FeedbackSignalSummary {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const generatedAt = new Date().toISOString();

  const pillarScores: Partial<Record<PillarSlug, number[]>> = {};
  const formatScores: Partial<Record<ArticleFormat, number[]>> = {};
  const intentScores: Partial<Record<SearchIntent, number[]>> = {};
  const affiliateScores: Partial<Record<CommercialIntentType, number[]>> = {};
  const tagScores: Record<string, number[]> = {};

  const topicPerformances: Array<{ slug: string; score: number }> = [];

  for (const record of records) {
    const breakdown = calculatePerformanceScore(record.metrics);
    const score = breakdown.overallScore;

    topicPerformances.push({ slug: record.articleSlug, score });

    // Pillar
    if (record.pillar) {
      pillarScores[record.pillar] = pillarScores[record.pillar] || [];
      pillarScores[record.pillar]!.push(score);
    }

    // Format
    if (record.format) {
      formatScores[record.format] = formatScores[record.format] || [];
      formatScores[record.format]!.push(score);
    }

    // Primary intent
    if (record.primaryIntent) {
      intentScores[record.primaryIntent] = intentScores[record.primaryIntent] || [];
      intentScores[record.primaryIntent]!.push(score);
    }

    // Commercial intent
    if (record.affiliateIntent) {
      affiliateScores[record.affiliateIntent] = affiliateScores[record.affiliateIntent] || [];
      affiliateScores[record.affiliateIntent]!.push(score);
    }

    // Tags
    if (Array.isArray(record.tags)) {
      for (const tag of record.tags) {
        const clean = tag.toLowerCase().trim();
        if (clean) {
          tagScores[clean] = tagScores[clean] || [];
          tagScores[clean].push(score);
        }
      }
    }
  }

  // Build category stats
  const byPillar: FeedbackSignalSummary['byPillar'] = {};
  for (const [pillar, scores] of Object.entries(pillarScores)) {
    byPillar[pillar as PillarSlug] = computeCategoryStat(
      scores,
      opts.minSampleSize,
      opts.highPerformanceThreshold,
      opts.lowPerformanceThreshold
    );
  }

  const byFormat: FeedbackSignalSummary['byFormat'] = {};
  for (const [format, scores] of Object.entries(formatScores)) {
    byFormat[format as ArticleFormat] = computeCategoryStat(
      scores,
      opts.minSampleSize,
      opts.highPerformanceThreshold,
      opts.lowPerformanceThreshold
    );
  }

  const byIntent: FeedbackSignalSummary['byIntent'] = {};
  for (const [intent, scores] of Object.entries(intentScores)) {
    byIntent[intent as SearchIntent] = computeCategoryStat(
      scores,
      opts.minSampleSize,
      opts.highPerformanceThreshold,
      opts.lowPerformanceThreshold
    );
  }

  const byAffiliateIntent: FeedbackSignalSummary['byAffiliateIntent'] = {};
  for (const [affIntent, scores] of Object.entries(affiliateScores)) {
    byAffiliateIntent[affIntent as CommercialIntentType] = computeCategoryStat(
      scores,
      opts.minSampleSize,
      opts.highPerformanceThreshold,
      opts.lowPerformanceThreshold
    );
  }

  const byTag: FeedbackSignalSummary['byTag'] = {};
  for (const [tag, scores] of Object.entries(tagScores)) {
    byTag[tag] = computeCategoryStat(
      scores,
      opts.minTagSampleSize,
      opts.highPerformanceThreshold,
      opts.lowPerformanceThreshold
    );
  }

  const topPerformingTopics = topicPerformances
    .filter((t) => t.score >= opts.highPerformanceThreshold)
    .map((t) => t.slug);

  const lowPerformingTopics = topicPerformances
    .filter((t) => t.score <= opts.lowPerformanceThreshold)
    .map((t) => t.slug);

  return {
    generatedAt,
    totalRecordsAnalyzed: records.length,
    byPillar,
    byFormat,
    byIntent,
    byAffiliateIntent,
    byTag,
    topPerformingTopics,
    lowPerformingTopics,
  };
}

/**
 * Evaluates a candidate topic against feedback signals to produce a bounded ranking score modifier.
 */
export function evaluateTopicPerformanceFeedback(
  topic: EditorialTopic,
  summary: FeedbackSignalSummary,
  options: FeedbackAggregationOptions = {}
): TopicPerformanceFeedback {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let rawAdjustment = 0;
  const reasons: string[] = [];
  const appliedSignals: TopicPerformanceFeedback['appliedSignals'] = {};

  // 1. Pillar Feedback (up to +/- 4 pts)
  const pillarStat = summary.byPillar[topic.pillar];
  if (pillarStat && pillarStat.status !== 'INSUFFICIENT_DATA') {
    appliedSignals.pillarStat = pillarStat;
    if (pillarStat.status === 'HIGH_PERFORMING') {
      const boost = Math.min(4, Math.round((pillarStat.averageScore - 70) * 0.2));
      rawAdjustment += boost;
      reasons.push(`Pillar '${topic.pillar}' is high-performing (avg ${pillarStat.averageScore}/100, n=${pillarStat.sampleSize}): +${boost}`);
    } else if (pillarStat.status === 'LOW_PERFORMING') {
      const penalty = Math.max(-4, Math.round((pillarStat.averageScore - 50) * 0.2));
      rawAdjustment += penalty;
      reasons.push(`Pillar '${topic.pillar}' is under-performing (avg ${pillarStat.averageScore}/100, n=${pillarStat.sampleSize}): ${penalty}`);
    }
  }

  // 2. Intent Feedback (up to +/- 3 pts)
  if (topic.primaryIntent) {
    const intentStat = summary.byIntent[topic.primaryIntent];
    if (intentStat && intentStat.status !== 'INSUFFICIENT_DATA') {
      appliedSignals.intentStat = intentStat;
      if (intentStat.status === 'HIGH_PERFORMING') {
        const boost = Math.min(3, Math.round((intentStat.averageScore - 70) * 0.15));
        rawAdjustment += boost;
        reasons.push(`Intent '${topic.primaryIntent}' is high-performing (avg ${intentStat.averageScore}/100, n=${intentStat.sampleSize}): +${boost}`);
      } else if (intentStat.status === 'LOW_PERFORMING') {
        const penalty = Math.max(-3, Math.round((intentStat.averageScore - 50) * 0.15));
        rawAdjustment += penalty;
        reasons.push(`Intent '${topic.primaryIntent}' is under-performing (avg ${intentStat.averageScore}/100, n=${intentStat.sampleSize}): ${penalty}`);
      }
    }
  }

  // 3. Tag / Topical Cluster Feedback (up to +/- 3 pts)
  if (Array.isArray(topic.tags) && topic.tags.length > 0) {
    const tagStatsList: Array<{ tag: string; stat: CategoryPerformanceStat }> = [];
    for (const tag of topic.tags) {
      const clean = tag.toLowerCase().trim();
      const tagStat = summary.byTag[clean];
      if (tagStat && tagStat.status !== 'INSUFFICIENT_DATA') {
        tagStatsList.push({ tag: clean, stat: tagStat });
        if (tagStat.status === 'HIGH_PERFORMING') {
          const boost = Math.min(2, Math.round((tagStat.averageScore - 70) * 0.1));
          rawAdjustment += boost;
          reasons.push(`Topic tag '${clean}' is high-performing (avg ${tagStat.averageScore}/100, n=${tagStat.sampleSize}): +${boost}`);
        } else if (tagStat.status === 'LOW_PERFORMING') {
          const penalty = Math.max(-2, Math.round((tagStat.averageScore - 50) * 0.1));
          rawAdjustment += penalty;
          reasons.push(`Topic tag '${clean}' is under-performing (avg ${tagStat.averageScore}/100, n=${tagStat.sampleSize}): ${penalty}`);
        }
      }
    }
    if (tagStatsList.length > 0) {
      appliedSignals.tagStats = tagStatsList;
    }
  }

  // Strict clamping of total adjustment
  const scoreAdjustment = Math.max(
    opts.maxNegativeModifier,
    Math.min(opts.maxPositiveModifier, rawAdjustment)
  );

  const totalEvaluated =
    (appliedSignals.pillarStat ? 1 : 0) +
    (appliedSignals.intentStat ? 1 : 0) +
    (appliedSignals.tagStats ? appliedSignals.tagStats.length : 0);

  const confidence = totalEvaluated > 0 ? Math.min(1.0, totalEvaluated * 0.3) : 0;

  if (reasons.length === 0) {
    reasons.push('No significant historical performance feedback for this topic cluster.');
  }

  return {
    scoreAdjustment,
    confidence,
    reasons,
    appliedSignals,
  };
}
