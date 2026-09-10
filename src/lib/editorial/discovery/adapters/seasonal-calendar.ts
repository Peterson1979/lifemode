import type { IDiscoveryAdapter, DiscoveryAdapterOptions, SeasonalCalendarPayload } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal } from '../types.ts';
import type { PillarSlug } from '../../types.ts';

/**
 * Seasonal events mapping with target months and pillar assignments.
 */
interface SeasonalTheme {
  event: string;
  pillar: PillarSlug;
  rawQuery: string;
  targetMonths: number[]; // 0-11 (Jan = 0, Dec = 11)
  growthRate: number;
  relativeInterest: number;
  visualPotentialScore: number;
  tags: string[];
}

const SEASONAL_EDITORIAL_THEMES: SeasonalTheme[] = [
  // Winter / Q1 (Jan - Feb - Mar)
  {
    event: 'New Year Intentional Habits & Clarity',
    pillar: 'life',
    rawQuery: 'Reset Rituals: Intentional Habits and Decluttering for the New Season',
    targetMonths: [0, 1, 2],
    growthRate: 85,
    relativeInterest: 90,
    visualPotentialScore: 88,
    tags: ['habits', 'intentional-living', 'reset', 'productivity'],
  },
  {
    event: 'Cold Weather Restorative Wellness',
    pillar: 'wellbeing',
    rawQuery: 'Circadian Light Management and Cold Season Vitality Protocols',
    targetMonths: [0, 1, 10, 11],
    growthRate: 80,
    relativeInterest: 85,
    visualPotentialScore: 82,
    tags: ['wellbeing', 'light-therapy', 'sleep', 'winter'],
  },
  {
    event: 'Annual Financial Architecture',
    pillar: 'money',
    rawQuery: 'Personal Treasury Architecture: Optimizing Cash Yields and Asset Allocation',
    targetMonths: [0, 1, 3],
    growthRate: 75,
    relativeInterest: 88,
    visualPotentialScore: 60,
    tags: ['finance', 'treasury', 'investing', 'allocation'],
  },

  // Spring / Q2 (Apr - May - Jun)
  {
    event: 'Spring Architectural & Interior Renewal',
    pillar: 'discover',
    rawQuery: 'Modernist Biophilic Design: Integrating Natural Light and Sustainable Materials',
    targetMonths: [2, 3, 4],
    growthRate: 90,
    relativeInterest: 92,
    visualPotentialScore: 96,
    tags: ['design', 'architecture', 'biophilic', 'interiors'],
  },
  {
    event: 'Spring Slow Travel & Cultural Dispatches',
    pillar: 'travel',
    rawQuery: 'The Art of Slow European Rail Journeys and Historic Stays',
    targetMonths: [3, 4, 5],
    growthRate: 95,
    relativeInterest: 94,
    visualPotentialScore: 95,
    tags: ['travel', 'europe', 'rail-travel', 'slow-living'],
  },
  {
    event: 'Digital Spring Cleaning & Local Workflows',
    pillar: 'tech-ai',
    rawQuery: 'Local AI Workflows and Frictionless Knowledge Management Systems',
    targetMonths: [2, 3, 4, 5],
    growthRate: 92,
    relativeInterest: 95,
    visualPotentialScore: 78,
    tags: ['tech-ai', 'pkm', 'ai-workflows', 'digital-organization'],
  },

  // Summer / Q3 (Jul - Aug - Sep)
  {
    event: 'Summer Coastal Architecture & Retreats',
    pillar: 'travel',
    rawQuery: 'Minimalist Coastal Retreats: Architecture and Secluded Stays in the Mediterranean',
    targetMonths: [5, 6, 7, 8],
    growthRate: 100,
    relativeInterest: 96,
    visualPotentialScore: 98,
    tags: ['travel', 'mediterranean', 'retreats', 'architecture'],
  },
  {
    event: 'Mid-Year Lifestyle & Zeitgeist Shift',
    pillar: 'now',
    rawQuery: 'The Analog Turn: Why High-Signal Professionals Are Embracing Tactile Objects',
    targetMonths: [5, 6, 7, 8, 9],
    growthRate: 110,
    relativeInterest: 95,
    visualPotentialScore: 90,
    tags: ['trends', 'zeitgeist', 'analog', 'culture'],
  },

  // Autumn / Q4 (Sep - Oct - Nov - Dec)
  {
    event: 'Autumn Deep Focus & Workspace Architecture',
    pillar: 'life',
    rawQuery: 'The Contemplative Workspace: Acoustic Comfort, Natural Wood, and Focus Ergonomics',
    targetMonths: [8, 9, 10],
    growthRate: 88,
    relativeInterest: 92,
    visualPotentialScore: 94,
    tags: ['workspace', 'focus', 'interiors', 'life'],
  },
  {
    event: 'End-of-Year Cultural Curation & Books',
    pillar: 'discover',
    rawQuery: 'Curated Monograph Curation: Timeless Design and Photography Volumes',
    targetMonths: [9, 10, 11],
    growthRate: 85,
    relativeInterest: 88,
    visualPotentialScore: 92,
    tags: ['books', 'curation', 'art', 'design'],
  },
  {
    event: 'Winter Longevity & Cold Adaptations',
    pillar: 'wellbeing',
    rawQuery: 'Thermal Cycling Protocols: Contrast Therapy for Cognitive Resilience',
    targetMonths: [10, 11, 0],
    growthRate: 90,
    relativeInterest: 89,
    visualPotentialScore: 85,
    tags: ['wellbeing', 'sauna', 'recovery', 'longevity'],
  },
];

/**
 * Seasonal Calendar Discovery Adapter.
 *
 * Deterministically computes seasonal trend signals based on the current date/month.
 * Provides guaranteed, high-signal, timely candidate topics across all 7 LifeMode pillars
 * without external network dependency.
 */
export class SeasonalCalendarDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'SEASONAL_CALENDAR' as const;
  readonly name = 'Seasonal Calendar Adapter';

  async fetchSignals(options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const limit = options?.limit ?? 10;

    // Filter themes active in the current month or adjacent upcoming month (+1)
    const nextMonth = (currentMonth + 1) % 12;
    const activeThemes = SEASONAL_EDITORIAL_THEMES.filter(
      (theme) => theme.targetMonths.includes(currentMonth) || theme.targetMonths.includes(nextMonth)
    );

    let filtered = activeThemes;
    if (options?.categoryFilter && options.categoryFilter.length > 0) {
      filtered = filtered.filter((t) => options.categoryFilter?.includes(t.pillar));
    }

    const selectedThemes = filtered.slice(0, limit);

    const signals: DiscoverySignal[] = selectedThemes.map((theme, index) => {
      const payload: SeasonalCalendarPayload = {
        seasonalEvent: theme.event,
        targetMonth: currentMonth + 1,
        relevanceWindowDays: 60,
        historicalSpikeMultiplier: 1.5,
      };

      return {
        source: 'SEASONAL_CALENDAR',
        sourceId: `seasonal-${now.getFullYear()}-${theme.pillar}-${index + 1}`,
        rawQuery: theme.rawQuery,
        timestamp: now.toISOString(),
        metrics: {
          growthRate: theme.growthRate,
          searchVolume: 18000,
          relativeInterest: theme.relativeInterest,
          isBreakout: theme.growthRate >= 95,
          visualPotentialScore: theme.visualPotentialScore,
        },
        geography: 'GLOBAL',
        language: 'en',
        category: theme.pillar,
        metadata: {
          seasonalPayload: payload,
          suggestedPillar: theme.pillar,
          curatedTags: theme.tags,
          isSeasonal: true,
        },
      };
    });

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals,
      fetchedAt: now.toISOString(),
    };
  }
}
