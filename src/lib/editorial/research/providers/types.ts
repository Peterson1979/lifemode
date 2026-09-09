import type { EditorialTopic, ContentBrief } from '../../types.ts';
import type { EvidenceResult } from '../types.ts';

/**
 * Provider contract for the Editorial Source Research / Evidence Layer.
 */
export interface IEditorialResearchProvider {
  readonly name: string;
  research(topic: EditorialTopic, brief: ContentBrief): Promise<EvidenceResult>;
}
