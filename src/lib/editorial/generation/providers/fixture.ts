import type { IGenerationProvider, ProviderGenerationPayload } from './types.ts';
import type { GenerationRequest, GeneratedArticle } from '../types.ts';

/**
 * Deterministic Fixture Generation Provider.
 * Generates structured, high-quality editorial article packages without network or external AI APIs.
 * Ideal for offline development, local CI/CD pipelines, and unit testing.
 */
export class FixtureGenerationProvider implements IGenerationProvider {
  readonly name = 'Fixture Generation Provider';
  readonly model = 'fixture-deterministic-v1';

  async generate(request: GenerationRequest): Promise<ProviderGenerationPayload> {
    const startTime = Date.now();

    // Deterministic slug derived from request or titleAngle
    const slug = request.titleAngle
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60);

    const title = request.titleAngle;
    const description = `Discover our editorial guide on ${request.titleAngle.toLowerCase()}. Explore key principles, actionable methods, and curated perspectives for modern living.`;
    const excerpt = `A deep dive into ${request.titleAngle.toLowerCase()}, designed for ${request.audience.toLowerCase()}.`;

    // Construct rich, deterministic markdown content with multiple H2 and H3 sections
    const contentSections: string[] = [
      `In contemporary lifestyle design, **${request.titleAngle}** represents a pivotal intersection of intentionality, curiosity, and modern practice. Whether navigating rapid cultural shifts or refining daily rituals, cultivating a high-signal approach creates enduring clarity.`,
      '',
      `## 1. Foundational Perspective & Core Principles`,
      `The essence of this topic addresses a fundamental question for ${request.audience.toLowerCase()}: how do we integrate intentional choices without unnecessary friction?`,
      '',
      `Key foundational pillars include:`,
      `- **Signal over Noise**: Prioritizing substance and depth over superficial trends.`,
      `- **Iterative Refinement**: Embracing gradual, sustainable adaptations to daily workflows.`,
      `- **Aesthetic & Functional Harmony**: Balancing visual minimalism with practical utility.`,
      '',
      `## 2. Practical Framework & Actionable Protocol`,
      `Applying these concepts requires a structured, step-by-step methodology:`,
      '',
      `### Step 1: Clarify the Essential Intent`,
      `Begin by identifying the primary outcome. By focusing on *${request.searchTargets.primaryKeyword}*, you establish a clear benchmark for evaluation.`,
      '',
      `### Step 2: Establish the Routine Architecture`,
      `Design a supportive environment that minimizes decision fatigue. Small systemic adjustments yield compounded benefits over time.`,
      '',
      `## 3. Curated Perspective & Long-Term Integration`,
      `True mastery lies in seamless everyday integration. Rather than treating this as an isolated experiment, incorporate these insights into your broader lifestyle philosophy.`,
      '',
      `As LifeMode continues to explore the evolution of ${request.pillar}, maintaining curiosity and intentional design remains our highest priority.`
    ];

    const content = contentSections.join('\n');

    // Deterministic FAQ
    const faq = [
      {
        question: `Why is ${request.searchTargets.primaryKeyword} important today?`,
        answer: `It provides a structured, intentional framework that helps modern individuals navigate complexity and optimize daily lifestyle decisions.`,
      },
      {
        question: `How quickly can one begin implementing these principles?`,
        answer: `Foundational adjustments can be implemented immediately, with compounding benefits emerging within two to three weeks of consistent practice.`,
      },
    ];

    // Structured sources
    const sources = request.requiredSources?.map((s) => ({
      name: s.name,
      url: s.url || 'https://lifemode.io/editorial-standards',
    })) || [
      {
        name: 'LifeMode Editorial Standards & Primary Reference',
        url: 'https://lifemode.io/editorial-standards',
      },
    ];

    // Internal links
    const internalLinks = request.internalLinks?.length
      ? request.internalLinks
      : [`/${request.pillar}`];

    // Affiliate intents
    const affiliateIntents = request.affiliateIntent && request.affiliateCategories
      ? request.affiliateCategories
      : request.affiliateIntent
      ? [request.pillar]
      : [];

    // Social hooks
    const socialHooks = [
      `How ${request.titleAngle} is reshaping the way we think about modern lifestyle design in 2026.`,
      `The 3-step framework for mastering ${request.searchTargets.primaryKeyword} with clarity and intent.`,
    ];

    const article: GeneratedArticle = {
      title,
      slug,
      description,
      excerpt,
      content,
      faq,
      sources,
      internalLinks,
      affiliateIntents,
      socialHooks,
    };

    const durationMs = Math.max(1, Date.now() - startTime);

    return {
      article,
      metadata: {
        provider: this.name,
        model: this.model,
        generatedAt: new Date().toISOString(),
        inputTokenEstimate: 320,
        outputTokenEstimate: 580,
        durationMs,
      },
    };
  }
}
