import type { SignalSourceType, SourceSignal, PillarSlug } from '../types.ts';

export type { SignalSourceType, SourceSignal };

/**
 * Origin classification of a discovery signal.
 */
export type SignalOriginClassification =
  | 'REAL_EXTERNAL'
  | 'STATIC_DETERMINISTIC'
  | 'CREDENTIAL_DEPENDENT'
  | 'FIXTURE';

/**
 * Standard Discovery Signal representation ingested by the discovery engine.
 */
export interface DiscoverySignal {
  source: SignalSourceType | 'FIXTURE' | 'MANUAL';
  sourceId?: string;
  rawQuery: string;
  timestamp: string; // ISO 8601
  metrics?: {
    growthRate?: number; // e.g. +45 (%)
    searchVolume?: number; // Estimated monthly volume
    relativeInterest?: number; // 0-100 relative trend interest
    isBreakout?: boolean;
    visualPotentialScore?: number; // 0-100
  };
  geography?: string; // e.g. 'US', 'GLOBAL'
  language?: string; // e.g. 'en'
  category?: PillarSlug | string;
  sourceUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Operational state of a discovery provider.
 */
export type ProviderStatus =
  | 'AVAILABLE'
  | 'NOT_CONFIGURED'
  | 'PROVIDER_UNAVAILABLE'
  | 'FAILED';

/**
 * Result returned by a discovery adapter fetch.
 */
export interface DiscoveryResult {
  provider: string;
  sourceType: SignalSourceType | 'FIXTURE' | 'MANUAL';
  status: ProviderStatus;
  signals: DiscoverySignal[];
  classification?: SignalOriginClassification;
  error?: string;
  fetchedAt: string;
}

/**
 * Configuration for a single discovery adapter.
 */
export interface ProviderConfig {
  enabled: boolean;
  name: string;
  sourceType: SignalSourceType | 'FIXTURE' | 'MANUAL';
  geography?: string;
  language?: string;
  maxSignals?: number;
  freshnessWindowHours?: number;
  apiKey?: string;
}

/**
 * Overall report emitted after running the discovery pipeline.
 */
export interface DiscoveryPipelineReport {
  timestamp: string;
  providerResults: DiscoveryResult[];
  totalSignalsReceived: number;
  realExternalSignalsCount: number;
  staticDeterministicSignalsCount: number;
  fixtureSignalsCount: number;
  normalizedCount: number;
  duplicateCount: number;
  newCandidatesStored: number;
  updatedCandidatesCount: number;
  candidatesSummary: Array<{
    id: string;
    canonicalTopic: string;
    pillar: PillarSlug;
    totalScore: number;
    pinterestScore?: number;
    priorityTier: string;
    opportunityType: string;
    originClassification?: SignalOriginClassification;
  }>;
}
