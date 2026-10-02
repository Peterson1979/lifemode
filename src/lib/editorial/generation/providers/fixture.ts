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
    const fs = request.factSheet;
    const primaryEntity = fs?.primaryEntity || request.titleAngle;
    const description = fs?.articleAngle || `A focused editorial analysis of ${primaryEntity.toLowerCase()}, examining verified facts, context, and key developments.`;
    const excerpt = `Verified reporting, context, and practical takeaways on ${primaryEntity.toLowerCase()}.`;

    // Construct rich, source-grounded markdown content
    const targetMin = request.estimatedWordCount?.min || 200;
    const targetWords = request.estimatedWordCount?.target || Math.ceil(targetMin * 1.2);
    const contentSections: string[] = [];

    if (fs && fs.confirmedFacts.length > 0) {
      // Source-grounded synthesis
      const openingFact = fs.confirmedFacts[0]?.claim || `Recent developments surrounding ${primaryEntity} highlight significant shifts.`;
      contentSections.push(
        `${primaryEntity} has drawn attention across the modern cultural landscape. ${openingFact}`,
        ''
      );

      // Section 1: Verified Facts and Context
      contentSections.push(`## Confirmed Facts & Key Developments`);
      for (const fact of fs.confirmedFacts.slice(0, 4)) {
        contentSections.push(`- **${fact.claim}**${fact.publisher ? ` (Reported by ${fact.publisher})` : ''}. This development underscores ongoing structural and tactical shifts within the domain.`);
      }
      contentSections.push('');

      if (fs.importantNumbers.length > 0 || fs.dates.length > 0 || fs.locations.length > 0) {
        contentSections.push(
          `Key confirmed benchmarks include: ${[
            fs.dates.length ? `Dates: ${fs.dates.join(', ')}` : '',
            fs.locations.length ? `Locations: ${fs.locations.join(', ')}` : '',
            fs.importantNumbers.length ? `Statistics: ${fs.importantNumbers.join(', ')}` : '',
            fs.organizations.length ? `Organizations: ${fs.organizations.join(', ')}` : '',
          ].filter(Boolean).join('; ')}.`
        );
        contentSections.push('');
      }

      // Section 2: Core Analysis & Strategic Context
      contentSections.push(`## Core Analysis & Cultural Context`);
      contentSections.push(
        `Examining ${primaryEntity.toLowerCase()} within a broader lifestyle and industry framework provides essential clarity for contemporary observers. Rather than focusing solely on surface-level headlines, understanding the underlying mechanics reveals how strategic decisions translate into long-term outcomes. For ${request.audience.toLowerCase()}, these shifts offer tangible reference points for navigating evolving standards.`
      );
      contentSections.push('');

      if (fs.people.length > 0) {
        contentSections.push(
          `Notable figures shaping these developments include ${fs.people.map(p => `${p.name}${p.role ? ` (${p.role})` : ''}`).join(', ')}. Their involvement emphasizes the collaborative and high-stakes nature of the current phase.`
        );
        contentSections.push('');
      }

      // If targetMin requires richer depth, incorporate outline sections and detailed thematic analysis
      const outline = request.outlineSections && request.outlineSections.length > 0
        ? request.outlineSections
        : [
            {
              heading: 'Foundational Principles & Context',
              keyPoints: [
                'Prioritizing high-signal clarity over superficial noise.',
                'Implementing sustainable adaptations to daily workflows.',
                'Balancing aesthetic minimalism with functional utility.',
              ],
            },
            {
              heading: 'Practical Methods & Implementation',
              keyPoints: [
                'Clarify primary outcomes to establish a clear benchmark.',
                'Design a supportive environment that minimizes decision fatigue.',
                'Maintain consistent execution that compounds over time.',
              ],
            },
            {
              heading: 'Long-Term Habits & Evolution',
              keyPoints: [
                'Incorporate insights into everyday lifestyle design.',
                'Focus on high-leverage adjustments rather than quick fixes.',
                'Review and refine practices periodically to match shifting priorities.',
              ],
            },
          ];

      const numSections = outline.length;
      const targetWords = request.estimatedWordCount?.target || Math.ceil(targetMin * 1.2);
      const wordsNeededPerSection = Math.max(100, Math.ceil((targetWords - 200) / Math.max(1, numSections)));

      for (let i = 0; i < outline.length; i++) {
        const sec = outline[i];
        contentSections.push(`## ${sec.heading}`);
        contentSections.push(
          `Exploring ${sec.heading.toLowerCase()} within the context of ${primaryEntity.toLowerCase()} provides critical insight into practical applications. For ${request.audience.toLowerCase()}, understanding how confirmed facts align with everyday practice ensures sustainable, high-value outcomes. By focusing on verified evidence rather than speculative trends, readers can make informed decisions that compound over time.`
        );
        contentSections.push('');

        if (sec.keyPoints && sec.keyPoints.length > 0) {
          for (const kp of sec.keyPoints) {
            contentSections.push(`- **${kp}**: Implementing this perspective establishes measurable clarity. By focusing on verified facts and deliberate execution, you eliminate decision fatigue and build durable domain understanding.`);
          }
          contentSections.push('');
        }

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
            `A frequent challenge when applying ${sec.heading.toLowerCase()} is over-complicating the setup during the initial phase. True mastery lies in reduction rather than accumulation. Begin with minimal baseline interventions, observe the feedback over two weeks, and iterate gradually. This disciplined restraint prevents burnout and ensures that new workflows integrate naturally into your overall lifestyle.`
          );
          contentSections.push('');
        }

        if (wordsNeededPerSection >= 280) {
          contentSections.push(
            `### Practical Protocol & Daily Integration`,
            `Establishing an explicit daily checklist grounds these concepts in immediate reality. Allocate a dedicated time block each morning or evening to audit your environment against these principles. Over time, what initially required deliberate cognitive effort becomes second nature, freeing your attention for creative and high-leverage aspirations.`
          );
          contentSections.push('');
        }

        if (wordsNeededPerSection >= 400) {
          contentSections.push(
            `### Contextual Adaptability and Long-Term Maintenance`,
            `Sustainable lifestyle design requires systems that adapt to shifting demands. By maintaining flexibility within structured routines, you ensure that unexpected disruptions do not derail your progress. Conduct periodic reviews of your practices to prune outdated habits and double down on high-leverage actions.`
          );
          contentSections.push('');
        }

        if (wordsNeededPerSection >= 550) {
          contentSections.push(
            `### In-Depth Domain Case Study & Analytical Breakdown`,
            `Analyzing real-world execution within ${primaryEntity.toLowerCase()} demonstrates that structured methodologies consistently outperform ad-hoc adjustments. When individuals and organizations align operational practices with verified empirical evidence, they reduce systemic volatility and achieve predictable, high-leverage outcomes. Documenting benchmarks and regular retrospectives ensures continuous optimization across changing circumstances.`
          );
          contentSections.push('');
        }
      }

      // Section: Practical Takeaways & Outlook
      contentSections.push(`## Strategic Takeaways & Outlook`);
      contentSections.push(
        `As ${primaryEntity.toLowerCase()} continues to develop, observers should monitor verified milestones and official communications. Staying grounded in documented evidence ensures an accurate perspective while filtering out unsubstantiated speculation. Moving forward, these insights offer a reliable framework for understanding subsequent announcements and long-term implications across the field.`
      );
      contentSections.push('');
    } else {
      // Outline-based fallback
      const outline = request.outlineSections && request.outlineSections.length > 0
        ? request.outlineSections
        : [
            {
              heading: 'Foundational Principles & Context',
              keyPoints: [
                'Prioritizing high-signal clarity over superficial noise.',
                'Implementing sustainable adaptations to daily workflows.',
                'Balancing aesthetic minimalism with functional utility.',
              ],
            },
            {
              heading: 'Practical Methods & Implementation',
              keyPoints: [
                'Clarify primary outcomes to establish a clear benchmark.',
                'Design a supportive environment that minimizes decision fatigue.',
                'Maintain consistent execution that compounds over time.',
              ],
            },
            {
              heading: 'Long-Term Habits & Evolution',
              keyPoints: [
                'Incorporate insights into everyday lifestyle design.',
                'Focus on high-leverage adjustments rather than quick fixes.',
                'Review and refine practices periodically to match shifting priorities.',
              ],
            },
          ];

      contentSections.push(
        `Understanding **${request.titleAngle}** offers practical clarity for everyday living. Examining the underlying principles and real-world considerations helps put these ideas to work effectively.`,
        ''
      );

      const numSections = outline.length;
      const targetWords = request.estimatedWordCount?.target || Math.ceil(targetMin * 1.15);
      const wordsNeededPerSection = Math.max(100, Math.ceil((targetWords - 120) / Math.max(1, numSections)));

      for (let i = 0; i < outline.length; i++) {
        const sec = outline[i];
        contentSections.push(`## ${i + 1}. ${sec.heading}`);
        contentSections.push(
          `Exploring the dynamics of ${sec.heading.toLowerCase()} reveals how intentional principles shape everyday lifestyle choices. For ${request.audience.toLowerCase()}, developing clarity around ${request.searchTargets.primaryKeyword} requires examining both theoretical frameworks and practical daily applications. When we approach this subject through a lens of curated simplicity, every detail contributes to a cohesive, calm, and high-performing environment.`
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
            `A frequent challenge when applying ${sec.heading.toLowerCase()} is over-complicating the setup during the initial phase. True mastery lies in reduction rather than accumulation. Begin with minimal baseline interventions, observe the feedback over two weeks, and iterate gradually. This disciplined restraint prevents burnout and ensures that new workflows integrate naturally into your overall lifestyle.`
          );
          contentSections.push('');
        }

        if (wordsNeededPerSection >= 280) {
          contentSections.push(
            `### Practical Protocol & Daily Integration`,
            `Establishing an explicit daily checklist grounds these concepts in immediate reality. Allocate a dedicated time block each morning or evening to audit your environment against these principles. Over time, what initially required deliberate cognitive effort becomes second nature, freeing your attention for creative and high-leverage aspirations.`
          );
          contentSections.push('');
        }

        if (wordsNeededPerSection >= 400) {
          contentSections.push(
            `### Contextual Adaptability and Long-Term Maintenance`,
            `Sustainable lifestyle design requires systems that adapt to shifting demands. By maintaining flexibility within structured routines, you ensure that unexpected disruptions do not derail your progress. Conduct periodic reviews of your practices to prune outdated habits and double down on high-leverage actions.`
          );
          contentSections.push('');
        }
      }

      contentSections.push(
        `## Summary & Long-Term Outlook`,
        `Mastering ${request.titleAngle} is an ongoing process of refinement, restraint, and intentionality. By returning to first principles, maintaining disciplined focus on what truly matters, and curating an environment of calm and purpose, readers can navigate contemporary challenges with confidence, balance, and timeless grace. Embrace the process of incremental evolution, and let each mindful decision reinforce your broader lifestyle vision.`
      );
    }

    // Ensure total generated content meets or exceeds targetMin using unique, non-repeating editorial sections
    const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
    const deepDiveModules = [
      {
        heading: 'Foundational Infrastructure & Environmental Architecture',
        paragraph: `Establishing an enduring relationship with ${primaryEntity.toLowerCase()} starts with deliberate environmental design. When we examine physical spaces, toolsets, and contextual workflows, the emphasis shifts from superficial aesthetics to functional durability. For ${request.audience.toLowerCase()}, creating an environment that minimizes friction allows natural habits to emerge effortlessly. Every material choice, acoustic consideration, and layout adjustment works synergistically to protect cognitive bandwidth and elevate daily focus.`,
        bullets: [
          'Spatial Alignment: Design designated touchpoints that encourage calm, deliberate engagement rather than hurried multitasking.',
          'Material Integrity: Select durable, tactile elements that age gracefully and retain utility over prolonged usage cycles.',
          'Atmospheric Curation: Optimize lighting, airflow, and acoustics to create an inviting baseline for sustained immersion.',
        ],
      },
      {
        heading: 'Cognitive Bandwidth & Intentional Focus Management',
        paragraph: `In an era characterized by relentless digital stimuli, navigating ${primaryEntity.toLowerCase()} requires active curation of attention. Cognitive stamina is a finite resource; squandering it on low-leverage micro-decisions compromises long-term creative clarity. By implementing structured boundaries and pre-committed routines, practitioners insulate their deep-work intervals from reactive interruptions. This disciplined curation cultivates an enduring state of flow that enriches both private contemplation and professional output.`,
        bullets: [
          'Attention Shielding: Establish explicit distraction-free windows during peak cognitive hours to deepen domain mastery.',
          'Decision Simplification: Standardize non-essential daily logistics to preserve executive function for high-impact creative tasks.',
          'Reflective Cadence: Incorporate regular pauses to assess psychological energy and adjust operational pace proactively.',
        ],
      },
      {
        heading: 'Practical Methodology & Step-by-Step Implementation',
        paragraph: `Translating conceptual enthusiasm for ${primaryEntity.toLowerCase()} into tangible lifestyle improvements demands a structured implementation protocol. Rather than attempting comprehensive overhaul overnight, high-performing individuals initiate small, tightly measured interventions. Documenting baseline metrics, monitoring subjective feedback across fourteen-day intervals, and refining friction points ensures that newly adopted workflows compound sustainably over extended horizons.`,
        bullets: [
          'Baseline Audit: Record existing habits and resource expenditures to identify immediate opportunities for reduction.',
          'Micro-Interventions: Introduce one isolated methodological adjustment at a time to clearly measure its compounding impact.',
          'Iterative Calibration: Review qualitative and quantitative outcomes bi-weekly to discard ineffective practices swiftly.',
        ],
      },
      {
        heading: 'Cultural Lineage & Contemporary Evolution',
        paragraph: `Understanding the modern expression of ${primaryEntity.toLowerCase()} is substantially enriched by examining its historical lineage. Many contemporary practices represent refined iterations of time-tested traditions that prioritized harmony, craftsmanship, and restraint. When modern enthusiasts reconnect with these foundational roots, their perspective shifts from ephemeral trends toward timeless excellence, infusing everyday rituals with profound cultural resonance.`,
        bullets: [
          'Historical Continuity: Trace contemporary trends back to traditional philosophies of balance, purpose, and restraint.',
          'Authentic Expression: Resist commercialized distortions by adhering to core principles validated across generations.',
          'Cross-Disciplinary Synthesis: Combine time-tested artisanal traditions with modern technological capabilities.',
        ],
      },
      {
        heading: 'Comparative Paradigm Analysis & Risk Mitigation',
        paragraph: `Evaluating alternatives is a cornerstone of responsible lifestyle curation. When approaching ${primaryEntity.toLowerCase()}, distinguishing between high-signal investments and speculative novelties prevents costly misallocations of capital and time. Rigorous comparative analysis illuminates subtle trade-offs, enabling observers to make nuanced choices tailored to their specific priorities, constraints, and long-term values.`,
        bullets: [
          'Value-to-Effort Ratio: Prioritize interventions that deliver disproportionate long-term utility relative to maintenance demands.',
          'False Economy Avoidance: Recognize that cheap, short-lived compromises frequently carry hidden compounding friction.',
          'Adaptive Flexibility: Choose modular systems that can evolve smoothly alongside changing professional and personal needs.',
        ],
      },
      {
        heading: 'Long-Term Maintenance Protocols & Sustainability',
        paragraph: `The ultimate measure of any lifestyle philosophy surrounding ${primaryEntity.toLowerCase()} is its durability across years and decades. Sustainable mastery avoids extreme dogmatism in favor of graceful adaptability. Developing gentle reset rituals, seasonal maintenance audits, and supportive communal connections ensures that intentional living remains an uplifting, restorative pursuit rather than an onerous obligation.`,
        bullets: [
          'Seasonal Audits: Conduct comprehensive quarterly reviews to recalibrate systems against evolving priorities.',
          'Graceful Recovery: Design simple fallback protocols to re-establish constructive routines following unexpected disruptions.',
          'Community Connection: Share observations and insights with thoughtful peers to deepen collective domain wisdom.',
        ],
      },
    ];

    let currentWords = countWords(contentSections.join('\n'));
    let moduleIdx = 0;
    while (currentWords < targetMin && moduleIdx < deepDiveModules.length) {
      const mod = deepDiveModules[moduleIdx];
      contentSections.push(`## ${mod.heading}`, mod.paragraph, '');
      for (const bullet of mod.bullets) {
        contentSections.push(`- **${bullet.split(':')[0]}**: ${bullet.split(':')[1] || bullet}`);
      }
      contentSections.push('');
      currentWords = countWords(contentSections.join('\n'));
      moduleIdx++;
    }

    // If affiliate disclosure is required, append editorial disclosure
    if (request.affiliateGuidance?.disclosureRequired) {
      const disclosure = request.affiliateGuidance.disclosureText || 'LifeMode may earn an affiliate commission on purchases made through verified partner recommendations.';
      contentSections.push('', `*Editorial Disclosure: ${disclosure}*`);
    }

    // If high-risk topic, prepend educational safety disclaimer
    if (request.riskLevel === 'high') {
      contentSections.unshift('*Editorial Disclaimer: This content is for educational purposes only. Consult a doctor or qualified professional for advice.*', '');
    }

    const content = contentSections.join('\n');

    // Deterministic FAQ
    const faq = [
      {
        question: `Why is ${request.searchTargets.primaryKeyword || primaryEntity} important today?`,
        answer: `It provides a structured, verified reference point that helps readers understand key developments and optimize daily lifestyle decisions.`,
      },
      {
        question: `What are the primary confirmed facts to keep in mind?`,
        answer: fs && fs.confirmedFacts.length > 0
          ? fs.confirmedFacts[0].claim
          : `Foundational adjustments can be implemented immediately with compounding benefits over time.`,
      },
    ];

    // Structured sources
    const sources = request.requiredSources?.map((s) => ({
      name: s.name,
      url: s.url || 'https://lifemode.life/editorial-standards',
    })) || [
      {
        name: 'LifeMode Editorial Standards & Primary Reference',
        url: 'https://lifemode.life/editorial-standards',
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
      `How ${request.titleAngle} is reshaping contemporary perspectives in 2026.`,
      `Key confirmed takeaways and context on ${request.searchTargets.primaryKeyword || primaryEntity}.`,
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
