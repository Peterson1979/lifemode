import type { QualityState, QualityValidationIssue, QualityValidationResult } from './types.ts';

export interface ValidationRulesConfig {
  minTitleLength?: number;
  maxTitleLength?: number;
  minDescriptionLength?: number;
  maxDescriptionLength?: number;
  minWordCount?: number;
  forbiddenKeywords?: string[];
  requireSourcesForRiskyPillars?: boolean;
}

const DEFAULT_RULES: ValidationRulesConfig = {
  minTitleLength: 15,
  maxTitleLength: 100,
  minDescriptionLength: 40,
  maxDescriptionLength: 250,
  minWordCount: 300,
  forbiddenKeywords: [
    'guaranteed returns',
    'cure all diseases',
    'instant wealth',
    'miracle cure',
    'secret trick they dont want you to know',
  ],
  requireSourcesForRiskyPillars: true,
};

/**
 * Counts words in a string.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Deterministically validates an article draft against editorial standards.
 */
export function validateArticleDraft(
  frontmatter: Record<string, any>,
  contentBody: string,
  customRules: ValidationRulesConfig = {}
): QualityValidationResult {
  const rules = { ...DEFAULT_RULES, ...customRules };
  const issues: QualityValidationIssue[] = [];

  // Title validation
  const title = (frontmatter.title || '').trim();
  if (!title) {
    issues.push({
      field: 'title',
      rule: 'REQUIRED',
      message: 'Article title is missing.',
      severity: 'error',
    });
  } else if (title.length < (rules.minTitleLength || 15)) {
    issues.push({
      field: 'title',
      rule: 'LENGTH_TOO_SHORT',
      message: `Title is too short (${title.length} chars, min ${rules.minTitleLength}).`,
      severity: 'error',
    });
  } else if (title.length > (rules.maxTitleLength || 100)) {
    issues.push({
      field: 'title',
      rule: 'LENGTH_TOO_LONG',
      message: `Title is too long (${title.length} chars, max ${rules.maxTitleLength}).`,
      severity: 'warning',
    });
  }

  // Description validation
  const description = (frontmatter.description || '').trim();
  if (!description) {
    issues.push({
      field: 'description',
      rule: 'REQUIRED',
      message: 'Article description / excerpt is missing.',
      severity: 'error',
    });
  } else if (description.length < (rules.minDescriptionLength || 40)) {
    issues.push({
      field: 'description',
      rule: 'LENGTH_TOO_SHORT',
      message: `Description is too short (${description.length} chars, min ${rules.minDescriptionLength}).`,
      severity: 'warning',
    });
  }

  // Word count validation
  const wordCount = countWords(contentBody);
  if (wordCount < (rules.minWordCount || 300)) {
    issues.push({
      field: 'content',
      rule: 'MIN_WORD_COUNT',
      message: `Article content has only ${wordCount} words (min ${rules.minWordCount}).`,
      severity: 'error',
    });
  }

  // Forbidden / High-risk phrases check
  const fullTextLower = `${title} ${description} ${contentBody}`.toLowerCase();
  for (const phrase of rules.forbiddenKeywords || []) {
    if (fullTextLower.includes(phrase.toLowerCase())) {
      issues.push({
        field: 'content',
        rule: 'FORBIDDEN_PHRASE',
        message: `Article contains forbidden or spam-flagged phrase: "${phrase}".`,
        severity: 'error',
      });
    }
  }

  // Calculate quality score (0-100)
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  let score = 100 - errorCount * 30 - warningCount * 10;
  score = Math.max(0, Math.min(100, score));

  const passed = errorCount === 0 && score >= 70;
  const state: QualityState = passed ? 'APPROVED' : errorCount > 0 ? 'REJECTED' : 'DETERMINISTIC_VALIDATION';

  return {
    passed,
    state,
    score,
    issues,
    validatedAt: new Date().toISOString(),
  };
}
