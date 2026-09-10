import type { ISocialGenerationProvider, SocialGenerationResult } from '../contracts.ts';
import type { SocialBrief, GeneratedSocialContent } from '../../types.ts';

export class FixtureSocialGenerationProvider implements ISocialGenerationProvider {
  readonly name = 'Fixture Social Provider';
  readonly model = 'fixture-deterministic';

  private overrides?: Partial<GeneratedSocialContent>;

  constructor(overrides?: Partial<GeneratedSocialContent>) {
    this.overrides = overrides;
  }

  async generateSocialContent(brief: SocialBrief): Promise<SocialGenerationResult> {
    const startTime = Date.now();

    const baseContent: GeneratedSocialContent = {
      topicId: brief.topicId,
      pillar: brief.pillar,
      concept: brief.coreConcept,
      hook: brief.editorialHook,
      title: brief.canonicalTopic,
      shortCaption: `Discover why ${brief.canonicalTopic.toLowerCase()} is redefining intentional living. A new perspective on LifeMode.`,
      extendedCaption: `In an era of relentless notifications and noise, finding focus requires intentional design. Our latest dispatch on ${brief.canonicalTopic} explores evidence-backed rituals, serene architecture, and calm practices to reclaim clarity.\n\nDiscover the full curated guide on LifeMode.`,
      callToAction: 'Explore the full story on LifeMode.',
      hashtags: brief.hashtagsHint,
      visualConcept: `Serene editorial photograph representing ${brief.canonicalTopic}, natural linen textures, warm diffuse morning light, uncluttered minimalist composition.`,
      imageText: {
        headline: brief.canonicalTopic.split(' ').slice(0, 6).join(' '),
        subheadline: `A Modern Guide to ${brief.pillar.toUpperCase()}`,
      },
      targetPlatforms: brief.targetPlatforms,
      sourceReferences: brief.evidence?.map((e) => ({ name: e.publisher || e.title, url: e.url })) || [],
      destinationUrl: brief.destinationUrl,
      ...this.overrides,
    };

    return {
      success: true,
      content: baseContent,
      durationMs: Date.now() - startTime,
      provider: this.name,
      model: this.model,
    };
  }
}
