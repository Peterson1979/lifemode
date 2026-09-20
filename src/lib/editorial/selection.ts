import type { EditorialTopic, PillarSlug } from './types.ts';
import { VALID_PILLARS } from './types.ts';
import type { FeedbackSignalSummary } from './performance/types.ts';
import { evaluateTopicPerformanceFeedback } from './performance/feedback.ts';

export interface SelectionOptions {
  minScoreThreshold?: number; // default 80
  maxTopicsPerPillar?: number; // default max topics per pillar in one batch
  totalLimit?: number; // batch total limit
  existingPillarDistribution?: Partial<Record<PillarSlug, number>>;
  existingPillarRecency?: Partial<Record<PillarSlug, number>>; // days since last publication in pillar
  enablePillarBalancing?: boolean; // default true
  requireVisualPotential?: boolean;
  feedbackSignals?: FeedbackSignalSummary;
  enablePerformanceFeedback?: boolean; // default true if feedbackSignals provided
}

/**
 * Calculates a dynamic anti-starvation score boost for a pillar based on elapsed days since last publication.
 * Ensures starved pillars (e.g. >3-7 days without publication) gain competitive priority
 * while never bypassing baseline quality (raw score >= 80).
 */
export function calculatePillarStarvationBoost(
  pillar: PillarSlug,
  existingPillarRecency?: Partial<Record<PillarSlug, number>>
): number {
  if (!existingPillarRecency) return 0;
  const daysSinceLast = existingPillarRecency[pillar];
  if (daysSinceLast === undefined) return 0;

  if (daysSinceLast >= 7) return 10;
  if (daysSinceLast >= 5) return 6;
  if (daysSinceLast >= 3) return 3;
  return 0;
}

/**
 * Deterministically filters, ranks, and selects approved editorial topics from scored candidates.
 *
 * Implements lightweight, practical pillar balancing:
 * - Prefers underrepresented and starved pillars when candidates have competitive scores.
 * - Prevents high-volume single-source topics from flooding a single pillar in one batch.
 * - Strict quality rule: Never approves or forces an inferior candidate (< 80) merely to balance pillars.
 * - Performance Feedback: Integrates bounded historical performance modifiers (+/- 10) without bypassing minimum quality or safety gates.
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
  const existingRecency = options.existingPillarRecency;
  const feedbackSignals = options.feedbackSignals;
  const applyFeedback = options.enablePerformanceFeedback ?? Boolean(feedbackSignals);

  const pillarCounts: Partial<Record<PillarSlug, number>> = {};
  for (const pillar of VALID_PILLARS) {
    pillarCounts[pillar] = 0;
  }

  const approved: EditorialTopic[] = [];
  const rejected: EditorialTopic[] = [];
  const deferred: EditorialTopic[] = [];

  // 1. Evaluate performance feedback and anti-starvation boosts on candidates
  const enrichedCandidates: Array<EditorialTopic & { effectiveScore: number }> = candidates.map((topic) => {
    let performanceFeedback = topic.performanceFeedback;
    if (feedbackSignals && applyFeedback) {
      performanceFeedback = evaluateTopicPerformanceFeedback(topic, feedbackSignals);
    }
    const adjustment = performanceFeedback?.scoreAdjustment || 0;
    const starvationBoost = enableBalancing ? calculatePillarStarvationBoost(topic.pillar, existingRecency) : 0;
    const effectiveScore = Math.max(0, Math.min(100, Math.round((topic.totalScore + adjustment + starvationBoost) * 10) / 10));

    return {
      ...topic,
      performanceFeedback,
      effectiveScore,
    };
  });

  // 2. Separate candidates into rejected, sub-threshold, and qualified
  // Safety rule: Raw score < 60 or REJECT priority tier is NEVER approved by feedback
  const qualified: Array<EditorialTopic & { effectiveScore: number }> = [];

  for (const topic of enrichedCandidates) {
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

  // 3. Sort qualified candidates with performance feedback and pillar balancing
  const sortedQualified = [...qualified].sort((a, b) => {
    // If effective scores differ significantly (> 5 points), highest effective score strictly wins
    const scoreDiff = b.effectiveScore - a.effectiveScore;
    if (Math.abs(scoreDiff) > 5 || !enableBalancing) {
      if (scoreDiff !== 0) return scoreDiff;
      return b.freshnessScore - a.freshnessScore;
    }

    // For competitively close scores (within 5 points), favor starved pillars with longer days since last publication
    const recencyA = existingRecency?.[a.pillar] ?? 0;
    const recencyB = existingRecency?.[b.pillar] ?? 0;
    if (Math.abs(recencyA - recencyB) >= 1) {
      return recencyB - recencyA; // Starved pillar ranks first
    }

    // Next favor pillars with lower total published count
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
