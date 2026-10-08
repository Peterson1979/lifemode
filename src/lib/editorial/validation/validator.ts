import type {
  EditorialValidationChecks,
  EditorialValidationContext,
  EditorialValidationOptions,
  EditorialValidationResult,
  ValidatableArticle,
} from './types.ts';
import { countWords, FORMULAIC_TITLE_PATTERNS, GENERIC_EXCERPT_PATTERNS, detectRepetitiveTitlePattern } from '../quality.ts';
import { hasLeakedInternalMetadata } from '../sanitization.ts';
import { VALID_PILLARS } from '../types.ts';
import { isPersonTopic, PERSON_MIN_REQUIRED_SOURCES } from '../person-policy.ts';
import { validateImageSemanticRelevance } from '../image-prompt.ts';
import { buildVisualBrief } from '../visual-brief.ts';
import { validateVisualRelevanceSync } from '../visual-relevance.ts';
import { normalizePillar, isMeaningfulEditorialTopic } from '../normalization.ts';

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\{\{[^}]+\}\}/,
  /<placeholder>/i,
  /\[insert\s+[^\]]+\]/i,
  /\[citation needed\]/i,
  /\[object Object\]/,
  /\bTODO\b/,
  /\bFIXME\b/,
];

const AI_ARTIFACT_PATTERNS: RegExp[] = [
  /as an ai language model/i,
  /as an ai/i,
  /certainly,? here is/i,
  /here is (the|an|your) (article|guide|breakdown|post)/i,
  /in this article, we (will|have)/i,
  /in conclusion, in summary/i,
  /as of my knowledge cutoff/i,
];

const SUSPICIOUS_URL_PATTERNS: RegExp[] = [
  /example\.com/i,
  /placeholder\.com/i,
  /mysite\.com/i,
  /yourwebsite\.com/i,
  /test\.com/i,
];

const DISCOVERY_ONLY_SOURCE_PATTERNS: RegExp[] = [
  /reddit\.com/i,
  /trends\.google\.com/i,
  /pinterest\.com/i,
  /youtube\.com/i,
  /tiktok\.com/i,
  /(^|\b)(reddit|pinterest|google trends|youtube trends)(\b|$)/i,
];

const DEFAULT_FORBIDDEN_PHRASES: string[] = [
  'guaranteed returns',
  'cure all diseases',
  'instant wealth',
  'miracle cure',
  'get rich quick',
  '100% foolproof',
  'secret trick they dont want you to know',
];

const HIGH_RISK_DISCLAIMER_PATTERNS: RegExp[] = [
  /consult (a|your)? (doctor|physician|financial advisor|tax professional|lawyer|attorney|certified financial|qualified professional|specialist)/i,
  /for (informational|educational) purposes only/i,
  /not (financial|medical|legal) advice/i,
  /seek professional (advice|guidance)/i,
  /editorial disclaimer/i,
  /medical disclaimer/i,
  /financial disclaimer/i,
];

export const AFFILIATE_DISCLOSURE_PATTERNS: RegExp[] = [
  /\b(commission|affiliate|partner|earn on purchases|editorial disclosure|advertiser disclosure)\b/i,
];

const FORCED_AFFILIATE_PATTERNS: RegExp[] = [
  /\b(affiliate link|buy now with code|use promo code|purchase via our link|exclusive discount code|click here to buy)\b/i,
];

const FAKE_TRACKING_PARAMS_PATTERN: RegExp = /[\?&](aff_id|ref|tag|click_id)=(fake|dummy|placeholder|fabricated|test)/i;

/**
 * Extracts all markdown links `[text](url)` from a string.
 */
export function extractMarkdownLinks(text: string): Array<{ text: string; url: string }> {
  if (!text) return [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
  const links: Array<{ text: string; url: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(text)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
    });
  }
  return links;
}

/**
 * Result of evaluating Content Formation for an article against its editorial mode.
 */
export interface ContentFormationResult {
  valid: boolean;
  mode: 'NEWS' | 'EXPLAINER' | 'EVERGREEN_REFERENCE' | 'EVERGREEN_DECISION';
  errors: string[];
  warnings: string[];
}

/**
 * Deterministically evaluates whether the article structure and content genuinely align
 * with the intended EverydayGuide mode (Reference Protocol vs Decision Framework vs Explainer vs News).
 */
export function evaluateContentFormation(
  article: ValidatableArticle,
  context: EditorialValidationContext = {}
): ContentFormationResult {
  const title = (article.title || '').trim();
  const content = (article.content || '').trim();
  if (!content) {
    return { valid: false, mode: 'EVERGREEN_REFERENCE', errors: ['Content is empty.'], warnings: [] };
  }

  const lowerContent = content.toLowerCase();
  const h2Matches = (content.match(/^##\s+(.+)$/gm) || []).map((h) => h.replace(/^##\s+/, '').trim());
  const h3Matches = (content.match(/^###\s+(.+)$/gm) || []).map((h) => h.replace(/^###\s+/, '').trim());
  const allHeadings = [...h2Matches, ...h3Matches].join(' ').toLowerCase();

  // If person topic, biographical structure is checked by person policy
  const isPerson = isPersonTopic({
    canonicalTopic: context.topicId,
    title,
    tags: context.tags,
    isPerson: context.isPerson,
  });

  if (isPerson) {
    return { valid: true, mode: 'EVERGREEN_REFERENCE', errors: [], warnings: [] };
  }

  // Determine effective content type
  let effectiveContentType: 'NEWS' | 'EXPLAINER' | 'EVERGREEN_GUIDE' = 'EVERGREEN_GUIDE';
  if (context.contentType === 'NEWS' || context.factSheet?.contentType === 'NEWS' || context.format === 'dispatch') {
    effectiveContentType = 'NEWS';
  } else if (context.contentType === 'EXPLAINER' || context.factSheet?.contentType === 'EXPLAINER') {
    effectiveContentType = 'EXPLAINER';
  } else if (context.contentType === 'EVERGREEN_GUIDE' || context.factSheet?.contentType === 'EVERGREEN_GUIDE') {
    effectiveContentType = 'EVERGREEN_GUIDE';
  } else if (context.contentType === 'reference' || context.contentType === 'decision' || context.guideMode) {
    effectiveContentType = 'EVERGREEN_GUIDE';
  } else if (context.format === 'guide' || context.format === 'curation') {
    effectiveContentType = 'EVERGREEN_GUIDE';
  } else if (context.format === 'deep-dive') {
    effectiveContentType = 'EXPLAINER';
  } else {
    const isExplicitGuide = /\b(how to|step[- ]by[- ]step|which|vs|versus|guide to|comparison|tutorial)\b/i.test(title);
    if (!isExplicitGuide && (context.format === 'standard' || !context.format)) {
      return { valid: true, mode: 'EVERGREEN_REFERENCE', errors: [], warnings: [] };
    }
  }

  // Determine effective guide mode
  let effectiveGuideMode: 'reference' | 'decision' = 'reference';
  if (context.guideMode === 'decision' || context.contentType === 'decision') {
    effectiveGuideMode = 'decision';
  } else if (context.guideMode === 'reference' || context.contentType === 'reference') {
    effectiveGuideMode = 'reference';
  } else if (effectiveContentType === 'EVERGREEN_GUIDE') {
    const topicText = `${context.topicId || ''} ${title} ${(context.tags || []).join(' ')}`.toLowerCase();
    const isDecision =
      /\b(which|vs|versus|comparison|compared|choose|selector|matrix|criteria|tradeoff|best|alternatives|roundup)\b/i.test(topicText) ||
      context.primaryIntent === 'commercial' ||
      context.primaryIntent === 'transactional' ||
      context.format === 'curation';
    effectiveGuideMode = isDecision ? 'decision' : 'reference';
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (effectiveContentType === 'NEWS') {
    return { valid: true, mode: 'NEWS', errors, warnings };
  }

  if (effectiveContentType === 'EXPLAINER') {
    const hasExplainerHeadings = /\b(how .+ works?|why|mechanism|science|architecture|anatomy|principles?|underlying|systems?|physics|chemistry|biology|process|foundations?|breakdown|origin|dynamics|context)\b/i.test(allHeadings);
    const causalMatches = lowerContent.match(/\b(because|as a result|due to|the reason|functions by|operates by|triggers|causes|leads to|results in|mechanism behind|underlying system|this occurs when|is governed by|in response to|explains why|how this works|how it works)\b/gi) || [];

    const hasSufficientExplanatoryDepth = hasExplainerHeadings || causalMatches.length >= 2;
    if (!hasSufficientExplanatoryDepth) {
      errors.push('Article lacks explanatory and causal substance required for Explainer content (must explain how or why the underlying mechanism, system, or process functions rather than presenting a generic list of tips).');
    }

    return {
      valid: errors.length === 0,
      mode: 'EXPLAINER',
      errors,
      warnings,
    };
  }

  // EVERGREEN_GUIDE - DECISION
  if (effectiveGuideMode === 'decision') {
    let decisionSignals = 0;

    // 1. Criteria / Tradeoffs
    const hasCriteriaHeadings = /\b(decision criteria|key tradeoffs?|trade-offs?|what matters most|buying factors?|evaluation criteria|how to choose|key considerations?|priorities|what to look for|selection criteria)\b/i.test(allHeadings);
    const hasCriteriaBody = /\b(decision criteria|evaluation factors?|key tradeoffs?|trade-offs?|when choosing|factors to consider|primary considerations?|crucial factors?|trade-off between|tradeoff between|key evaluation factors?)\b/i.test(lowerContent);
    if (hasCriteriaHeadings || hasCriteriaBody) decisionSignals++;

    // 2. Comparison / Differentiation / Alternatives
    const hasComparisonHeadings = /\b(comparison|matrix|breakdown|versus|vs\.?|differences?|alternatives?|options?|how (?:the options|they) differ|side-by-side|head-to-head)\b/i.test(allHeadings);
    const hasTable = /\|.+\|\n\|[-:\s|]+\|\n\|.+\|/.test(content);
    const hasComparativeBody = /\b(compared (?:to|with)|in contrast|whereas|on the other hand|while [a-z0-9\s-]+ excels at|differs from|alternative to|higher [a-z]+ than|more durable than|lighter than|faster than|better for [a-z]+ than|side-by-side|options? (?:a|b|1|2)|both worlds)\b/i.test(lowerContent);
    if (hasComparisonHeadings || hasTable || hasComparativeBody) decisionSignals++;

    // 3. Use-Case / Scenario Recommendations
    const hasRecommendationHeadings = /\b(recommendations?|use-case|which (?:option|one|material|model|type) is right|who should (?:choose|buy)|which option fits|verdict|best for [a-z]+|scenarios?|choosing the right|our pick|decision guide)\b/i.test(allHeadings);
    const hasRecommendationBody = /\b(choose [a-z\s-]+ if|best for (?:beginners|daily|heavy|budget|small|large|most people|anyone who)|recommended for|ideal for|if you (?:need|want|prioritize|cook|value|have)|who should buy|who should choose|the right choice for|match the [a-z]+ to your|match [a-z]+ to your)\b/i.test(lowerContent);
    if (hasRecommendationHeadings || hasRecommendationBody) decisionSignals++;

    // 4. Selection Mistakes
    const hasMistakes = /\b(selection mistakes?|buying mistakes?|buyer missteps?|common selection mistakes?|overpaying|what to avoid when choosing|pitfalls? to avoid|buying mistake)\b/i.test(allHeadings) ||
      /\b(common selection mistakes?|buyer missteps?|pitfall to avoid|buying mistake)\b/i.test(lowerContent);
    if (hasMistakes) decisionSignals++;

    if (decisionSignals < 2) {
      errors.push('Article lacks comparative decision support required for Decision content (missing decision criteria, meaningful comparison between alternatives, trade-offs, or scenario-based recommendations).');
    }

    return {
      valid: errors.length === 0,
      mode: 'EVERGREEN_DECISION',
      errors,
      warnings,
    };
  }

  // EVERGREEN_GUIDE - REFERENCE
  let referenceSignals = 0;

  // 1. Action Sequence / Procedure / Instructions
  const hasStepHeadings = /\b(step[- ]by[- ]step|steps?\b|execution protocol|procedure|instructions?|how to|process|workflow|daily protocols?|implementation|action plan|directions|checklist)\b/i.test(allHeadings);
  const hasNumberedSteps = /^\s*(?:\d+[\.\)]|[-*]\s+(?:Step\s+\d+|Phase\s+\d+|Stage\s+\d+|First,?|Next,?|Then,?|Finally,?))\s+.+/m.test(content) || /^###?\s+(?:step|phase|stage|part)\s+\d+/im.test(content);
  const imperativeMatches = lowerContent.match(/\b(apply|clean|remove|wipe|rinse|heat|bake|boil|simmer|mix|stir|whisk|dissolve|pour|soak|scrub|sanitize|store|freeze|refrigerate|chill|reheat|inspect|measure|weigh|cut|slice|chop|tighten|loosen|install|assemble|disassemble|mount|calibrate|lubricate|flush|descale|replace|drain|insert|connect|disconnect|fasten|seal)\b/gi) || [];
  if (hasStepHeadings || hasNumberedSteps || imperativeMatches.length >= 3) referenceSignals++;

  // 2. Tools / Materials / Preparation / Prerequisites
  const hasToolsHeadings = /\b(tools?|materials?|ingredients?|equipment|supplies|what (?:you(?:'ll)? need|to prepare)|preparation|prerequisites?|items needed|essentials?)\b/i.test(allHeadings);
  const hasToolsBody = /\b(what you(?:'ll)? need|tools required|materials required|ingredients:|equipment needed|supplies:|gather the following|before beginning,?\s+(?:prepare|ensure|gather|assemble)|prep time|required tools|required equipment|safety gear|protective equipment)\b/i.test(lowerContent);
  if (hasToolsHeadings || hasToolsBody) referenceSignals++;

  // 3. Parameters / Operational Thresholds / Measurements
  const hasParamHeadings = /\b(parameters?|operational conditions?|specifications?|thresholds?|rules?|guidelines?|metrics?|limits?|temperatures?|timing|durations?|benchmarks?|overview|key parameters?|summary & parameters)\b/i.test(allHeadings);
  const hasParamNumbers = /\b\d+(?:\.\d+)?\s*(?:°[cf]|degrees?(?:\s+[cf])?|minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|%|inches|inch|in\b|cm\b|mm\b|oz\b|ounces|cups?|tbsp|tsp|grams?|g\b|kg\b|lbs?|pounds|psi\b|ppm\b|rpm\b|volts?|amps?|liters?|litres?|ml\b|quarts?|gallons?)\b/i.test(content);
  if (hasParamHeadings || hasParamNumbers) referenceSignals++;

  // 4. Mistakes / Troubleshooting / Failure Prevention / Maintenance
  const hasTroubleshootingHeadings = /\b(troubleshooting|troubleshoot|mistakes?|errors?|problems?|what to avoid|pitfalls?|failure prevention|fixes|maintenance|storage|prevention|precautions?|common issues|diagnostics?)\b/i.test(allHeadings);
  const hasTroubleshootingBody = /\b(common mistakes?|troubleshooting|troubleshoot|failure prevention|if you notice|if .+ fails|to prevent|avoid (?:using|doing|over-|under-|letting)|never use|never do|never leave|common errors?|frequent missteps?|how to fix|diagnostic|maintenance schedule|prevent damage|prevent degradation|spoilage|safety hazard)\b/i.test(lowerContent);
  if (hasTroubleshootingHeadings || hasTroubleshootingBody) referenceSignals++;

  if (referenceSignals < 2) {
    errors.push('Article lacks actionable practical guidance required for Reference content (missing procedure, operational parameters, required tools/materials, or troubleshooting/failure prevention).');
  }

  return {
    valid: errors.length === 0,
    mode: 'EVERGREEN_REFERENCE',
    errors,
    warnings,
  };
}

/**
 * Unified deterministic editorial validation for generated articles.
 * Enforces structure, evidence, citations, SEO, risk, affiliate, and image rules.
 */
export function validateEditorialArticle(
  article: ValidatableArticle,
  context: EditorialValidationContext = {},
  options: EditorialValidationOptions = {}
): EditorialValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const checks: EditorialValidationChecks = {
    structure: true,
    evidence: true,
    citations: true,
    seo: true,
    risk: true,
    affiliate: true,
    image: true,
  };

  const title = (article.title || '').trim();
  const slug = (article.slug || '').trim();
  const description = (article.description || '').trim();
  const excerpt = (article.excerpt || '').trim();
  const content = (article.content || '').trim();
  const fullText = `${title} ${description} ${excerpt} ${content}`;
  const lowerFullText = fullText.toLowerCase();

  const minTitleLength = options.minTitleLength ?? 10;
  const maxTitleLength = options.maxTitleLength ?? 100;
  const minDescriptionLength = options.minDescriptionLength ?? 30;
  const maxDescriptionLength = options.maxDescriptionLength ?? 250;
  const forbiddenPhrases = [
    ...DEFAULT_FORBIDDEN_PHRASES,
    ...(options.customForbiddenKeywords || []),
  ];

  // ----------------------------------------------------
  // 0. VIDEO-ONLY PILLAR GUARD (Life Hacks)
  // ----------------------------------------------------
  if (context.pillar === 'life-hacks') {
    errors.push('Life Hacks is a video-only pillar. Written text articles cannot be validated or published for this pillar.');
    checks.structure = false;
  }

  // ----------------------------------------------------
  // 1. STRUCTURE CHECKS
  // ----------------------------------------------------
  if (!title) {
    errors.push('Article title is missing or empty.');
    checks.structure = false;
  }

  if (article.slug === '') {
    errors.push('Article slug is missing or empty.');
    checks.structure = false;
  } else if (!slug && !context.topicId) {
    errors.push('Article slug is missing or empty.');
    checks.structure = false;
  }

  if (!description) {
    errors.push('Article description is missing or empty.');
    checks.structure = false;
  }

  if (!excerpt) {
    errors.push('Article excerpt is missing or empty.');
    checks.structure = false;
  }

  if (!content) {
    errors.push('Article content body is missing or empty.');
    checks.structure = false;
  } else {
    // Heading check
    const h2Matches = content.match(/^##\s+.+$/gm) || [];
    if (h2Matches.length === 0) {
      errors.push('Article content lacks required H2 section headings (## Section).');
      checks.structure = false;
    }

    // Empty section check
    const emptySectionPattern = /##\s+[^\n]+\n\s*\n(?=##\s+)/;
    if (emptySectionPattern.test(content)) {
      warnings.push('Article contains an empty heading section without body content.');
    }

    // Word count check
    const wordCount = countWords(content);
    if (context.estimatedWordCount?.min) {
      const targetMin = context.estimatedWordCount.min;
      const lowerBoundary = Math.floor(targetMin * 0.8);
      if (wordCount < lowerBoundary) {
        errors.push(
          `Article content (${wordCount} words) is substantially below the required minimum target (${targetMin} words, threshold >= ${lowerBoundary} words).`
        );
        checks.structure = false;
      } else if (wordCount < targetMin) {
        warnings.push(
          `Article content (${wordCount} words) is slightly below the brief target minimum (${targetMin} words).`
        );
      }
    } else if (wordCount < (options.minWordCount ?? 80)) {
      errors.push(`Article content is too short (${wordCount} words, min ${options.minWordCount ?? 80}).`);
      checks.structure = false;
    }

    // Placeholders check
    if (options.disallowUnresolvedPlaceholders !== false) {
      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(fullText)) {
          errors.push(`Article contains unresolved template placeholder or debug artifact matching pattern: ${pattern.toString()}`);
          checks.structure = false;
          break;
        }
      }
    }

    // Duplicate paragraph check (verbatim repetition across sections)
    const paragraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 80 && !p.startsWith('#'));
    const uniqueParagraphs = new Set<string>();
    let hasDuplicateParagraphs = false;
    for (const p of paragraphs) {
      if (uniqueParagraphs.has(p)) {
        hasDuplicateParagraphs = true;
        break;
      }
      uniqueParagraphs.add(p);
    }
    if (hasDuplicateParagraphs) {
      errors.push('Article content contains verbatim duplicate paragraphs repeated across sections.');
      checks.structure = false;
    }

    // Fact sheet sufficiency and grounding check
    if (context.factSheet) {
      if (!context.factSheet.isSufficient) {
        errors.push(context.factSheet.insufficiencyReason || 'Topic source material is insufficient to ground the article without fabrication.');
        checks.evidence = false;
      }
    }

    // Content Formation QA: verify structural integrity according to editorial mode
    const formationResult = evaluateContentFormation(article, context);
    if (!formationResult.valid) {
      for (const err of formationResult.errors) {
        errors.push(err);
      }
      checks.structure = false;
    }
  }

  const isPerson = isPersonTopic({
    canonicalTopic: context.topicId,
    title,
    tags: context.tags,
    isPerson: context.isPerson,
  });

  // ----------------------------------------------------
  // 2. SEO & METADATA CHECKS
  // ----------------------------------------------------
  if (title) {
    if (title.length < minTitleLength) {
      errors.push(`Article title is too short (${title.length} chars, min ${minTitleLength}).`);
      checks.seo = false;
    } else if (title.length > maxTitleLength) {
      warnings.push(`Article title is unusually long (${title.length} chars, max ${maxTitleLength}).`);
    }

    for (const pattern of FORMULAIC_TITLE_PATTERNS) {
      if (pattern.test(title)) {
        errors.push(`Article title matches banned formulaic template pattern: "${pattern.toString()}".`);
        checks.seo = false;
        break;
      }
    }

    const titleSemanticCheck = isMeaningfulEditorialTopic(title);
    if (!titleSemanticCheck.isValid) {
      errors.push(`Article title failed semantic editorial validation: ${titleSemanticCheck.reason}`);
      checks.seo = false;
    }

    if (isPerson && /^[A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)+:\s*(?:what to know|what you should know)$/i.test(title)) {
      warnings.push(`Person-related article uses repetitive formulaic title pattern ("${title}"); varied editorial headlines are recommended.`);
    }

    if (context.recentTitles && context.recentTitles.length > 0) {
      const repCheck = detectRepetitiveTitlePattern(title, context.recentTitles);
      if (repCheck.isRepetitive) {
        warnings.push(repCheck.reason || 'Article title matches a repetitive structural pattern used across recent articles.');
      }
    }
  }

  if (context.topicId) {
    const topicSemanticCheck = isMeaningfulEditorialTopic(context.topicId);
    if (!topicSemanticCheck.isValid) {
      errors.push(`Topic ID "${context.topicId}" failed semantic editorial validation: ${topicSemanticCheck.reason}`);
      checks.seo = false;
    }
  }

  if (slug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      warnings.push(`Slug "${slug}" does not strictly match canonical kebab-case format.`);
    }
  }

  if (description) {
    if (description.length < minDescriptionLength) {
      warnings.push(`Article description is brief (${description.length} chars, min recommended ${minDescriptionLength}).`);
    } else if (description.length > maxDescriptionLength) {
      warnings.push(`Article description is long (${description.length} chars, max recommended ${maxDescriptionLength}).`);
    }

    for (const pattern of GENERIC_EXCERPT_PATTERNS) {
      if (pattern.test(description)) {
        warnings.push(`Article description contains generic template boilerplate: "${pattern.toString()}".`);
        break;
      }
    }
  }

  if (context.pillar) {
    const normalized = normalizePillar(context.pillar);
    if (!normalized || !(VALID_PILLARS as readonly string[]).includes(normalized)) {
      errors.push(`Invalid or excluded editorial pillar specified: "${context.pillar}".`);
      checks.seo = false;
    }
  }

  // AI persona / conversational artifacts
  for (const pattern of AI_ARTIFACT_PATTERNS) {
    if (pattern.test(fullText)) {
      warnings.push(`Content contains conversational AI preamble or artifact: "${pattern.toString()}".`);
      break;
    }
  }

  // ----------------------------------------------------
  // 3. EVIDENCE & BRIEF V2 INTEGRITY CHECKS
  // ----------------------------------------------------
  // doNotClaim constraint enforcement
  if (context.doNotClaim && Array.isArray(context.doNotClaim)) {
    for (const claim of context.doNotClaim) {
      const trimmedClaim = claim.trim();
      if (!trimmedClaim) continue;
      if (lowerFullText.includes(trimmedClaim.toLowerCase())) {
        errors.push(`Article violates doNotClaim constraint: "${trimmedClaim}" was asserted in content.`);
        checks.evidence = false;
      }
    }
  }

  // ----------------------------------------------------
  // 4. CITATIONS & APPROVED SOURCES CHECKS
  // ----------------------------------------------------
  const articleSources = article.sources || [];
  let validCredibleSourcesCount = 0;

  for (let i = 0; i < articleSources.length; i++) {
    const src = articleSources[i];
    if (!src || typeof src.name !== 'string' || !src.name.trim()) {
      warnings.push(`Source citation at index ${i} is missing a name.`);
      continue;
    }

    const srcUrl = (src.url || '').trim();
    let isInvalidSource = false;

    if (!srcUrl) {
      warnings.push(`Source citation "${src.name}" is missing a URL.`);
      continue;
    }

    // Suspicious dummy domains
    for (const pattern of SUSPICIOUS_URL_PATTERNS) {
      if (pattern.test(srcUrl)) {
        errors.push(`Article contains invalid dummy/placeholder source citation URL: "${srcUrl}".`);
        checks.citations = false;
        isInvalidSource = true;
        break;
      }
    }

    // Discovery-only signal isolation
    for (const pattern of DISCOVERY_ONLY_SOURCE_PATTERNS) {
      if (pattern.test(srcUrl) || pattern.test(src.name)) {
        errors.push(`Discovery signal from "${src.name || srcUrl}" cannot be cited as authoritative factual evidence.`);
        checks.citations = false;
        isInvalidSource = true;
        break;
      }
    }

    // Internal standards URL cannot be used as external factual biography source for person articles
    if (isPerson && /lifemode\.life\/editorial-standards/i.test(srcUrl)) {
      warnings.push(`Internal standard URL "${srcUrl}" cannot be used as an external factual biography source.`);
      isInvalidSource = true;
    }

    if (!isInvalidSource && /^https?:\/\//i.test(srcUrl)) {
      validCredibleSourcesCount++;
    }
  }

  // Person-specific source requirements (>= 2 credible sources)
  if (isPerson) {
    if (validCredibleSourcesCount < PERSON_MIN_REQUIRED_SOURCES) {
      errors.push(
        `Person-related article requires at least ${PERSON_MIN_REQUIRED_SOURCES} verified, credible sources for biographical reporting, but only ${validCredibleSourcesCount} valid source(s) were provided.`
      );
      checks.citations = false;
    }
  }

  // ----------------------------------------------------
  // 5. RISK LEVEL & SAFETY CHECKS
  // ----------------------------------------------------
  if (context.riskLevel === 'high') {
    if (articleSources.length === 0) {
      errors.push('High-risk editorial topic requires verified source citations, but none were provided.');
      checks.risk = false;
    }

    const hasDisclaimer = HIGH_RISK_DISCLAIMER_PATTERNS.some((pattern) => pattern.test(fullText));
    if (!hasDisclaimer) {
      errors.push('High-risk editorial topic requires professional safety disclaimer / advisory wording in content.');
      checks.risk = false;
    }
  }

  // Forbidden / Spam phrases check
  for (const phrase of forbiddenPhrases) {
    if (lowerFullText.includes(phrase.toLowerCase())) {
      errors.push(`Article contains forbidden or spam phrase: "${phrase}".`);
      checks.risk = false;
      break;
    }
  }

  // ----------------------------------------------------
  // 6. AFFILIATE INTEGRITY CHECKS
  // ----------------------------------------------------
  const isInformational =
    context.affiliateIntent === false ||
    context.commercialIntentType === 'none' ||
    context.commercialIntentType === 'informational' ||
    (!context.affiliateIntent && (!context.affiliateGuidance || !context.affiliateGuidance.hasMatches));

  const markdownLinks = extractMarkdownLinks(content);

  if (isInformational) {
    // Informational topic must NOT contain forced commercial/affiliate links or promos
    for (const pattern of FORCED_AFFILIATE_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`Informational article must not contain forced promotional or affiliate purchase calls-to-action: "${pattern.toString()}".`);
        checks.affiliate = false;
        break;
      }
    }
  } else {
    // Commercial / Affiliate intent is present
    const affiliateGuidance = context.affiliateGuidance;
    const approvedDestinationUrls = new Set<string>();

    if (affiliateGuidance?.matchedOpportunities) {
      for (const opp of affiliateGuidance.matchedOpportunities) {
        if (opp.approvedDestinationUrl) {
          approvedDestinationUrls.add(opp.approvedDestinationUrl.trim().toLowerCase());
        }
      }
    }

    // Check all markdown links for fabricated affiliate params or unapproved destinations
    for (const link of markdownLinks) {
      const lowerUrl = link.url.toLowerCase();

      // Check for fake tracking IDs
      if (FAKE_TRACKING_PARAMS_PATTERN.test(lowerUrl)) {
        errors.push(`Article contains fabricated affiliate tracking URL: "${link.url}".`);
        checks.affiliate = false;
      }

      // Check unresolved opportunities cannot become live links
      if (affiliateGuidance?.matchedOpportunities) {
        for (const opp of affiliateGuidance.matchedOpportunities) {
          if (!opp.isLinkable || !opp.approvedDestinationUrl) {
            // Product is unapproved/unresolved: ensure markdown link does not target a dummy URL for this product
            if (lowerUrl.includes(opp.programId.toLowerCase()) || lowerUrl.includes(opp.category.toLowerCase().replace(/\s+/g, '-'))) {
              errors.push(`Unresolved affiliate opportunity "${opp.name}" cannot be linked as a live URL.`);
              checks.affiliate = false;
            }
          }
        }
      }
    }

    // Disclosure requirement
    const disclosureRequired = Boolean(affiliateGuidance?.disclosureRequired);
    if (disclosureRequired) {
      const hasDisclosure = AFFILIATE_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(fullText));
      if (!hasDisclosure) {
        errors.push('Affiliate disclosure is required when commercial recommendations are included, but no disclosure was found in article.');
        checks.affiliate = false;
      }
    }
  }

  // ----------------------------------------------------
  // 7. IMAGE PUBLICATION REQUIREMENT & SEMANTIC RELEVANCE CHECK
  // ----------------------------------------------------
  const hasValidImageUrl = Boolean(
    context.imageMetadata?.url &&
    typeof context.imageMetadata.url === 'string' &&
    context.imageMetadata.url.trim().length > 0 &&
    /^https?:\/\//i.test(context.imageMetadata.url.trim())
  );

  if (options.requireImage) {
    if (!hasValidImageUrl) {
      errors.push('Article publication requires a valid hero image URL, but none was provided.');
      checks.image = false;
    } else {
      // Validate semantic relevance: image must be contextually appropriate for subject matter
      const semanticCheck = validateImageSemanticRelevance(
        article.title || '',
        context.pillar || '',
        context.imageMetadata,
        {
          tags: context.tags,
          isPerson: context.isPerson,
          topicId: context.topicId,
        }
      );

      const visualBrief = context.visualBrief || buildVisualBrief(article, { pillar: context.pillar, tags: context.tags });
      const visualRelevance = validateVisualRelevanceSync(article, visualBrief, context.imageMetadata);

      if (!semanticCheck.valid) {
        errors.push(`Hero image failed semantic relevance validation: ${semanticCheck.reason}`);
        checks.image = false;
      } else if (!visualRelevance.relevant) {
        errors.push(`Hero image failed visual relevance validation: ${visualRelevance.reason}`);
        checks.image = false;
      } else {
        checks.image = true;
      }
    }
  } else if (hasValidImageUrl) {
    // Even when optional, if an image is provided it must not be severely irrelevant
    const semanticCheck = validateImageSemanticRelevance(
      article.title || '',
      context.pillar || '',
      context.imageMetadata,
      {
        tags: context.tags,
        isPerson: context.isPerson,
        topicId: context.topicId,
      }
    );

    const visualBrief = context.visualBrief || buildVisualBrief(article, { pillar: context.pillar, tags: context.tags });
    const visualRelevance = validateVisualRelevanceSync(article, visualBrief, context.imageMetadata);

    if (!semanticCheck.valid) {
      warnings.push(`Hero image may have semantic relevance issues: ${semanticCheck.reason}`);
    }
    if (!visualRelevance.relevant) {
      warnings.push(`Hero image may have visual relevance issues: ${visualRelevance.reason}`);
    }
    checks.image = true;
  } else {
    checks.image = true;
  }

  // ----------------------------------------------------
  // SCORING & FINAL STATUS
  // ----------------------------------------------------
  const errorCount = errors.length;
  const warningCount = warnings.length;

  let score = 100 - errorCount * 30 - warningCount * 5;
  score = Math.max(0, Math.min(100, score));

  const allChecksPass =
    checks.structure &&
    checks.seo &&
    checks.evidence &&
    checks.citations &&
    checks.risk &&
    checks.affiliate &&
    checks.image;

  const passed = errorCount === 0 && allChecksPass;

  return {
    passed,
    score,
    errors,
    warnings,
    checks,
    validatedAt: new Date().toISOString(),
  };
}
