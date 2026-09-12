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
export const SEED_TOPICS_FOR_EMPTY_PILLARS: Record<PillarSlug, EditorialTopic> = {
  money: {
    id: 'lm-money-seed-01-high-yield-cash-buffer',
    canonicalTopic: 'The High-Yield Cash Buffer: Why a Liquid Reserve Beats Rigid Budgeting',
    slug: 'high-yield-cash-buffer-emergency-savings',
    pillar: 'money',
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
    tags: ['money', 'finance', 'savings', 'banking', 'wealth'],
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
    id: 'lm-life-seed-01-daily-frictionless-routines',
    canonicalTopic: 'Designing Low-Friction Daily Routines for Focused Living',
    slug: 'low-friction-daily-routines-focused-living',
    pillar: 'life',
    sourceSignals: [],
    queryVariants: ['daily routines for focus', 'home systems for quiet living'],
    freshnessScore: 85,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['life', 'habits', 'routines', 'home'],
    targetAudience: 'Curious readers wanting calmer daily systems.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 85,
      pinterestPotential: 90,
      socialPotential: 80,
      lifeModeRelevance: 95,
      commercialPotential: 75,
      freshness: 85,
      competitionOpportunity: 80,
      originalityPotential: 85,
    },
    totalScore: 85,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
  },
  travel: {
    id: 'lm-travel-seed-01-slow-train-routes-europe',
    canonicalTopic: 'Scenic Sleeper Trains: The Return of Unhurried Overnight Travel in Europe',
    slug: 'scenic-sleeper-trains-overnight-travel-europe',
    pillar: 'travel',
    sourceSignals: [],
    queryVariants: ['night train routes europe', 'slow travel sleeper trains'],
    freshnessScore: 88,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['travel', 'trains', 'europe', 'slow-travel'],
    targetAudience: 'Travelers seeking scenic, sustainable journey experiences.',
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
    tags: ['tech', 'privacy', 'notes', 'tools'],
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
  wellbeing: {
    id: 'lm-wellbeing-seed-01-zone-2-cardio-longevity',
    canonicalTopic: 'Zone 2 Cardio for Longevity: The Science of Base Aerobic Health',
    slug: 'zone-2-cardio-longevity-aerobic-health',
    pillar: 'wellbeing',
    sourceSignals: [],
    queryVariants: ['zone 2 cardio protocol', 'aerobic base training longevity'],
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['wellbeing', 'fitness', 'longevity', 'health'],
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
  discover: {
    id: 'lm-discover-seed-01-independent-magazines-print',
    canonicalTopic: 'The Renaissance of Independent Print: Niche Magazines Worth Holding',
    slug: 'renaissance-independent-print-niche-magazines',
    pillar: 'discover',
    sourceSignals: [],
    queryVariants: ['best independent print magazines', 'collectible indie publications'],
    freshnessScore: 85,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['discover', 'culture', 'print', 'design', 'magazines'],
    targetAudience: 'Design lovers and tactile print enthusiasts.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 80,
      pinterestPotential: 90,
      socialPotential: 80,
      lifeModeRelevance: 95,
      commercialPotential: 75,
      freshness: 85,
      competitionOpportunity: 85,
      originalityPotential: 90,
    },
    totalScore: 85,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'APPROVED',
  },
  now: {
    id: 'lm-now-seed-01-slow-morning-rituals-shift',
    canonicalTopic: 'The Cultural Rejection of the 5 AM Rush: Embracing Unhurried Mornings',
    slug: 'cultural-rejection-5am-rush-unhurried-mornings',
    pillar: 'now',
    sourceSignals: [],
    queryVariants: ['rethinking 5am morning routine', 'slow morning culture shift'],
    freshnessScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['now', 'culture', 'habits', 'trends'],
    targetAudience: 'People looking for mindful cultural alternatives.',
    primaryIntent: 'informational',
    scoring: {
      searchPotential: 88,
      pinterestPotential: 92,
      socialPotential: 85,
      lifeModeRelevance: 95,
      commercialPotential: 75,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    totalScore: 87,
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
  const pillarCounts: Record<PillarSlug, number> = {
    life: 0,
    travel: 0,
    'tech-ai': 0,
    money: 0,
    wellbeing: 0,
    discover: 0,
    now: 0,
  };

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
    .filter(Boolean);

  return {
    emptyPillars,
    pillarCounts,
    plannedArticles,
  };
}
