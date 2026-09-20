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

export const FORMULAIC_TITLE_PATTERNS: RegExp[] = [
  /:\s*a\s+(modern|complete|comprehensive|definitive|ultimate)\s+guide\s+to/i,
  /\ba\s+modern\s+guide\s+to\b/i,
  /\bthe\s+ultimate\s+guide\s+to\b/i,
  /\bcomprehensive\s+guide:\b/i,
  /\ba\s+complete\s+guide\s+to\b/i,
  /\beverything\s+you\s+need\s+to\s+know\s+about\b/i,
  /\ball\s+you\s+need\s+to\s+know\b/i,
  /:\s*(what to know|what you should know|what you need to know|what to know right now)$/i,
  /\bwhy\s+.+\s+are\s+essential\s+in\s+20\d\d\b/i,
  /\bmastering\s+.+:\s*a\s+(complete|definitive|modern)\s+guide\b/i,
  /:\s*a\s+definitive\s+guide\b/i,
  /\btrends,?\s+signals\s+&\s+zeitgeist\b/i,
  /\bdestinations\s+&\s+global\s+journeys\b/i,
  /\bliving,?\s+habits\s+&\s+daily\s+rituals\b/i,
  /\bintelligent\s+tools\s+&\s+innovation\b/i,
  /\bwealth,?\s+strategy\s+&\s+freedom\b/i,
  /\bhealth,?\s+vitality\s+&\s+mindset\b/i,
  /\bculture,?\s+books\s+&\s+design\b/i,
];

export const GENERIC_EXCERPT_PATTERNS: RegExp[] = [
  /\bdiscover\s+our\s+editorial\s+guide\b/i,
  /\bexplore\s+key\s+principles\b/i,
  /\bcurated\s+perspectives\s+for\b/i,
  /\bin\s+today'?s\s+fast-paced\s+world\b/i,
  /\bwhen\s+it\s+comes\s+to\b/i,
  /\bit\s+is\s+important\s+to\b/i,
  /\bleverages\s+seamless\s+tools\b/i,
  /\belevate\s+your\b/i,
  /in this article,?\s+we/i,
  /read on to discover/i,
  /dive into/i,
  /explore the world of/i,
  /everything you need to know/i,
  /what you need to know/i,
];

export interface RepetitivePatternResult {
  isRepetitive: boolean;
  pattern?: string;
  matchCount?: number;
  reason?: string;
}

/**
 * Checks if a given title matches known formulaic or generic patterns.
 */
export function detectFormulaicTitle(title: string): boolean {
  if (!title) return false;
  return FORMULAIC_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

/**
 * Extracts normalized structural skeleton pattern from a title for repetition tracking.
 */
export function extractTitleStructurePattern(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // 1. Check for colon-separated suffix patterns (e.g. "X: What to Know", "X: A Modern Guide")
  const colonMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const suffix = colonMatch[2].toLowerCase().trim();
    // Return generalized suffix pattern
    return `: ${suffix}`;
  }

  // 2. Check for leading phrase patterns (e.g. "Why X Is ...", "Inside X: ...", "Exploring X ...", "The Shift Toward ...")
  const leadingMatch = trimmed.match(/^(why|how|inside|exploring|discovering|understanding|the shift toward|what's behind|what is behind|a practical guide to|a guide to|the new)\b/i);
  if (leadingMatch) {
    return leadingMatch[1].toLowerCase();
  }

  return null;
}

/**
 * Detects excessive reuse of identical structural title patterns across recent articles.
 * Rejects or flags candidate titles that duplicate a pattern already used >= maxRepetitions times in the window.
 */
export function detectRepetitiveTitlePattern(
  candidateTitle: string,
  recentTitles: string[] = [],
  maxRepetitions = 2
): RepetitivePatternResult {
  if (!candidateTitle || !recentTitles || recentTitles.length === 0) {
    return { isRepetitive: false };
  }

  const candidatePattern = extractTitleStructurePattern(candidateTitle);
  if (!candidatePattern) {
    return { isRepetitive: false };
  }

  let matchCount = 0;
  for (const recent of recentTitles) {
    const recentPattern = extractTitleStructurePattern(recent);
    if (recentPattern && recentPattern === candidatePattern) {
      matchCount++;
    }
  }

  if (matchCount >= maxRepetitions) {
    return {
      isRepetitive: true,
      pattern: candidatePattern,
      matchCount,
      reason: `Title structure "${candidatePattern}" has been used in ${matchCount} recent articles (max allowed: ${maxRepetitions - 1}). Diverse editorial headlines are required.`,
    };
  }

  return { isRepetitive: false, matchCount };
}

/**
 * Validates an article title against length, quality, and anti-formula rules.
 */
export function validateTitle(
  title: string,
  options: { minLength?: number; maxLength?: number; recentTitles?: string[] } = {}
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmed = (title || '').trim();
  const minLength = options.minLength ?? 10;
  const maxLength = options.maxLength ?? 100;

  if (!trimmed) {
    errors.push('Title is required.');
    return { valid: false, errors };
  }

  if (trimmed.length < minLength) {
    errors.push(`Title is too short (${trimmed.length} chars, min ${minLength}).`);
  }

  if (trimmed.length > maxLength) {
    errors.push(`Title is too long (${trimmed.length} chars, max ${maxLength}).`);
  }

  for (const pattern of FORMULAIC_TITLE_PATTERNS) {
    if (pattern.test(trimmed)) {
      errors.push(`Title matches formulaic template pattern: ${pattern.toString()}`);
      break;
    }
  }

  if (options.recentTitles && options.recentTitles.length > 0) {
    const repetition = detectRepetitiveTitlePattern(trimmed, options.recentTitles);
    if (repetition.isRepetitive) {
      errors.push(repetition.reason || 'Title uses a repetitive structural pattern.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an article description / excerpt against length, quality, and boilerplate rules.
 */
export function validateDescription(description: string, options: { minLength?: number; maxLength?: number } = {}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmed = (description || '').trim();
  const minLength = options.minLength ?? 30;
  const maxLength = options.maxLength ?? 250;

  if (!trimmed) {
    errors.push('Description is required.');
    return { valid: false, errors };
  }

  if (trimmed.length < minLength) {
    errors.push(`Description is too short (${trimmed.length} chars, min ${minLength}).`);
  }

  if (trimmed.length > maxLength) {
    errors.push(`Description is too long (${trimmed.length} chars, max ${maxLength}).`);
  }

  for (const pattern of GENERIC_EXCERPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      errors.push(`Description contains generic boilerplate template: ${pattern.toString()}`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
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

  // Check for formulaic title constructions
  for (const pattern of FORMULAIC_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      issues.push({
        field: 'title',
        rule: 'FORMULAIC_TITLE',
        message: `Title uses a formulaic template pattern: "${pattern.toString()}".`,
        severity: 'warning',
      });
      break;
    }
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

  // Check for generic excerpt boilerplate
  for (const pattern of GENERIC_EXCERPT_PATTERNS) {
    if (pattern.test(description)) {
      issues.push({
        field: 'description',
        rule: 'GENERIC_EXCERPT_BOILERPLATE',
        message: `Description contains generic boilerplate template: "${pattern.toString()}".`,
        severity: 'warning',
      });
      break;
    }
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
