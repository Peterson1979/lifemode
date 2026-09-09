/**
 * Controlled source type classification for editorial evidence.
 */
export type EvidenceSourceType =
  | 'official'
  | 'government'
  | 'academic'
  | 'reputable_media'
  | 'industry'
  | 'primary'
  | 'other';

/**
 * Reliability classification for evidence items.
 */
export type EvidenceReliability = 'high' | 'medium' | 'low';

/**
 * Normalized evidence item used for grounding editorial generation and quality review.
 */
export interface EvidenceItem {
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
  accessedAt: string;
  claimSummary: string;
  sourceType: EvidenceSourceType;
  reliability: EvidenceReliability;
}

/**
 * Overall structured outcome of the research stage for an editorial topic.
 */
export interface EvidenceResult {
  topicId: string;
  required: boolean;
  reason: string;
  status: 'SUCCESS' | 'NOT_REQUIRED' | 'NO_EVIDENCE' | 'FAILED';
  items: EvidenceItem[];
  queryUsed?: string;
  error?: string;
  researchedAt: string;
  metadata?: {
    provider: string;
    durationMs: number;
    sourcesCount?: number;
  };
}
