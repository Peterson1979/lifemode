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

    // Internal metadata leak check
    if (hasLeakedInternalMetadata(content)) {
      errors.push('Article content contains un-sanitized internal editorial metadata sections.');
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
        warnings.push(`Article title matches formulaic template pattern: "${pattern.toString()}".`);
        break;
      }
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

  if (context.pillar && !VALID_PILLARS.includes(context.pillar)) {
    errors.push(`Invalid editorial pillar specified: "${context.pillar}".`);
    checks.seo = false;
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
  // 7. IMAGE PUBLICATION REQUIREMENT CHECK
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
      checks.image = true;
    }
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
