import type { PinterestScoringDimensions } from './types.ts';
import { clampScore } from './scoring.ts';

/**
 * Deterministic Pinterest scoring weights configuration.
 * Sum = 0.30 + 0.20 + 0.15 + 0.20 + 0.15 = 1.00.
 */
export const PINTEREST_WEIGHTS = {
  trendGrowth: 0.30,
  searchRelevance: 0.20,
  seasonalRelevance: 0.15,
  visualPotential: 0.20,
  categoryFit: 0.15,
} as const;

/**
 * Calculates deterministic Pinterest score (0–100).
 */
export function calculatePinterestScore(dimensions: PinterestScoringDimensions): number {
  const weighted =
    clampScore(dimensions.trendGrowth) * PINTEREST_WEIGHTS.trendGrowth +
    clampScore(dimensions.searchRelevance) * PINTEREST_WEIGHTS.searchRelevance +
    clampScore(dimensions.seasonalRelevance) * PINTEREST_WEIGHTS.seasonalRelevance +
    clampScore(dimensions.visualPotential) * PINTEREST_WEIGHTS.visualPotential +
    clampScore(dimensions.categoryFit) * PINTEREST_WEIGHTS.categoryFit;

  return Math.round(weighted * 10) / 10;
}

/**
 * Checks if a topic has high Pinterest distribution potential (score >= 75).
 */
export function isHighPotentialPinterestTopic(score: number): boolean {
  return score >= 75;
}
