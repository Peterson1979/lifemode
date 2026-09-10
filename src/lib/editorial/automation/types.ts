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

import type { IEditorialResearchProvider } from '../research/providers/types.ts';
import type { EvidenceResult } from '../research/types.ts';

/**
 * Distinct sequential stages of the LifeMode Editorial Automation Pipeline.
 */
export type AutomationStage =
  | 'DISCOVERY'
  | 'SELECTION'
  | 'BRIEF'
  | 'RESEARCH'
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
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'DRY_RUN' | 'REJECTED';
  brief?: ContentBrief;
  research?: EvidenceResult;
  generation?: GenerationResult;
  review?: ReviewResult;
  revisedGeneration?: GenerationResult;
  revisedReview?: ReviewResult;
  revisionPerformed?: boolean;
  revisionError?: {
    code: string;
    message: string;
  };
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
  accelerationEnabled?: boolean; // default: false
  accelerationMaxOpportunities?: number; // default: 5
  
  // Custom provider injections
  discoveryAdapters?: IDiscoveryAdapter[];
  researchProvider?: IEditorialResearchProvider;
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
  rejectedCount?: number;
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
  accelerationEnabled?: boolean;
  accelerationMaxOpportunities?: number;
}

/**
 * Top-level machine-readable outcome status for Scheduled Editorial Automation runs.
 */
export type ScheduledStatus =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'SUCCESS_NO_PUBLICATION'
  | 'FAILED';

import type { SocialAutomationResult, SocialAutomationConfig } from '../../social/index.ts';

/**
 * Options and overrides for Scheduled Editorial Automation.
 */
export interface ScheduledAutomationOptions extends AutomationRequest {
  allowPush?: boolean;
  lockPath?: string;
  staleLockTimeoutMs?: number;
  gitRemote?: string;
  gitBranch?: string;
  socialEnabled?: boolean;
  socialOptions?: Partial<SocialAutomationConfig>;
}

/**
 * Configuration for Scheduled Editorial Automation.
 */
export interface ScheduledAutomationConfig extends AutomationConfig {
  allowCommit: boolean;
  allowPush: boolean;
  gitRemote: string;
  gitBranch: string;
  lockPath?: string;
  socialEnabled?: boolean;
  socialOptions?: Partial<SocialAutomationConfig>;
}

/**
 * Structured machine-readable result of a scheduled editorial automation run.
 */
export interface ScheduledAutomationResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: ScheduledStatus;
  dryRun: boolean;
  discoveredCount: number;
  candidateCount: number;
  selectedCount: number;
  processedCount: number;
  succeededCount: number;
  rejectedCount: number;
  failedCount: number;
  publishedCount: number;
  pushedToRemote: boolean;
  researchRequiredCount: number;
  researchSuccessCount: number;
  researchFailureCount: number;
  summary: string;
  fatalError?: string;
  automationResult?: AutomationResult;
  socialResult?: SocialAutomationResult;
  jsonResult: {
    runId: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    status: ScheduledStatus;
    dryRun: boolean;
    counts: {
      discovered: number;
      candidates: number;
      selected: number;
      processed: number;
      succeeded: number;
      rejected: number;
      failed: number;
      published: number;
      researchRequired: number;
      researchSuccess: number;
      researchFailure: number;
    };
    pushedToRemote: boolean;
    fatalError?: string;
    social?: SocialAutomationResult;
  };
}

