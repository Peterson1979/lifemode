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
  PillarSlug,
} from './types.ts';
import { VALID_PILLARS } from './types.ts';
import type { EvidenceItem } from './research/types.ts';
import { PILLARS } from '../../config/site.ts';
import {
  isPersonTopic,
  generatePersonTitle,
  PERSON_DO_NOT_CLAIM_GUARDRAILS,
} from './person-policy.ts';
import { buildFactSheet, determineContentType } from './fact-sheet.ts';

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
  'direct-answer': { min: 250, target: 450, max: 700 },
  'practical-guide': { min: 350, target: 550, max: 800 },
  'comparison-table': { min: 300, target: 500, max: 750 },
  explainer: { min: 350, target: 550, max: 800 },
  'trending-question': { min: 250, target: 450, max: 700 },
  'visual-guide': { min: 300, target: 500, max: 750 },
  standard: { min: 300, target: 500, max: 750 },
  guide: { min: 350, target: 550, max: 800 },
  listicle: { min: 300, target: 500, max: 750 },
  'deep-dive': { min: 500, target: 750, max: 1100 },
  dispatch: { min: 250, target: 400, max: 600 },
  curation: { min: 300, target: 500, max: 750 },
  recipe: { min: 300, target: 500, max: 750 },
};

/**
 * Deterministically derives the recommended article format from topic signals and query phrasing.
 * Prioritizes high-demand real-world question and practical formats.
 */
export function deriveArticleFormat(topic: EditorialTopic, requestedFormat?: ArticleFormat): ArticleFormat {
  if (requestedFormat) return requestedFormat;

  const text = `${topic.canonicalTopic} ${(topic.queryVariants || []).join(' ')}`.toLowerCase();

  // 1. Guides / Actionable Tutorials
  if (/\b(how to|step by step|tutorial|how-to|guide to)\b/.test(text)) {
    return 'guide';
  }
  // 2. Curations / Comparative Roundups
  if (/\b(best|top\s*\d+|ranked|comparison|versus|vs\.?|alternatives|roundup)\b/.test(text)) {
    return 'curation';
  }
  // 3. Deep Dives / Explanations
  if (/\b(what is|why|deep dive|explained|explainer|architecture|breakdown|mechanism)\b/.test(text)) {
    return 'deep-dive';
  }
  // 4. Listicles / Principles
  if (/\b(tips|rules|habits|lessons|strategies|ways to|principles|checklist)\b/.test(text)) {
    return 'listicle';
  }
  // 5. Dispatches / Breaking
  if (/\b(dispatch|breaking|now|update|first look)\b/.test(text)) {
    return 'dispatch';
  }
  // 6. Direct Answer Question Formats
  if (/\b(can i|can you|should i|should you|does |is it safe|is it ok|is it safe to|when to|when should|will |do |are )\b/.test(text)) {
    return 'direct-answer';
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

  if (topic.targetProject === 'get-ai-set') {
    return 'Accessible, plain-language exploration of practical AI workflows, everyday productivity, and useful tools for non-technical users.';
  }

  const pillarAngles: Record<string, string> = {
    'tech-ai': 'Accessible, plain-language exploration of practical AI workflows, everyday productivity, and useful tools for non-technical users.',
    wealth: 'Disciplined personal financial frameworks, strategic cash management calculations, and allocation decision trees.',
    money: 'Disciplined personal financial frameworks, strategic cash management calculations, and allocation decision trees.',
    health: 'Evidence-based physiological protocols, nutritional science, and biomarker tracking.',
    home: 'Authoritative step-by-step household protocols, food safety limits, appliance care schedules, and stain chemistry.',
    life: 'Actionable daily routines, desk ergonomics, digital decluttering frameworks, and personal organization systems.',
    tools: 'Interactive calculators, comparison matrices, printable checklists, and decision finders.',
  };

  const baseAngle = pillarAngles[topic.pillar] || 'Evidence-grounded practical reference guidance with clear, actionable takeaways.';

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

  if (topic.targetProject === 'get-ai-set') {
    return `The reader wants to understand how to practically use ${cleanTopic} in their daily life or work without getting overwhelmed by technical jargon, developer concepts, or marketing hype.`;
  }

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

  if (topic.pillar === 'wellbeing' || /\b(health|diet|supplement|therapy|medical|fitness|cure|treatment)\b/.test(lowerTopic)) {
    constraints.push('Do not imply medical certainty, diagnose conditions, prescribe treatments, or present lifestyle interventions as medical cures.');
  }

  if (topic.targetProject === 'get-ai-set') {
    constraints.push(
      'Do not write for developers, data scientists, or technical engineers; keep explanations strictly accessible to everyday mainstream users.',
      'Do not invent features, tools, capabilities, benchmarks, or pricing not supported by verified evidence.',
      'Do not make exaggerated AI claims, promise unrealistic capabilities, or adopt a breathless hype tone.',
      'Do not make unsupported tool superiority claims or write in a promotional/advertorial voice.'
    );
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
 * Generates dynamic, organic, subject-grounded editorial title angles for articles.
 * Avoids repetitive formulaic suffixes (e.g. ": What to Know") and adapts organically to pillar, intent, and subject matter.
 */
export function deriveEditorialTitleAngle(
  topicOrCanonical: EditorialTopic | string,
  formatOrPillar?: ArticleFormat | PillarSlug,
  primaryIntent?: SearchIntent,
  _evidence?: EvidenceItem[]
): string {
  const isTopicObj = typeof topicOrCanonical === 'object' && topicOrCanonical !== null;
  const cleanTopic = (isTopicObj ? topicOrCanonical.canonicalTopic : String(topicOrCanonical)).trim();
  const pillar = isTopicObj ? topicOrCanonical.pillar : (typeof formatOrPillar === 'string' && VALID_PILLARS.includes(formatOrPillar as any) ? formatOrPillar as PillarSlug : 'now');
  const format = (isTopicObj ? (formatOrPillar as ArticleFormat) : 'standard') || 'standard';

  if (isTopicObj && isPersonTopic(topicOrCanonical)) {
    return generatePersonTitle(cleanTopic, {
      format,
      primaryIntent: primaryIntent || 'informational',
      queryVariants: topicOrCanonical.queryVariants,
      topicId: topicOrCanonical.id,
    });
  }

  const lower = cleanTopic.toLowerCase();
  // If the cleanTopic is already an organic, complete headline sentence
  if (
    lower.startsWith('how ') ||
    lower.startsWith('why ') ||
    lower.startsWith('what ') ||
    lower.startsWith('the ') ||
    lower.startsWith('inside ') ||
    lower.startsWith('designing ') ||
    lower.startsWith('building ') ||
    lower.startsWith('a practical ') ||
    lower.startsWith('10 ') ||
    lower.startsWith('7 ')
  ) {
    return cleanTopic;
  }

  // Calculate stable hash from topic ID or canonical topic
  const seedString = (isTopicObj ? topicOrCanonical.id : '') || cleanTopic;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  const entropy = Math.abs(hash);

  // Pillar & format-aware EverydayGuide headline angle catalog
  switch (pillar) {
    case 'tech-ai': {
      const angles = [
        `How to Use ${cleanTopic}: Practical Everyday Guide`,
        `How ${cleanTopic} Works: Practical Workflows and Setup`,
        `The Practical Guide to ${cleanTopic} for Everyday Tasks`,
        `How to Set Up ${cleanTopic}: Step-by-Step Instructions`,
        `${cleanTopic}: Plain-Language Guide and Useful Tips`,
        `How to Protect Your Privacy While Using ${cleanTopic}`,
      ];
      return angles[entropy % angles.length];
    }
    case 'health': {
      const angles = [
        `How to Optimize ${cleanTopic}: The Evidence-Based Protocol`,
        `Understanding ${cleanTopic}: Mechanisms, Biomarkers, and Daily Protocol`,
        `How Much ${cleanTopic} Do You Need? The Practical Guide`,
        `${cleanTopic}: Timing, Dosage, and Daily Optimization Protocol`,
        `The Science of ${cleanTopic}: Practical Habits for Long-Term Vitality`,
      ];
      return angles[entropy % angles.length];
    }
    case 'wealth': {
      const angles = [
        `How to Manage ${cleanTopic}: A Step-by-Step Financial Framework`,
        `${cleanTopic}: Allocation Matrix and Decision Guide`,
        `How ${cleanTopic} Affects Cash Reserves and Liquidity`,
        `A Practical Protocol for ${cleanTopic}`,
        `Understanding ${cleanTopic}: Core Mechanics and Strategy`,
      ];
      return angles[entropy % angles.length];
    }
    case 'home': {
      const angles = [
        `How to Clean and Maintain ${cleanTopic}: Step-by-Step Protocol`,
        `How to Store ${cleanTopic} Safely: The Complete Protocol`,
        `Which ${cleanTopic} Is Right for You? Comparison and Decision Guide`,
        `How to Repair and Maintain ${cleanTopic}: Prevention and Fixes`,
        `${cleanTopic}: Safe Handling and Maintenance Protocol`,
      ];
      return angles[entropy % angles.length];
    }
    case 'life': {
      const angles = [
        `How to Build a Frictionless ${cleanTopic}: Step-by-Step Setup`,
        `How to Organize ${cleanTopic}: Practical Guide`,
        `${cleanTopic}: Ergonomics, Systems, and Daily Habits`,
        `How to Optimize ${cleanTopic} for Everyday Clarity`,
      ];
      return angles[entropy % angles.length];
    }
    case 'tools': {
      const angles = [
        `${cleanTopic}: Interactive Calculator and Sizing Guide`,
        `${cleanTopic} Decision Matrix: Which Option Is Right for You?`,
        `${cleanTopic} Cheat Sheet and Reference Matrix`,
        `${cleanTopic}: Seasonal Inspection and Care Planner`,
      ];
      return angles[entropy % angles.length];
    }
    default: {
      const angles = [
        `How to Master ${cleanTopic}: Step-by-Step Practical Protocol`,
        `Which ${cleanTopic} Is Right for You? Decision Guide`,
        `${cleanTopic}: Practical Reference and Step-by-Step Guide`,
      ];
      return angles[entropy % angles.length];
    }
  }
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
  const riskLevel = options.riskLevel || (topic.pillar === 'wealth' || topic.pillar === 'health' ? 'medium' : 'low');

  const estimatedWordCount = FORMAT_WORD_COUNT_MAP[format] || FORMAT_WORD_COUNT_MAP.standard;

  // Evidence resolution
  const effectiveEvidence = options.evidence || evidence || topic.evidence;

  // Title angle generation
  const titleAngle = deriveEditorialTitleAngle(topic, format, primaryIntent, effectiveEvidence);

  const workingTitle = titleAngle;
  const recommendedAngle = deriveArticleAngle(topic, format, options.recommendedAngle);
  const readerProblem = deriveReaderProblem(topic, primaryIntent, options.readerProblem);
  const affiliateOpportunities = deriveCommercialIntent(topic);
  const sourceBackedFacts = extractSourceBackedFacts(effectiveEvidence);
  const keyClaims = deriveKeyClaims(topic, sourceBackedFacts, options.claimsRequiringEvidence);
  const evidenceLimitations = deriveEvidenceLimitations(effectiveEvidence, topic, riskLevel);
  const doNotClaim = deriveDoNotClaimConstraints(topic, riskLevel, affiliateOpportunities.intentType);
  const seoMetadata = deriveSeoMetadata(topic, titleAngle);
  const sourceUrls = Array.from(new Set((effectiveEvidence || []).map((e) => e.url).filter(Boolean)));

  const defaultAudience = topic.targetProject === 'get-ai-set'
    ? 'Everyday curious users, non-technical professionals, and learners looking for accessible, practical AI guidance without technical jargon.'
    : 'Everyday readers seeking actionable, verified reference and decision guidance.';
  const audience = options.audience || topic.targetAudience || defaultAudience;

  // Determine EverydayGuide content type & mode
  const factSheet = buildFactSheet(topic, effectiveEvidence, topic.sourceSignals);
  const editorialContentType = factSheet.contentType || determineContentType(topic);

  const isDecision =
    /\b(which|vs|versus|comparison|compared|choose|selector|matrix|criteria|tradeoff)\b/i.test(topic.canonicalTopic) ||
    primaryIntent === 'commercial' ||
    format === 'curation';
  const effectiveGuideMode: 'reference' | 'decision' = isDecision ? 'decision' : 'reference';

  const effectiveContentType = editorialContentType === 'EVERGREEN_GUIDE'
    ? effectiveGuideMode
    : editorialContentType;

  // Outline structure according to editorial mode
  const isPerson = isPersonTopic(topic);
  let outlineSections: Array<{ heading: string; keyPoints: string[] }>;

  if (isPerson) {
    outlineSections = [
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
    ];
  } else if (editorialContentType === 'NEWS') {
    outlineSections = [
      {
        heading: 'What Happened & Confirmed Details',
        keyPoints: [
          `Verified account of the primary event for ${topic.canonicalTopic}.`,
          'Confirmed figures, dates, and organizations involved.',
        ],
      },
      {
        heading: 'Background & Precedent Context',
        keyPoints: [
          'How this situation developed and relevant historical context.',
          'Official investigations or institutional responses.',
        ],
      },
      {
        heading: 'Broader Implications & What to Watch',
        keyPoints: [
          'Significance for readers, industry standards, or broader policies.',
          'Confirmed next milestones supported strictly by verified reporting.',
        ],
      },
    ];
  } else if (editorialContentType === 'EXPLAINER') {
    outlineSections = [
      {
        heading: 'Core Mechanism & Underlying Principles',
        keyPoints: [
          `How ${topic.canonicalTopic} functions at a fundamental level.`,
          'The science, architecture, or causal systems at work.',
        ],
      },
      {
        heading: 'System Dynamics & Key Variables',
        keyPoints: [
          'Step-by-step breakdown of interactions and operational principles.',
          'Why this matters and how different conditions affect outcomes.',
        ],
      },
      {
        heading: 'Practical Implications & Real-World Context',
        keyPoints: [
          'Everyday relevance, applications, and contextual takeaways.',
          'Common misconceptions clarified through objective explanation.',
        ],
      },
    ];
  } else if (effectiveGuideMode === 'decision') {
    outlineSections = [
      {
        heading: 'Core Decision Criteria & Key Tradeoffs',
        keyPoints: [
          `Primary evaluation criteria for choosing between ${topic.canonicalTopic} options.`,
          'Crucial factors: durability, maintenance requirements, and practical constraints.',
        ],
      },
      {
        heading: 'Comparison Matrix & Practical Breakdown',
        keyPoints: [
          'Detailed side-by-side comparison across key performance metrics.',
          'Pros, cons, and realistic usable lifespans for each alternative.',
        ],
      },
      {
        heading: 'Common Selection Mistakes & Use-Case Recommendations',
        keyPoints: [
          'Frequent buyer missteps, why they matter, and how to avoid them.',
          'Direct scenario-based recommendations matching specific user needs.',
        ],
      },
    ];
  } else {
    outlineSections = [
      {
        heading: 'Quick Summary & Key Parameters',
        keyPoints: [
          `Essential rules, baseline metrics, and safety thresholds for ${topic.canonicalTopic}.`,
          'Required tools, materials, and prep time.',
        ],
      },
      {
        heading: 'Step-by-Step Execution Protocol',
        keyPoints: [
          'Numbered sequence of clear, actionable instructions from preparation to completion.',
          'Crucial execution tips and specific failure-prevention warnings.',
        ],
      },
      {
        heading: 'Common Mistakes & Troubleshooting',
        keyPoints: [
          'Frequent errors, the underlying science or reason they fail, and immediate fixes.',
          'Pro tips for long-term maintenance, storage, or optimization.',
        ],
      },
    ];
  }

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
    targetProject: topic.targetProject,
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
    factSheet,
    guideMode: effectiveGuideMode,
    contentType: effectiveContentType,
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

