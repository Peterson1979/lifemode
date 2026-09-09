/**
 * Supported AI Provider Identifiers.
 */
export type AIProviderId = 'gemini' | 'groq' | 'fixture' | string;

/**
 * Supported AI Editorial Task Types.
 */
export type AITaskType =
  | 'content_generation'
  | 'content_review'
  | 'social_generation'
  | 'classification'
  | 'topic_ideation';

/**
 * Standard request payload provided to an AI Provider.
 */
export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  requestId?: string;
  taskType: AITaskType;
  timeoutMs?: number;
  responseFormat?: 'text' | 'json';
  validateJson?: boolean;
}

/**
 * Standardized response payload returned by an AI Provider.
 */
export interface AIResponse {
  text: string;
  provider: AIProviderId;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs: number;
}

/**
 * Stable error classifications for AI provider failures.
 */
export type AIErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'QUOTA'
  | 'INVALID_REQUEST'
  | 'PROVIDER_ERROR'
  | 'NETWORK'
  | 'BUDGET_EXCEEDED'
  | 'NOT_CONFIGURED'
  | 'MALFORMED_OUTPUT'
  | 'UNKNOWN';

/**
 * Standardized error structure returned by providers and the router.
 */
export interface AIProviderError {
  code: AIErrorCode;
  message: string;
  provider: AIProviderId;
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  rawError?: unknown;
}

/**
 * Common, provider-agnostic interface for low-level AI providers.
 */
export interface IAIProvider {
  readonly id: AIProviderId;
  readonly defaultModel: string;

  /**
   * Checks whether the provider has the required configuration/credentials.
   */
  isConfigured(): boolean;

  /**
   * Generates a raw text completion from an AIRequest.
   */
  generate(request: AIRequest): Promise<AIResponse>;
}

/**
 * Record of a single provider attempt during routing.
 */
export interface RouterAttempt {
  provider: AIProviderId;
  model: string;
  durationMs: number;
  success: boolean;
  error?: AIProviderError;
  tokensUsed?: {
    input?: number;
    output?: number;
    total?: number;
  };
}

/**
 * Discriminated union result returned by the AI Router.
 */
export type RouterResult =
  | {
      success: true;
      response: AIResponse;
      provider: AIProviderId;
      attempts: RouterAttempt[];
    }
  | {
      success: false;
      error: AIProviderError;
      attemptedProviders: AIProviderId[];
      attempts: RouterAttempt[];
    };
