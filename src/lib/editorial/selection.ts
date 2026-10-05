import type { EditorialTopic, PillarSlug } from './types.ts';
import { VALID_PILLARS } from './types.ts';
import type { FeedbackSignalSummary } from './performance/types.ts';
import { evaluateTopicPerformanceFeedback } from './performance/feedback.ts';
import { isAiCadenceDay } from './cadence.ts';

export interface SelectionOptions {
  minScoreThreshold?: number; // default 80
  maxTopicsPerPillar?: number; // default max topics per pillar in one batch
  totalLimit?: number; // batch total limit (default 3 for daily editorial)
  existingPillarDistribution?: Partial<Record<PillarSlug, number>>;
  existingPillarRecency?: Partial<Record<PillarSlug, number>>; // days since last publication in pillar
  enablePillarBalancing?: boolean; // default true
  requireVisualPotential?: boolean;
  feedbackSignals?: FeedbackSignalSummary;
  enablePerformanceFeedback?: boolean; // default true if feedbackSignals provided
  guaranteedPillar?: PillarSlug | null; // backward compatibility
  guaranteedPillars?: PillarSlug[]; // explicit guaranteed pillars override
  targetDate?: string | Date; // Target UTC date for cadence evaluation
  isAiDay?: boolean; // Explicit override for AI Day status
  requireAiCandidate?: boolean; // If true, forces AI day behavior
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
 * Implements LifeMode V2 Editorial Strategy:
 * - Up to 3 articles per daily editorial run (or configured totalLimit).
 * - Selection driven primarily by current/trending signals and editorial value (no fixed daily pillar rotation).
 * - Deterministic AI cadence: on AI Days (every 3rd UTC day), selects exactly 1 qualified GetAISet mainstream AI candidate + 2 dynamic LifeMode articles.
 * - On Normal Days: selects 3 strongest dynamic LifeMode candidates.
 * - Topic diversity: prevents duplicate/colliding topics and restricts same-pillar flooding (max 1 per pillar when totalLimit <= 3).
 * - Filters out removed/inactive pillars (such as 'life') and video-only pillars ('life-hacks').
 * - Strict quality rule: Never approves or forces an inferior candidate (< 80).
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
  const rawGuaranteed = options.guaranteedPillars || (options.guaranteedPillar ? [options.guaranteedPillar] : []);
  const guaranteedPillars = Array.from(new Set(rawGuaranteed.filter(Boolean))) as PillarSlug[];

  // Determine AI Day status: explicit option or calculated from targetDate UTC cadence
  const isAiDay = options.isAiDay !== undefined
    ? options.isAiDay
    : (options.requireAiCandidate ?? (options.targetDate !== undefined ? isAiCadenceDay(options.targetDate) : false));

  const pillarCounts: Partial<Record<PillarSlug, number>> = {};
  for (const pillar of VALID_PILLARS) {
    pillarCounts[pillar] = 0;
  }

  const approved: EditorialTopic[] = [];
  const rejected: EditorialTopic[] = [];
  const deferred: EditorialTopic[] = [];

  // 1. Evaluate performance feedback and anti-starvation boosts on candidates
  const enrichedCandidates: Array<EditorialTopic & { effectiveScore: number }> = [];

  for (const topic of candidates) {
    // Inactive / removed pillar check
    if (!VALID_PILLARS.includes(topic.pillar as PillarSlug)) {
      rejected.push({
        ...topic,
        status: 'REJECTED',
        rejectionReason: `Pillar "${topic.pillar}" is inactive or removed`,
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    // Video-only pillar guard: Life Hacks contains videos only, no written articles
    if (topic.pillar === 'life-hacks') {
      rejected.push({
        ...topic,
        status: 'REJECTED',
        rejectionReason: 'Life Hacks is a video-only pillar. Written text articles are not permitted.',
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    let performanceFeedback = topic.performanceFeedback;
    if (feedbackSignals && applyFeedback) {
      performanceFeedback = evaluateTopicPerformanceFeedback(topic, feedbackSignals);
    }
    const adjustment = performanceFeedback?.scoreAdjustment || 0;
    const starvationBoost = enableBalancing ? calculatePillarStarvationBoost(topic.pillar, existingRecency) : 0;
    const effectiveScore = Math.max(0, Math.min(100, Math.round((topic.totalScore + adjustment + starvationBoost) * 10) / 10));

    enrichedCandidates.push({
      ...topic,
      performanceFeedback,
      effectiveScore,
    });
  }

  // 2. Separate candidates into rejected, sub-threshold, and qualified
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
  const sortFn = (a: EditorialTopic & { effectiveScore: number }, b: EditorialTopic & { effectiveScore: number }) => {
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
  };

  const sortedQualified = [...qualified].sort(sortFn);

  // Determine dynamic max per pillar if not specified: strictly 1 when totalLimit <= 3 (enforcing topic diversity)
  const defaultMaxPerPillar = options.totalLimit && options.totalLimit <= 3
    ? 1
    : (options.totalLimit ? Math.max(1, Math.ceil(options.totalLimit / 3)) : 1);
  const maxPerPillar = options.maxTopicsPerPillar ?? defaultMaxPerPillar;
  const strictDiversity = maxPerPillar === 1 || (options.totalLimit !== undefined && options.totalLimit <= 3);

  const approvedIds = new Set<string>();
  const approvedSlugs = new Set<string>();

  // Helper to approve a topic
  const approveTopic = (topic: EditorialTopic & { effectiveScore: number }) => {
    pillarCounts[topic.pillar] = (pillarCounts[topic.pillar] || 0) + 1;
    approvedIds.add(topic.id);
    approvedSlugs.add(topic.slug);
    approved.push({
      ...topic,
      status: 'APPROVED',
      updatedAt: new Date().toISOString(),
    });
  };

  // Helper to check topic similarity / collision with already approved topics
  const isDuplicateOrColliding = (topic: EditorialTopic) => {
    if (approvedIds.has(topic.id) || approvedSlugs.has(topic.slug)) return true;
    const cleanTopic = topic.canonicalTopic.toLowerCase().trim();
    return approved.some((a) => a.canonicalTopic.toLowerCase().trim() === cleanTopic);
  };

  // 4. AI DAY SELECTION: If it is an AI Cadence Day, allocate exactly 1 slot for GetAISet mainstream AI topic
  let candidatesForGeneralPool: Array<EditorialTopic & { effectiveScore: number }> = sortedQualified;

  if (isAiDay && (!options.totalLimit || options.totalLimit >= 1)) {
    const getAiSetCandidates = sortedQualified.filter(
      (t) => t.targetProject === 'get-ai-set' || (t.pillar === 'tech-ai' && t.tags?.includes('get-ai-set'))
    );

    if (getAiSetCandidates.length > 0) {
      const topGetAiSet = getAiSetCandidates[0];
      approveTopic(topGetAiSet);

      // Defer other GetAISet candidates for future AI days
      for (let i = 1; i < getAiSetCandidates.length; i++) {
        deferred.push({
          ...getAiSetCandidates[i],
          status: 'DEFERRED',
          deferReason: 'AI Day single GetAISet article quota (1) met',
          updatedAt: new Date().toISOString(),
        });
      }

      // Filter out all GetAISet candidates from the general pool for remaining slots
      candidatesForGeneralPool = sortedQualified.filter(
        (t) => t.id !== topGetAiSet.id && t.targetProject !== 'get-ai-set' && !t.tags?.includes('get-ai-set')
      );
    }
  }

  // 5. Explicit Guaranteed Pillars Allocation (e.g. if caller explicitly provided guaranteedPillars)
  const candidatesToProcess: Array<EditorialTopic & { effectiveScore: number }> = [];

  if (guaranteedPillars.length > 0 && options.totalLimit && approved.length < options.totalLimit) {
    let guaranteedSlotsFilled = 0;

    for (const gp of guaranteedPillars) {
      if (options.totalLimit && approved.length >= options.totalLimit) break;

      const guaranteedCandidates = candidatesForGeneralPool.filter(
        (t) => t.pillar === gp && !isDuplicateOrColliding(t)
      );
      if (guaranteedCandidates.length > 0) {
        const topGuaranteed = guaranteedCandidates[0];
        approveTopic(topGuaranteed);
        guaranteedSlotsFilled++;

        // Defer remaining candidates of this guaranteed pillar
        for (let i = 1; i < guaranteedCandidates.length; i++) {
          deferred.push({
            ...guaranteedCandidates[i],
            status: 'DEFERRED',
            deferReason: `Guaranteed pillar ${gp} daily quota (1) met`,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    // Remaining slots to be filled by non-guaranteed candidates
    const nonGuaranteedCandidates = candidatesForGeneralPool.filter(
      (t) => !guaranteedPillars.includes(t.pillar) && !approvedIds.has(t.id)
    );
    if (guaranteedSlotsFilled > 0) {
      candidatesToProcess.push(...nonGuaranteedCandidates);
    } else {
      candidatesToProcess.push(...candidatesForGeneralPool.filter((t) => !approvedIds.has(t.id)));
    }
  } else {
    candidatesToProcess.push(...candidatesForGeneralPool.filter((t) => !approvedIds.has(t.id)));
  }

  // 6. Pass 1: Select up to maxPerPillar per pillar for remaining slots (enforcing diversity)
  const remainingAfterPass1: Array<EditorialTopic & { effectiveScore: number }> = [];

  for (const topic of candidatesToProcess) {
    if (approvedIds.has(topic.id) || isDuplicateOrColliding(topic)) {
      continue;
    }

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

    approveTopic(topic);
  }

  // 7. Pass 2: If totalLimit not yet reached and strict diversity is NOT required, fill capacity with remaining
  if (options.totalLimit && approved.length < options.totalLimit && !strictDiversity) {
    for (const topic of remainingAfterPass1) {
      if (approvedIds.has(topic.id) || isDuplicateOrColliding(topic)) {
        continue;
      }

      if (approved.length >= options.totalLimit) {
        deferred.push({
          ...topic,
          status: 'DEFERRED',
          deferReason: `Batch limit reached (${options.totalLimit})`,
          updatedAt: new Date().toISOString(),
        });
        continue;
      }

      approveTopic(topic);
    }
  } else {
    for (const topic of remainingAfterPass1) {
      if (!approvedIds.has(topic.id)) {
        deferred.push({
          ...topic,
          status: 'DEFERRED',
          deferReason: `Pillar ${topic.pillar} quota reached (${pillarCounts[topic.pillar] || 0}/${maxPerPillar}) and topic diversity enforced`,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  return { approved, rejected, deferred };
}
