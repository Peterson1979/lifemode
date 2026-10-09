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
  /:\s*(?:a|the)\s+(?:modern|complete|comprehensive|definitive|ultimate)\s+guide\b/i,
  /\ba\s+modern\s+guide\s+to\b/i,
  /\bthe\s+ultimate\s+guide\s+to\b/i,
  /\bcomprehensive\s+guide:\b/i,
  /\ba\s+complete\s+guide\s+to\b/i,
  /\beverything\s+you\s+need\s+to\s+know\s+about\b/i,
  /\ball\s+you\s+need\s+to\s+know\b/i,
  /:\s*(what to know|what you should know|what you need to know|what to know right now)$/i,
  /\bwhy\s+.+\s+are\s+essential\s+in\s+20\d\d\b/i,
  /\bmastering\s+.+:\s*a\s+(complete|definitive|modern)\s+guide\b/i,
  /\b(?:the\s+art\s+of|the\s+poetry\s+of)\s+[^:]+:\s*restraint/i,
  /\brestraint,?\s*craft,?\s*(?:and|&)\s*purpose\b/i,
  /\belevates?\s+(?:(?:modern|contemporary|daily)\s+)+living\b/i,
  /\ba\s+contemporary\s+perspective\b/i,
  /\bfor\s+(modern|contemporary)\s+(daily\s+)?living\b/i,
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

export const GENERIC_CONTENT_FILLER_PATTERNS: RegExp[] = [
  /\bexploring the dynamics of\b/i,
  /\bimplementing this priority\b/i,
  /\bby establishing structured routines\b/i,
  /\bto maximize the impact of this approach\b/i,
  /\bpreserve cognitive bandwidth\b/i,
  /\bprotect cognitive bandwidth\b/i,
  /\bhigh-leverage aspirations\b/i,
  /\bhigh-leverage micro-decisions\b/i,
  /\bhigh-leverage adjustments\b/i,
  /\bin an era characterized by relentless digital stimuli\b/i,
  /\bcultivates an enduring state of flow\b/i,
  /\bcreating an environment that minimizes friction\b/i,
  /\bsmall,?\s*repeatable workflows that compound\b/i,
  /\bestablishing an enduring relationship with\b/i,
  /\bcontributes to a cohesive,?\s*calm,?\s*and high-performing environment\b/i,
  /\beliminating friction points before introducing\b/i,
  /\btrue mastery lies in reduction rather than accumulation\b/i,
  /\bdeliberate cognitive effort becomes second nature\b/i,
  /\bfreeing your attention for creative and high-leverage\b/i,
  /\bnavigating contemporary challenges with confidence,?\s*balance,?\s*and timeless grace\b/i,
  /\blet each mindful decision reinforce your broader lifestyle vision\b/i,
  /\belevates contemporary daily living\b/i,
  /\bembracing everyday care\b/i,
  /\bcontemporary expression of .+ is substantially enriched\b/i,
  /\bdistinguishing between high-signal investments and speculative novelties\b/i,
  /\btranslating conceptual enthusiasm for .+ into tangible lifestyle improvements\b/i,
];

/**
 * Detects generic reusable AI filler in article text.
 */
export function detectGenericContentFiller(text: string): { hasFiller: boolean; matches: string[] } {
  if (!text) return { hasFiller: false, matches: [] };
  const matches: string[] = [];
  for (const pattern of GENERIC_CONTENT_FILLER_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(pattern.toString());
    }
  }
  return { hasFiller: matches.length > 0, matches };
}

const TOPIC_STOP_WORDS = new Set([
  'how', 'to', 'what', 'why', 'when', 'where', 'which', 'who', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'for', 'of', 'with', 'by', 'from', 'into', 'vs', 'versus', 'guide', 'modern', 'practical', 'essential', 'insights', 'everyday', 'daily', 'best', 'top', 'step', 'protocol', 'framework', 'tips', 'review', 'analysis', 'overview', 'complete', 'definitive', 'ultimate', 'your', 'you', 'our', 'is', 'are', 'can', 'will', 'should', 'about', 'life', 'lifemode', '2024', '2025', '2026', '2027', 'step-by-step', 'stepbystep'
]);

/**
 * Extracts substantive entity keywords from a title or topic ID.
 */
export function extractSubstantiveTopicTerms(title: string, topicId?: string): string[] {
  const combined = `${title || ''} ${(topicId || '').replace(/^lm-[a-z0-9-]+-/, '').replace(/-/g, ' ')}`.toLowerCase();
  const words = combined.replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !TOPIC_STOP_WORDS.has(w));
  return Array.from(new Set(words));
}

/**
 * Evaluates whether the content actually contains topic-specific subject matter
 * rather than being a generic, topic-empty essay.
 */
export function validateTopicContentSpecificity(
  title: string,
  content: string,
  topicId?: string
): { isSpecific: boolean; matchedTerms: string[]; reason?: string } {
  if (!content) {
    return { isSpecific: false, matchedTerms: [], reason: 'Content is empty.' };
  }

  const substantiveTerms = extractSubstantiveTopicTerms(title, topicId);
  if (substantiveTerms.length === 0) {
    return { isSpecific: true, matchedTerms: [] };
  }

  const lowerContent = content.toLowerCase();
  const matchedTerms = substantiveTerms.filter((term) => lowerContent.includes(term));

  // If there are at least 2 substantive terms in the title/topic and none match in content
  if (substantiveTerms.length >= 2 && matchedTerms.length === 0) {
    return {
      isSpecific: false,
      matchedTerms: [],
      reason: `Article content lacks substantive topic-specific material and fails topic coherence (none of the expected topic keywords [${substantiveTerms.slice(0, 5).join(', ')}] appear in the content body).`,
    };
  }

  return { isSpecific: true, matchedTerms };
}

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
