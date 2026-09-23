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

    const title = brief.articleTitle || brief.canonicalTopic;
    const isStyle = brief.pillar === 'style';
    const isFood = brief.pillar === 'food-drink';

    const shortCaption = isStyle
      ? `Discover how ${title.toLowerCase()} is shaping contemporary personal style and everyday beauty rituals on LifeMode.`
      : isFood
        ? `Explore why ${title.toLowerCase()} is redefining modern culinary rituals. A fresh perspective on LifeMode.`
        : `Discover why ${title.toLowerCase()} is redefining modern living. A new perspective on LifeMode.`;

    const extendedCaption = isStyle
      ? `From thoughtful capsule tailoring to mindful daily skincare rituals, our latest dispatch on ${title} explores practical, contemporary style perspectives for everyday living.\n\nExplore the complete guide on LifeMode.`
      : `In an era of relentless notifications and noise, finding focus requires intentional design. Our latest dispatch on ${title} explores evidence-backed rituals, serene architecture, and calm practices to reclaim clarity.\n\nDiscover the full curated guide on LifeMode.`;

    const visualConcept = isStyle
      ? `Luminous editorial photograph representing ${title}, tactile fabric textures, clean skincare flacons, warm diffused daylight, contemporary aesthetic details.`
      : `Serene editorial photograph representing ${title}, natural linen textures, warm diffuse morning light, uncluttered minimalist composition.`;

    const baseContent: GeneratedSocialContent = {
      topicId: brief.topicId,
      pillar: brief.pillar,
      concept: brief.coreConcept,
      hook: brief.editorialHook,
      title,
      shortCaption,
      extendedCaption,
      callToAction: 'Explore the full story on LifeMode.',
      hashtags: brief.hashtagsHint,
      visualConcept,
      imageText: {
        headline: title.split(' ').slice(0, 6).join(' '),
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
