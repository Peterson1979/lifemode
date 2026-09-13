import type { PillarSlug, ArticleFormat, CommercialIntentType } from '../types.ts';

/**
 * Single curated affiliate program or product category configuration.
 */
export interface AffiliateCatalogItem {
  id: string;
  name: string;
  category: string;
  applicablePillars: PillarSlug[];
  applicableIntents: CommercialIntentType[];
  applicableFormats?: ArticleFormat[];
  keywords: string[];
  enabled: boolean;
  merchant?: string;
  approvedDestinationUrl?: string; // Real, verified destination URL only. No fake tracking IDs or fabricated URLs.
  placementSuggestion?: string;
  disclosureType?: 'standard' | 'sponsored' | 'editorial-partner';
  priority?: number; // 1-100 base priority
  riskRestrictions?: {
    allowHighRisk?: boolean;
    disallowedPillars?: PillarSlug[];
    disallowedKeywords?: string[];
  };
}

/**
 * Matched affiliate opportunity scored against an editorial brief.
 */
export interface MatchedAffiliateOpportunity {
  programId: string;
  name: string;
  category: string;
  merchant?: string;
  score: number; // 0-100 deterministic match score
  matchReasons: string[];
  placementSuggestion: string;
  approvedDestinationUrl?: string;
  isLinkable: boolean; // true ONLY if approvedDestinationUrl is provided and valid
  disclosureRequired: boolean;
}

/**
 * Structured outcome of the affiliate matching pipeline for an editorial brief.
 */
export interface AffiliateMatchResult {
  hasMatches: boolean;
  intentType: CommercialIntentType;
  primaryCategory?: string;
  matchedOpportunities: MatchedAffiliateOpportunity[];
  topOpportunity?: MatchedAffiliateOpportunity;
  disclosureRequired: boolean;
  disclosureText?: string;
  editorialGuidance: string[];
  safetyConstraints: string[];
}

/**
 * Options for configuring the affiliate matching pipeline.
 */
export interface AffiliateMatchOptions {
  customCatalog?: AffiliateCatalogItem[];
  minScoreThreshold?: number; // Minimum match score to qualify (default: 40)
  maxOpportunities?: number; // Maximum matched opportunities to return (default: 3)
  customDisclosureText?: string;
}

/**
 * Validation report for the central affiliate catalog.
 */
export interface CatalogValidationReport {
  isValid: boolean;
  totalItems: number;
  enabledItems: number;
  errors: string[];
  warnings: string[];
}
