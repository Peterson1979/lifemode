import type { ContentBrief } from '../types.ts';
import type { GenerationRequest } from './types.ts';

export interface BriefAdapterOptions {
  contentInstructions?: string;
  overrideAudience?: string;
  overrideTitleAngle?: string;
}

/**
 * Converts an existing LifeMode ContentBrief into a typed GenerationRequest
 * ready for the Generation V1 pipeline.
 */
export function briefToGenerationRequest(
  brief: ContentBrief,
  options: BriefAdapterOptions = {}
): GenerationRequest {
  return {
    topicId: brief.topicId,
    titleAngle: options.overrideTitleAngle || brief.titleAngle,
    pillar: brief.pillar,
    format: brief.format,
    audience: options.overrideAudience || brief.audience,
    primaryIntent: brief.primaryIntent,
    secondaryIntent: brief.secondaryIntent,
    searchTargets: {
      primaryKeyword: brief.searchTargets.primaryKeyword,
      secondaryKeywords: brief.searchTargets.secondaryKeywords,
      targetSearchVolumeTier: brief.searchTargets.targetSearchVolumeTier,
    },
    pinterestAngle: {
      visualTheme: brief.pinterestAngle.visualTheme,
      pinTitleAngle: brief.pinterestAngle.pinTitleAngle,
      pinDescriptionAngle: brief.pinterestAngle.pinDescriptionAngle,
      aestheticKeywords: brief.pinterestAngle.aestheticKeywords,
    },
    socialAngle: {
      hookAngle: brief.socialAngle.hookAngle,
      keyTakeaways: brief.socialAngle.keyTakeaways,
    },
    affiliateIntent: brief.affiliateOpportunities.hasAffiliateIntent,
    affiliateCategories: brief.affiliateOpportunities.productCategories,
    riskLevel: brief.riskLevel,
    requiredSources: brief.requiredSources,
    internalLinks: brief.internalLinkTargets,
    contentInstructions: options.contentInstructions,
    estimatedWordCount: brief.estimatedWordCount,
    outlineSections: brief.outlineSections,
  };
}
