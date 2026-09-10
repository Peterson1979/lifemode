import type { EditorialTopic, PillarSlug } from './types.ts';
import { VALID_PILLARS } from './types.ts';

export interface SelectionOptions {
  minScoreThreshold?: number; // default 80
  maxTopicsPerPillar?: number; // default max topics per pillar in one batch
  totalLimit?: number; // batch total limit
  existingPillarDistribution?: Partial<Record<PillarSlug, number>>;
  enablePillarBalancing?: boolean; // default true
  requireVisualPotential?: boolean;
}

/**
 * Deterministically filters, ranks, and selects approved editorial topics from scored candidates.
 *
 * Implements lightweight, practical pillar balancing:
 * - Prefers underrepresented pillars when candidates have competitive scores (within ~5 points).
 * - Prevents high-volume single-source topics from flooding a single pillar in one batch.
 * - Strict quality rule: Never approves or forces an inferior candidate (< 80) merely to balance pillars.
 */
export function selectEditorialCandidates(
  candidates: EditorialTopic[],
  options: SelectionOptions = {}
): {
  approved: EditorialTopic[];
  rejected: EditorialTopic[];
  deferred: EditorialTopic[];
} {
  const minScore = options.minScoreThreshold ?? 80;
  const enableBalancing = options.enablePillarBalancing ?? true;
  const existingDist = options.existingPillarDistribution || {};

  const pillarCounts: Partial<Record<PillarSlug, number>> = {};
  for (const pillar of VALID_PILLARS) {
    pillarCounts[pillar] = 0;
  }

  const approved: EditorialTopic[] = [];
  const rejected: EditorialTopic[] = [];
  const deferred: EditorialTopic[] = [];

  // Separate candidates into rejected, sub-threshold, and qualified
  const qualified: EditorialTopic[] = [];

  for (const topic of candidates) {
    if (topic.priorityTier === 'REJECT' || topic.totalScore < 60) {
      rejected.push({
        ...topic,
        status: 'REJECTED',
        rejectionReason: topic.rejectionReason || 'Score below minimum threshold (< 60)',
        updatedAt: new Date().toISOString(),
      });
    } else if (topic.totalScore < minScore) {
      deferred.push({
        ...topic,
        status: 'DEFERRED',
        deferReason: topic.deferReason || `Score (${topic.totalScore}) below approval threshold (${minScore})`,
        updatedAt: new Date().toISOString(),
      });
    } else {
      qualified.push(topic);
    }
  }

  // Sort qualified candidates with pillar balancing
  const sortedQualified = [...qualified].sort((a, b) => {
    // If scores differ significantly (> 5 points), highest score strictly wins
    const scoreDiff = b.totalScore - a.totalScore;
    if (Math.abs(scoreDiff) > 5 || !enableBalancing) {
      if (scoreDiff !== 0) return scoreDiff;
      return b.freshnessScore - a.freshnessScore;
    }

    // For competitively close scores (within 5 points), favor pillars with lower published count
    const countA = existingDist[a.pillar] || 0;
    const countB = existingDist[b.pillar] || 0;
    if (countA !== countB) {
      return countA - countB; // Lower count ranks first
    }

    if (scoreDiff !== 0) return scoreDiff;
    return b.freshnessScore - a.freshnessScore;
  });

  // Determine dynamic max per pillar if not specified: min(3, ceil(totalLimit / 2))
  const defaultMaxPerPillar = options.totalLimit && options.totalLimit > 2
    ? Math.max(2, Math.ceil(options.totalLimit / 3))
    : undefined;
  const maxPerPillar = options.maxTopicsPerPillar ?? defaultMaxPerPillar;

  // Pass 1: Select up to maxPerPillar per pillar
  const remainingAfterPass1: EditorialTopic[] = [];

  for (const topic of sortedQualified) {
    if (options.totalLimit && approved.length >= options.totalLimit) {
      deferred.push({
        ...topic,
        status: 'DEFERRED',
        deferReason: `Batch limit reached (${options.totalLimit})`,
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    const currentCount = pillarCounts[topic.pillar] || 0;
    if (maxPerPillar && currentCount >= maxPerPillar) {
      remainingAfterPass1.push(topic);
      continue;
    }

    pillarCounts[topic.pillar] = currentCount + 1;
    approved.push({
      ...topic,
      status: 'APPROVED',
      updatedAt: new Date().toISOString(),
    });
  }

  // Pass 2: If totalLimit not yet reached and we have remaining qualified candidates, fill capacity
  if (options.totalLimit && approved.length < options.totalLimit) {
    for (const topic of remainingAfterPass1) {
      if (approved.length >= options.totalLimit) {
        deferred.push({
          ...topic,
          status: 'DEFERRED',
          deferReason: `Batch limit reached (${options.totalLimit})`,
          updatedAt: new Date().toISOString(),
        });
        continue;
      }

      pillarCounts[topic.pillar] = (pillarCounts[topic.pillar] || 0) + 1;
      approved.push({
        ...topic,
        status: 'APPROVED',
        updatedAt: new Date().toISOString(),
      });
    }
  } else {
    for (const topic of remainingAfterPass1) {
      deferred.push({
        ...topic,
        status: 'DEFERRED',
        deferReason: `Pillar ${topic.pillar} quota reached and batch filled`,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { approved, rejected, deferred };
}
