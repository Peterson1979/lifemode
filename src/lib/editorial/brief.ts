import type {
  ContentBrief,
  EditorialTopic,
  ArticleFormat,
  SearchIntent,
  RiskLevel,
  SourceBackedFact,
  SeoOpportunityMetadata,
  BriefAffiliateOpportunities,
  CommercialIntentType,
} from './types.ts';
import type { EvidenceItem } from './research/types.ts';
import { PILLARS } from '../../config/site.ts';
import {
  isPersonTopic,
  generatePersonTitle,
  PERSON_DO_NOT_CLAIM_GUARDRAILS,
} from './person-policy.ts';

export interface BriefGenerationOptions {
  format?: ArticleFormat;
  primaryIntent?: SearchIntent;
  secondaryIntent?: string;
  secondaryIntents?: string[];
  audience?: string;
  recommendedAngle?: string;
  readerProblem?: string;
  riskLevel?: RiskLevel;
  internalLinkCandidates?: string[];
  evidence?: EvidenceItem[];
  claimsRequiringEvidence?: string[];
}

/**
 * Word count guidelines by editorial format.
 */
export const FORMAT_WORD_COUNT_MAP: Record<ArticleFormat, { min: number; target: number; max: number }> = {
  standard: { min: 800, target: 1200, max: 1600 },
  guide: { min: 1400, target: 2000, max: 2800 },
  listicle: { min: 900, target: 1300, max: 1800 },
  'deep-dive': { min: 1800, target: 2500, max: 3500 },
  dispatch: { min: 500, target: 750, max: 1000 },
  curation: { min: 700, target: 1100, max: 1500 },
};

/**
 * Deterministically derives the recommended article format from topic signals and query phrasing.
 */
export function deriveArticleFormat(topic: EditorialTopic, requestedFormat?: ArticleFormat): ArticleFormat {
  if (requestedFormat) return requestedFormat;

  const text = `${topic.canonicalTopic} ${(topic.queryVariants || []).join(' ')}`.toLowerCase();

  if (/\b(how to|step by step|tutorial|how-to|guide to)\b/.test(text)) {
    return 'guide';
  }
  if (/\b(best|top\s*\d+|ranked|comparison|versus|vs\.?|alternatives|roundup)\b/.test(text)) {
    return 'curation';
  }
  if (/\b(what is|why|deep dive|explained|explainer|architecture|breakdown|mechanism)\b/.test(text)) {
    return 'deep-dive';
  }
  if (/\b(tips|rules|habits|lessons|strategies|ways to|principles|checklist)\b/.test(text)) {
    return 'listicle';
  }
  if (/\b(dispatch|breaking|now|update|first look)\b/.test(text)) {
    return 'dispatch';
  }
  if (topic.opportunityType === 'SEASONAL_ARTICLE') {
    return 'guide';
  }
  return 'standard';
}

/**
 * Derives a recommended article angle aligned with the pillar and editorial voice.
 */
export function deriveArticleAngle(topic: EditorialTopic, format: ArticleFormat, customAngle?: string): string {
  if (customAngle) return customAngle;

  const pillarAngles: Record<string, string> = {
    'tech-ai': 'Pragmatic technical analysis emphasizing real-world workflows, architecture, and verifiable capabilities.',
    money: 'Disciplined, evidence-grounded strategic guidance prioritizing sustainable financial clarity and risk mitigation.',
    life: 'Human-centered lifestyle perspective focusing on intentional daily practices, design, and tangible routines.',
    wellbeing: 'Balanced, science-aware wellness guidance grounded in sustainable daily habits and professional caution.',
    travel: 'Curated, design-conscious experiential exploration prioritizing architectural detail and authentic atmosphere.',
    now: 'Insightful contemporary cultural observation dissecting emerging behavioral shifts and modern zeitgeist.',
  };

  const baseAngle = pillarAngles[topic.pillar] || 'Contemporary, human-first editorial analysis with high-signal takeaways.';

  switch (format) {
    case 'guide':
      return `${baseAngle} Step-by-step actionable implementation.`;
    case 'deep-dive':
      return `${baseAngle} Rigorous foundational breakdown and contextual depth.`;
    case 'curation':
      return `${baseAngle} Discerning, high-signal comparative appraisal.`;
    case 'listicle':
      return `${baseAngle} Concise, memorable principles for immediate application.`;
    case 'dispatch':
      return `${baseAngle} Direct, timely reporting on emerging shifts.`;
    default:
      return baseAngle;
  }
}

/**
 * Derives the core reader problem / need statement based on search intent and topic context.
 */
export function deriveReaderProblem(topic: EditorialTopic, primaryIntent: SearchIntent, customProblem?: string): string {
  if (customProblem) return customProblem;

  const cleanTopic = topic.canonicalTopic.trim();

  if (isPersonTopic(topic)) {
    return `The reader needs accurate, verified biographical context, career milestones, and objective understanding regarding ${cleanTopic} grounded in authoritative reporting without speculation or gossip.`;
  }

  switch (primaryIntent) {
    case 'commercial':
    case 'transactional':
      return `The reader needs objective evaluation criteria, actionable comparisons, and trusted evidence before committing time or resources to ${cleanTopic}.`;
    case 'inspirational':
      return `The reader is seeking elevated aesthetic perspectives, tasteful curation, and fresh ideas for ${cleanTopic}.`;
    case 'navigational':
      return `The reader needs direct, authoritative guidance on navigating and applying ${cleanTopic}.`;
    case 'informational':
    default:
      return `The reader needs clear, verified understanding, context, and practical takeaways regarding ${cleanTopic} without marketing hype or superficial filler.`;
  }
}

/**
 * Classifies commercial and affiliate intent deterministically from topic signals and scoring.
 */
export function deriveCommercialIntent(topic: EditorialTopic): BriefAffiliateOpportunities {
  const text = `${topic.canonicalTopic} ${(topic.queryVariants || []).join(' ')}`.toLowerCase();
  const commercialScore = topic.scoring?.commercialPotential ?? 0;
  const isCommercialQuery = Boolean(
    /\b(best|review|reviews|vs|comparison|price|cost|tools|gear|software|equipment|buy|setup)\b/.test(text)
  );

  let intentType: CommercialIntentType = 'none';
  let hasAffiliateIntent = false;
  let productCategories: string[] = [];
  let suggestedPlacements: string[] = [];

  if (topic.primaryIntent === 'transactional' || commercialScore >= 75) {
    intentType = 'transactional';
    hasAffiliateIntent = true;
    productCategories = [topic.pillar, 'gear', 'tools', ...(topic.tags || []).slice(0, 2)];
    suggestedPlacements = [
      'Curated product comparison table',
      'In-text practical recommendation',
      'Featured tool callout box',
    ];
  } else if (
    topic.primaryIntent === 'commercial' ||
    isCommercialQuery ||
    (commercialScore >= 50 && topic.primaryIntent !== 'informational' && topic.primaryIntent !== 'navigational')
  ) {
    intentType = 'commercial-investigation';
    hasAffiliateIntent = true;
    productCategories = [topic.pillar, 'essentials', ...(topic.tags || []).slice(0, 2)];
    suggestedPlacements = [
      'Contextual product mention in key section',
      'Curated recommendation highlight',
    ];
  } else if (topic.primaryIntent === 'informational' || commercialScore >= 25) {
    intentType = 'informational';
    hasAffiliateIntent = false;
    productCategories = [];
    suggestedPlacements = [];
  } else {
    intentType = 'none';
    hasAffiliateIntent = false;
    productCategories = [];
    suggestedPlacements = [];
  }

  return {
    hasAffiliateIntent,
    intentType,
    productCategories,
    suggestedPlacements,
  };
}

/**
 * Extracts verified source-backed facts traceable to evidence items.
 */
export function extractSourceBackedFacts(evidence?: EvidenceItem[]): SourceBackedFact[] {
  if (!evidence || evidence.length === 0) return [];

  const facts: SourceBackedFact[] = [];
  for (const item of evidence) {
    if (item.claimSummary && item.claimSummary.trim().length > 0 && item.url) {
      facts.push({
        claim: item.claimSummary.trim(),
        sourceUrl: item.url.trim(),
        sourceTitle: item.title?.trim() || item.publisher || 'Verified Source',
        publisher: item.publisher || 'Primary Source',
        reliability: item.reliability || 'medium',
        sourceType: item.sourceType || 'other',
      });
    }
  }
  return facts;
}

/**
 * Derives explicit key claims that must be supported by evidence or verified domain knowledge.
 */
export function deriveKeyClaims(
  topic: EditorialTopic,
  sourceBackedFacts: SourceBackedFact[],
  requestedClaims?: string[]
): string[] {
  if (requestedClaims && requestedClaims.length > 0) {
    return requestedClaims;
  }
  if (sourceBackedFacts.length > 0) {
    return sourceBackedFacts.map((f) => f.claim);
  }
  return [
    `Core facts, origin, and verified context defining ${topic.canonicalTopic}.`,
    `Practical mechanisms and verifiable applications for ${topic.canonicalTopic}.`,
    `Measurable lifestyle or domain outcomes associated with ${topic.canonicalTopic}.`,
  ];
}

/**
 * Derives compact evidence limitations and uncertainties as strict generation constraints.
 */
export function deriveEvidenceLimitations(
  evidence: EvidenceItem[] | undefined,
  topic: EditorialTopic,
  riskLevel: RiskLevel
): string[] {
  const limitations: string[] = [];

  if (!evidence || evidence.length === 0) {
    limitations.push(
      'No verified external research evidence was retrieved; generator must rely strictly on verified domain concepts and must not cite unverified statistics, dates, or study findings.'
    );
    return limitations;
  }

  if (evidence.length === 1) {
    limitations.push(
      'Only one external source was retrieved; avoid presenting single-source perspectives as universal industry consensus.'
    );
  }

  const hasPrimaryOrOfficial = evidence.some(
    (e) => e.sourceType === 'official' || e.sourceType === 'government' || e.sourceType === 'academic' || e.sourceType === 'primary'
  );
  if (!hasPrimaryOrOfficial) {
    limitations.push(
      'Current evidence is drawn from secondary media or industry coverage rather than primary institutional or government data.'
    );
  }

  const hasLowReliability = evidence.some((e) => e.reliability === 'low');
  if (hasLowReliability) {
    limitations.push('Some evidence items have low reliability; treat claims with appropriate editorial caution.');
  }

  if (topic.scoring?.freshness && topic.scoring.freshness > 70) {
    limitations.push('Topic relates to fast-evolving current events or trends; facts reflect current reporting and may change over time.');
  }

  if (riskLevel === 'high') {
    limitations.push('Sensitive domain topic: research provides general context and does not constitute individualized medical, legal, or financial advice.');
  }

  return limitations;
}

/**
 * Derives deterministic "do not claim" guardrails based on topic, pillar, risk level, and intent.
 */
export function deriveDoNotClaimConstraints(
  topic: EditorialTopic,
  riskLevel: RiskLevel,
  commercialIntent: CommercialIntentType
): string[] {
  const constraints: string[] = [
    'Do not invent statistics, studies, benchmark numbers, quotes, or percentages not provided in verified evidence.',
    'Do not cite external URLs or publisher names that are not in the approved source list.',
    'Do not cite discovery or social signals (Reddit, Google Trends, Pinterest, YouTube) as authoritative factual citations.',
  ];

  if (isPersonTopic(topic)) {
    constraints.push(...PERSON_DO_NOT_CLAIM_GUARDRAILS);
  }

  const lowerTopic = topic.canonicalTopic.toLowerCase();

  if (topic.pillar === 'money' || /\b(finance|investment|crypto|stock|tax|retirement|budget|wealth)\b/.test(lowerTopic)) {
    constraints.push('Do not guarantee returns, predict market movements with certainty, or provide individualized financial or investment advice.');
  }

  if (topic.pillar === 'wellbeing' || topic.pillar === 'life' || /\b(health|diet|supplement|therapy|medical|fitness|cure|treatment)\b/.test(lowerTopic)) {
    constraints.push('Do not imply medical certainty, diagnose conditions, prescribe treatments, or present lifestyle interventions as medical cures.');
  }

  if (topic.pillar === 'tech-ai' || /\b(ai|llm|model|software|agent)\b/.test(lowerTopic)) {
    constraints.push('Do not claim unreleased software features, speculative artificial general intelligence milestones, or unverified benchmark numbers as established facts.');
  }

  if (riskLevel === 'high') {
    constraints.push('Do not present speculative or fringe theories as established scientific, medical, or regulatory consensus.');
  }

  if (commercialIntent === 'commercial-investigation' || commercialIntent === 'transactional') {
    constraints.push('Do not make false superiority claims, guarantee vendor reliability, or quote precise pricing without live verification.');
  }

  return constraints;
}

/**
 * Derives SEO opportunity metadata from topic signals and scoring.
 */
export function deriveSeoMetadata(topic: EditorialTopic, titleAngle: string): SeoOpportunityMetadata {
  const freshnessScore = topic.scoring?.freshness ?? topic.freshnessScore ?? 50;
  const freshnessSensitivity: 'low' | 'medium' | 'high' =
    freshnessScore >= 75 ? 'high' : freshnessScore >= 40 ? 'medium' : 'low';

  return {
    primaryKeyword: topic.canonicalTopic.toLowerCase().trim(),
    secondaryKeywords: (topic.queryVariants || []).slice(0, 5),
    intentCategory: topic.primaryIntent || 'informational',
    freshnessSensitivity,
    opportunityScore: topic.totalScore,
    recommendedAngle: titleAngle,
  };
}

/**
 * Enriches an existing ContentBrief with research evidence, updating source-backed facts,
 * limitations, citations, and constraints in place.
 */
export function enrichBriefWithResearch(
  brief: ContentBrief,
  topic: EditorialTopic,
  evidence: EvidenceItem[]
): ContentBrief {
  const sourceBackedFacts = extractSourceBackedFacts(evidence);
  const evidenceLimitations = deriveEvidenceLimitations(evidence, topic, brief.riskLevel);
  const sourceUrls = Array.from(new Set(evidence.map((e) => e.url).filter(Boolean)));
  const keyClaims = deriveKeyClaims(topic, sourceBackedFacts);

  brief.evidence = evidence;
  brief.sourceBackedFacts = sourceBackedFacts;
  brief.evidenceLimitations = evidenceLimitations;
  brief.sourceUrls = sourceUrls;
  brief.keyClaims = keyClaims;

  if (evidence.length > 0) {
    const evidenceRequiredSources = evidence.map((e) => ({
      name: e.publisher || e.title,
      url: e.url,
      citationType: (e.sourceType === 'official' || e.sourceType === 'government'
        ? 'official'
        : e.sourceType === 'academic'
        ? 'study'
        : 'authority') as 'authority' | 'study' | 'official' | 'benchmark',
    }));

    const existingUrls = new Set(brief.requiredSources.map((s) => s.url).filter(Boolean));
    for (const rs of evidenceRequiredSources) {
      if (rs.url && !existingUrls.has(rs.url)) {
        brief.requiredSources.push(rs);
        existingUrls.add(rs.url);
      }
    }
  }

  return brief;
}

/**
 * Synthesizes a structured Editorial Brief V2 from an approved topic and optional research evidence.
 */
export function synthesizeEditorialBrief(
  topic: EditorialTopic,
  evidence?: EvidenceItem[],
  options: BriefGenerationOptions = {}
): ContentBrief {
  const pillarConfig = PILLARS[topic.pillar] || { name: topic.pillar };
  const format = deriveArticleFormat(topic, options.format);
  const primaryIntent = options.primaryIntent || topic.primaryIntent || 'informational';
  const riskLevel = options.riskLevel || (topic.pillar === 'money' || topic.pillar === 'wellbeing' ? 'medium' : 'low');

  const estimatedWordCount = FORMAT_WORD_COUNT_MAP[format] || FORMAT_WORD_COUNT_MAP.standard;

  // Title angle generation
  const cleanTopic = topic.canonicalTopic.trim();
  const isPerson = isPersonTopic(topic);
  let titleAngle = cleanTopic;

  if (isPerson) {
    titleAngle = generatePersonTitle(cleanTopic, {
      format,
      primaryIntent,
      queryVariants: topic.queryVariants,
      topicId: topic.id,
    });
  } else if (!cleanTopic.toLowerCase().startsWith('how ') && !cleanTopic.toLowerCase().startsWith('why ') && !cleanTopic.toLowerCase().startsWith('what ')) {
    if (format === 'guide') {
      titleAngle = `How to make the most of ${cleanTopic}`;
    } else if (format === 'deep-dive') {
      titleAngle = `${cleanTopic}: what it tells you and how it works`;
    } else if (format === 'listicle') {
      titleAngle = `Practical lessons and insights from ${cleanTopic}`;
    } else if (format === 'curation') {
      titleAngle = `The best approaches and insights for ${cleanTopic}`;
    } else if (format === 'dispatch') {
      titleAngle = `${cleanTopic}: what to know right now`;
    } else {
      titleAngle = `${cleanTopic}: what to know`;
    }
  }

  const workingTitle = titleAngle;
  const recommendedAngle = deriveArticleAngle(topic, format, options.recommendedAngle);
  const readerProblem = deriveReaderProblem(topic, primaryIntent, options.readerProblem);
  const affiliateOpportunities = deriveCommercialIntent(topic);
  const effectiveEvidence = options.evidence || evidence || topic.evidence;
  const sourceBackedFacts = extractSourceBackedFacts(effectiveEvidence);
  const keyClaims = deriveKeyClaims(topic, sourceBackedFacts, options.claimsRequiringEvidence);
  const evidenceLimitations = deriveEvidenceLimitations(effectiveEvidence, topic, riskLevel);
  const doNotClaim = deriveDoNotClaimConstraints(topic, riskLevel, affiliateOpportunities.intentType);
  const seoMetadata = deriveSeoMetadata(topic, titleAngle);
  const sourceUrls = Array.from(new Set((effectiveEvidence || []).map((e) => e.url).filter(Boolean)));

  const audience = options.audience || topic.targetAudience || 'Curious, thoughtful readers looking for practical ideas.';

  // Default outline structure
  const outlineSections = isPerson
    ? [
        {
          heading: 'Background & Career Context',
          keyPoints: [
            `Verified biographical background and career milestones for ${topic.canonicalTopic}.`,
            'Key context and recent developments supported by primary sources.',
          ],
        },
        {
          heading: 'Notable Achievements & Impact',
          keyPoints: [
            'Documented career contributions, verified records, and professional focus.',
            'Distinctive approaches and verified domain impact.',
          ],
        },
        {
          heading: 'Verified Context & Practical Takeaways',
          keyPoints: [
            'Factual summary of current status and confirmed future initiatives.',
            'Objective takeaways grounded strictly in verified reporting.',
          ],
        },
      ]
    : [
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

  const requiredSources: Array<{
    name: string;
    url?: string;
    citationType: 'authority' | 'study' | 'official' | 'benchmark';
  }> = isPerson
    ? [
        {
          name: 'Primary Official Record & Biographical Source',
          citationType: 'official',
        },
        {
          name: 'Reputable Secondary Media Coverage',
          citationType: 'authority',
        },
      ]
    : [
        {
          name: 'LifeMode Editorial Standards & Primary Reference',
          citationType: 'authority',
        },
      ];

  if (effectiveEvidence && effectiveEvidence.length > 0) {
    for (const ev of effectiveEvidence) {
      if (ev.url) {
        requiredSources.push({
          name: ev.publisher || ev.title,
          url: ev.url,
          citationType: (ev.sourceType === 'official' || ev.sourceType === 'government'
            ? 'official'
            : ev.sourceType === 'academic'
            ? 'study'
            : 'authority') as 'authority' | 'study' | 'official' | 'benchmark',
        });
      }
    }
  }

  const secondaryKeywords = (topic.queryVariants || []).slice(0, 5);

  return {
    topicId: topic.id,
    titleAngle,
    workingTitle,
    slug: topic.slug,
    pillar: topic.pillar,
    format,
    primaryIntent,
    secondaryIntent: options.secondaryIntent || topic.secondaryIntent,
    secondaryIntents: options.secondaryIntents || (topic.secondaryIntent ? [topic.secondaryIntent] : []),
    audience,
    recommendedAngle,
    readerProblem,
    keyClaims,
    searchTargets: {
      primaryKeyword: topic.canonicalTopic.toLowerCase(),
      secondaryKeywords,
      targetSearchVolumeTier: (topic.scoring?.searchPotential ?? 0) > 80 ? 'high' : 'medium',
    },
    seoMetadata,
    pinterestAngle: {
      visualTheme: `${pillarConfig.name} Lifestyle & Everyday Ideas`,
      pinTitleAngle: titleAngle,
      pinDescriptionAngle: `Explore practical ideas and takeaways for ${topic.canonicalTopic.toLowerCase()} on LifeMode.`,
      aestheticKeywords: [topic.pillar, 'lifestyle', 'ideas', 'modern living', ...(topic.tags || [])],
    },
    socialAngle: {
      hookAngle: `What you should know about ${topic.canonicalTopic}.`,
      keyTakeaways: [
        `Key shift in ${topic.canonicalTopic}`,
        'Core actionable takeaway',
        'Long-term everyday outcome',
      ],
    },
    affiliateOpportunities,
    internalLinkTargets: options.internalLinkCandidates || [`/${topic.pillar}`],
    requiredSources,
    evidence: effectiveEvidence,
    sourceBackedFacts,
    evidenceLimitations,
    doNotClaim,
    sourceUrls,
    riskLevel,
    estimatedWordCount,
    outlineSections,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Builds a deterministic, structured Content Brief from an approved Editorial Topic.
 * Backward-compatible entrypoint that delegates to synthesizeEditorialBrief.
 */
export function buildContentBrief(
  topic: EditorialTopic,
  options: BriefGenerationOptions = {}
): ContentBrief {
  return synthesizeEditorialBrief(topic, options.evidence, options);
}

