import type { IDiscoveryAdapter } from '../discovery/contracts.ts';
import type { DiscoveryPipelineReport } from '../discovery/types.ts';
import type { PillarSlug, ContentBrief } from '../types.ts';
import type { IGenerationProvider } from '../generation/providers/types.ts';
import type { GenerationResult } from '../generation/types.ts';
import type { IAIReviewProvider } from '../review/providers/types.ts';
import type { ReviewResult } from '../review/types.ts';
import type { IPublishingProvider } from '../publishing/providers/types.ts';
import type { PublishingResult } from '../publishing/types.ts';
import type { IContentRepository, StorageResult } from '../storage/types.ts';
import type { IGitPublisher, GitPublisherResult } from '../git-publisher/types.ts';
import type { BriefGenerationOptions } from '../brief.ts';
import type { ValidationRulesOptions } from '../generation/validation.ts';
import type { AIRouter } from '../../ai/router.ts';

/**
 * Distinct sequential stages of the LifeMode Editorial Automation Pipeline.
 */
export type AutomationStage =
  | 'DISCOVERY'
  | 'SELECTION'
  | 'BRIEF'
  | 'GENERATION'
  | 'VALIDATION'
  | 'REVIEW'
  | 'PUBLISHING_GATE'
  | 'STORAGE'
  | 'GIT_PUBLICATION';

/**
 * Execution status for an individual pipeline stage.
 */
export type AutomationStageStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'SKIPPED'
  | 'WARNING'
  | 'DRY_RUN';

/**
 * Structured diagnostic information for a completed or failed stage.
 */
export interface AutomationStageResult<T = any> {
  stage: AutomationStage;
  status: AutomationStageStatus;
  durationMs: number;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  warning?: string;
}

/**
 * Detailed execution summary for an individual editorial candidate/topic.
 */
export interface OpportunityRunResult {
  topicId: string;
  canonicalTopic: string;
  pillar: PillarSlug;
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'DRY_RUN';
  brief?: ContentBrief;
  generation?: GenerationResult;
  review?: ReviewResult;
  publishing?: PublishingResult;
  storage?: StorageResult;
  gitPublication?: GitPublisherResult;
  stageResults: Record<AutomationStage, AutomationStageResult>;
  failedStage?: AutomationStage;
  error?: {
    stage: AutomationStage;
    code: string;
    message: string;
  };
}

/**
 * Request payload configuring an editorial automation run.
 */
export interface AutomationRequest {
  enabled?: boolean;
  dryRun?: boolean; // default: true
  allowCommit?: boolean; // default: false
  maxOpportunities?: number; // default: 1
  minScoreThreshold?: number; // default: 80
  providerMode?: 'fixture' | 'router'; // default: 'fixture'
  
  // Custom provider injections
  discoveryAdapters?: IDiscoveryAdapter[];
  generationProvider?: IGenerationProvider;
  reviewProvider?: IAIReviewProvider;
  publishingProvider?: IPublishingProvider;
  contentRepository?: IContentRepository;
  gitPublisher?: IGitPublisher;
  aiRouter?: AIRouter;

  // Custom paths & options
  storagePath?: string; // discovery candidate storage path
  contentRoot?: string; // base content root for articles
  gitRepoRoot?: string; // base git repository root
  briefOptions?: BriefGenerationOptions;
  validationOptions?: ValidationRulesOptions;
  allowUnrelatedChanges?: boolean;
  commitAuthor?: {
    name: string;
    email: string;
  };
}

/**
 * Overall structured execution result returned by the Editorial Automation Runner.
 */
export interface AutomationResult {
  runId: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'NO_OPPORTUNITIES' | 'DISABLED';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  dryRun: boolean;
  discoveryReport?: DiscoveryPipelineReport;
  discoveredCount: number;
  candidateCount: number;
  selectedCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  opportunities: OpportunityRunResult[];
  summary: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Core runtime configuration for Editorial Automation V1.
 */
export interface AutomationConfig {
  enabled: boolean;
  maxOpportunities: number;
  dryRun: boolean;
  minScoreThreshold: number;
  providerMode: 'fixture' | 'router';
}
