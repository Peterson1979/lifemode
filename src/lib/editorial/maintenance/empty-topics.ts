import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import { VALID_PILLARS, type PillarSlug, type EditorialTopic } from '../types.ts';

export interface EmptyTopicReport {
  emptyPillars: PillarSlug[];
  pillarCounts: Record<PillarSlug, number>;
  plannedArticles: EditorialTopic[];
}

/**
 * Curated, high-signal seed topics for pillars that currently lack published coverage.
 */
export const SEED_TOPICS_FOR_EMPTY_PILLARS: Partial<Record<PillarSlug, EditorialTopic>> = {
  wealth: {
    id: 'lm-wealth-seed-01-high-yield-cash-buffer',
    canonicalTopic: 'The High-Yield Cash Buffer: Why a Liquid Reserve Beats Rigid Budgeting',
    slug: 'high-yield-cash-buffer-emergency-savings',
    pillar: 'wealth',
    sourceSignals: [
      {
        source: 'MANUAL',
        query: 'high yield cash buffer emergency fund framework',
        volumeOrGrowth: 95,
        recordedAt: new Date().toISOString(),
      },
    ],
    queryVariants: [
      'where to keep emergency fund 2026',
      'high yield savings cash reserve strategy',
      'personal finance liquid buffer without budgeting',
    ],
    freshnessScore: 92,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['wealth', 'finance', 'savings', 'banking'],
    targetAudience:
      'Independent professionals and modern households seeking practical, low-friction cash management.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 90,
      pinterestPotential: 85,
      socialPotential: 80,
      lifeModeRelevance: 95,
      commercialPotential: 85,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    totalScore: 88,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE_AND_SOCIAL',
    status: 'APPROVED',
  },
  life: {
    id: 'lm-life-seed-01-contemporary-capsule-wardrobe',
    canonicalTopic: 'The Modern Capsule Wardrobe and Intentional Skincare: A Practical Guide to Everyday Living',
    slug: 'modern-capsule-wardrobe-intentional-skincare-guide',
    pillar: 'life',
    sourceSignals: [],
    queryVariants: ['capsule wardrobe essentials', 'minimalist skincare routine', 'contemporary personal style'],
    freshnessScore: 88,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['life', 'fashion', 'skincare', 'beauty', 'wardrobe'],
    targetAudience: 'Everyday readers seeking accessible, elevated style and thoughtful beauty routines.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 88,
      pinterestPotential: 92,
      socialPotential: 85,
      lifeModeRelevance: 95,
      commercialPotential: 80,
      freshness: 88,
      competitionOpportunity: 80,
      originalityPotential: 88,
    },
    totalScore: 87,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
  },
  'tech-ai': {
    id: 'lm-tech-seed-01-private-note-taking-systems',
    canonicalTopic: 'Local-First Markdown Note-Taking: Building an Archive You Truly Own',
    slug: 'local-first-markdown-note-taking-archive',
    pillar: 'tech-ai',
    sourceSignals: [],
    queryVariants: ['local first markdown notes', 'future proof digital notebook'],
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['tech-ai', 'privacy', 'notes', 'tools'],
    targetAudience: 'Knowledge workers and writers seeking permanent digital tools.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 88,
      pinterestPotential: 85,
      socialPotential: 80,
      lifeModeRelevance: 95,
      commercialPotential: 75,
      freshness: 90,
      competitionOpportunity: 85,
      originalityPotential: 90,
    },
    totalScore: 87,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
  },
  health: {
    id: 'lm-health-seed-01-zone-2-cardio-longevity',
    canonicalTopic: 'Zone 2 Cardio for Longevity: The Science of Base Aerobic Health',
    slug: 'zone-2-cardio-longevity-aerobic-health',
    pillar: 'health',
    sourceSignals: [],
    queryVariants: ['zone 2 cardio protocol', 'aerobic base training longevity'],
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['health', 'fitness', 'longevity'],
    targetAudience: 'Readers interested in sustainable health protocols.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 90,
      pinterestPotential: 85,
      socialPotential: 85,
      lifeModeRelevance: 95,
      commercialPotential: 80,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    totalScore: 88,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
  },
  home: {
    id: 'lm-home-seed-01-artisan-fermentation-kitchen',
    canonicalTopic: 'The Art of Home Fermentation: Sourdough, Sauerkraut, and Cultured Pantry Basics',
    slug: 'artisan-home-fermentation-sourdough-sauerkraut-pantry',
    pillar: 'home',
    sourceSignals: [],
    queryVariants: ['home fermentation basics', 'artisan sourdough culture pantry'],
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['home', 'cooking', 'food-culture', 'kitchen', 'ingredients'],
    targetAudience: 'Culinary enthusiasts seeking mindful, traditional food craft.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 88,
      pinterestPotential: 95,
      socialPotential: 85,
      lifeModeRelevance: 95,
      commercialPotential: 80,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    totalScore: 88,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
  },
  tools: {
    id: 'lm-tools-seed-01-mortgage-rent-calculator',
    canonicalTopic: 'Interactive Rent vs. Buy Decision Framework: Weighing Liquidity and Equity',
    slug: 'rent-vs-buy-decision-framework-calculators',
    pillar: 'tools',
    sourceSignals: [],
    queryVariants: ['rent vs buy decision calculator', 'housing cost interactive model'],
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['tools', 'calculators', 'decision-making', 'finance'],
    targetAudience: 'Households evaluating long-term housing economics.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 92,
      pinterestPotential: 80,
      socialPotential: 82,
      lifeModeRelevance: 95,
      commercialPotential: 80,
      freshness: 90,
      competitionOpportunity: 85,
      originalityPotential: 92,
    },
    totalScore: 90,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
  },
};

/**
 * Discovers which pillars have zero substantive published articles.
 */
export async function findEmptyTopics(options: {
  contentRoot?: string;
}): Promise<EmptyTopicReport> {
  const contentRoot = resolve(options.contentRoot || join(process.cwd(), 'src', 'content'));
  const emptyPillars: PillarSlug[] = [];
  const pillarCounts: Record<PillarSlug, number> = Object.fromEntries(
    VALID_PILLARS.map((p) => [p, 0])
  ) as Record<PillarSlug, number>;

  for (const pillar of VALID_PILLARS) {
    const pillarDir = join(contentRoot, pillar);
    let files: string[] = [];
    try {
      files = await fs.readdir(pillarDir);
    } catch {
      files = [];
    }

    const substantiveArticles = files.filter(
      (f) => (f.endsWith('.md') || f.endsWith('.mdx')) && !f.startsWith('welcome-to-')
    );

    pillarCounts[pillar] = substantiveArticles.length;
    if (substantiveArticles.length === 0) {
      emptyPillars.push(pillar);
    }
  }

  const plannedArticles = emptyPillars
    .map((pillar) => SEED_TOPICS_FOR_EMPTY_PILLARS[pillar])
    .filter((t): t is EditorialTopic => Boolean(t));

  return {
    emptyPillars,
    pillarCounts,
    plannedArticles,
  };
}
