import type { EditorialTopic, PillarSlug } from './types.ts';

export interface SelectionOptions {
  minScoreThreshold?: number; // default 80
  maxTopicsPerPillar?: number;
  totalLimit?: number;
  requireVisualPotential?: boolean;
}

/**
 * Deterministically filters, ranks, and selects approved editorial topics from scored candidates.
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
  const pillarCounts: Partial<Record<PillarSlug, number>> = {};

  const approved: EditorialTopic[] = [];
  const rejected: EditorialTopic[] = [];
  const deferred: EditorialTopic[] = [];

  // Sort candidates by totalScore desc, then freshnessScore desc
  const sorted = [...candidates].sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    return b.freshnessScore - a.freshnessScore;
  });

  for (const topic of sorted) {
    // Immediate rejection for low scores or REJECT tier
    if (topic.priorityTier === 'REJECT' || topic.totalScore < 60) {
      rejected.push({
        ...topic,
        status: 'REJECTED',
        rejectionReason: topic.rejectionReason || 'Score below minimum threshold (< 60)',
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    // Low priority topics (< 80) are deferred
    if (topic.totalScore < minScore) {
      deferred.push({
        ...topic,
        status: 'DEFERRED',
        deferReason: topic.deferReason || `Score (${topic.totalScore}) below approval threshold (${minScore})`,
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    // Check pillar quota
    const currentPillarCount = pillarCounts[topic.pillar] || 0;
    if (options.maxTopicsPerPillar && currentPillarCount >= options.maxTopicsPerPillar) {
      deferred.push({
        ...topic,
        status: 'DEFERRED',
        deferReason: `Pillar ${topic.pillar} reached maximum quota (${options.maxTopicsPerPillar})`,
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    // Check total limit
    if (options.totalLimit && approved.length >= options.totalLimit) {
      deferred.push({
        ...topic,
        status: 'DEFERRED',
        deferReason: `Batch limit reached (${options.totalLimit})`,
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    // Approve candidate
    pillarCounts[topic.pillar] = currentPillarCount + 1;
    approved.push({
      ...topic,
      status: 'APPROVED',
      updatedAt: new Date().toISOString(),
    });
  }

  return { approved, rejected, deferred };
}
