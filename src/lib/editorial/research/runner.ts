import type { IEditorialResearchProvider } from './providers/types.ts';
import type { EditorialTopic, ContentBrief } from '../types.ts';
import type { EvidenceResult } from './types.ts';

export interface ResearchPipelineOptions {
  topic: EditorialTopic;
  brief: ContentBrief;
  provider: IEditorialResearchProvider;
}

/**
 * Runs the Editorial Source Research / Evidence Layer Pipeline.
 *
 * Flow:
 * 1. Invokes the Research Provider within a safe error boundary
 * 2. Normalizes the structured EvidenceResult
 * 3. Enforces bounded execution without unhandled exceptions
 */
export async function runResearchPipeline(
  options: ResearchPipelineOptions
): Promise<EvidenceResult> {
  const { topic, brief, provider } = options;
  const startTime = Date.now();

  try {
    const result = await provider.research(topic, brief);
    const durationMs = Math.max(1, Date.now() - startTime);

    return {
      ...result,
      metadata: {
        provider: provider.name,
        durationMs,
        sourcesCount: result.items ? result.items.length : 0,
      },
    };
  } catch (err: any) {
    const durationMs = Math.max(1, Date.now() - startTime);
    return {
      topicId: topic.id,
      required: true,
      reason: 'Research provider encountered an error during execution.',
      status: 'FAILED',
      items: [],
      error: err?.message || 'Unknown research provider failure.',
      researchedAt: new Date().toISOString(),
      metadata: {
        provider: provider.name,
        durationMs,
        sourcesCount: 0,
      },
    };
  }
}
