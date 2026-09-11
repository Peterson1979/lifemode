import type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel } from '../types.ts';
import type { GeneratedArticle } from '../generation/types.ts';
import type { ReviewResult, ReviewDecision } from '../review/types.ts';

export type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel, GeneratedArticle, ReviewResult, ReviewDecision };

/**
 * Status lifecycle of a publishing operation.
 */
export type PublishingStatus = 'READY' | 'BLOCKED' | 'PUBLISHED' | 'FAILED' | 'SKIPPED';

/**
 * Canonical normalized publish package representing the article to be published.
 */
export interface PublishPackage {
  id: string; // Unique publication identifier (e.g. `pub-${topicId}-${slug}`)
  topicId: string;
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  content: string; // Full Markdown content
  pillar: PillarSlug;
  format: ArticleFormat;
  audience: string;
  primaryIntent: SearchIntent;
  secondaryIntent?: string;
  riskLevel: RiskLevel;
  tags: string[];
  sources: Array<{
    name: string;
    url?: string;
  }>;
  internalLinks: string[];
  affiliateIntent: boolean;
  affiliateCategories?: string[];
  faq: Array<{
    question: string;
    answer: string;
  }>;
  socialHooks: string[];
  imageMetadata?: {
    url?: string;
    alt?: string;
    prompt?: string;
    source?: string;
    visualTheme?: string;
    recommendedAspectRatio?: string;
  };
  publicationMetadata: {
    targetDate: string; // ISO 8601
    version: number;
    author: string;
  };
  qualitySummary: {
    overallScore: number;
    safetyScore: number;
    factualityScore: number;
    reviewedAt: string;
    reviewer: string;
    decision: ReviewDecision;
  };
}

/**
 * Editorial context provided alongside the generated article for publishing.
 */
export interface PublishingContext {
  topicId: string;
  pillar: PillarSlug;
  format: ArticleFormat;
  audience: string;
  primaryIntent: SearchIntent;
  secondaryIntent?: string;
  riskLevel: RiskLevel;
  affiliateIntent?: boolean;
  affiliateCategories?: string[];
  tags?: string[];
  imageMetadata?: {
    url?: string;
    alt?: string;
    prompt?: string;
    source?: string;
    visualTheme?: string;
    recommendedAspectRatio?: string;
  };
  estimatedWordCount?: {
    min: number;
    target: number;
    max: number;
  };
  isAlreadyPublished?: boolean;
}

/**
 * Configuration thresholds for the publishing eligibility gate.
 */
export interface PublishingGateThresholds {
  minOverallScore: number; // default: 85
  minSafetyScore: number; // default: 85
  minFactualityScore: number; // default: 85
  requirePassDecision: boolean; // default: true
  disallowUnresolvedPlaceholders: boolean; // default: true
}

/**
 * Options passed to the publishing runner.
 */
export interface PublishingOptions {
  dryRun?: boolean; // default: true
  author?: string;
  targetDate?: string;
  customThresholds?: Partial<PublishingGateThresholds>;
}

/**
 * Request payload passed into the publishing gate and runner.
 */
export interface PublishingRequest {
  article: GeneratedArticle;
  review: ReviewResult;
  context: PublishingContext;
  options?: PublishingOptions;
}

/**
 * Structured evaluation result from the publishing eligibility gate.
 */
export interface PublishingGateResult {
  eligible: boolean;
  reasons: string[];
  warnings: string[];
  evaluatedAt: string;
}

/**
 * Stable error codes for publishing pipeline issues.
 */
export type PublishingErrorCode =
  | 'GATE_BLOCKED'
  | 'INVALID_PACKAGE'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REJECTED'
  | 'DUPLICATE_PUBLICATION'
  | 'UNEXPECTED_FAILURE';

import type { OrchestrationResult } from '../images/orchestrator.ts';

/**
 * Complete structured result from a publishing execution.
 */
export interface PublishingResult {
  status: PublishingStatus;
  publicationId?: string;
  slug?: string;
  dryRun: boolean;
  provider: string;
  publishedAt?: string;
  publishPackage?: PublishPackage;
  gateResult: PublishingGateResult;
  imageResult?: OrchestrationResult;
  error?: {
    code: PublishingErrorCode;
    message: string;
  };
  metadata?: Record<string, any>;
}
