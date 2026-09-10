import type { GeneratedArticle, GenerationRequest, GenerationValidationIssue, GenerationValidationReport } from './types.ts';
import { countWords } from '../quality.ts';
import { hasLeakedInternalMetadata } from '../sanitization.ts';

export interface ValidationRulesOptions {
  minTitleLength?: number;
  minDescriptionLength?: number;
  minWordCount?: number;
  requireH2?: boolean;
  disallowUnresolvedPlaceholders?: boolean;
}

const DEFAULT_OPTIONS: ValidationRulesOptions = {
  minTitleLength: 10,
  minDescriptionLength: 30,
  minWordCount: 80,
  requireH2: true,
  disallowUnresolvedPlaceholders: true,
};

/**
 * Common AI chatter / artifact patterns to flag in generated content.
 */
const AI_ARTIFACT_PATTERNS = [
  /as an ai language model/i,
  /as an ai/i,
  /certainly,? here is/i,
  /here is (the|an|your) (article|guide|breakdown|post)/i,
  /in this article, we (will|have)/i,
  /in conclusion, in summary/i,
  /as of my knowledge cutoff/i,
  /i cannot provide financial advice/i,
];

/**
 * Placeholder patterns indicating incomplete or unrendered generation.
 */
const PLACEHOLDER_PATTERNS = [
  /\{\{[^}]+\}\}/, // {{placeholder}}
  /<placeholder>/i,
  /\[insert\s+[^\]]+\]/i, // [insert link], [insert quote]
  /\[citation needed\]/i,
  /\[object Object\]/,
  /\bTODO\b/,
  /\bFIXME\b/,
];

/**
 * Forbidden / Spammy commercial phrases.
 */
const FORBIDDEN_PHRASES = [
  'guaranteed returns',
  'miracle cure',
  'get rich quick',
  'instant wealth',
  '100% foolproof',
  'secret trick they dont want you to know',
];

/**
 * Suspicious / Dummy URLs to flag.
 */
const SUSPICIOUS_URL_PATTERNS = [
  /example\.com/i,
  /placeholder\.com/i,
  /mysite\.com/i,
  /yourwebsite\.com/i,
  /test\.com/i,
];


/**
 * Deterministically validates an article package output from a generation provider.
 */
export function validateGeneratedArticle(
  article: Partial<GeneratedArticle>,
  request?: GenerationRequest,
  options: ValidationRulesOptions = {}
): GenerationValidationReport {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const issues: GenerationValidationIssue[] = [];

  // 1. Required Fields Validation
  const title = (article.title || '').trim();
  if (!title) {
    issues.push({
      field: 'title',
      rule: 'REQUIRED',
      message: 'Article title is missing or empty.',
      severity: 'error',
    });
  } else if (title.length < (opts.minTitleLength || 10)) {
    issues.push({
      field: 'title',
      rule: 'MIN_LENGTH',
      message: `Article title is too short (${title.length} chars, min ${opts.minTitleLength}).`,
      severity: 'error',
    });
  }

  const slug = (article.slug || '').trim();
  if (!slug) {
    issues.push({
      field: 'slug',
      rule: 'REQUIRED',
      message: 'Article slug is missing or empty.',
      severity: 'error',
    });
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    issues.push({
      field: 'slug',
      rule: 'INVALID_SLUG_FORMAT',
      message: `Slug "${slug}" must be lowercase alphanumeric with hyphens.`,
      severity: 'warning',
    });
  }

  const description = (article.description || '').trim();
  if (!description) {
    issues.push({
      field: 'description',
      rule: 'REQUIRED',
      message: 'Article description is missing or empty.',
      severity: 'error',
    });
  } else if (description.length < (opts.minDescriptionLength || 30)) {
    issues.push({
      field: 'description',
      rule: 'MIN_LENGTH',
      message: `Article description is too short (${description.length} chars, min ${opts.minDescriptionLength}).`,
      severity: 'warning',
    });
  }

  const excerpt = (article.excerpt || '').trim();
  if (!excerpt) {
    issues.push({
      field: 'excerpt',
      rule: 'REQUIRED',
      message: 'Article excerpt is missing or empty.',
      severity: 'error',
    });
  }

  const content = (article.content || '').trim();
  const wordCount = countWords(content);

  if (!content) {
    issues.push({
      field: 'content',
      rule: 'REQUIRED',
      message: 'Article content body is missing or empty.',
      severity: 'error',
    });
  } else {
    // 2. Content Structure Checks
    const h2Matches = content.match(/^##\s+.+$/gm) || [];
    const headingsCount = h2Matches.length;

    if (opts.requireH2 && headingsCount === 0) {
      issues.push({
        field: 'content',
        rule: 'MISSING_H2',
        message: 'Article content must include at least one H2 heading (## Section).',
        severity: 'error',
      });
    }

    // Word count target validation
    if (request?.estimatedWordCount?.min) {
      const targetMin = request.estimatedWordCount.min;
      const lowerBoundary = Math.floor(targetMin * 0.8);

      if (wordCount < lowerBoundary) {
        issues.push({
          field: 'content',
          rule: 'BELOW_TARGET_WORD_COUNT',
          message: `Article content is substantially below the brief target minimum (${wordCount} words, expected minimum ${targetMin} words, acceptable threshold >= ${lowerBoundary} words).`,
          severity: 'error',
        });
      } else if (wordCount < targetMin) {
        issues.push({
          field: 'content',
          rule: 'NEAR_MINIMUM_WORD_COUNT',
          message: `Article content is slightly below brief target minimum (${wordCount} words, target min ${targetMin} words).`,
          severity: 'warning',
        });
      }
    } else if (wordCount < (opts.minWordCount || 80)) {
      issues.push({
        field: 'content',
        rule: 'MIN_WORD_COUNT',
        message: `Article content is too short (${wordCount} words, min ${opts.minWordCount}).`,
        severity: 'error',
      });
    }

    // Check for empty heading sections (e.g. ## Heading\n\n## Next Heading)
    const emptySectionPattern = /##\s+[^\n]+\n\s*\n(?=##\s+)/;
    if (emptySectionPattern.test(content)) {
      issues.push({
        field: 'content',
        rule: 'EMPTY_SECTION',
        message: 'Article contains an empty heading section without body text.',
        severity: 'warning',
      });
    }
  }

  // 3. Metadata Structure Checks
  if (article.faq !== undefined) {
    if (!Array.isArray(article.faq)) {
      issues.push({
        field: 'faq',
        rule: 'INVALID_TYPE',
        message: 'FAQ must be an array of question/answer objects.',
        severity: 'error',
      });
    } else {
      for (let i = 0; i < article.faq.length; i++) {
        const item = article.faq[i];
        if (!item || typeof item.question !== 'string' || typeof item.answer !== 'string' || !item.question.trim() || !item.answer.trim()) {
          issues.push({
            field: `faq[${i}]`,
            rule: 'INVALID_FAQ_ITEM',
            message: `FAQ item at index ${i} is missing question or answer text.`,
            severity: 'warning',
          });
        }
      }
    }
  }

  if (article.sources !== undefined) {
    if (!Array.isArray(article.sources)) {
      issues.push({
        field: 'sources',
        rule: 'INVALID_TYPE',
        message: 'Sources must be an array of source objects.',
        severity: 'error',
      });
    } else {
      for (let i = 0; i < article.sources.length; i++) {
        const src = article.sources[i];
        if (!src || typeof src.name !== 'string' || !src.name.trim()) {
          issues.push({
            field: `sources[${i}]`,
            rule: 'INVALID_SOURCE_ITEM',
            message: `Source at index ${i} is missing name.`,
            severity: 'warning',
          });
        }
        if (src && src.url) {
          for (const pattern of SUSPICIOUS_URL_PATTERNS) {
            if (pattern.test(src.url)) {
              issues.push({
                field: `sources[${i}].url`,
                rule: 'SUSPICIOUS_SOURCE_URL',
                message: `Source URL "${src.url}" appears to be a placeholder/fake URL.`,
                severity: 'warning',
              });
            }
          }
        }
      }
    }
  }

  if (article.internalLinks !== undefined && !Array.isArray(article.internalLinks)) {
    issues.push({
      field: 'internalLinks',
      rule: 'INVALID_TYPE',
      message: 'Internal links must be an array of strings.',
      severity: 'error',
    });
  }

  if (article.socialHooks !== undefined && !Array.isArray(article.socialHooks)) {
    issues.push({
      field: 'socialHooks',
      rule: 'INVALID_TYPE',
      message: 'Social hooks must be an array of strings.',
      severity: 'error',
    });
  }

  // 4. Placeholder & Artifact Checks across all text fields
  const fullText = `${title} ${description} ${excerpt} ${content}`;

  if (opts.disallowUnresolvedPlaceholders) {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(fullText)) {
        issues.push({
          field: 'content',
          rule: 'UNRESOLVED_PLACEHOLDER',
          message: `Detected unresolved template placeholder or debug artifact matching pattern: ${pattern.toString()}`,
          severity: 'error',
        });
      }
    }
  }

  // AI Persona Artifacts
  for (const pattern of AI_ARTIFACT_PATTERNS) {
    if (pattern.test(fullText)) {
      issues.push({
        field: 'content',
        rule: 'AI_ARTIFACT_DETECTED',
        message: `Content contains conversational AI preamble or artifact: "${pattern.toString()}".`,
        severity: 'warning',
      });
    }
  }

  // Forbidden / Spam phrases
  const lowerFullText = fullText.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lowerFullText.includes(phrase.toLowerCase())) {
      issues.push({
        field: 'content',
        rule: 'FORBIDDEN_PHRASE',
        message: `Content contains forbidden or high-risk phrase: "${phrase}".`,
        severity: 'error',
      });
    }
  }

  // Internal Metadata Leak Detection
  if (hasLeakedInternalMetadata(content)) {
    issues.push({
      field: 'content',
      rule: 'INTERNAL_METADATA_LEAK',
      message: 'Content contains un-sanitized internal editorial metadata sections (e.g. Internal Links, Affiliate Intents, Social Hooks).',
      severity: 'error',
    });
  }

  // High-risk request specific checks
  if (request?.riskLevel === 'high') {
    if (!article.sources || article.sources.length === 0) {
      issues.push({
        field: 'sources',
        rule: 'HIGH_RISK_REQUIRES_SOURCES',
        message: 'High-risk topic requires at least one verified source citation.',
        severity: 'warning',
      });
    }
  }

  const h2Matches = content.match(/^##\s+.+$/gm) || [];
  const headingsCount = h2Matches.length;

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  let score = 100 - errorCount * 30 - warningCount * 10;
  score = Math.max(0, Math.min(100, score));

  const isValid = errorCount === 0;

  return {
    isValid,
    score,
    issues,
    wordCount,
    headingsCount,
    validatedAt: new Date().toISOString(),
  };
}
