import type { ReviewRequest, ReviewResult, ReviewDecisionPolicy, ReviewDimensionKey, ReviewDimensionScore } from './types.ts';
import type { IAIReviewProvider } from './providers/types.ts';
import { evaluateReviewGates } from './gates.ts';
import { buildReviewPrompt } from './prompt.ts';
import { validateReviewResponse, REQUIRED_REVIEW_DIMENSIONS } from './validation.ts';
import { evaluateReviewDecision, DEFAULT_REVIEW_POLICY } from './decision.ts';

export interface RunReviewPipelineOptions {
  request: ReviewRequest;
  provider: IAIReviewProvider;
  customPolicy?: Partial<ReviewDecisionPolicy>;
}

function createFallbackZeroDimensions(reason: string): Record<ReviewDimensionKey, ReviewDimensionScore> {
  const dims = {} as Record<ReviewDimensionKey, ReviewDimensionScore>;
  for (const key of REQUIRED_REVIEW_DIMENSIONS) {
    dims[key] = {
      score: 0,
      rationale: `Evaluation aborted: ${reason}`,
      issues: [reason],
    };
  }
  return dims;
}

/**
 * Runs the AI Quality Review V1 Pipeline.
 *
 * Flow:
 * 1. Deterministic Review Gates (short-circuits critical structural/safety issues)
 * 2. Prompt Construction
 * 3. AI Reviewer Invocation (isolated error boundary)
 * 4. Review Output Validation
 * 5. Deterministic Decision Policy (calculates final PASS / REVISE / REJECT)
 */
export async function runReviewPipeline(
  options: RunReviewPipelineOptions
): Promise<ReviewResult> {
  const { request, provider, customPolicy } = options;
  const startTime = Date.now();

  // 1. Evaluate Deterministic Gates
  const gateResult = evaluateReviewGates(request);

  // If deterministic gates fail with critical issues, short-circuit before calling AI
  if (!gateResult.passed) {
    const durationMs = Math.max(1, Date.now() - startTime);
    return {
      decision: 'REJECT',
      overallScore: 0,
      dimensions: createFallbackZeroDimensions('Failed deterministic pre-review gate.'),
      criticalIssues: gateResult.criticalIssues,
      warnings: gateResult.warnings,
      reviewer: provider.name,
      metadata: {
        provider: provider.name,
        model: provider.model,
        reviewedAt: new Date().toISOString(),
        durationMs,
        inputTokenEstimate: 0,
        outputTokenEstimate: 0,
      },
      gatePassed: false,
      gateIssues: gateResult.criticalIssues,
    };
  }

  // 2. Build review prompt (for telemetry / inspection)
  const promptPayload = buildReviewPrompt(request);
  const estimatedInputTokens = Math.max(10, Math.ceil(promptPayload.fullPromptText.length / 4));

  // 3. Invoke Review Provider
  let rawResponse;
  try {
    rawResponse = await provider.review(request);
  } catch (err: any) {
    // Provider failure NEVER produces PASS
    const durationMs = Math.max(1, Date.now() - startTime);
    const failureMsg = err?.message || 'Review provider execution failed';
    return {
      decision: 'REJECT',
      overallScore: 0,
      dimensions: createFallbackZeroDimensions(`Provider error: ${failureMsg}`),
      criticalIssues: [`Review provider execution failed: ${failureMsg}`],
      warnings: gateResult.warnings,
      reviewer: provider.name,
      metadata: {
        provider: provider.name,
        model: provider.model,
        reviewedAt: new Date().toISOString(),
        durationMs,
        inputTokenEstimate: estimatedInputTokens,
        outputTokenEstimate: 0,
      },
      gatePassed: true,
    };
  }

  // 4. Validate Provider Output
  const validationReport = validateReviewResponse(rawResponse);
  if (!validationReport.isValid) {
    const durationMs = Math.max(1, Date.now() - startTime);
    return {
      decision: 'REJECT',
      overallScore: 0,
      dimensions: createFallbackZeroDimensions('Review response validation failed.'),
      criticalIssues: validationReport.issues.map((i) => `Review response validation failed: ${i}`),
      warnings: gateResult.warnings,
      reviewer: provider.name,
      metadata: {
        provider: provider.name,
        model: provider.model,
        reviewedAt: new Date().toISOString(),
        durationMs,
        inputTokenEstimate: estimatedInputTokens,
        outputTokenEstimate: 0,
      },
      gatePassed: true,
    };
  }

  // 5. Apply Deterministic Decision Policy
  const decision = evaluateReviewDecision({
    overallScore: rawResponse.overallScore,
    dimensions: rawResponse.dimensions,
    criticalIssues: rawResponse.criticalIssues,
    gatePassed: true,
    riskLevel: request.riskLevel,
    customPolicy: { ...DEFAULT_REVIEW_POLICY, ...customPolicy },
  });

  const durationMs = Math.max(1, Date.now() - startTime);

  return {
    decision,
    overallScore: rawResponse.overallScore,
    dimensions: rawResponse.dimensions,
    criticalIssues: rawResponse.criticalIssues,
    warnings: [...gateResult.warnings, ...(rawResponse.warnings || [])],
    reviewer: provider.name,
    metadata: {
      provider: rawResponse.metadata?.provider || provider.name,
      model: rawResponse.metadata?.model || provider.model,
      reviewedAt: rawResponse.metadata?.reviewedAt || new Date().toISOString(),
      durationMs: rawResponse.metadata?.durationMs || durationMs,
      inputTokenEstimate: rawResponse.metadata?.inputTokenEstimate || estimatedInputTokens,
      outputTokenEstimate: rawResponse.metadata?.outputTokenEstimate || 350,
    },
    gatePassed: true,
  };
}
