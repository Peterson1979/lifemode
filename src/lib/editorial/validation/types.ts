import type {
  PillarSlug,
  ArticleFormat,
  SearchIntent,
  RiskLevel,
  CommercialIntentType,
  SourceBackedFact,
} from '../types.ts';
import type { EvidenceItem } from '../research/types.ts';
import type { AffiliateMatchResult } from '../affiliate/types.ts';

export interface ValidatableArticle {
  title?: string;
  slug?: string;
  description?: string;
  excerpt?: string;
  content?: string;
  sources?: Array<{
    name: string;
    url?: string;
  }>;
  internalLinks?: string[];
  faq?: Array<{
    question: string;
    answer: string;
  }>;
  affiliateIntents?: string[];
  socialHooks?: string[];
}

export interface EditorialValidationChecks {
  structure: boolean;
  evidence: boolean;
  citations: boolean;
  seo: boolean;
  risk: boolean;
  affiliate: boolean;
  image: boolean;
}

export interface EditorialValidationResult {
  passed: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  checks: EditorialValidationChecks;
  validatedAt: string;
}

export interface EditorialValidationContext {
  topicId?: string;
  pillar?: PillarSlug;
  format?: ArticleFormat;
  audience?: string;
  primaryIntent?: SearchIntent;
  secondaryIntent?: string;
  riskLevel?: RiskLevel;
  readerProblem?: string;
  keyClaims?: string[];
  doNotClaim?: string[];
  evidenceLimitations?: string[];
  sourceBackedFacts?: SourceBackedFact[] | Array<{ claim: string; sourceUrl: string; reliability?: string; publisher?: string; sourceTitle?: string; sourceType?: string }>;
  evidence?: EvidenceItem[];
  sourceUrls?: string[];
  requiredSources?: Array<{ name: string; url?: string; citationType?: string }>;
  searchTargets?: {
    primaryKeyword: string;
    secondaryKeywords?: string[];
    targetSearchVolumeTier?: string;
  };
  seoMetadata?: {
    primaryKeyword?: string;
    secondaryKeywords?: string[];
    intentCategory?: string;
  };
  affiliateIntent?: boolean;
  commercialIntentType?: CommercialIntentType;
  affiliateGuidance?: AffiliateMatchResult;
  affiliateCategories?: string[];
  estimatedWordCount?: {
    min?: number;
    target?: number;
    max?: number;
  };
  imageMetadata?: {
    url?: string;
    alt?: string;
    prompt?: string;
    source?: string;
    sourceUrl?: string;
    license?: string;
    visualTheme?: string;
    recommendedAspectRatio?: string;
  };
  tags?: string[];
  isAlreadyPublished?: boolean;
  isPerson?: boolean;
  recentTitles?: string[];
}

export interface EditorialValidationOptions {
  requireImage?: boolean;
  minWordCount?: number;
  minTitleLength?: number;
  maxTitleLength?: number;
  minDescriptionLength?: number;
  maxDescriptionLength?: number;
  disallowUnresolvedPlaceholders?: boolean;
  customForbiddenKeywords?: string[];
}
