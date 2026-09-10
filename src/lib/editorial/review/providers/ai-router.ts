import type { IAIReviewProvider, RawAIReviewResponse } from './types.ts';
import type { ReviewRequest } from '../types.ts';
import { buildReviewPrompt } from '../prompt.ts';
import { AIRouter, defaultAIRouter } from '../../../ai/router.ts';
import type { AIRequest } from '../../../ai/types.ts';
import { extractAndParseJson } from '../../../ai/json-extractor.ts';

/**
 * Adapter bridging the AI Quality Reviewer to the AI Router subsystem.
 * Routes review tasks via `taskType: 'content_review'`.
 */
export class AIRouterReviewProvider implements IAIReviewProvider {
  readonly name = 'AI Router Reviewer';
  readonly model = 'router-managed';
  private router: AIRouter;

  constructor(router: AIRouter = defaultAIRouter) {
    this.router = router;
  }

  /**
   * Cleans JSON and parses the response into a structured raw review package.
   */
  private parseReviewJson(rawText: string): RawAIReviewResponse {
    const parsed = extractAndParseJson<any>(rawText);
    return {
      overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : 0,
      dimensions: parsed.dimensions || {},
      criticalIssues: Array.isArray(parsed.criticalIssues) ? parsed.criticalIssues : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  }

  async review(request: ReviewRequest): Promise<RawAIReviewResponse> {
    const promptPayload = buildReviewPrompt(request);

    const aiRequest: AIRequest = {
      prompt: promptPayload.userPrompt,
      systemPrompt: promptPayload.systemPrompt,
      taskType: 'content_review',
      requestId: `rev-${request.topicId}`,
      responseFormat: 'json',
      validateJson: true,
      maxOutputTokens: 2500,
    };

    const routerResult = await this.router.route(aiRequest);

    if (!routerResult.success) {
      throw new Error(`AI Router review request failed: [${routerResult.error.code}] ${routerResult.error.message}`);
    }

    const parsed = this.parseReviewJson(routerResult.response.text);

    return {
      ...parsed,
      metadata: {
        provider: routerResult.provider,
        model: routerResult.response.model,
        reviewedAt: new Date().toISOString(),
        durationMs: routerResult.response.durationMs,
        inputTokenEstimate: routerResult.response.inputTokens || 350,
        outputTokenEstimate: routerResult.response.outputTokens || 400,
      },
    };
  }
}
