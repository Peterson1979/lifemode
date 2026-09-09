import type { ReviewRequest, ReviewDimensionKey, ReviewDimensionScore, ReviewMetadata } from '../types.ts';

/**
 * Raw output returned from an AI Review Provider implementation.
 */
export interface RawAIReviewResponse {
  overallScore: number;
  dimensions: Record<ReviewDimensionKey, ReviewDimensionScore>;
  criticalIssues: string[];
  warnings: string[];
  metadata?: Partial<ReviewMetadata>;
}

/**
 * Provider-neutral interface for AI Review Providers.
 */
export interface IAIReviewProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Reviews an article draft and outputs raw structured evaluation findings.
   */
  review(request: ReviewRequest): Promise<RawAIReviewResponse>;
}
