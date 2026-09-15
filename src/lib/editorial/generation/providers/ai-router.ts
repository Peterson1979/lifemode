import type { IGenerationProvider, ProviderGenerationPayload } from './types.ts';
import type { GenerationRequest, GeneratedArticle } from '../types.ts';
import { buildGenerationPrompt } from '../prompt.ts';
import { AIRouter, defaultAIRouter } from '../../../ai/router.ts';
import type { AIRequest } from '../../../ai/types.ts';
import { FixtureGenerationProvider } from './fixture.ts';
import { sanitizeArticleContent } from '../../sanitization.ts';
import { extractAndParseJson } from '../../../ai/json-extractor.ts';
import { AFFILIATE_DISCLOSURE_PATTERNS } from '../../validation/validator.ts';

/**
 * Adapter that connects the Editorial Generation Runner to the AI Router.
 * Bridges: GenerationRequest -> AIRequest -> AIResponse -> GeneratedArticle.
 * Includes bounded deterministic fallback to preserve editorial throughput.
 */
export class AIRouterGenerationProvider implements IGenerationProvider {
  readonly name = 'AI Router Provider';
  readonly model = 'router-managed';
  private router: AIRouter;
  private fallbackProvider: IGenerationProvider | null;

  constructor(
    router: AIRouter = defaultAIRouter,
    fallbackProvider: IGenerationProvider | null = new FixtureGenerationProvider()
  ) {
    this.router = router;
    this.fallbackProvider = fallbackProvider;
  }

  /**
   * Cleans JSON and parses the response into a structured article package.
   */
  private parseGeneratedJson(rawText: string, request?: GenerationRequest): GeneratedArticle {
    const parsed = extractAndParseJson<any>(rawText);
    const rawContent = parsed.content || '';

    if (!rawContent.trim() || !parsed.title?.trim()) {
      throw new Error('Generated output is missing required content or title.');
    }

    const { cleanContent: baseCleanContent, extractedMetadata } = sanitizeArticleContent(rawContent);
    let cleanContent = baseCleanContent;

    // Guarantee required affiliate disclosure is present if commercial recommendations/intent exist
    if (request?.affiliateGuidance?.disclosureRequired) {
      const hasDisclosure = AFFILIATE_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(cleanContent));
      if (!hasDisclosure) {
        const disclosure = request.affiliateGuidance.disclosureText || 'LifeMode may earn an affiliate commission on purchases made through verified partner recommendations.';
        cleanContent = `${cleanContent.trim()}\n\n*Editorial Disclosure: ${disclosure}*`;
      }
    }

    // Guarantee required safety disclaimer is present if riskLevel is high
    if (request?.riskLevel === 'high') {
      const hasDisclaimer = /disclaimer|educational purposes only|consult a doctor/i.test(cleanContent);
      if (!hasDisclaimer) {
        cleanContent = `*Editorial Disclaimer: This content is for educational purposes only. Consult a doctor or qualified professional for advice.*\n\n${cleanContent.trim()}`;
      }
    }

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
    const startTime = Date.now();
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

    let routerError: Error | null = null;

    try {
      const routerResult = await this.router.route(aiRequest);

      if (routerResult.success && routerResult.response?.text) {
        try {
          const article = this.parseGeneratedJson(routerResult.response.text, request);

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
        } catch (jsonErr: any) {
          routerError = new Error(`AI Router generation output parsing failed: [MALFORMED_OUTPUT] ${jsonErr.message}`);
          console.warn(`[AI Router Generation Provider] Output parsing failed (${jsonErr.message}). Falling back to deterministic generation.`);
        }
      } else {
        const errorInfo = !routerResult.success ? routerResult.error : undefined;
        routerError = new Error(`AI Router generation failed: [${errorInfo?.code || 'PROVIDER_ERROR'}] ${errorInfo?.message || 'unknown error'}`);
        console.warn(`[AI Router Generation Provider] AI generation failed (${errorInfo?.code || 'ERROR'}: ${errorInfo?.message || 'unknown'}). Falling back to deterministic generation.`);
      }
    } catch (err: any) {
      routerError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[AI Router Generation Provider] Unexpected AI generation error: ${err?.message || err}. Falling back to deterministic generation.`);
    }

    if (!this.fallbackProvider) {
      throw routerError || new Error('AI Router generation failed and no fallback provider is configured.');
    }

    const fallbackResult = await this.fallbackProvider.generate(request);
    return {
      ...fallbackResult,
      metadata: {
        ...fallbackResult.metadata,
        durationMs: Math.max(1, Date.now() - startTime),
      },
    };
  }
}
