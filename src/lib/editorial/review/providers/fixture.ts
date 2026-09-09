import type { IAIReviewProvider, RawAIReviewResponse } from './types.ts';
import type { ReviewRequest, ReviewDimensionKey, ReviewDimensionScore } from '../types.ts';

export type FixtureReviewOutcome = 'PASS' | 'REVISE' | 'REJECT' | 'MALFORMED' | 'FORCED_ERROR';

export interface FixtureReviewOptions {
  name?: string;
  model?: string;
  outcome?: FixtureReviewOutcome;
  outcomes?: FixtureReviewOutcome[];
  customResponse?: Partial<RawAIReviewResponse>;
}

/**
 * Creates a standard full set of 10 dimension scores.
 */
function createStandardDimensions(baseScore: number, rationalePrefix: string): Record<ReviewDimensionKey, ReviewDimensionScore> {
  const dimensions: ReviewDimensionKey[] = [
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

  const result = {} as Record<ReviewDimensionKey, ReviewDimensionScore>;
  for (const dim of dimensions) {
    result[dim] = {
      score: baseScore,
      rationale: `${rationalePrefix} for ${dim}.`,
      issues: [],
    };
  }
  return result;
}

/**
 * Deterministic offline AI Review Provider for testing Quality Review V1.
 */
export class FixtureReviewProvider implements IAIReviewProvider {
  readonly name: string;
  readonly model: string;
  private outcome: FixtureReviewOutcome;
  private outcomes?: FixtureReviewOutcome[];
  private customResponse?: Partial<RawAIReviewResponse>;

  constructor(options: FixtureReviewOptions = {}) {
    this.name = options.name || 'Fixture AI Reviewer';
    this.model = options.model || 'fixture-review-v1';
    this.outcome = options.outcome || 'PASS';
    this.outcomes = options.outcomes ? [...options.outcomes] : undefined;
    this.customResponse = options.customResponse;
  }

  setOutcome(outcome: FixtureReviewOutcome): void {
    this.outcome = outcome;
  }

  setCustomResponse(custom: Partial<RawAIReviewResponse>): void {
    this.customResponse = custom;
  }

  async review(_request: ReviewRequest): Promise<RawAIReviewResponse> {
    const currentOutcome = (this.outcomes && this.outcomes.length > 0)
      ? this.outcomes.shift()!
      : this.outcome;

    if (currentOutcome === 'FORCED_ERROR') {
      throw new Error('Simulated upstream AI reviewer service outage');
    }

    if (currentOutcome === 'MALFORMED') {
      // Missing required dimensions and invalid score
      return {
        overallScore: 150, // Invalid score > 100
        dimensions: {} as any, // Missing dimensions
        criticalIssues: 'not an array' as any,
        warnings: [],
      };
    }

    if (this.customResponse && (!this.outcomes || this.outcomes.length === 0)) {
      const defaultDims = createStandardDimensions(88, 'Good evaluation');
      return {
        overallScore: this.customResponse.overallScore ?? 88,
        dimensions: this.customResponse.dimensions ?? defaultDims,
        criticalIssues: this.customResponse.criticalIssues ?? [],
        warnings: this.customResponse.warnings ?? [],
        metadata: {
          provider: this.name,
          model: this.model,
          reviewedAt: new Date().toISOString(),
          durationMs: 10,
          inputTokenEstimate: 350,
          outputTokenEstimate: 420,
        },
      };
    }

    if (currentOutcome === 'REVISE') {
      const dims = createStandardDimensions(78, 'Adequate quality with minor gaps');
      dims.usefulness.issues = ['Actionable steps in section 2 could be more concrete.'];
      dims.readability.issues = ['Third paragraph in section 1 is slightly long.'];

      return {
        overallScore: 78,
        dimensions: dims,
        criticalIssues: [],
        warnings: [
          'Consider clarifying the implementation protocol in section 2.',
          'Slightly refine paragraph lengths for improved mobile flow.',
        ],
        metadata: {
          provider: this.name,
          model: this.model,
          reviewedAt: new Date().toISOString(),
          durationMs: 12,
          inputTokenEstimate: 320,
          outputTokenEstimate: 390,
        },
      };
    }

    if (currentOutcome === 'REJECT') {
      const dims = createStandardDimensions(54, 'Below acceptable publication standard');
      dims.factuality.score = 45;
      dims.factuality.issues = ['Unverified health claim regarding sleep protocols without scientific citation.'];
      dims.safety.score = 50;
      dims.safety.issues = ['Definitive medical assertion present.'];

      return {
        overallScore: 54,
        dimensions: dims,
        criticalIssues: [
          'Severe factuality issue: unsupported definitive medical assertion.',
          'Fails safety threshold for wellbeing pillar.',
        ],
        warnings: ['Low originality and heavily repetitive phrasing.'],
        metadata: {
          provider: this.name,
          model: this.model,
          reviewedAt: new Date().toISOString(),
          durationMs: 15,
          inputTokenEstimate: 310,
          outputTokenEstimate: 450,
        },
      };
    }

    // Default PASS outcome
    const dims = createStandardDimensions(91, 'High editorial quality meeting LifeMode standards');
    dims.safety.score = 96;
    dims.factuality.score = 92;

    return {
      overallScore: 91,
      dimensions: dims,
      criticalIssues: [],
      warnings: [],
      metadata: {
        provider: this.name,
        model: this.model,
        reviewedAt: new Date().toISOString(),
        durationMs: 10,
        inputTokenEstimate: 340,
        outputTokenEstimate: 380,
      },
    };
  }
}
