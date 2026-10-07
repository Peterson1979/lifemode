import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import type { EditorialTopic } from '../types.ts';

const DEFAULT_TOPICS_DIR = resolve(process.cwd(), 'data/topics');
const DEFAULT_CANDIDATES_PATH = join(DEFAULT_TOPICS_DIR, 'candidates.json');
const DEFAULT_APPROVED_PATH = join(DEFAULT_TOPICS_DIR, 'approved.json');
const DEFAULT_REJECTED_PATH = join(DEFAULT_TOPICS_DIR, 'rejected.json');
const DEFAULT_PUBLISHED_PATH = join(DEFAULT_TOPICS_DIR, 'published.json');

/**
 * Loads a topics array from a specified JSON file path.
 */
async function loadTopicsFromFile(filePath: string): Promise<EditorialTopic[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EditorialTopic[]) : [];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

import { normalizePillar, isMeaningfulEditorialTopic } from '../normalization.ts';

export interface CandidateLifecycleOptions {
  now?: Date;
  maxPoolSize?: number; // default 150
  trendingTtlDays?: number; // default 7
  seasonalTtlDays?: number; // default 14
  publishedSlugs?: Set<string>;
  skipPruning?: boolean;
}

/**
 * Prunes expired, legacy, rejected, or low-quality candidates, decays freshness for older items,
 * and bounds the active pool to the top-scoring candidates.
 */
export function pruneAndMigrateCandidates(
  candidates: EditorialTopic[],
  options: CandidateLifecycleOptions = {}
): EditorialTopic[] {
  if (options.skipPruning) {
    return candidates;
  }

  const now = options.now ?? new Date();
  const maxPoolSize = options.maxPoolSize ?? 150;
  const trendingTtlDays = options.trendingTtlDays ?? 7;
  const seasonalTtlDays = options.seasonalTtlDays ?? 14;
  const publishedSlugs = options.publishedSlugs ?? new Set<string>();

  const validMap = new Map<string, EditorialTopic>();

  for (const candidate of candidates) {
    // 2. Normalize legacy pillar to active 6 pillars; reject unmapped/invalid
    const activePillar = normalizePillar(candidate.pillar);
    if (!activePillar) {
      continue;
    }

    // 3. Reject low-intent / filler / gossip / non-editorial queries
    const topicText = candidate.canonicalTopic || '';
    const meaningCheck = isMeaningfulEditorialTopic(topicText);
    if (!meaningCheck.isValid) {
      continue;
    }

    // 4. Lifetime / Staleness check (7 days trending, 14 days seasonal)
    const timestampStr = candidate.createdAt || candidate.updatedAt;
    const itemDate = timestampStr ? new Date(timestampStr) : now;
    const effectiveDate = !isNaN(itemDate.getTime()) ? itemDate : now;
    const ageMs = now.getTime() - effectiveDate.getTime();
    const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));

    const isSeasonal = candidate.opportunityType === 'SEASONAL_ARTICLE' || candidate.tags?.includes('seasonal');
    const allowedLifetimeDays = isSeasonal ? seasonalTtlDays : trendingTtlDays;

    if (ageDays > allowedLifetimeDays) {
      continue;
    }

    // 5. Freshness decay: older candidates gradually lose freshness advantage
    const decayFactor = Math.max(0.1, 1 - ageDays / allowedLifetimeDays);
    const baseFreshness = candidate.freshnessScore ?? 75;
    const decayedFreshness = Math.round(baseFreshness * decayFactor);

    let updatedTotalScore = candidate.totalScore;
    if (candidate.scoring) {
      const scoring = { ...candidate.scoring, freshness: decayedFreshness };
      updatedTotalScore = Math.round(
        scoring.searchPotential * 0.20 +
        scoring.pinterestPotential * 0.15 +
        scoring.socialPotential * 0.15 +
        scoring.lifeModeRelevance * 0.15 +
        scoring.commercialPotential * 0.10 +
        scoring.freshness * 0.10 +
        scoring.competitionOpportunity * 0.05 +
        scoring.originalityPotential * 0.10
      );
    } else {
      updatedTotalScore = Math.round(candidate.totalScore * (0.85 + 0.15 * decayFactor));
    }

    const isRejected = candidate.status === 'REJECTED' || candidate.priorityTier === 'REJECT' || candidate.opportunityType === 'REJECT';
    const isPublished = candidate.status === 'PUBLISHED' || publishedSlugs.has(candidate.slug);

    const updatedCandidate: EditorialTopic = {
      ...candidate,
      pillar: activePillar,
      status: isPublished ? 'PUBLISHED' : (isRejected ? 'REJECTED' : candidate.status),
      priorityTier: isRejected ? 'REJECT' : candidate.priorityTier,
      opportunityType: isRejected ? 'REJECT' : candidate.opportunityType,
      freshnessScore: decayedFreshness,
      totalScore: isRejected ? 0 : updatedTotalScore,
      createdAt: candidate.createdAt || effectiveDate.toISOString(),
      updatedAt: candidate.updatedAt || now.toISOString(),
    };

    // 6. Deduplication by slug
    const dedupeKey = candidate.slug;
    if (validMap.has(dedupeKey)) {
      const existing = validMap.get(dedupeKey)!;
      if (updatedCandidate.totalScore > existing.totalScore) {
        validMap.set(dedupeKey, {
          ...updatedCandidate,
          sourceSignals: [...existing.sourceSignals, ...updatedCandidate.sourceSignals],
        });
      }
    } else {
      validMap.set(dedupeKey, updatedCandidate);
    }
  }

  // 7. Sort by totalScore desc, freshnessScore desc, and recency desc
  const sorted = Array.from(validMap.values()).sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.freshnessScore !== a.freshnessScore) {
      return b.freshnessScore - a.freshnessScore;
    }
    return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime();
  });

  // 8. Bound active pool to target maximum (default 150)
  return sorted.slice(0, maxPoolSize);
}

/**
 * Loads all candidate topics from storage and applies migration, pruning, and decay.
 */
export async function loadCandidates(
  filePath: string = DEFAULT_CANDIDATES_PATH,
  options?: CandidateLifecycleOptions
): Promise<EditorialTopic[]> {
  const rawTopics = await loadTopicsFromFile(filePath);
  return pruneAndMigrateCandidates(rawTopics, options);
}

/**
 * Loads all approved topics from storage.
 */
export async function loadApproved(filePath: string = DEFAULT_APPROVED_PATH): Promise<EditorialTopic[]> {
  return loadTopicsFromFile(filePath);
}

/**
 * Loads all rejected topics from storage.
 */
export async function loadRejected(filePath: string = DEFAULT_REJECTED_PATH): Promise<EditorialTopic[]> {
  return loadTopicsFromFile(filePath);
}

/**
 * Loads all published topics from storage.
 */
export async function loadPublished(filePath: string = DEFAULT_PUBLISHED_PATH): Promise<EditorialTopic[]> {
  return loadTopicsFromFile(filePath);
}

/**
 * Loads all topics across all pools (candidates, approved, rejected, published) for comprehensive deduplication.
 */
export async function loadAllHistoricalTopics(baseDir: string = DEFAULT_TOPICS_DIR): Promise<{
  candidates: EditorialTopic[];
  approved: EditorialTopic[];
  rejected: EditorialTopic[];
  published: EditorialTopic[];
  all: EditorialTopic[];
}> {
  const [candidates, approved, rejected, published] = await Promise.all([
    loadTopicsFromFile(join(baseDir, 'candidates.json')),
    loadTopicsFromFile(join(baseDir, 'approved.json')),
    loadTopicsFromFile(join(baseDir, 'rejected.json')),
    loadTopicsFromFile(join(baseDir, 'published.json')),
  ]);

  return {
    candidates,
    approved,
    rejected,
    published,
    all: [...candidates, ...approved, ...rejected, ...published],
  };
}

/**
 * Persists candidate topics to storage.
 */
export async function saveCandidates(
  candidates: EditorialTopic[],
  filePath: string = DEFAULT_CANDIDATES_PATH
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const formattedJson = JSON.stringify(candidates, null, 2);
  await writeFile(filePath, formattedJson, 'utf-8');
}

/**
 * Merges a candidate topic into the existing list.
 * Updates the existing topic if ID or slug matches, or appends a new entry.
 */
export function mergeCandidateTopic(
  newCandidate: EditorialTopic,
  existingList: EditorialTopic[]
): { updatedList: EditorialTopic[]; isNew: boolean; mergedTopic: EditorialTopic } {
  const index = existingList.findIndex(
    (item) => item.id === newCandidate.id || item.slug === newCandidate.slug
  );

  if (index === -1) {
    return {
      updatedList: [...existingList, newCandidate],
      isNew: true,
      mergedTopic: newCandidate,
    };
  }

  // Update existing record, preserving published/approved/rejected lifecycle status
  const existing = existingList[index];
  const isExistingProtected = existing.status === 'PUBLISHED' || existing.status === 'REJECTED';
  const resolvedStatus = isExistingProtected
    ? existing.status
    : (newCandidate.status ?? existing.status);

  const updatedRecord: EditorialTopic = {
    ...existing,
    canonicalTopic: newCandidate.canonicalTopic,
    scoring: newCandidate.scoring,
    totalScore: Math.max(existing.totalScore, newCandidate.totalScore),
    pinterestScore: newCandidate.pinterestScore ?? existing.pinterestScore,
    priorityTier: existing.status === 'REJECTED' ? 'REJECT' : newCandidate.priorityTier,
    opportunityType: existing.status === 'REJECTED' ? 'REJECT' : newCandidate.opportunityType,
    status: resolvedStatus,
    rejectionReason: existing.rejectionReason ?? newCandidate.rejectionReason,
    deferReason: newCandidate.deferReason ?? existing.deferReason,
    revisionCyclesCount: Math.max(existing.revisionCyclesCount ?? 0, newCandidate.revisionCyclesCount ?? 0),
    revisionAttempted: existing.revisionAttempted ?? newCandidate.revisionAttempted,
    freshnessScore: Math.max(existing.freshnessScore, newCandidate.freshnessScore),
    updatedAt: new Date().toISOString(),
    sourceSignals: [
      ...existing.sourceSignals,
      ...newCandidate.sourceSignals.filter(
        (ns) => !existing.sourceSignals.some((es) => es.source === ns.source && es.query === ns.query)
      ),
    ],
    queryVariants: Array.from(new Set([...existing.queryVariants, ...newCandidate.queryVariants])),
    tags: Array.from(new Set([...existing.tags, ...newCandidate.tags])),
  };

  const updatedList = [...existingList];
  updatedList[index] = updatedRecord;

  return {
    updatedList,
    isNew: false,
    mergedTopic: updatedRecord,
  };
}
