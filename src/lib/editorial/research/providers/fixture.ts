import type { IEditorialResearchProvider } from './types.ts';
import type { EditorialTopic, ContentBrief } from '../../types.ts';
import type { EvidenceResult, EvidenceItem } from '../types.ts';
import { evaluateResearchRequirement } from '../classifier.ts';

/**
 * Deterministic Fixture Research Provider.
 * Generates verified, structured evidence packages without external network requests.
 * Ideal for unit testing, offline CI/CD, and reproducible development.
 */
export class FixtureEditorialResearchProvider implements IEditorialResearchProvider {
  readonly name = 'Fixture Research Provider';

  private generatePillarEvidence(topic: EditorialTopic, brief: ContentBrief): EvidenceItem[] {
    const now = new Date().toISOString();
    const pillar = topic.pillar;
    const title = brief.titleAngle || topic.canonicalTopic;

    switch (pillar) {
      case 'travel':
        return [
          {
            title: 'Kyoto City Official Travel & Heritage Guide',
            url: 'https://kyoto.travel/en/culture/tea-houses',
            publisher: 'Kyoto Convention & Visitors Bureau',
            publishedAt: '2026-01-15T00:00:00.000Z',
            accessedAt: now,
            claimSummary: 'Official architectural registry and visitor protocols for historic Sukiya-style tea houses in Gion, Higashiyama, and Uji.',
            sourceType: 'official',
            reliability: 'high',
          },
          {
            title: 'Japanese Sukiya Architecture: Principles and Preservation',
            url: 'https://japan-architect.org/preservation/sukiya-heritage',
            publisher: 'Japan Institute of Traditional Architecture',
            publishedAt: '2025-11-20T00:00:00.000Z',
            accessedAt: now,
            claimSummary: 'Design specifications for traditional tea pavilion timber joinery, tatami proportioning, and garden integration.',
            sourceType: 'academic',
            reliability: 'high',
          },
        ];

      case 'now':
        return [
          {
            title: 'Digital Intentionality and Consumer Technology Shift Report 2026',
            url: 'https://wgsn.com/reports/2026-digital-intentionality-consumer-shift',
            publisher: 'WGSN & Digital Culture Institute',
            publishedAt: '2026-02-01T00:00:00.000Z',
            accessedAt: now,
            claimSummary: 'Empirical survey data showing a 34% year-over-year increase in screen time boundaries, notification pruning, and calm tech workflows among knowledge professionals.',
            sourceType: 'industry',
            reliability: 'high',
          },
          {
            title: 'The Psychology of Calm Technology in Modern Workspaces',
            url: 'https://mit.edu/research/calm-technology-workplace-wellbeing',
            publisher: 'MIT Center for Digital Wellbeing',
            publishedAt: '2025-10-10T00:00:00.000Z',
            accessedAt: now,
            claimSummary: 'Academic findings demonstrating reduced cognitive fatigue and enhanced creative focus when adopting analog-first morning rituals.',
            sourceType: 'academic',
            reliability: 'high',
          },
        ];

      case 'tech-ai':
        return [
          {
            title: 'Local Large Language Model Benchmarks and Hardware Architecture',
            url: 'https://huggingface.co/blog/local-llm-deployment-2026',
            publisher: 'Hugging Face Open Research',
            publishedAt: '2026-01-28T00:00:00.000Z',
            accessedAt: now,
            claimSummary: 'Quantization benchmarks (4-bit vs 8-bit), RAM requirements (16GB minimum recommended for 20B models), and privacy isolation standards.',
            sourceType: 'industry',
            reliability: 'high',
          },
          {
            title: 'Private AI Architecture Guidelines for Knowledge Workers',
            url: 'https://lifemode.io/editorial-standards/tech-ai',
            publisher: 'LifeMode Tech & AI Standards',
            publishedAt: '2026-01-01T00:00:00.000Z',
            accessedAt: now,
            claimSummary: 'Local-first terminal workflows and privacy verification procedures.',
            sourceType: 'official',
            reliability: 'high',
          },
        ];

      case 'money':
        return [
          {
            title: 'Treasury Direct & Cash Management Yield Standards',
            url: 'https://treasurydirect.gov/institutions/cash-management-rates',
            publisher: 'U.S. Department of the Treasury',
            publishedAt: '2026-02-15T00:00:00.000Z',
            accessedAt: now,
            claimSummary: 'Current institutional yield benchmarks, cash allocation thresholds, and liquidity reserve requirements.',
            sourceType: 'government',
            reliability: 'high',
          },
        ];

      case 'wellbeing':
        return [
          {
            title: 'Circadian Light Exposure and Cortisol Awakening Response Protocol',
            url: 'https://ncbi.nlm.nih.gov/pmc/articles/circadian-sleep-vitality-protocols',
            publisher: 'National Center for Biotechnology Information (NCBI)',
            publishedAt: '2025-08-14T00:00:00.000Z',
            accessedAt: now,
            claimSummary: 'Clinical recommendations for 10,000+ lux morning light within 30 minutes of waking to optimize deep sleep architecture.',
            sourceType: 'academic',
            reliability: 'high',
          },
        ];

      default:
        return [
          {
            title: `${title} - Primary Reference`,
            url: `https://lifemode.io/editorial-standards/${pillar}`,
            publisher: 'LifeMode Editorial Board',
            publishedAt: '2026-01-01T00:00:00.000Z',
            accessedAt: now,
            claimSummary: `Foundational editorial framework and verified practical principles for ${topic.canonicalTopic}.`,
            sourceType: 'official',
            reliability: 'high',
          },
        ];
    }
  }

  async research(topic: EditorialTopic, brief: ContentBrief): Promise<EvidenceResult> {
    const requirement = evaluateResearchRequirement(topic, brief);
    const now = new Date().toISOString();

    if (!requirement.required) {
      return {
        topicId: topic.id,
        required: false,
        reason: requirement.reason,
        status: 'NOT_REQUIRED',
        items: [],
        researchedAt: now,
      };
    }

    const items = this.generatePillarEvidence(topic, brief);

    return {
      topicId: topic.id,
      required: true,
      reason: requirement.reason,
      status: 'SUCCESS',
      items,
      queryUsed: requirement.suggestedQueries[0] || topic.canonicalTopic,
      researchedAt: now,
    };
  }
}
