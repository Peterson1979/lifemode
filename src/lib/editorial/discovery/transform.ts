import type { DiscoverySignal } from './types.ts';
import type { EditorialTopic, PillarSlug, TopicScoringDimensions, SourceSignal } from '../types.ts';
import { normalizeTopicQuery, inferPillarFromKeywords, generateTopicId, normalizePillar } from '../normalization.ts';
import { scoreTopicEntity } from '../scoring.ts';
import { calculatePinterestScore } from '../pinterest-scoring.ts';
import { ACTIVE_EDITORIAL_PILLARS } from '../../../config/site.ts';

/**
 * Evaluates whether a query/snippet expresses EverydayGuide practical intent (Reference / Protocol / Decision / Comparison).
 */
export function evaluatePracticalIntent(text: string): {
  isProtocolOrAction: boolean;
  isDecisionOrComparison: boolean;
  isPracticalIntent: boolean;
} {
  const lower = text.toLowerCase();
  const isProtocolOrAction = /\b(how to|how-to|guide to|protocol|steps|routine|clean|cleaning|store|storage|maintain|maintenance|prep|prepare|fix|repair|organize|declutter|setup|install|calculate|troubleshoot|recipe|cook|bake|descaling)\b/i.test(lower);
  const isDecisionOrComparison = /\b(which|vs|versus|comparison|compared|choose|choosing|selector|matrix|criteria|tradeoffs|difference between|pros and cons|best for)\b/i.test(lower);
  return {
    isProtocolOrAction,
    isDecisionOrComparison,
    isPracticalIntent: isProtocolOrAction || isDecisionOrComparison,
  };
}

/**
 * Transforms a raw Discovery Signal into a scored, normalized LifeMode EditorialTopic candidate.
 */
export function transformSignalToCandidate(signal: DiscoverySignal, rankOffset = 0): EditorialTopic {
  const norm = normalizeTopicQuery(signal.rawQuery);
  const cleanTitle = norm.canonicalTopic;
  const slug = norm.canonicalSlug;

  // Determine active pillar
  let pillar: PillarSlug = 'life';
  const normalizedCategory = normalizePillar(signal.category);
  if (normalizedCategory) {
    pillar = normalizedCategory;
  } else {
    pillar = inferPillarFromKeywords(cleanTitle, 'life');
  }

  const topicId = generateTopicId(pillar, slug);

  // Derive scoring dimensions from signal metrics & source characteristics
  const searchVol = signal.metrics?.searchVolume ?? 10000;
  const relativeInterest = signal.metrics?.relativeInterest ?? 75;
  const growthRate = signal.metrics?.growthRate ?? 50;
  const visualScore = signal.metrics?.visualPotentialScore ?? (
    signal.source === 'PINTEREST_TRENDS' ? 90 : (pillar === 'life' || pillar === 'home' ? 85 : 70)
  );

  // Evaluate EverydayGuide practical intent (Reference / Protocol / Decision / Comparison)
  const queryLower = cleanTitle.toLowerCase();
  const snippetLower = (signal.contentSnippet || '').toLowerCase();
  const combinedText = `${queryLower} ${snippetLower}`;

  const { isProtocolOrAction, isDecisionOrComparison, isPracticalIntent } = evaluatePracticalIntent(combinedText);

  let searchPotential = Math.min(100, Math.round(relativeInterest * 0.6 + Math.min(40, searchVol / 1000)));
  let pinterestPotential = Math.min(100, Math.round(visualScore * 0.6 + Math.min(40, growthRate * 0.4)));
  let socialPotential = Math.min(100, Math.round(growthRate * 0.7 + relativeInterest * 0.3));
  let lifeModeRelevance = isPracticalIntent ? 94 : 80;
  let commercialPotential = isDecisionOrComparison ? 80 : (searchPotential > 80 ? 70 : 55);
  let freshness = signal.metrics?.isBreakout ? 95 : 85;
  let competitionOpportunity = 70;
  let originalityPotential = isPracticalIntent ? 90 : 75;

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
    lifeModeRelevance = Math.max(lifeModeRelevance, 94);
  } else if (signal.source === 'RSS_FEEDS') {
    originalityPotential = Math.max(originalityPotential, 88);
  }

  // Practical problem-solving bonus
  if (isPracticalIntent) {
    searchPotential = Math.min(100, searchPotential + 5);
    lifeModeRelevance = Math.max(lifeModeRelevance, 95);
    originalityPotential = Math.max(originalityPotential, 90);
    competitionOpportunity = Math.max(competitionOpportunity, 78);
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
    sourceUrl: signal.sourceUrl || signal.metadata?.rssPayload?.itemLink,
    publisherName: signal.publisherName || signal.metadata?.rssPayload?.feedTitle || signal.metadata?.feedName,
    publishedAt: signal.publishedAt || signal.metadata?.rssPayload?.publishedDate || signal.timestamp,
    contentSnippet: signal.contentSnippet || signal.metadata?.rssPayload?.contentSnippet,
    volumeOrGrowth: growthRate || relativeInterest,
    recordedAt: signal.timestamp || new Date().toISOString(),
    metadata: signal.metadata,
  };

  const tags = Array.isArray(signal.metadata?.curatedTags)
    ? (signal.metadata?.curatedTags as string[])
    : [pillar, isDecisionOrComparison ? 'decision' : 'guide'];

  const candidateBase = {
    id: topicId,
    canonicalTopic: cleanTitle,
    slug,
    pillar,
    targetProject: signal.metadata?.targetProject as string | undefined,
    sourceSignals: [sourceSig],
    queryVariants: [cleanTitle.toLowerCase()],
    freshnessScore: freshness,
    createdAt: signal.timestamp || new Date().toISOString(),
    tags,
    targetAudience: 'Everyday readers and households seeking actionable, verified reference guidance.',
    primaryIntent: (isDecisionOrComparison ? 'commercial' : 'informational') as any,
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
    sourceUrl: newSignal.sourceUrl || newSignal.metadata?.rssPayload?.itemLink,
    publisherName: newSignal.publisherName || newSignal.metadata?.rssPayload?.feedTitle || newSignal.metadata?.feedName,
    publishedAt: newSignal.publishedAt || newSignal.metadata?.rssPayload?.publishedDate || newSignal.timestamp,
    contentSnippet: newSignal.contentSnippet || newSignal.metadata?.rssPayload?.contentSnippet,
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
    pillar: (normalizePillar(existingTopic.pillar) || existingTopic.pillar) as PillarSlug,
    targetProject: existingTopic.targetProject || (newSignal.metadata?.targetProject as string | undefined),
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
