import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { EditorialTopic } from '../types.ts';

const DEFAULT_CANDIDATES_PATH = resolve(process.cwd(), 'data/topics/candidates.json');

/**
 * Loads all candidate topics from storage.
 */
export async function loadCandidates(filePath: string = DEFAULT_CANDIDATES_PATH): Promise<EditorialTopic[]> {
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
): { updatedList: EditorialTopic[]; isNew: boolean } {
  const index = existingList.findIndex(
    (item) => item.id === newCandidate.id || item.slug === newCandidate.slug
  );

  if (index === -1) {
    return {
      updatedList: [...existingList, newCandidate],
      isNew: true,
    };
  }

  // Update existing record, preserving published/approved lifecycle status
  const existing = existingList[index];
  const updatedRecord: EditorialTopic = {
    ...existing,
    canonicalTopic: newCandidate.canonicalTopic,
    scoring: newCandidate.scoring,
    totalScore: newCandidate.totalScore,
    pinterestScore: newCandidate.pinterestScore ?? existing.pinterestScore,
    priorityTier: newCandidate.priorityTier,
    opportunityType: newCandidate.opportunityType,
    freshnessScore: newCandidate.freshnessScore,
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
  };
}
