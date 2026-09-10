import type { ISocialGenerationProvider, SocialGenerationResult } from '../contracts.ts';
import type { SocialBrief, GeneratedSocialContent } from '../../types.ts';
import { buildSocialGenerationPrompt } from '../prompt.ts';
import { AIRouter, defaultAIRouter } from '../../../ai/router.ts';
import type { AIRequest } from '../../../ai/types.ts';

export class AIRouterSocialGenerationProvider implements ISocialGenerationProvider {
  readonly name = 'AI Router Social Provider';
  readonly model = 'router-managed';
  private router: AIRouter;

  constructor(router: AIRouter = defaultAIRouter) {
    this.router = router;
  }

  private parseJsonOutput(rawText: string, brief: SocialBrief): GeneratedSocialContent {
    let clean = rawText.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    const parsed = JSON.parse(clean);

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

      if (!routerResult.success) {
        return {
          success: false,
          durationMs: Date.now() - startTime,
          provider: this.name,
          error: {
            code: routerResult.error?.code || 'ROUTER_ERROR',
            message: routerResult.error?.message || 'AI Router failed to generate social content.',
          },
        };
      }

      if (!routerResult.response?.text) {
        return {
          success: false,
          durationMs: Date.now() - startTime,
          provider: this.name,
          error: {
            code: 'EMPTY_RESPONSE',
            message: 'AI Router returned empty response text.',
          },
        };
      }

      const content = this.parseJsonOutput(routerResult.response.text, brief);

      return {
        success: true,
        content,
        rawResponse: routerResult.response.text,
        durationMs: Date.now() - startTime,
        provider: routerResult.response.provider,
        model: routerResult.response.model,
      };
    } catch (err: any) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        provider: this.name,
        error: {
          code: 'PARSING_ERROR',
          message: `Failed to parse structured social content JSON: ${err?.message || String(err)}`,
        },
      };
    }
  }
}
