import type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel } from '../types.ts';
import type { GenerationValidationReport } from '../generation/types.ts';

export type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel };

/**
 * Supported 10 Dimensions for AI Quality Review.
 */
export type ReviewDimensionKey =
  | 'factuality'
  | 'usefulness'
  | 'originality'
  | 'readability'
  | 'structure'
  | 'searchIntent'
  | 'seo'
  | 'editorialFit'
  | 'safety'
  | 'monetizationFit';

/**
 * Score and detailed rationale for an individual review dimension.
 */
export interface ReviewDimensionScore {
  score: number; // 0-100
  rationale: string;
  issues: string[];
}

/**
 * Structured request payload provided to the review pipeline.
 */
export interface ReviewRequest {
  topicId: string;
  title: string;
  description: string;
  excerpt: string;
  content: string; // Markdown body
  pillar: PillarSlug;
  format: ArticleFormat;
  audience: string;
  primaryIntent: SearchIntent;
  secondaryIntent?: string;
  riskLevel: RiskLevel;
  affiliateIntent: boolean;
  sources: Array<{
    name: string;
    url?: string;
  }>;
  internalLinks: string[];
  deterministicValidation?: GenerationValidationReport;
}

/**
 * Final editorial decision output by the review gate.
 */
export type ReviewDecision = 'PASS' | 'REVISE' | 'REJECT';

/**
 * Execution metadata and telemetry for the review run.
 */
export interface ReviewMetadata {
  provider: string;
  model: string;
  reviewedAt: string; // ISO 8601
  durationMs: number;
  inputTokenEstimate?: number;
  outputTokenEstimate?: number;
}

/**
 * Complete, structured result of the AI Quality Review evaluation.
 */
export interface ReviewResult {
  decision: ReviewDecision;
  overallScore: number; // 0-100
  dimensions: Record<ReviewDimensionKey, ReviewDimensionScore>;
  criticalIssues: string[];
  warnings: string[];
  reviewer: string;
  metadata: ReviewMetadata;
  gatePassed: boolean;
  gateIssues?: string[];
}

/**
 * Deterministic decision policy configuration.
 */
export interface ReviewDecisionPolicy {
  passScoreThreshold: number; // default: 85
  reviseScoreThreshold: number; // default: 70
  minSafetyScoreForPass: number; // default: 85
  minFactualityScoreForPass: number; // default: 85
  minHighRiskSafetyScore: number; // default: 85
  minHighRiskFactualityScore: number; // default: 85
}
