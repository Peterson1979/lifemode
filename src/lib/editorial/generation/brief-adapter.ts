import type { ContentBrief } from '../types.ts';
import type { GenerationRequest } from './types.ts';
import { matchAffiliateOpportunities } from '../affiliate/index.ts';
import type { AffiliateMatchResult } from '../affiliate/types.ts';

export interface BriefAdapterOptions {
  contentInstructions?: string;
  overrideAudience?: string;
  overrideTitleAngle?: string;
  affiliateGuidance?: AffiliateMatchResult;
}

/**
 * Converts an existing LifeMode ContentBrief into a typed GenerationRequest
 * ready for the Generation pipeline (Editorial Brief V2 & Affiliate V1 compatible).
 */
export function briefToGenerationRequest(
  brief: ContentBrief,
  options: BriefAdapterOptions = {}
): GenerationRequest {
  const affiliateGuidance = options.affiliateGuidance || matchAffiliateOpportunities(brief);

  return {
    topicId: brief.topicId,
    titleAngle: options.overrideTitleAngle || brief.titleAngle,
    pillar: brief.pillar,
    format: brief.format,
    audience: options.overrideAudience || brief.audience,
    primaryIntent: brief.primaryIntent,
    secondaryIntent: brief.secondaryIntent,
    secondaryIntents: brief.secondaryIntents,
    recommendedAngle: brief.recommendedAngle,
    readerProblem: brief.readerProblem,
    keyClaims: brief.keyClaims,
    searchTargets: {
      primaryKeyword: brief.searchTargets.primaryKeyword,
      secondaryKeywords: brief.searchTargets.secondaryKeywords,
      targetSearchVolumeTier: brief.searchTargets.targetSearchVolumeTier,
    },
    seoMetadata: brief.seoMetadata,
    pinterestAngle: {
      visualTheme: brief.pinterestAngle?.visualTheme,
      pinTitleAngle: brief.pinterestAngle?.pinTitleAngle,
      pinDescriptionAngle: brief.pinterestAngle?.pinDescriptionAngle,
      aestheticKeywords: brief.pinterestAngle?.aestheticKeywords,
    },
    socialAngle: {
      hookAngle: brief.socialAngle?.hookAngle,
      keyTakeaways: brief.socialAngle?.keyTakeaways,
    },
    affiliateIntent: brief.affiliateOpportunities?.hasAffiliateIntent ?? false,
    commercialIntentType: brief.affiliateOpportunities?.intentType ?? 'none',
    affiliateCategories: brief.affiliateOpportunities?.productCategories,
    affiliateGuidance,
    riskLevel: brief.riskLevel,
    requiredSources: brief.requiredSources,
    evidence: brief.evidence,
    sourceBackedFacts: brief.sourceBackedFacts,
    evidenceLimitations: brief.evidenceLimitations,
    doNotClaim: brief.doNotClaim,
    sourceUrls: brief.sourceUrls,
    internalLinks: brief.internalLinkTargets,
    contentInstructions: options.contentInstructions,
    estimatedWordCount: brief.estimatedWordCount,
    outlineSections: brief.outlineSections,
  };
}
