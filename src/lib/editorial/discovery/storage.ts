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

/**
 * Loads all candidate topics from storage.
 */
export async function loadCandidates(filePath: string = DEFAULT_CANDIDATES_PATH): Promise<EditorialTopic[]> {
  return loadTopicsFromFile(filePath);
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
