import type { DiscoverySignal } from './types.ts';
import type { EditorialTopic, PillarSlug, TopicScoringDimensions, SourceSignal } from '../types.ts';
import { normalizeTopicQuery, inferPillarFromKeywords, generateTopicId } from '../normalization.ts';
import { scoreTopicEntity } from '../scoring.ts';
import { calculatePinterestScore } from '../pinterest-scoring.ts';
import { PILLAR_SLUGS } from '../../../config/site.ts';

/**
 * Transforms a raw Discovery Signal into a scored, normalized LifeMode EditorialTopic candidate.
 */
export function transformSignalToCandidate(signal: DiscoverySignal): EditorialTopic {
  const norm = normalizeTopicQuery(signal.rawQuery);
  const cleanTitle = norm.canonicalTopic;
  const slug = norm.canonicalSlug;

  // Determine pillar
  let pillar: PillarSlug = 'life';
  if (signal.category && PILLAR_SLUGS.includes(signal.category as PillarSlug)) {
    pillar = signal.category as PillarSlug;
  } else {
    pillar = inferPillarFromKeywords(cleanTitle);
  }

  const topicId = generateTopicId(pillar, slug);

  // Derive scoring dimensions from signal metrics & source characteristics
  const searchVol = signal.metrics?.searchVolume ?? 10000;
  const relativeInterest = signal.metrics?.relativeInterest ?? 75;
  const growthRate = signal.metrics?.growthRate ?? 50;
  const visualScore = signal.metrics?.visualPotentialScore ?? (
    signal.source === 'PINTEREST_TRENDS' ? 90 : (pillar === 'discover' || pillar === 'travel' ? 85 : 70)
  );

  let searchPotential = Math.min(100, Math.round(relativeInterest * 0.6 + Math.min(40, searchVol / 1000)));
  let pinterestPotential = Math.min(100, Math.round(visualScore * 0.6 + Math.min(40, growthRate * 0.4)));
  let socialPotential = Math.min(100, Math.round(growthRate * 0.7 + relativeInterest * 0.3));
  let lifeModeRelevance = 90;
  let commercialPotential = searchPotential > 80 ? 75 : 60;
  let freshness = signal.metrics?.isBreakout ? 95 : 85;
  let competitionOpportunity = 70;
  let originalityPotential = 85;

  // Source-specific adjustments
  if (signal.source === 'PINTEREST_TRENDS') {
    pinterestPotential = Math.max(pinterestPotential, 85);
    visualScore >= 80 ? (lifeModeRelevance = Math.max(lifeModeRelevance, 92)) : null;
  } else if (signal.source === 'GOOGLE_TRENDS') {
    searchPotential = Math.max(searchPotential, 85);
  } else if (signal.source === 'REDDIT_SOCIAL') {
    socialPotential = Math.max(socialPotential, 85);
  } else if (signal.source === 'SEASONAL_CALENDAR') {
    freshness = Math.max(freshness, 90);
    lifeModeRelevance = Math.max(lifeModeRelevance, 92);
  } else if (signal.source === 'RSS_FEEDS') {
    originalityPotential = Math.max(originalityPotential, 88);
  }

  const dimensions: TopicScoringDimensions = {
    searchPotential,
    pinterestPotential,
    socialPotential,
    lifeModeRelevance,
    commercialPotential,
    freshness,
    competitionOpportunity,
    originalityPotential,
  };

  // Convert source signal
  const sourceSig: SourceSignal = {
    source: signal.source as any,
    sourceId: signal.sourceId,
    query: cleanTitle,
    volumeOrGrowth: growthRate || relativeInterest,
    recordedAt: signal.timestamp || new Date().toISOString(),
    metadata: signal.metadata,
  };

  const tags = Array.isArray(signal.metadata?.curatedTags)
    ? (signal.metadata?.curatedTags as string[])
    : [pillar, 'curation'];

  const candidateBase = {
    id: topicId,
    canonicalTopic: cleanTitle,
    slug,
    pillar,
    sourceSignals: [sourceSig],
    queryVariants: [cleanTitle.toLowerCase()],
    freshnessScore: freshness,
    createdAt: signal.timestamp || new Date().toISOString(),
    tags,
    targetAudience: 'Modern curious readers seeking high-signal editorial lifestyle perspectives.',
    primaryIntent: (searchPotential > 80 ? 'informational' : 'inspirational') as any,
  };

  const scoredTopic = scoreTopicEntity(candidateBase, dimensions);

  // If signal has Pinterest affinity or visual scores, calculate deterministic Pinterest score
  if (signal.source === 'PINTEREST_TRENDS' || visualScore >= 70) {
    const pinScore = calculatePinterestScore({
      trendGrowth: Math.min(100, growthRate),
      searchRelevance: searchPotential,
      seasonalRelevance: 75,
      visualPotential: visualScore,
      categoryFit: 90,
    });
    scoredTopic.pinterestScore = pinScore;
  }

  return scoredTopic;
}

/**
 * Re-scores an existing candidate topic when new corroborated source signals are added.
 * Cross-source confirmation adds transparent, deterministic boosts to relevance and opportunity scores.
 */
export function applyCrossSourceCorroboration(
  existingTopic: EditorialTopic,
  newSignal: DiscoverySignal
): EditorialTopic {
  const distinctSources = new Set([
    ...existingTopic.sourceSignals.map((s) => s.source),
    newSignal.source,
  ]);

  const corroborationCount = distinctSources.size;
  // Multi-source boost: +2 per additional source, capped at +6
  const corroborationBoost = Math.min(6, (corroborationCount - 1) * 2);

  const updatedDimensions: TopicScoringDimensions = {
    searchPotential: Math.min(100, existingTopic.scoring.searchPotential + (newSignal.source === 'GOOGLE_TRENDS' ? 4 : corroborationBoost)),
    pinterestPotential: Math.min(100, existingTopic.scoring.pinterestPotential + (newSignal.source === 'PINTEREST_TRENDS' ? 5 : corroborationBoost)),
    socialPotential: Math.min(100, existingTopic.scoring.socialPotential + (newSignal.source === 'REDDIT_SOCIAL' ? 4 : corroborationBoost)),
    lifeModeRelevance: Math.min(100, existingTopic.scoring.lifeModeRelevance + corroborationBoost),
    commercialPotential: existingTopic.scoring.commercialPotential,
    freshness: Math.min(100, Math.max(existingTopic.scoring.freshness, newSignal.metrics?.isBreakout ? 95 : 88)),
    competitionOpportunity: existingTopic.scoring.competitionOpportunity,
    originalityPotential: Math.min(100, existingTopic.scoring.originalityPotential + corroborationBoost),
  };

  const newSourceSig: SourceSignal = {
    source: newSignal.source as any,
    sourceId: newSignal.sourceId,
    query: newSignal.rawQuery,
    volumeOrGrowth: newSignal.metrics?.growthRate || newSignal.metrics?.relativeInterest,
    recordedAt: newSignal.timestamp || new Date().toISOString(),
    metadata: newSignal.metadata,
  };

  const mergedSignals = [
    ...existingTopic.sourceSignals,
    ...(!existingTopic.sourceSignals.some((s) => s.source === newSignal.source && s.sourceId === newSignal.sourceId) ? [newSourceSig] : []),
  ];

  const candidateBase = {
    id: existingTopic.id,
    canonicalTopic: existingTopic.canonicalTopic,
    slug: existingTopic.slug,
    pillar: existingTopic.pillar,
    sourceSignals: mergedSignals,
    queryVariants: Array.from(new Set([...existingTopic.queryVariants, newSignal.rawQuery.toLowerCase()])),
    freshnessScore: updatedDimensions.freshness,
    createdAt: existingTopic.createdAt,
    tags: existingTopic.tags,
    targetAudience: existingTopic.targetAudience,
    primaryIntent: existingTopic.primaryIntent,
    rejectionReason: existingTopic.rejectionReason,
    deferReason: existingTopic.deferReason,
    revisionCyclesCount: existingTopic.revisionCyclesCount,
    revisionAttempted: existingTopic.revisionAttempted,
    researchRequired: existingTopic.researchRequired,
    researchStatus: existingTopic.researchStatus,
    evidence: existingTopic.evidence,
  };

  const rescored = scoreTopicEntity(candidateBase, updatedDimensions);

  // Preserve protected lifecycle status (e.g. PUBLISHED, REJECTED)
  if (existingTopic.status === 'PUBLISHED' || existingTopic.status === 'REJECTED') {
    return {
      ...rescored,
      status: existingTopic.status,
      priorityTier: existingTopic.status === 'REJECTED' ? 'REJECT' : rescored.priorityTier,
      opportunityType: existingTopic.status === 'REJECTED' ? 'REJECT' : rescored.opportunityType,
    };
  }

  return rescored;
}
