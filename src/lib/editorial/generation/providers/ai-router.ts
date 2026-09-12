import type { IGenerationProvider, ProviderGenerationPayload } from './types.ts';
import type { GenerationRequest, GeneratedArticle } from '../types.ts';
import { buildGenerationPrompt } from '../prompt.ts';
import { AIRouter, defaultAIRouter } from '../../../ai/router.ts';
import type { AIRequest } from '../../../ai/types.ts';

import { sanitizeArticleContent } from '../../sanitization.ts';
import { extractAndParseJson } from '../../../ai/json-extractor.ts';

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
   * Cleans JSON and parses the response into a structured article package.
   */
  private parseGeneratedJson(rawText: string): GeneratedArticle {
    const parsed = extractAndParseJson<any>(rawText);
    const rawContent = parsed.content || '';

    const { cleanContent, extractedMetadata } = sanitizeArticleContent(rawContent);

    const internalLinks = Array.isArray(parsed.internalLinks) && parsed.internalLinks.length > 0
      ? parsed.internalLinks
      : extractedMetadata.internalLinks;

    const affiliateIntents = Array.isArray(parsed.affiliateIntents) && parsed.affiliateIntents.length > 0
      ? parsed.affiliateIntents
      : extractedMetadata.affiliateIntents;

    const socialHooks = Array.isArray(parsed.socialHooks) && parsed.socialHooks.length > 0
      ? parsed.socialHooks
      : extractedMetadata.socialHooks;

    return {
      title: parsed.title || '',
      slug: parsed.slug || '',
      description: parsed.description || '',
      excerpt: parsed.excerpt || '',
      content: cleanContent,
      faq: Array.isArray(parsed.faq) ? parsed.faq : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      internalLinks,
      affiliateIntents,
      socialHooks,
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
      maxOutputTokens: 3000,
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
