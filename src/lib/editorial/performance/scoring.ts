import type { PerformanceMetrics, PerformanceScoreBreakdown } from './types.ts';

/**
 * Standard baseline dimension weights when all metrics are available.
 */
export const PERFORMANCE_METRIC_WEIGHTS: Record<keyof PerformanceMetrics, number> = {
  views: 0.20,
  clicks: 0.15,
  ctr: 0.15,
  engagement: 0.20,
  conversions: 0.15,
  affiliateClicks: 0.10,
  socialInteractions: 0.05,
};

/**
 * Clamps a number between min and max.
 */
export function clamp(val: number, min = 0, max = 100): number {
  if (isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Normalizes page views to a 0–100 score using logarithmic scale centered around a 100-view benchmark.
 */
export function normalizeViews(views: number): number {
  if (views <= 0) return 20;
  // 10 views -> ~35, 100 views -> 50, 1000 views -> 75, 5000 views -> 90, 15000+ views -> 100
  const score = 50 + 25 * Math.log10(views / 100);
  return clamp(Math.round(score));
}

/**
 * Normalizes click volume to a 0–100 score centered around a 20-click benchmark.
 */
export function normalizeClicks(clicks: number): number {
  if (clicks <= 0) return 20;
  // 2 clicks -> ~25, 20 clicks -> 50, 100 clicks -> 75, 500+ clicks -> 95
  const score = 50 + 25 * Math.log10(clicks / 20);
  return clamp(Math.round(score));
}

/**
 * Normalizes click-through rate (CTR) to a 0–100 score.
 * Handles both decimal ratios (e.g. 0.035) and percentage numbers (e.g. 3.5).
 */
export function normalizeCtr(rawCtr: number): number {
  const ctrPct = rawCtr <= 1.0 ? rawCtr * 100 : rawCtr;
  if (ctrPct <= 0) return 20;
  // 1.0% -> ~40, 2.5% -> 55, 5.0% -> 75, 10.0%+ -> 95
  const score = 30 + 15 * Math.log2(Math.max(0.2, ctrPct));
  return clamp(Math.round(score));
}

/**
 * Normalizes reader engagement (scroll depth / duration index 0–100).
 */
export function normalizeEngagement(engagement: number): number {
  return clamp(Math.round(engagement));
}

/**
 * Normalizes reader actions / conversions (e.g. newsletter signups, saves).
 */
export function normalizeConversions(conversions: number): number {
  if (conversions <= 0) return 30;
  // 1 -> 55, 5 -> 75, 20 -> 90, 50+ -> 100
  const score = 55 + 20 * Math.log10(conversions);
  return clamp(Math.round(score));
}

/**
 * Normalizes commercial affiliate click-outs.
 */
export function normalizeAffiliateClicks(affiliateClicks: number): number {
  if (affiliateClicks <= 0) return 30;
  // 1 -> 50, 5 -> 70, 20 -> 85, 50+ -> 95
  const score = 50 + 22 * Math.log10(affiliateClicks);
  return clamp(Math.round(score));
}

/**
 * Normalizes social shares, pins, and external interactions.
 */
export function normalizeSocialInteractions(social: number): number {
  if (social <= 0) return 30;
  // 5 -> 50, 25 -> 70, 100+ -> 90
  const score = 50 + 20 * Math.log10(social / 5);
  return clamp(Math.round(score));
}

/**
 * Calculates a bounded, deterministic performance score from available metrics.
 *
 * Rules:
 * 1. Partial Data: Only present dimensions are evaluated. Missing metrics do NOT penalize the score as 0.
 * 2. Logarithmic Normalization: Protects against viral spikes disproportionately skewing the score.
 * 3. Confidence Factor: Derived from the proportion of measured dimensions.
 */
export function calculatePerformanceScore(metrics: PerformanceMetrics): PerformanceScoreBreakdown {
  const evaluatedDimensions: PerformanceScoreBreakdown['evaluatedDimensions'] = [];
  const reasons: string[] = [];

  if (metrics.views !== undefined && metrics.views >= 0) {
    const norm = normalizeViews(metrics.views);
    evaluatedDimensions.push({
      dimension: 'views',
      rawMetric: metrics.views,
      normalizedScore: norm,
      weight: PERFORMANCE_METRIC_WEIGHTS.views,
    });
    reasons.push(`Views (${metrics.views.toLocaleString()}): score ${norm}/100`);
  }

  if (metrics.clicks !== undefined && metrics.clicks >= 0) {
    const norm = normalizeClicks(metrics.clicks);
    evaluatedDimensions.push({
      dimension: 'clicks',
      rawMetric: metrics.clicks,
      normalizedScore: norm,
      weight: PERFORMANCE_METRIC_WEIGHTS.clicks,
    });
    reasons.push(`Clicks (${metrics.clicks}): score ${norm}/100`);
  }

  if (metrics.ctr !== undefined && metrics.ctr >= 0) {
    const norm = normalizeCtr(metrics.ctr);
    evaluatedDimensions.push({
      dimension: 'ctr',
      rawMetric: metrics.ctr,
      normalizedScore: norm,
      weight: PERFORMANCE_METRIC_WEIGHTS.ctr,
    });
    reasons.push(`CTR (${metrics.ctr <= 1.0 ? (metrics.ctr * 100).toFixed(1) + '%' : metrics.ctr + '%'}): score ${norm}/100`);
  }

  if (metrics.engagement !== undefined && metrics.engagement >= 0) {
    const norm = normalizeEngagement(metrics.engagement);
    evaluatedDimensions.push({
      dimension: 'engagement',
      rawMetric: metrics.engagement,
      normalizedScore: norm,
      weight: PERFORMANCE_METRIC_WEIGHTS.engagement,
    });
    reasons.push(`Engagement index (${metrics.engagement}): score ${norm}/100`);
  }

  if (metrics.conversions !== undefined && metrics.conversions >= 0) {
    const norm = normalizeConversions(metrics.conversions);
    evaluatedDimensions.push({
      dimension: 'conversions',
      rawMetric: metrics.conversions,
      normalizedScore: norm,
      weight: PERFORMANCE_METRIC_WEIGHTS.conversions,
    });
    reasons.push(`Conversions (${metrics.conversions}): score ${norm}/100`);
  }

  if (metrics.affiliateClicks !== undefined && metrics.affiliateClicks >= 0) {
    const norm = normalizeAffiliateClicks(metrics.affiliateClicks);
    evaluatedDimensions.push({
      dimension: 'affiliateClicks',
      rawMetric: metrics.affiliateClicks,
      normalizedScore: norm,
      weight: PERFORMANCE_METRIC_WEIGHTS.affiliateClicks,
    });
    reasons.push(`Affiliate Clicks (${metrics.affiliateClicks}): score ${norm}/100`);
  }

  if (metrics.socialInteractions !== undefined && metrics.socialInteractions >= 0) {
    const norm = normalizeSocialInteractions(metrics.socialInteractions);
    evaluatedDimensions.push({
      dimension: 'socialInteractions',
      rawMetric: metrics.socialInteractions,
      normalizedScore: norm,
      weight: PERFORMANCE_METRIC_WEIGHTS.socialInteractions,
    });
    reasons.push(`Social Interactions (${metrics.socialInteractions}): score ${norm}/100`);
  }

  // If no metrics at all are available, return neutral 50 score with 0 confidence
  if (evaluatedDimensions.length === 0) {
    return {
      overallScore: 50,
      evaluatedDimensions: [],
      confidence: 0,
      reasons: ['No performance metrics recorded yet; neutral baseline applied.'],
    };
  }

  // Sum weights of evaluated dimensions to re-normalize
  const totalWeight = evaluatedDimensions.reduce((sum, d) => sum + d.weight, 0);
  const weightedScore = evaluatedDimensions.reduce(
    (sum, d) => sum + (d.normalizedScore * (d.weight / totalWeight)),
    0
  );

  const overallScore = clamp(Math.round(weightedScore));
  const confidence = Math.round((evaluatedDimensions.length / Object.keys(PERFORMANCE_METRIC_WEIGHTS).length) * 100) / 100;

  return {
    overallScore,
    evaluatedDimensions,
    confidence,
    reasons,
  };
}
