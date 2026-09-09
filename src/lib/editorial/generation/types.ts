import type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel } from '../types.ts';

export type { PillarSlug, ArticleFormat, SearchIntent, RiskLevel };

/**
 * Standard structured request payload provided to an AI Generation Provider.
 */
export interface GenerationRequest {
  topicId: string;
  titleAngle: string;
  pillar: PillarSlug;
  format: ArticleFormat;
  audience: string;
  primaryIntent: SearchIntent;
  secondaryIntent?: string;
  searchTargets: {
    primaryKeyword: string;
    secondaryKeywords?: string[];
    targetSearchVolumeTier?: 'low' | 'medium' | 'high' | 'breakout';
  };
  pinterestAngle?: {
    visualTheme?: string;
    pinTitleAngle?: string;
    pinDescriptionAngle?: string;
    aestheticKeywords?: string[];
  };
  socialAngle?: {
    hookAngle?: string;
    keyTakeaways?: string[];
  };
  affiliateIntent: boolean;
  affiliateCategories?: string[];
  riskLevel: RiskLevel;
  requiredSources?: Array<{
    name: string;
    url?: string;
    citationType?: 'authority' | 'study' | 'official' | 'benchmark' | string;
  }>;
  evidence?: import('../research/types.ts').EvidenceItem[];
  internalLinks?: string[];
  contentInstructions?: string;
  estimatedWordCount?: {
    min?: number;
    target?: number;
    max?: number;
  };
  outlineSections?: Array<{
    heading: string;
    keyPoints?: string[];
  }>;
  revisionContext?: GenerationRevisionContext;
}

/**
 * Context provided to an AI Generation Provider when revising an existing draft.
 */
export interface GenerationRevisionContext {
  originalArticle: GeneratedArticle;
  reviewResult: {
    decision: string;
    overallScore: number;
    dimensions?: Record<string, { score: number; rationale: string; issues?: string[] }>;
    criticalIssues?: string[];
    warnings?: string[];
    gatePassed?: boolean;
  };
  revisionAttempt: number;
}

/**
 * Structured FAQ entry within a generated article package.
 */
export interface GeneratedFAQItem {
  question: string;
  answer: string;
}

/**
 * Structured external source citation.
 */
export interface GeneratedSourceItem {
  name: string;
  url: string;
}

/**
 * Complete structured article package produced by a generation provider.
 */
export interface GeneratedArticle {
  title: string;
  slug: string;
  description: string;
  excerpt: string;
  content: string; // Markdown body
  faq: GeneratedFAQItem[];
  sources: GeneratedSourceItem[];
  internalLinks: string[];
  affiliateIntents: string[];
  socialHooks: string[];
}

/**
 * Telemetry and execution metadata from the generation run.
 */
export interface GenerationMetadata {
  provider: string;
  model: string;
  generatedAt: string; // ISO 8601
  inputTokenEstimate: number;
  outputTokenEstimate: number;
  durationMs: number;
}

/**
 * Issue flagged during deterministic generation validation.
 */
export interface GenerationValidationIssue {
  field: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Complete validation report for generated content.
 */
export interface GenerationValidationReport {
  isValid: boolean;
  score: number; // 0-100
  issues: GenerationValidationIssue[];
  wordCount: number;
  headingsCount: number;
  validatedAt: string;
}

/**
 * Discriminated union result returned by the generation pipeline runner.
 */
export type GenerationResult =
  | {
      success: true;
      article: GeneratedArticle;
      metadata: GenerationMetadata;
      validation: GenerationValidationReport;
    }
  | {
      success: false;
      errorCode:
        | 'INVALID_REQUEST'
        | 'PROVIDER_ERROR'
        | 'VALIDATION_FAILED'
        | 'UNEXPECTED_ERROR';
      errorMessage: string;
      provider?: string;
      validation?: GenerationValidationReport;
    };
