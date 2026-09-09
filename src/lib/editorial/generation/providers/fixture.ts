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
    const targetMin = request.estimatedWordCount?.min || 200;
    const outline = request.outlineSections && request.outlineSections.length > 0
      ? request.outlineSections
      : [
          {
            heading: 'Foundational Perspective & Core Principles',
            keyPoints: [
              'Signal over Noise: Prioritizing substance and depth over superficial trends.',
              'Iterative Refinement: Embracing gradual, sustainable adaptations to daily workflows.',
              'Aesthetic & Functional Harmony: Balancing visual minimalism with practical utility.',
            ],
          },
          {
            heading: 'Practical Framework & Actionable Protocol',
            keyPoints: [
              'Clarify the Essential Intent: Focus on primary outcomes to establish a clear benchmark.',
              'Establish the Routine Architecture: Design a supportive environment that minimizes decision fatigue.',
              'Execute with Precision: Maintain consistent daily habits that compound over time.',
            ],
          },
          {
            heading: 'Curated Perspective & Long-Term Integration',
            keyPoints: [
              'Seamless Everyday Integration: Incorporate insights into your broader lifestyle philosophy.',
              'Sustainable Habit Formation: Focus on high-leverage adjustments rather than quick fixes.',
              'Continuous Evolution: Review and refine practices periodically to match lifestyle shifts.',
            ],
          },
        ];

    const contentSections: string[] = [
      `In contemporary lifestyle design, **${request.titleAngle}** represents a pivotal intersection of intentionality, curiosity, and modern practice. Whether navigating rapid cultural shifts or refining daily rituals, cultivating a high-signal approach creates enduring clarity for ${request.audience.toLowerCase()}. In this comprehensive editorial guide, we examine the foundational principles, practical frameworks, and curated methodologies that transform abstract concepts into tangible daily routines.`,
      '',
    ];

    const numSections = outline.length;
    // Target comfortably above targetMin using brief target or 1.1x targetMin
    const targetWords = request.estimatedWordCount?.target || Math.ceil(targetMin * 1.15);
    const wordsNeededPerSection = Math.max(100, Math.ceil((targetWords - 120) / Math.max(1, numSections)));

    for (let i = 0; i < outline.length; i++) {
      const sec = outline[i];
      contentSections.push(`## ${i + 1}. ${sec.heading}`);
      contentSections.push(
        `Exploring the core dynamics of ${sec.heading.toLowerCase()} reveals how intentional design principles shape everyday lifestyle choices. For ${request.audience.toLowerCase()}, developing clarity around ${request.searchTargets.primaryKeyword} requires examining both theoretical frameworks and tangible daily practices. When we approach this subject through a lens of curated simplicity, every detail contributes to a cohesive, calm, and high-performing environment.`
      );
      contentSections.push('');

      if (sec.keyPoints && sec.keyPoints.length > 0) {
        for (const kp of sec.keyPoints) {
          contentSections.push(`- **${kp}**: Implementing this priority creates compounding clarity across your daily environment. By removing extraneous noise and focusing on essential elements, you preserve cognitive bandwidth for deep, meaningful pursuits. Consistent execution turns small architectural shifts into transformative long-term habits.`);
        }
        contentSections.push('');
      }

      contentSections.push(
        `By establishing structured routines around ${sec.heading.toLowerCase()}, modern individuals cultivate a sustainable rhythm that supports long-term wellbeing and peak daily performance. Small, deliberate adjustments compound significantly over months and years, establishing a grounded foundation for thoughtful living that remains resilient amidst shifting external demands.`
      );
      contentSections.push('');

      // Add depth levels based on section word requirements
      if (wordsNeededPerSection >= 100) {
        contentSections.push(
          `### Strategic Implementation of ${sec.heading}`,
          `To maximize the impact of this approach, consider how it interacts with your existing environment. Eliminating friction points before introducing new habits ensures greater consistency and prevents cognitive overload. When applied with patience and precision, these guidelines create an enduring standard of excellence that enriches both private rituals and professional endeavors.`
        );
        contentSections.push('');
      }

      if (wordsNeededPerSection >= 180) {
        contentSections.push(
          `### Common Pitfalls and Refinement Strategies`,
          `A frequent mistake when applying ${sec.heading.toLowerCase()} is over-complicating the setup during the initial phase. True mastery lies in reduction rather than accumulation. Begin with minimal baseline interventions, observe the feedback over two weeks, and iterate gradually. This disciplined restraint prevents burnout and ensures that new workflows integrate naturally into your overall lifestyle.`
        );
        contentSections.push('');
      }

      if (wordsNeededPerSection >= 280) {
        contentSections.push(
          `### Practical Workflow Protocol & Daily Integration`,
          `Establishing an explicit daily checklist grounds these concepts in immediate reality. Allocate a dedicated time block each morning or evening to audit your environment against these principles. Over time, what initially required deliberate cognitive effort becomes second nature, freeing your attention for creative and high-leverage aspirations.`
        );
        contentSections.push('');
      }

      if (wordsNeededPerSection >= 400) {
        contentSections.push(
          `### Contextual Adaptability and Long-Term Maintenance`,
          `Sustainable lifestyle design requires systems that adapt to shifting demands. By maintaining flexibility within structured routines, you ensure that unexpected disruptions do not derail your progress. Conduct quarterly reviews of your practices to prune outdated habits and double down on high-leverage actions.`
        );
        contentSections.push('');
      }
    }

    contentSections.push(
      `## Summary & Long-Term Outlook`,
      `Mastering ${request.titleAngle} is an ongoing journey of refinement, restraint, and intentionality. By returning to first principles, maintaining disciplined focus on what truly matters, and curating an environment of calm and purpose, readers can navigate contemporary challenges with confidence, balance, and timeless grace. Embrace the process of incremental evolution, and let each mindful decision reinforce your broader lifestyle vision.`
    );

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
