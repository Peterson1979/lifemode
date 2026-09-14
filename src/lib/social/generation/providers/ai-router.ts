import type { ISocialGenerationProvider, SocialGenerationResult } from '../contracts.ts';
import type { SocialBrief, GeneratedSocialContent } from '../../types.ts';
import { buildSocialGenerationPrompt } from '../prompt.ts';
import { AIRouter, defaultAIRouter } from '../../../ai/router.ts';
import type { AIRequest } from '../../../ai/types.ts';
import { extractAndParseJson } from '../../../ai/json-extractor.ts';
import { FixtureSocialGenerationProvider } from './fixture.ts';

export class AIRouterSocialGenerationProvider implements ISocialGenerationProvider {
  readonly name = 'AI Router Social Provider';
  readonly model = 'router-managed';
  private router: AIRouter;
  private fallbackProvider: ISocialGenerationProvider;

  constructor(
    router: AIRouter = defaultAIRouter,
    fallbackProvider: ISocialGenerationProvider = new FixtureSocialGenerationProvider()
  ) {
    this.router = router;
    this.fallbackProvider = fallbackProvider;
  }

  private parseJsonOutput(rawText: string, brief: SocialBrief): GeneratedSocialContent {
    const parsed = extractAndParseJson<any>(rawText);

    return {
      topicId: parsed.topicId || brief.topicId,
      pillar: parsed.pillar || brief.pillar,
      concept: parsed.concept || brief.coreConcept,
      hook: parsed.hook || brief.editorialHook,
      title: parsed.title || brief.canonicalTopic,
      shortCaption: parsed.shortCaption || `${brief.canonicalTopic}. Explore intentional living with LifeMode.`,
      extendedCaption: parsed.extendedCaption,
      callToAction: parsed.callToAction || 'Read the complete dispatch on LifeMode.',
      hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0 ? parsed.hashtags : brief.hashtagsHint,
      visualConcept: parsed.visualConcept || `${brief.canonicalTopic}, editorial minimalism, serene natural lighting.`,
      imageText: {
        headline: parsed.imageText?.headline || brief.canonicalTopic.slice(0, 40),
        subheadline: parsed.imageText?.subheadline,
      },
      targetPlatforms: Array.isArray(parsed.targetPlatforms) && parsed.targetPlatforms.length > 0 ? parsed.targetPlatforms : brief.targetPlatforms,
      sourceReferences: Array.isArray(parsed.sourceReferences) ? parsed.sourceReferences : [],
      destinationUrl: parsed.destinationUrl || brief.destinationUrl,
    };
  }

  async generateSocialContent(brief: SocialBrief): Promise<SocialGenerationResult> {
    const startTime = Date.now();
    const prompt = buildSocialGenerationPrompt(brief);

    const aiRequest: AIRequest = {
      prompt,
      taskType: 'social_generation',
      maxOutputTokens: 1200,
      temperature: 0.7,
      responseFormat: 'json',
    };

    try {
      const routerResult = await this.router.route(aiRequest);

      if (routerResult.success && routerResult.response?.text) {
        try {
          const content = this.parseJsonOutput(routerResult.response.text, brief);

          return {
            success: true,
            content,
            rawResponse: routerResult.response.text,
            durationMs: Date.now() - startTime,
            provider: routerResult.response.provider,
            model: routerResult.response.model,
          };
        } catch (jsonErr: any) {
          console.warn(`[AI Router Social Provider] Output parsing failed: ${jsonErr.message}. Falling back to deterministic generation.`);
        }
      } else {
        const errorInfo = !routerResult.success ? routerResult.error : undefined;
        console.warn(`[AI Router Social Provider] AI generation failed (${errorInfo?.code || 'ERROR'}: ${errorInfo?.message || 'unknown'}). Falling back to deterministic generation.`);
      }
    } catch (err: any) {
      console.warn(`[AI Router Social Provider] Unexpected error during AI generation: ${err.message}. Falling back to deterministic generation.`);
    }

    // Fallback: Use deterministic FixtureSocialGenerationProvider when AI Router fails
    try {
      const fallbackResult = await this.fallbackProvider.generateSocialContent(brief);
      return {
        ...fallbackResult,
        durationMs: Date.now() - startTime,
      };
    } catch (fallbackErr: any) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        provider: this.name,
        error: {
          code: 'FALLBACK_ERROR',
          message: `Both AI Router and fallback social generation failed: ${fallbackErr?.message || String(fallbackErr)}`,
        },
      };
    }
  }
}
