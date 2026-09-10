import type { IDiscoveryAdapter } from './contracts.ts';
import type {
  DiscoveryPipelineReport,
  DiscoveryResult,
  DiscoverySignal,
  SignalOriginClassification,
} from './types.ts';
import type { EditorialTopic } from '../types.ts';
import { PinterestTrendsDiscoveryAdapter } from './adapters/pinterest.ts';
import { GoogleTrendsDiscoveryAdapter } from './adapters/google-trends.ts';
import { RedditSocialDiscoveryAdapter } from './adapters/reddit-social.ts';
import { RSSFeedsDiscoveryAdapter } from './adapters/rss-feeds.ts';
import { SeasonalCalendarDiscoveryAdapter } from './adapters/seasonal-calendar.ts';
import { GoogleSearchConsoleDiscoveryAdapter } from './adapters/google-search-console.ts';
import { BingWebmasterDiscoveryAdapter } from './adapters/bing-webmaster.ts';
import { YouTubeTrendsDiscoveryAdapter } from './adapters/youtube-trends.ts';
import { InternalAnalyticsDiscoveryAdapter } from './adapters/internal-analytics.ts';
import { transformSignalToCandidate, applyCrossSourceCorroboration } from './transform.ts';
import { checkTopicDuplicate, checkSourceUrlDuplicate } from '../deduplication.ts';
import { loadCandidates, saveCandidates, mergeCandidateTopic, loadAllHistoricalTopics } from './storage.ts';

export interface PipelineRunnerOptions {
  storagePath?: string;
  minScoreThreshold?: number; // default 80
  similarityThreshold?: number; // default 0.75
  saveToDisk?: boolean; // default true
  allowReconsideration?: boolean; // default false
}

/**
 * Classifies the origin of a discovery result.
 */
export function classifyProviderOrigin(result: DiscoveryResult): SignalOriginClassification {
  if (result.sourceType === 'FIXTURE' || result.sourceType === 'MANUAL') {
    return 'FIXTURE';
  }
  if (result.sourceType === 'SEASONAL_CALENDAR') {
    return 'STATIC_DETERMINISTIC';
  }
  if (
    result.sourceType === 'RSS_FEEDS' ||
    result.sourceType === 'REDDIT_SOCIAL' ||
    result.sourceType === 'GOOGLE_TRENDS'
  ) {
    return 'REAL_EXTERNAL';
  }
  return 'CREDENTIAL_DEPENDENT';
}

/**
 * Default Discovery V2 adapters suite for live operation.
 */
export function getDefaultDiscoveryAdapters(): IDiscoveryAdapter[] {
  return [
    new GoogleTrendsDiscoveryAdapter(),
    new RedditSocialDiscoveryAdapter(),
    new RSSFeedsDiscoveryAdapter(),
    new SeasonalCalendarDiscoveryAdapter(),
    new PinterestTrendsDiscoveryAdapter(),
    new GoogleSearchConsoleDiscoveryAdapter(),
    new BingWebmasterDiscoveryAdapter(),
    new YouTubeTrendsDiscoveryAdapter(),
    new InternalAnalyticsDiscoveryAdapter(),
  ];
}

/**
 * Runs the end-to-end Content Discovery V2 pipeline.
 *
 * Fault-tolerant execution guarantees:
 * - Failure in one adapter never crashes the entire run.
 * - Multi-source signals for the same topic are merged and scored with cross-source corroboration.
 * - Historical published and rejected topics remain protected from duplicate processing.
 * - Distinguishes REAL_EXTERNAL, STATIC_DETERMINISTIC, and FIXTURE signals.
 */
export async function runDiscoveryPipeline(
  adapters?: IDiscoveryAdapter[],
  options: PipelineRunnerOptions = {}
): Promise<DiscoveryPipelineReport> {
  const saveToDisk = options.saveToDisk ?? true;
  const similarityThreshold = options.similarityThreshold ?? 0.75;

  const activeAdapters: IDiscoveryAdapter[] = adapters || getDefaultDiscoveryAdapters();

  // 1. DISCOVERY: Fetch from all adapters with individual failure isolation
  const providerResults: DiscoveryResult[] = [];
  const allSignals: DiscoverySignal[] = [];

  let realExternalCount = 0;
  let staticDeterministicCount = 0;
  let fixtureCount = 0;

  for (const adapter of activeAdapters) {
    try {
      const result = await adapter.fetchSignals();
      const classification = classifyProviderOrigin(result);
      result.classification = classification;
      providerResults.push(result);

      if (result.status === 'AVAILABLE' && result.signals && result.signals.length > 0) {
        allSignals.push(...result.signals);
        if (classification === 'REAL_EXTERNAL') {
          realExternalCount += result.signals.length;
        } else if (classification === 'STATIC_DETERMINISTIC') {
          staticDeterministicCount += result.signals.length;
        } else if (classification === 'FIXTURE') {
          fixtureCount += result.signals.length;
        }
      }
    } catch (err: any) {
      providerResults.push({
        provider: adapter.name,
        sourceType: adapter.sourceType,
        status: 'FAILED',
        classification: 'REAL_EXTERNAL',
        signals: [],
        error: err?.message || 'Unknown provider error occurred during signal fetch.',
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  // 2. Load candidate pool & historical topics for comprehensive deduplication
  let existingCandidates: EditorialTopic[] = [];
  try {
    existingCandidates = await loadCandidates(options.storagePath);
  } catch {
    existingCandidates = [];
  }

  let historicalTopics: { published: EditorialTopic[]; rejected: EditorialTopic[] } = {
    published: [],
    rejected: [],
  };
  try {
    const historical = await loadAllHistoricalTopics();
    historicalTopics = {
      published: historical.published,
      rejected: historical.rejected,
    };
  } catch {
    historicalTopics = { published: [], rejected: [] };
  }

  let normalizedCount = 0;
  let duplicateCount = 0;
  let newCandidatesStored = 0;
  let updatedCandidatesCount = 0;

  let currentCandidatesList = [...existingCandidates];

  // 3. NORMALIZATION, DEDUPLICATION, CROSS-SOURCE CORROBORATION & SCORING
  for (const signal of allSignals) {
    normalizedCount++;

    // Check against published articles to prevent duplicate generation
    const publishedDup = checkTopicDuplicate(
      signal.rawQuery,
      historicalTopics.published,
      similarityThreshold
    );
    if (publishedDup.isDuplicate) {
      duplicateCount++;
      continue;
    }

    // Check against rejected topics unless reconsideration is explicitly enabled
    if (!options.allowReconsideration) {
      const rejectedDup = checkTopicDuplicate(
        signal.rawQuery,
        historicalTopics.rejected,
        similarityThreshold
      );
      if (rejectedDup.isDuplicate) {
        duplicateCount++;
        continue;
      }
    }

    // Check URL duplicates if sourceUrl is available
    if (signal.sourceUrl) {
      const allHistoric = [...historicalTopics.published, ...historicalTopics.rejected, ...currentCandidatesList];
      const isUrlDup = checkSourceUrlDuplicate(signal.sourceUrl, allHistoric);
      if (isUrlDup) {
        duplicateCount++;
        continue;
      }
    }

    // Check existing candidates pool for matching canonical topic
    const candidateDup = checkTopicDuplicate(
      signal.rawQuery,
      currentCandidatesList,
      similarityThreshold
    );

    const existingMatchingTopic = candidateDup.matchedTopicId
      ? currentCandidatesList.find((t) => t.id === candidateDup.matchedTopicId)
      : undefined;

    if (candidateDup.isDuplicate && existingMatchingTopic) {
      // Existing topic found: Corroborate with the new source signal and boost score
      const updated = applyCrossSourceCorroboration(existingMatchingTopic, signal);
      const mergeResult = mergeCandidateTopic(updated, currentCandidatesList);
      currentCandidatesList = mergeResult.updatedList;
      if (mergeResult.isNew) {
        newCandidatesStored++;
      } else {
        updatedCandidatesCount++;
      }
    } else {
      // Transform new raw signal into canonical candidate topic
      const newCandidate = transformSignalToCandidate(signal);
      const mergeResult = mergeCandidateTopic(newCandidate, currentCandidatesList);
      currentCandidatesList = mergeResult.updatedList;
      if (mergeResult.isNew) {
        newCandidatesStored++;
      } else {
        updatedCandidatesCount++;
      }
    }
  }

  // 4. PERSISTENCE
  if (saveToDisk && (newCandidatesStored > 0 || updatedCandidatesCount > 0)) {
    await saveCandidates(currentCandidatesList, options.storagePath);
  }

  // 5. EMIT PIPELINE REPORT
  const candidatesSummary = currentCandidatesList.map((c) => {
    let origin: SignalOriginClassification = 'REAL_EXTERNAL';
    if (c.sourceSignals.every((s) => s.source === 'FIXTURE' || s.source === 'MANUAL')) {
      origin = 'FIXTURE';
    } else if (c.sourceSignals.every((s) => s.source === 'SEASONAL_CALENDAR')) {
      origin = 'STATIC_DETERMINISTIC';
    }
    return {
      id: c.id,
      canonicalTopic: c.canonicalTopic,
      pillar: c.pillar,
      totalScore: c.totalScore,
      pinterestScore: c.scoring.pinterestPotential,
      priorityTier: c.priorityTier,
      opportunityType: c.opportunityType,
      originClassification: origin,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    providerResults,
    totalSignalsReceived: allSignals.length,
    realExternalSignalsCount: realExternalCount,
    staticDeterministicSignalsCount: staticDeterministicCount,
    fixtureSignalsCount: fixtureCount,
    normalizedCount,
    duplicateCount,
    newCandidatesStored,
    updatedCandidatesCount,
    candidatesSummary,
  };
}
