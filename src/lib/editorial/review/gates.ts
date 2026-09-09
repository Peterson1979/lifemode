import type { ReviewRequest } from './types.ts';
import { countWords } from '../quality.ts';

export interface ReviewGateResult {
  passed: boolean;
  criticalIssues: string[];
  warnings: string[];
}

const SUSPICIOUS_URL_PATTERNS = [
  /example\.com/i,
  /placeholder\.com/i,
  /mysite\.com/i,
  /yourwebsite\.com/i,
  /test\.com/i,
];

const AI_ARTIFACT_PATTERNS = [
  /as an ai language model/i,
  /as an ai/i,
  /certainly,? here is/i,
  /here is (the|an|your) (article|guide|breakdown|post)/i,
  /in this article, we (will|have)/i,
  /in conclusion, in summary/i,
  /as of my knowledge cutoff/i,
];

const PLACEHOLDER_PATTERNS = [
  /\{\{[^}]+\}\}/, // {{placeholder}}
  /<placeholder>/i,
  /\[insert\s+[^\]]+\]/i, // [insert link], [insert quote]
  /\[citation needed\]/i,
  /\[object Object\]/,
  /\bTODO\b/,
  /\bFIXME\b/,
];

const FORBIDDEN_PROMOTIONAL_PHRASES = [
  'guaranteed returns',
  'miracle cure',
  'get rich quick',
  'instant wealth',
  '100% foolproof',
  'secret trick they dont want you to know',
];

/**
 * Runs deterministic gates on an article package BEFORE invoking the AI Reviewer.
 * Short-circuits critical failures to prevent unnecessary model inference.
 */
export function evaluateReviewGates(request: ReviewRequest): ReviewGateResult {
  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  // 1. Required core fields
  const title = (request.title || '').trim();
  if (!title) {
    criticalIssues.push('Article title is missing or empty.');
  }

  const description = (request.description || '').trim();
  if (!description) {
    criticalIssues.push('Article description is missing or empty.');
  } else if (description.length < 30) {
    warnings.push(`Article description is unusually brief (${description.length} chars).`);
  }

  const content = (request.content || '').trim();
  if (!content) {
    criticalIssues.push('Article content body is missing or empty.');
  } else {
    const wordCount = countWords(content);

    // 2. Minimum length check against brief target
    if (request.estimatedWordCount?.min) {
      const targetMin = request.estimatedWordCount.min;
      const lowerBoundary = Math.floor(targetMin * 0.8);

      if (wordCount < lowerBoundary) {
        criticalIssues.push(
          `Article content is severely undersized (${wordCount} words) compared to brief target minimum of ${targetMin} words (acceptable threshold >= ${lowerBoundary} words).`
        );
      } else if (wordCount < targetMin) {
        warnings.push(
          `Article content is slightly below brief target minimum (${wordCount} words, target min ${targetMin} words).`
        );
      }
    } else if (wordCount < 80) {
      criticalIssues.push(`Article content is too short for review (${wordCount} words, minimum 80 words required).`);
    }

    // 3. Heading structure check
    const h2Matches = content.match(/^##\s+.+$/gm) || [];
    if (h2Matches.length === 0) {
      criticalIssues.push('Article content lacks required H2 subheadings (## Heading).');
    }

    // 4. Empty heading sections
    const emptySectionPattern = /##\s+[^\n]+\n\s*\n(?=##\s+)/;
    if (emptySectionPattern.test(content)) {
      warnings.push('Article contains an empty heading section without body content.');
    }
  }

  // 4b. Generation validation report check
  if (request.deterministicValidation && !request.deterministicValidation.isValid) {
    const validationErrors = request.deterministicValidation.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `Generation validation failure [${i.field} / ${i.rule}]: ${i.message}`);
    criticalIssues.push(...validationErrors);
  }

  const fullText = `${title} ${description} ${request.excerpt || ''} ${content}`;

  // 5. Placeholder & Debug artifacts
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(fullText)) {
      criticalIssues.push(`Detected unresolved template placeholder or debug artifact: ${pattern.toString()}`);
    }
  }

  // 6. Conversational AI artifacts
  for (const pattern of AI_ARTIFACT_PATTERNS) {
    if (pattern.test(fullText)) {
      warnings.push(`Content contains AI preamble or conversational artifact: "${pattern.toString()}"`);
    }
  }

  // 7. Forbidden promotional / spam phrases
  const lowerFullText = fullText.toLowerCase();
  for (const phrase of FORBIDDEN_PROMOTIONAL_PHRASES) {
    if (lowerFullText.includes(phrase.toLowerCase())) {
      criticalIssues.push(`Article contains forbidden promotional / spam phrase: "${phrase}".`);
    }
  }

  // 8. Sources & URL checks
  if (request.sources && Array.isArray(request.sources)) {
    for (const src of request.sources) {
      if (src.url) {
        for (const pattern of SUSPICIOUS_URL_PATTERNS) {
          if (pattern.test(src.url)) {
            warnings.push(`Source citation URL "${src.url}" appears to be a dummy or placeholder domain.`);
          }
        }
      }
    }
  }

  // 9. High-risk topic safety check
  if (request.riskLevel === 'high') {
    if (!request.sources || request.sources.length === 0) {
      criticalIssues.push('High-risk editorial topic requires verified source attribution, but no sources were provided.');
    }
  }

  return {
    passed: criticalIssues.length === 0,
    criticalIssues,
    warnings,
  };
}
