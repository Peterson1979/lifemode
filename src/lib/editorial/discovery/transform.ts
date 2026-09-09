import type { DiscoverySignal } from './types.ts';
import type { EditorialTopic, PillarSlug, TopicScoringDimensions, SourceSignal } from '../types.ts';
import { cleanTopicString, slugify, inferPillarFromKeywords, generateTopicId } from '../normalization.ts';
import { scoreTopicEntity } from '../scoring.ts';
import { calculatePinterestScore } from '../pinterest-scoring.ts';
import { PILLAR_SLUGS } from '../../../config/site.ts';

/**
 * Transforms a raw Discovery Signal into a scored, normalized LifeMode EditorialTopic candidate.
 */
export function transformSignalToCandidate(signal: DiscoverySignal): EditorialTopic {
  const cleanTitle = cleanTopicString(signal.rawQuery);
  const slug = slugify(cleanTitle);

  // Determine pillar
  let pillar: PillarSlug = 'life';
  if (signal.category && PILLAR_SLUGS.includes(signal.category as PillarSlug)) {
    pillar = signal.category as PillarSlug;
  } else {
    pillar = inferPillarFromKeywords(cleanTitle);
  }

  const topicId = generateTopicId(pillar, slug);

  // Derive scoring dimensions from signal metrics
  const searchVol = signal.metrics?.searchVolume ?? 10000;
  const relativeInterest = signal.metrics?.relativeInterest ?? 75;
  const growthRate = signal.metrics?.growthRate ?? 50;
  const visualScore = signal.metrics?.visualPotentialScore ?? 75;

  const searchPotential = Math.min(100, Math.round(relativeInterest * 0.6 + Math.min(40, searchVol / 1000)));
  const pinterestPotential = Math.min(100, Math.round(visualScore * 0.6 + Math.min(40, growthRate * 0.4)));
  const socialPotential = Math.min(100, Math.round(growthRate * 0.7 + relativeInterest * 0.3));
  const lifeModeRelevance = 90;
  const commercialPotential = searchPotential > 80 ? 75 : 60;
  const freshness = signal.metrics?.isBreakout ? 95 : 85;
  const competitionOpportunity = 70;
  const originalityPotential = 85;

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
