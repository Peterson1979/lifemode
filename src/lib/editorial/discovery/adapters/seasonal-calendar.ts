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
    event: 'Winter Home Weatherization & HVAC Care',
    pillar: 'home',
    rawQuery: 'How to Prepare Home for Winter: Draft Sealing, Pipe Insulation, and HVAC Filter Schedules',
    targetMonths: [0, 1, 10, 11],
    growthRate: 90,
    relativeInterest: 92,
    visualPotentialScore: 85,
    tags: ['home', 'home-maintenance', 'winter-prep', 'hvac'],
  },
  {
    event: 'Circadian Light Optimization & Sleep Protocol',
    pillar: 'health',
    rawQuery: 'Circadian Light Management: Morning Sun Protocol and Blue Light Timing for Deep Sleep',
    targetMonths: [0, 1, 10, 11],
    growthRate: 85,
    relativeInterest: 88,
    visualPotentialScore: 82,
    tags: ['health', 'sleep', 'circadian', 'light-therapy'],
  },
  {
    event: 'New Year Personal Finance & Treasury Architecture',
    pillar: 'wealth',
    rawQuery: 'Personal Treasury Architecture: Optimizing High-Yield Savings and Treasury Bill Allocation',
    targetMonths: [0, 1, 2, 3],
    growthRate: 88,
    relativeInterest: 90,
    visualPotentialScore: 65,
    tags: ['wealth', 'personal-finance', 'treasury-bills', 'cash-management'],
  },
  {
    event: 'Desk Ergonomics & Morning Routine Architecture',
    pillar: 'life',
    rawQuery: 'How to Build a Frictionless Morning Routine: Habit Stacking and Workspace Ergonomics',
    targetMonths: [0, 1, 2],
    growthRate: 82,
    relativeInterest: 85,
    visualPotentialScore: 80,
    tags: ['life', 'productivity', 'ergonomics', 'morning-routine'],
  },
  {
    event: 'Local LLM Setup & Privacy-First Workflows',
    pillar: 'tech-ai',
    rawQuery: 'How to Set Up Local AI with Ollama: Private Document Search and Offline Note-Taking',
    targetMonths: [0, 1, 2, 3],
    growthRate: 95,
    relativeInterest: 94,
    visualPotentialScore: 78,
    tags: ['tech-ai', 'local-llm', 'ollama', 'privacy', 'ai-workflows'],
  },
  {
    event: 'Seasonal Home Maintenance Checklist',
    pillar: 'home',
    rawQuery: 'Seasonal Home Maintenance Checklist: Winter Inspection and Appliance Care Planner',
    targetMonths: [0, 1, 10, 11],
    growthRate: 85,
    relativeInterest: 89,
    visualPotentialScore: 80,
    tags: ['home', 'checklist', 'home-maintenance', 'inspection'],
  },

  // Spring / Q2 (Apr - May - Jun)
  {
    event: 'Spring Deep Cleaning & Appliance Descaling',
    pillar: 'home',
    rawQuery: 'How to Deep Clean a Washing Machine and Dishwasher: Descaling and Mildew Prevention Protocol',
    targetMonths: [2, 3, 4, 5],
    growthRate: 92,
    relativeInterest: 95,
    visualPotentialScore: 88,
    tags: ['home', 'cleaning', 'appliance-care', 'spring-cleaning'],
  },
  {
    event: 'Spring Pantry Organization & Safe Storage',
    pillar: 'home',
    rawQuery: 'How to Organize a Small Pantry: Airtight Container Sizing and Grain Longevity',
    targetMonths: [2, 3, 4],
    growthRate: 86,
    relativeInterest: 89,
    visualPotentialScore: 90,
    tags: ['home', 'pantry', 'food-storage', 'organization'],
  },
  {
    event: 'Spring Aerobic Base & Zone 2 Training Formula',
    pillar: 'health',
    rawQuery: 'Zone 2 Cardio Calculation: Heart Rate Formula and Weekly Duration for Metabolic Health',
    targetMonths: [2, 3, 4, 5],
    growthRate: 90,
    relativeInterest: 92,
    visualPotentialScore: 82,
    tags: ['health', 'fitness', 'zone-2', 'cardio', 'metabolic'],
  },
  {
    event: 'Tax Strategy & Retirement Account Contributions',
    pillar: 'wealth',
    rawQuery: 'Roth IRA vs Traditional 401k: Contribution Limits and Tax-Bracket Decision Guide',
    targetMonths: [2, 3, 4],
    growthRate: 95,
    relativeInterest: 96,
    visualPotentialScore: 60,
    tags: ['wealth', 'tax-strategy', 'ira', '401k', 'investing'],
  },
  {
    event: 'Digital Decluttering & Local Data Backup Protocol',
    pillar: 'life',
    rawQuery: 'How to Build a 3-2-1 Backup Strategy: Local Hard Drives and Cloud Storage Setup',
    targetMonths: [2, 3, 4, 5],
    growthRate: 84,
    relativeInterest: 88,
    visualPotentialScore: 75,
    tags: ['life', 'digital-declutter', 'backup', 'organization'],
  },
  {
    event: 'Cookware Material Finder & Decision Matrix',
    pillar: 'home',
    rawQuery: 'Cookware Material Decision Guide: Cast Iron vs Stainless Steel vs Carbon Steel Compared',
    targetMonths: [2, 3, 4, 5],
    growthRate: 88,
    relativeInterest: 90,
    visualPotentialScore: 85,
    tags: ['home', 'decision-matrix', 'cookware', 'kitchen'],
  },

  // Summer / Q3 (Jul - Aug - Sep)
  {
    event: 'Safe Leftover Storage & Rapid Cooling Protocol',
    pillar: 'home',
    rawQuery: 'How to Store Cooked Rice Safely: The 1-Hour Rule and Reheating Protocol',
    targetMonths: [5, 6, 7, 8],
    growthRate: 94,
    relativeInterest: 95,
    visualPotentialScore: 86,
    tags: ['home', 'food-safety', 'rice-storage', 'leftovers'],
  },
  {
    event: 'Summer Laundry Stain Chemistry & Sunscreen Removal',
    pillar: 'home',
    rawQuery: 'How to Remove Sunscreen Stains and Sweat Marks: Enzyme Pre-Treatment Protocol',
    targetMonths: [5, 6, 7, 8],
    growthRate: 92,
    relativeInterest: 94,
    visualPotentialScore: 85,
    tags: ['home', 'laundry', 'stain-removal', 'summer-care'],
  },
  {
    event: 'Hydration & Electrolyte Timing Protocol',
    pillar: 'health',
    rawQuery: 'Electrolyte Intake and Heat Hydration: Sodium, Potassium, and Magnesium Ratios',
    targetMonths: [5, 6, 7, 8],
    growthRate: 90,
    relativeInterest: 91,
    visualPotentialScore: 80,
    tags: ['health', 'hydration', 'electrolytes', 'nutrition'],
  },
  {
    event: 'Emergency Fund Sizing & High-Yield Cash Allocation',
    pillar: 'wealth',
    rawQuery: 'How Much Cash to Keep in Emergency Funds: 3 vs 6 vs 12 Month Sizing Matrix',
    targetMonths: [5, 6, 7, 8],
    growthRate: 82,
    relativeInterest: 86,
    visualPotentialScore: 62,
    tags: ['wealth', 'emergency-fund', 'savings', 'cash-flow'],
  },
  {
    event: 'Smartphone Camera AI for Household Troubleshooting',
    pillar: 'tech-ai',
    rawQuery: 'How to Use AI Vision Features to Identify Objects, Translate Labels, and Troubleshoot Problems',
    targetMonths: [5, 6, 7, 8, 9],
    growthRate: 96,
    relativeInterest: 98,
    visualPotentialScore: 90,
    tags: ['tech-ai', 'ai-vision', 'camera-ai', 'troubleshooting'],
  },
  {
    event: 'Food Storage Shelf Life Calculator',
    pillar: 'home',
    rawQuery: 'Food Storage & Shelf Life Calculator: Pantry, Refrigerator, and Freezer Limits',
    targetMonths: [5, 6, 7, 8],
    growthRate: 88,
    relativeInterest: 92,
    visualPotentialScore: 84,
    tags: ['home', 'calculator', 'food-storage', 'shelf-life'],
  },

  // Autumn / Q4 (Sep - Oct - Nov - Dec)
  {
    event: 'Autumn Home Winterization & Gutter Maintenance',
    pillar: 'home',
    rawQuery: 'How to Prepare Home for Winter: Gutter Cleaning, Draft Proofing, and Pipe Care',
    targetMonths: [8, 9, 10, 11],
    growthRate: 95,
    relativeInterest: 96,
    visualPotentialScore: 88,
    tags: ['home', 'home-maintenance', 'winter-prep', 'gutters'],
  },
  {
    event: 'Cast Iron Restoration & High-Heat Seasoning',
    pillar: 'home',
    rawQuery: 'How to Clean and Season a Cast Iron Skillet: The Oil Polymerization Protocol',
    targetMonths: [8, 9, 10, 11],
    growthRate: 90,
    relativeInterest: 93,
    visualPotentialScore: 92,
    tags: ['home', 'cast-iron', 'cookware-care', 'kitchen-chemistry'],
  },
  {
    event: 'Daily Protein Intake Calculation for Muscle Preservation',
    pillar: 'health',
    rawQuery: 'How to Calculate Daily Protein Intake: Leucine Thresholds and Distribution per Meal',
    targetMonths: [8, 9, 10, 11],
    growthRate: 88,
    relativeInterest: 92,
    visualPotentialScore: 80,
    tags: ['health', 'protein', 'nutrition', 'muscle-health'],
  },
  {
    event: 'Year-End Tax Loss Harvesting & Portfolio Rebalancing',
    pillar: 'wealth',
    rawQuery: 'Tax-Loss Harvesting Strategy: Wash-Sale Rules and Portfolio Rebalancing Matrix',
    targetMonths: [9, 10, 11],
    growthRate: 92,
    relativeInterest: 95,
    visualPotentialScore: 65,
    tags: ['wealth', 'tax-loss-harvesting', 'portfolio', 'investing'],
  },
  {
    event: 'Seasonal Clothes Storage & Wool Fabric Care',
    pillar: 'life',
    rawQuery: 'How to Store Seasonal Clothes: Moth Prevention, Cedar Placement, and Breathable Bags',
    targetMonths: [8, 9, 10],
    growthRate: 86,
    relativeInterest: 90,
    visualPotentialScore: 85,
    tags: ['life', 'wardrobe-care', 'fabric-storage', 'organization'],
  },
  {
    event: 'AI Audio Transcription & Note-Taking Workflow',
    pillar: 'tech-ai',
    rawQuery: 'How to Use Voice-to-Text and AI Note-Taking Tools to Organize Everyday Tasks',
    targetMonths: [8, 9, 10, 11],
    growthRate: 92,
    relativeInterest: 94,
    visualPotentialScore: 80,
    tags: ['tech-ai', 'transcription', 'note-taking', 'ai-tools'],
  },
  {
    event: 'Laundry Stain Solver & Chemical Treatment Guide',
    pillar: 'home',
    rawQuery: 'Laundry Stain Solver Matrix: Tannin vs Lipid vs Protein vs Mineral Stain Protocols',
    targetMonths: [8, 9, 10, 11],
    growthRate: 88,
    relativeInterest: 92,
    visualPotentialScore: 84,
    tags: ['home', 'cheat-sheet', 'stain-solver', 'laundry'],
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
