import type { ContentBrief, EditorialTopic, ArticleFormat, SearchIntent, RiskLevel } from './types.ts';
import { PILLARS } from '../../config/site.ts';

export interface BriefGenerationOptions {
  format?: ArticleFormat;
  primaryIntent?: SearchIntent;
  secondaryIntent?: string;
  audience?: string;
  riskLevel?: RiskLevel;
  internalLinkCandidates?: string[];
}

/**
 * Builds a deterministic, structured Content Brief from an approved Editorial Topic.
 */
export function buildContentBrief(
  topic: EditorialTopic,
  options: BriefGenerationOptions = {}
): ContentBrief {
  const pillarConfig = PILLARS[topic.pillar];
  const format = options.format || (topic.opportunityType === 'SEASONAL_ARTICLE' ? 'guide' : 'standard');
  const primaryIntent = options.primaryIntent || topic.primaryIntent || 'informational';
  const riskLevel = options.riskLevel || (topic.pillar === 'money' || topic.pillar === 'wellbeing' ? 'medium' : 'low');

  // Word count guidelines by format
  const wordCountMap: Record<ArticleFormat, { min: number; target: number; max: number }> = {
    standard: { min: 800, target: 1200, max: 1600 },
    guide: { min: 1400, target: 2000, max: 2800 },
    listicle: { min: 900, target: 1300, max: 1800 },
    'deep-dive': { min: 1800, target: 2500, max: 3500 },
    dispatch: { min: 500, target: 750, max: 1000 },
    curation: { min: 700, target: 1100, max: 1500 },
  };

  const estimatedWordCount = wordCountMap[format] || wordCountMap.standard;

  // Title angle generator based on pillar and topic
  const titleAngle = `${topic.canonicalTopic}: A Modern Guide to ${pillarConfig.tagline}`;

  // Default outline structure
  const outlineSections = [
    {
      heading: 'Introduction & Core Perspective',
      keyPoints: [
        `Define the essence of ${topic.canonicalTopic}.`,
        'Highlight why this matters in contemporary lifestyle design.',
      ],
    },
    {
      heading: 'Foundational Principles & Actionable Framework',
      keyPoints: [
        'Break down the core methodology / insights.',
        'Provide concrete, high-signal takeaways for the reader.',
      ],
    },
    {
      heading: 'Curated Recommendations & Next Steps',
      keyPoints: [
        'Specific tools, habits, or curated suggestions.',
        'Actionable checklist or routine integration.',
      ],
    },
  ];

  return {
    topicId: topic.id,
    titleAngle,
    slug: topic.slug,
    pillar: topic.pillar,
    format,
    primaryIntent,
    secondaryIntent: options.secondaryIntent || topic.secondaryIntent,
    audience: options.audience || topic.targetAudience || 'Modern, curious, globally minded readers seeking intentional living.',
    searchTargets: {
      primaryKeyword: topic.canonicalTopic.toLowerCase(),
      secondaryKeywords: topic.queryVariants.slice(0, 5),
      targetSearchVolumeTier: topic.scoring.searchPotential > 80 ? 'high' : 'medium',
    },
    pinterestAngle: {
      visualTheme: `${pillarConfig.name} Aesthetic & Minimalist Living`,
      pinTitleAngle: `The Ultimate Guide to ${topic.canonicalTopic}`,
      pinDescriptionAngle: `Discover how ${topic.canonicalTopic.toLowerCase()} transforms modern routines. Read the full editorial breakdown on LifeMode.`,
      aestheticKeywords: [topic.pillar, 'lifestyle', 'minimalist', 'modern living', ...topic.tags],
    },
    socialAngle: {
      hookAngle: `Why ${topic.canonicalTopic} is changing how we approach ${pillarConfig.name.toLowerCase()} in 2026.`,
      keyTakeaways: [
        `Key shift in ${topic.canonicalTopic}`,
        'Core actionable framework',
        'Long-term lifestyle outcome',
      ],
    },
    affiliateOpportunities: {
      hasAffiliateIntent: topic.scoring.commercialPotential > 60,
      productCategories: topic.scoring.commercialPotential > 60 ? [topic.pillar, 'gear', 'books'] : [],
      suggestedPlacements: topic.scoring.commercialPotential > 60 ? ['Product mention in section 2', 'Curated gear box'] : [],
    },
    internalLinkTargets: options.internalLinkCandidates || [`/${topic.pillar}`],
    requiredSources: [
      {
        name: 'LifeMode Editorial Standards & Primary Reference',
        citationType: 'authority',
      },
    ],
    riskLevel,
    estimatedWordCount,
    outlineSections,
    createdAt: new Date().toISOString(),
  };
}
