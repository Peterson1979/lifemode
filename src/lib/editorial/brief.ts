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

  // Title angle generator based on canonical topic and format
  const cleanTopic = topic.canonicalTopic.trim();
  let titleAngle = cleanTopic;
  if (!cleanTopic.toLowerCase().startsWith('how ') && !cleanTopic.toLowerCase().startsWith('why ') && !cleanTopic.toLowerCase().startsWith('what ')) {
    if (format === 'guide') {
      titleAngle = `How to make the most of ${cleanTopic}`;
    } else if (format === 'deep-dive') {
      titleAngle = `${cleanTopic}: what it tells you and how it works`;
    } else if (format === 'listicle') {
      titleAngle = `Practical lessons and insights from ${cleanTopic}`;
    } else {
      titleAngle = `${cleanTopic}: what to know`;
    }
  }

  // Default outline structure
  const outlineSections = [
    {
      heading: 'Background & Core Context',
      keyPoints: [
        `Understand the essentials of ${topic.canonicalTopic}.`,
        'Highlight why this matters for modern readers.',
      ],
    },
    {
      heading: 'Practical Applications & Key Takeaways',
      keyPoints: [
        'Break down practical insights and real-world methods.',
        'Provide concrete, high-signal takeaways.',
      ],
    },
    {
      heading: 'Actionable Advice & Next Steps',
      keyPoints: [
        'Specific recommendations, routines, or tools.',
        'Practical steps for everyday integration.',
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
    audience: options.audience || topic.targetAudience || 'Curious, thoughtful readers looking for practical ideas.',
    searchTargets: {
      primaryKeyword: topic.canonicalTopic.toLowerCase(),
      secondaryKeywords: topic.queryVariants.slice(0, 5),
      targetSearchVolumeTier: topic.scoring.searchPotential > 80 ? 'high' : 'medium',
    },
    pinterestAngle: {
      visualTheme: `${pillarConfig.name} Lifestyle & Everyday Ideas`,
      pinTitleAngle: titleAngle,
      pinDescriptionAngle: `Explore practical ideas and takeaways for ${topic.canonicalTopic.toLowerCase()} on LifeMode.`,
      aestheticKeywords: [topic.pillar, 'lifestyle', 'ideas', 'modern living', ...topic.tags],
    },
    socialAngle: {
      hookAngle: `What you should know about ${topic.canonicalTopic}.`,
      keyTakeaways: [
        `Key shift in ${topic.canonicalTopic}`,
        'Core actionable takeaway',
        'Long-term everyday outcome',
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
