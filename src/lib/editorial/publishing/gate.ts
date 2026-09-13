import type { PublishingRequest, PublishingGateThresholds, PublishingGateResult } from './types.ts';
import { countWords } from '../quality.ts';
import { validateEditorialArticle } from '../validation/validator.ts';

export const DEFAULT_PUBLISHING_GATE_THRESHOLDS: PublishingGateThresholds = {
  minOverallScore: 85,
  minSafetyScore: 85,
  minFactualityScore: 85,
  requirePassDecision: true,
  disallowUnresolvedPlaceholders: true,
  requireImage: false,
};

const SUSPICIOUS_URL_PATTERNS = [
  /example\.com/i,
  /placeholder\.com/i,
  /mysite\.com/i,
  /yourwebsite\.com/i,
  /test\.com/i,
];

const PLACEHOLDER_PATTERNS = [
  /\{\{[^}]+\}\}/, // {{placeholder}}
  /<placeholder>/i,
  /\[insert\s+[^\]]+\]/i,
  /\[citation needed\]/i,
  /\[object Object\]/,
  /\bTODO\b/,
  /\bFIXME\b/,
];

const AI_ARTIFACT_PATTERNS = [
  /as an ai language model/i,
  /as an ai/i,
  /certainly,? here is/i,
  /here is (the|an|your) (article|guide|breakdown|post)/i,
  /in conclusion, in summary/i,
];

/**
 * Deterministic Publishing Eligibility Gate.
 * Evaluates generated article package, quality review results, and editorial context
 * before allowing any publication action.
 */
export function evaluatePublishingGate(
  request: PublishingRequest,
  customThresholds?: Partial<PublishingGateThresholds>
): PublishingGateResult {
  const thresholds: PublishingGateThresholds = {
    ...DEFAULT_PUBLISHING_GATE_THRESHOLDS,
    ...customThresholds,
  };

  const reasons: string[] = [];
  const warnings: string[] = [];

  const { article, review, context } = request;

  // 1. Article Package Integrity
  if (!article) {
    reasons.push('Generated article package is missing.');
    return {
      eligible: false,
      reasons,
      warnings,
      evaluatedAt: new Date().toISOString(),
    };
  }

  // 2. Unified Editorial Validation (Structure, SEO, Evidence, Citations, Risk, Affiliate, Image)
  const validationResult = validateEditorialArticle(
    article,
    {
      topicId: context?.topicId,
      pillar: context?.pillar,
      format: context?.format,
      audience: context?.audience,
      primaryIntent: context?.primaryIntent,
      secondaryIntent: context?.secondaryIntent,
      riskLevel: context?.riskLevel,
      readerProblem: context?.readerProblem,
      doNotClaim: context?.doNotClaim,
      evidenceLimitations: context?.evidenceLimitations,
      sourceUrls: context?.sourceUrls,
      evidence: context?.evidence,
      searchTargets: context?.searchTargets,
      seoMetadata: context?.seoMetadata,
      affiliateIntent: context?.affiliateIntent,
      affiliateCategories: context?.affiliateCategories,
      affiliateGuidance: context?.affiliateGuidance,
      estimatedWordCount: context?.estimatedWordCount,
      imageMetadata: context?.imageMetadata,
      tags: context?.tags,
      isAlreadyPublished: context?.isAlreadyPublished,
    },
    {
      requireImage: false,
      disallowUnresolvedPlaceholders: thresholds.disallowUnresolvedPlaceholders,
    }
  );

  if (!validationResult.passed) {
    for (const err of validationResult.errors) {
      if (!reasons.includes(err)) {
        reasons.push(err);
      }
    }
  }

  for (const warn of validationResult.warnings) {
    if (!warnings.includes(warn)) {
      warnings.push(warn);
    }
  }

  const title = (article.title || '').trim();
  if (!title && !reasons.includes('Article title is missing or empty.')) {
    reasons.push('Article title is missing or empty.');
  }

  const slug = (article.slug || '').trim();
  if (!slug && !reasons.includes('Article slug is missing or empty.')) {
    reasons.push('Article slug is missing or empty.');
  } else if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    warnings.push(`Slug "${slug}" does not strictly match canonical kebab-case format.`);
  }

  const description = (article.description || '').trim();
  if (!description && !reasons.includes('Article description is missing or empty.')) {
    reasons.push('Article description is missing or empty.');
  }

  const content = (article.content || '').trim();
  if (!content && !reasons.includes('Article content body is missing or empty.')) {
    reasons.push('Article content body is missing or empty.');
  } else if (content) {
    const wordCount = countWords(content);

    // Minimum length check against brief context
    if (context?.estimatedWordCount?.min) {
      const targetMin = context.estimatedWordCount.min;
      const lowerBoundary = Math.floor(targetMin * 0.8);
      if (wordCount < lowerBoundary && !reasons.some((r) => r.includes('substantially below'))) {
        reasons.push(
          `Article content (${wordCount} words) is substantially below the required minimum target (${targetMin} words, threshold >= ${lowerBoundary} words).`
        );
      }
    } else if (wordCount < 80 && !reasons.some((r) => r.includes('too short'))) {
      reasons.push(`Article content is too short (${wordCount} words, min 80 required for publishing).`);
    }

    const h2Matches = content.match(/^##\s+.+$/gm) || [];
    if (h2Matches.length === 0 && !reasons.some((r) => r.includes('H2'))) {
      reasons.push('Article content lacks required H2 markdown section headings.');
    }
  }

  // 3. Placeholder & Artifact Checks
  const fullText = `${title} ${description} ${article.excerpt || ''} ${content}`;

  if (thresholds.disallowUnresolvedPlaceholders) {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(fullText) && !reasons.some((r) => r.includes('placeholder'))) {
        reasons.push(`Article contains unresolved template placeholder or debug artifact: ${pattern.toString()}`);
      }
    }
  }

  for (const pattern of AI_ARTIFACT_PATTERNS) {
    if (pattern.test(fullText) && !warnings.some((w) => w.includes('conversational AI'))) {
      warnings.push(`Article contains conversational AI artifact pattern: "${pattern.toString()}"`);
    }
  }

  // 4. Source citations & Suspicious URLs
  if (article.sources && Array.isArray(article.sources)) {
    for (const src of article.sources) {
      if (src.url) {
        for (const pattern of SUSPICIOUS_URL_PATTERNS) {
          if (pattern.test(src.url) && !reasons.some((r) => r.includes('dummy source URL'))) {
            reasons.push(`Article contains invalid or suspicious dummy source URL: "${src.url}"`);
          }
        }
      }
    }
  }

  // 5. High-risk safety requirements
  if (context?.riskLevel === 'high') {
    if (!article.sources || article.sources.length === 0) {
      if (!reasons.some((r) => r.toLowerCase().includes('high-risk editorial topic requires verified sources'))) {
        reasons.push('High-risk editorial topic requires verified sources before publishing, but none were provided.');
      }
    }
  }

  // 6. Duplicate / Lifecycle check
  if (context?.isAlreadyPublished) {
    reasons.push('Article topic is already marked as published in editorial lifecycle.');
  }

  // 7. AI Quality Review Evaluation
  if (!review) {
    reasons.push('AI Quality Review result is missing. Articles must be reviewed before entering publishing gate.');
  } else {
    // Check Decision: Must strictly be 'PASS'
    if (thresholds.requirePassDecision && review.decision !== 'PASS') {
      reasons.push(`AI Quality Review decision is "${review.decision}". Only articles with decision "PASS" are eligible for publishing.`);
    }

    // Check Scores against thresholds
    if (review.overallScore < thresholds.minOverallScore) {
      reasons.push(`Overall review score (${review.overallScore}) is below publishing threshold (${thresholds.minOverallScore}).`);
    }

    const safetyScore = review.dimensions?.safety?.score ?? 0;
    if (safetyScore < thresholds.minSafetyScore) {
      reasons.push(`Safety review score (${safetyScore}) is below publishing threshold (${thresholds.minSafetyScore}).`);
    }

    const factualityScore = review.dimensions?.factuality?.score ?? 0;
    if (factualityScore < thresholds.minFactualityScore) {
      reasons.push(`Factuality review score (${factualityScore}) is below publishing threshold (${thresholds.minFactualityScore}).`);
    }

    // Check for blocking critical review issues
    if (review.criticalIssues && review.criticalIssues.length > 0) {
      reasons.push(`Article has ${review.criticalIssues.length} unresolved critical review issue(s): ${review.criticalIssues.join('; ')}`);
    }
  }

  const eligible = reasons.length === 0;

  return {
    eligible,
    reasons,
    warnings,
    validationResult,
    evaluatedAt: new Date().toISOString(),
  };
}
