import type { ISocialReviewProvider, SocialReviewRequest } from '../contracts.ts';
import type { SocialReviewResult } from '../../types.ts';
import { buildSocialReviewPrompt } from '../prompt.ts';
import { AIRouter, defaultAIRouter } from '../../../ai/router.ts';
import type { AIRequest } from '../../../ai/types.ts';

export class AIRouterSocialReviewProvider implements ISocialReviewProvider {
  readonly name = 'AI Router Social Review Provider';
  private router: AIRouter;

  constructor(router: AIRouter = defaultAIRouter) {
    this.router = router;
  }

  async reviewSocialContent(request: SocialReviewRequest): Promise<SocialReviewResult> {
    const prompt = buildSocialReviewPrompt(request);

    const aiRequest: AIRequest = {
      prompt,
      taskType: 'content_review',
      maxOutputTokens: 1000,
      temperature: 0.2, // Low temperature for deterministic evaluation
      responseFormat: 'json',
    };

    try {
      const result = await this.router.route(aiRequest);

      if (!result.success) {
        return {
          passed: false,
          score: 0,
          verdict: 'REJECT',
          feedback: {
            brandAlignment: 0,
            readability: 0,
            factuality: 0,
            safety: 0,
            platformSuitability: 0,
            notes: `AI Review router failed: ${result.error?.message || 'Router failed'}`,
          },
        };
      }

      if (!result.response?.text) {
        return {
          passed: false,
          score: 0,
          verdict: 'REJECT',
          feedback: {
            brandAlignment: 0,
            readability: 0,
            factuality: 0,
            safety: 0,
            platformSuitability: 0,
            notes: 'AI Review router returned empty response text.',
          },
        };
      }

      let clean = result.response.text.trim();
      if (clean.startsWith('```json')) {
        clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (clean.startsWith('```')) {
        clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      const parsed = JSON.parse(clean);
      const score = typeof parsed.score === 'number' ? parsed.score : 80;
      const verdict = parsed.verdict || (score >= 80 ? 'PASS' : score >= 60 ? 'REVISE' : 'REJECT');

      return {
        passed: verdict === 'PASS' && score >= 80,
        score,
        verdict,
        feedback: {
          brandAlignment: parsed.feedback?.brandAlignment || 80,
          readability: parsed.feedback?.readability || 80,
          factuality: parsed.feedback?.factuality || 80,
          safety: parsed.feedback?.safety || 80,
          platformSuitability: parsed.feedback?.platformSuitability || 80,
          notes: parsed.feedback?.notes || 'Social package review complete.',
        },
        revisedContent: parsed.revisedContent || undefined,
      };
    } catch (err: any) {
      return {
        passed: false,
        score: 0,
        verdict: 'REJECT',
        feedback: {
          brandAlignment: 0,
          readability: 0,
          factuality: 0,
          safety: 0,
          platformSuitability: 0,
          notes: `Failed to parse AI review output: ${err?.message || String(err)}`,
        },
      };
    }
  }
}
