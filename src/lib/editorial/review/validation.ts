import type { RawAIReviewResponse } from './providers/types.ts';
import type { ReviewDimensionKey } from './types.ts';

export interface ReviewValidationReport {
  isValid: boolean;
  issues: string[];
}

export const REQUIRED_REVIEW_DIMENSIONS: ReviewDimensionKey[] = [
  'factuality',
  'usefulness',
  'originality',
  'readability',
  'structure',
  'searchIntent',
  'seo',
  'editorialFit',
  'safety',
  'monetizationFit',
];

/**
 * Validates that an AI Reviewer's raw output strictly satisfies structural,
 * dimension, and score boundary requirements.
 */
export function validateReviewResponse(raw: Partial<RawAIReviewResponse>): ReviewValidationReport {
  const issues: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      isValid: false,
      issues: ['Review response is null, undefined, or not an object.'],
    };
  }

  // 1. Overall score validation
  if (typeof raw.overallScore !== 'number' || Number.isNaN(raw.overallScore)) {
    issues.push('overallScore is missing or not a valid number.');
  } else if (raw.overallScore < 0 || raw.overallScore > 100) {
    issues.push(`overallScore ${raw.overallScore} is out of bounds [0, 100].`);
  }

  // 2. Critical issues and warnings arrays
  if (!Array.isArray(raw.criticalIssues)) {
    issues.push('criticalIssues must be an array of strings.');
  }

  if (!Array.isArray(raw.warnings)) {
    issues.push('warnings must be an array of strings.');
  }

  // 3. Dimensions object validation
  if (!raw.dimensions || typeof raw.dimensions !== 'object') {
    issues.push('dimensions object is missing or invalid.');
  } else {
    for (const dimKey of REQUIRED_REVIEW_DIMENSIONS) {
      const dim = raw.dimensions[dimKey];
      if (!dim || typeof dim !== 'object') {
        issues.push(`Missing required review dimension: "${dimKey}".`);
      } else {
        if (typeof dim.score !== 'number' || Number.isNaN(dim.score)) {
          issues.push(`Dimension "${dimKey}" has an invalid score (must be a number).`);
        } else if (dim.score < 0 || dim.score > 100) {
          issues.push(`Dimension "${dimKey}" score ${dim.score} is out of bounds [0, 100].`);
        }

        if (typeof dim.rationale !== 'string' || !dim.rationale.trim()) {
          issues.push(`Dimension "${dimKey}" is missing a non-empty rationale.`);
        }

        if (dim.issues !== undefined && !Array.isArray(dim.issues)) {
          issues.push(`Dimension "${dimKey}" issues must be an array.`);
        }
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
