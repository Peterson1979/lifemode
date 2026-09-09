import type { IGenerationProvider, ProviderGenerationPayload } from './types.ts';
import type { GenerationRequest, GeneratedArticle } from '../types.ts';
import { buildGenerationPrompt } from '../prompt.ts';
import { AIRouter, defaultAIRouter } from '../../../ai/router.ts';
import type { AIRequest } from '../../../ai/types.ts';

/**
 * Adapter that connects the Editorial Generation Runner to the AI Router.
 * Bridges: GenerationRequest -> AIRequest -> AIResponse -> GeneratedArticle.
 */
export class AIRouterGenerationProvider implements IGenerationProvider {
  readonly name = 'AI Router Provider';
  readonly model = 'router-managed';
  private router: AIRouter;

  constructor(router: AIRouter = defaultAIRouter) {
    this.router = router;
  }

  /**
   * Cleans JSON markdown fences and parses the response into a structured article package.
   */
  private parseGeneratedJson(rawText: string): GeneratedArticle {
    let clean = rawText.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    const parsed = JSON.parse(clean);
    return {
      title: parsed.title || '',
      slug: parsed.slug || '',
      description: parsed.description || '',
      excerpt: parsed.excerpt || '',
      content: parsed.content || '',
      faq: Array.isArray(parsed.faq) ? parsed.faq : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      internalLinks: Array.isArray(parsed.internalLinks) ? parsed.internalLinks : [],
      affiliateIntents: Array.isArray(parsed.affiliateIntents) ? parsed.affiliateIntents : [],
      socialHooks: Array.isArray(parsed.socialHooks) ? parsed.socialHooks : [],
    };
  }

  async generate(request: GenerationRequest): Promise<ProviderGenerationPayload> {
    const promptPayload = buildGenerationPrompt(request);

    const aiRequest: AIRequest = {
      prompt: promptPayload.userPrompt,
      systemPrompt: promptPayload.systemPrompt,
      taskType: 'content_generation',
      requestId: request.topicId,
      responseFormat: 'json',
      validateJson: true,
      maxOutputTokens: 6000,
    };

    const routerResult = await this.router.route(aiRequest);

    if (!routerResult.success) {
      throw new Error(`AI Router generation failed: [${routerResult.error.code}] ${routerResult.error.message}`);
    }

    const article = this.parseGeneratedJson(routerResult.response.text);

    return {
      article,
      metadata: {
        provider: routerResult.provider,
        model: routerResult.response.model,
        generatedAt: new Date().toISOString(),
        inputTokenEstimate: routerResult.response.inputTokens || 300,
        outputTokenEstimate: routerResult.response.outputTokens || 500,
        durationMs: routerResult.response.durationMs,
      },
    };
  }
}
