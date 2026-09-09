import type {
  ReviewDecision,
  ReviewDecisionPolicy,
  ReviewDimensionKey,
  ReviewDimensionScore,
  RiskLevel,
} from './types.ts';

export const DEFAULT_REVIEW_POLICY: ReviewDecisionPolicy = {
  passScoreThreshold: 85,
  reviseScoreThreshold: 70,
  minSafetyScoreForPass: 85,
  minFactualityScoreForPass: 85,
  minHighRiskSafetyScore: 85,
  minHighRiskFactualityScore: 85,
};

export interface EvaluateDecisionParams {
  overallScore: number;
  dimensions: Record<ReviewDimensionKey, ReviewDimensionScore>;
  criticalIssues: string[];
  gatePassed: boolean;
  riskLevel: RiskLevel;
  customPolicy?: Partial<ReviewDecisionPolicy>;
}

/**
 * Deterministically computes the editorial review decision based on objective thresholds.
 *
 * Rules:
 * 1. REJECT:
 *    - Failed deterministic review gate
 *    - Presence of any critical issues
 *    - Overall score < 70
 *    - Safety or Factuality score < 70
 *    - High-risk topic with safety or factuality < 85
 *
 * 2. PASS:
 *    - Overall score >= 85
 *    - Zero critical issues
 *    - Deterministic gate passed
 *    - Safety >= 85 and Factuality >= 85
 *
 * 3. REVISE:
 *    - Overall score 70–84 with no blocking safety/factuality failures
 *    - Minor/repairable editorial warnings
 */
export function evaluateReviewDecision(params: EvaluateDecisionParams): ReviewDecision {
  const policy = { ...DEFAULT_REVIEW_POLICY, ...params.customPolicy };
  const { overallScore, dimensions, criticalIssues, gatePassed, riskLevel } = params;

  // Rule 1: Immediate REJECT on failed gates or critical issues
  if (!gatePassed || (criticalIssues && criticalIssues.length > 0)) {
    return 'REJECT';
  }

  const safetyScore = dimensions?.safety?.score ?? 0;
  const factualityScore = dimensions?.factuality?.score ?? 0;

  // Rule 2: High-risk sensitivity threshold enforcement
  if (riskLevel === 'high') {
    if (safetyScore < policy.minHighRiskSafetyScore || factualityScore < policy.minHighRiskFactualityScore) {
      return 'REJECT';
    }
  }

  // Rule 3: General floor for rejection
  if (overallScore < policy.reviseScoreThreshold || safetyScore < 70 || factualityScore < 70) {
    return 'REJECT';
  }

  // Rule 4: Clear PASS criteria
  if (
    overallScore >= policy.passScoreThreshold &&
    safetyScore >= policy.minSafetyScoreForPass &&
    factualityScore >= policy.minFactualityScoreForPass
  ) {
    return 'PASS';
  }

  // Rule 5: Mid-tier REVISE criteria
  return 'REVISE';
}
