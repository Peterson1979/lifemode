import type { IDiscoveryAdapter } from './contracts.ts';
import type { DiscoveryPipelineReport, DiscoveryResult, DiscoverySignal } from './types.ts';
import type { EditorialTopic } from '../types.ts';
import { PinterestTrendsDiscoveryAdapter } from './adapters/pinterest.ts';
import { GoogleTrendsDiscoveryAdapter } from './adapters/google-trends.ts';
import { FixtureDiscoveryAdapter } from './adapters/fixture.ts';
import { transformSignalToCandidate } from './transform.ts';
import { checkTopicDuplicate } from '../deduplication.ts';
import { loadCandidates, saveCandidates, mergeCandidateTopic } from './storage.ts';

export interface PipelineRunnerOptions {
  storagePath?: string;
  minScoreThreshold?: number; // default 80
  similarityThreshold?: number; // default 0.75
  saveToDisk?: boolean; // default true
}

/**
 * Runs the end-to-end Content Discovery V1 pipeline.
 */
export async function runDiscoveryPipeline(
  adapters?: IDiscoveryAdapter[],
  options: PipelineRunnerOptions = {}
): Promise<DiscoveryPipelineReport> {
  const saveToDisk = options.saveToDisk ?? true;
  const similarityThreshold = options.similarityThreshold ?? 0.75;

  // Default registered adapters
  const activeAdapters: IDiscoveryAdapter[] = adapters || [
    new PinterestTrendsDiscoveryAdapter(),
    new GoogleTrendsDiscoveryAdapter(),
    new FixtureDiscoveryAdapter(),
  ];

  // 1. DISCOVERY: Fetch from all adapters
  const providerResults: DiscoveryResult[] = [];
  const allSignals: DiscoverySignal[] = [];

  for (const adapter of activeAdapters) {
    try {
      const result = await adapter.fetchSignals();
      providerResults.push(result);
      if (result.status === 'AVAILABLE' && result.signals.length > 0) {
        allSignals.push(...result.signals);
      }
    } catch (err: any) {
      providerResults.push({
        provider: adapter.name,
        sourceType: adapter.sourceType,
        status: 'FAILED',
        signals: [],
        error: err?.message || 'Unknown provider error occurred',
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  // Load existing candidates for deduplication
  let existingCandidates: EditorialTopic[] = [];
  try {
    existingCandidates = await loadCandidates(options.storagePath);
  } catch {
    existingCandidates = [];
  }

  let normalizedCount = 0;
  let duplicateCount = 0;
  let newCandidatesStored = 0;
  let updatedCandidatesCount = 0;

  let currentCandidatesList = [...existingCandidates];
  const newlyCreatedCandidates: EditorialTopic[] = [];

  // 2. NORMALIZATION, DEDUPLICATION & SCORING
  for (const signal of allSignals) {
    normalizedCount++;

    // Check duplication against current candidate pool
    const dupCheck = checkTopicDuplicate(
      signal.rawQuery,
      currentCandidatesList,
      similarityThreshold
    );

    if (dupCheck.isDuplicate) {
      duplicateCount++;
      continue;
    }

    // Transform and score candidate
    const candidateTopic = transformSignalToCandidate(signal);

    // Merge into storage list
    const mergeResult = mergeCandidateTopic(candidateTopic, currentCandidatesList);
    currentCandidatesList = mergeResult.updatedList;

    if (mergeResult.isNew) {
      newCandidatesStored++;
      newlyCreatedCandidates.push(candidateTopic);
    } else {
      updatedCandidatesCount++;
    }
  }

  // 3. STORAGE PERSISTENCE
  if (saveToDisk && (newCandidatesStored > 0 || updatedCandidatesCount > 0)) {
    await saveCandidates(currentCandidatesList, options.storagePath);
  }

  const report: DiscoveryPipelineReport = {
    timestamp: new Date().toISOString(),
    providerResults,
    totalSignalsReceived: allSignals.length,
    normalizedCount,
    duplicateCount,
    newCandidatesStored,
    updatedCandidatesCount,
    candidatesSummary: currentCandidatesList.map((c) => ({
      id: c.id,
      canonicalTopic: c.canonicalTopic,
      pillar: c.pillar,
      totalScore: c.totalScore,
      pinterestScore: c.pinterestScore,
      priorityTier: c.priorityTier,
      opportunityType: c.opportunityType,
    })),
  };

  return report;
}
