import type {
  AIRequest,
  RouterResult,
  RouterAttempt,
  AIProviderError,
  IAIProvider,
  AIProviderId,
} from './types.ts';
import { loadAIConfig, type AIConfig } from './config.ts';
import { GeminiProvider } from './providers/gemini.ts';
import { GroqProvider } from './providers/groq.ts';
import { AIRouterFixtureProvider } from './providers/fixture.ts';
import { defaultUsageTracker, type IUsageTracker } from './usage.ts';
import { defaultRateLimiter, type IRateLimiter } from './rate-limit.ts';
import { defaultTelemetryRecorder, type ITelemetryRecorder } from './telemetry.ts';
import { estimateRequestResponseTokens, estimateRequestTokens } from './token-estimator.ts';
import { extractAndParseJson } from './json-extractor.ts';


export interface AIRouterOptions {
  config?: AIConfig;
  providers?: Map<AIProviderId, IAIProvider>;
  usageTracker?: IUsageTracker;
  rateLimiter?: IRateLimiter;
  telemetryRecorder?: ITelemetryRecorder;
  sleepFn?: (ms: number) => Promise<void>;
  logRateLimits?: boolean;
}

/**
 * Production-ready, provider-agnostic AI Router V1.
 * Coordinates provider selection, fallback logic, timeout enforcement, token budgets, rate limits, and telemetry.
 */
export class AIRouter {
  private config: AIConfig;
  private providers: Map<AIProviderId, IAIProvider>;
  private usageTracker: IUsageTracker;
  private rateLimiter: IRateLimiter;
  private telemetryRecorder: ITelemetryRecorder;
  private sleepFn: (ms: number) => Promise<void>;
  private logRateLimits: boolean;

  constructor(options: AIRouterOptions = {}) {
    this.config = options.config || loadAIConfig();
    this.usageTracker = options.usageTracker || defaultUsageTracker;
    this.rateLimiter = options.rateLimiter || defaultRateLimiter;
    this.telemetryRecorder = options.telemetryRecorder || defaultTelemetryRecorder;
    this.sleepFn = options.sleepFn || ((ms) => new Promise((res) => setTimeout(res, ms)));
    this.logRateLimits = options.logRateLimits ?? true;

    if (options.providers) {
      this.providers = options.providers;
    } else {
      this.providers = new Map();
      this.providers.set('gemini', new GeminiProvider());
      this.providers.set('groq', new GroqProvider());
      this.providers.set('fixture', new AIRouterFixtureProvider());
    }
  }

  /**
   * Registers a provider with the router.
   */
  registerProvider(provider: IAIProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Routes an AIRequest through configured providers with fallback, budgets, and rate limiting.
   */
  async route(request: AIRequest): Promise<RouterResult> {
    // 1. Validate basic request parameters
    if (!request || !request.prompt || !request.prompt.trim()) {
      const error: AIProviderError = {
        code: 'INVALID_REQUEST',
        message: 'AIRequest prompt is missing or empty.',
        provider: 'none',
        retryable: false,
      };
      return {
        success: false,
        error,
        attemptedProviders: [],
        attempts: [],
      };
    }

    const providerOrder = this.config.providerOrder;
    const maxAttempts = Math.min(this.config.router.maxAttempts, providerOrder.length);
    const attempts: RouterAttempt[] = [];
    const attemptedProviders: AIProviderId[] = [];

    const hasAlternativeConfiguredProvider = (currentIdx: number): boolean => {
      for (let j = currentIdx + 1; j < providerOrder.length; j++) {
        const nextId = providerOrder[j];
        const nextP = this.providers.get(nextId);
        if (nextP && nextP.isConfigured()) {
          return true;
        }
      }
      return false;
    };

    let lastError: AIProviderError = {
      code: 'UNKNOWN',
      message: 'No providers were attempted.',
      provider: 'none',
      retryable: false,
    };

    for (let i = 0; i < maxAttempts; i++) {
      const providerId = providerOrder[i];
      attemptedProviders.push(providerId);

      const provider = this.providers.get(providerId);
      const startTime = Date.now();
      const model = request.model || provider?.defaultModel || 'unknown';

      // Check if provider instance exists
      if (!provider) {
        const error: AIProviderError = {
          code: 'NOT_CONFIGURED',
          message: `Provider "${providerId}" is not registered in AI Router.`,
          provider: providerId,
          retryable: true,
        };
        lastError = error;
        attempts.push({
          provider: providerId,
          model,
          durationMs: 0,
          success: false,
          error,
        });
        continue;
      }

      // Check if provider is configured with credentials
      if (!provider.isConfigured()) {
        const error: AIProviderError = {
          code: 'NOT_CONFIGURED',
          message: `Provider "${providerId}" is not configured. Missing API credentials.`,
          provider: providerId,
          retryable: true,
        };
        lastError = error;
        attempts.push({
          provider: providerId,
          model,
          durationMs: 0,
          success: false,
          error,
        });
        continue;
      }

      // 2. Check Rate Limits (RPM, RPD, and TPM)
      const estimatedReqTokens = estimateRequestTokens(request);
      let providerTpmLimit = 0;
      if (providerId === 'groq' || providerId.startsWith('groq')) {
        providerTpmLimit = this.config.groq.tokensPerMinute ?? 0;
      } else if (providerId === 'gemini' || providerId.startsWith('gemini')) {
        providerTpmLimit = this.config.gemini.tokensPerMinute ?? 0;
      }

      let rateLimitCheck = this.rateLimiter.checkRateLimit(providerId, {
        requestsPerMinute: this.config.router.requestsPerMinute,
        requestsPerDay: this.config.router.requestsPerDay,
        tokensPerMinute: providerTpmLimit,
        estimatedTokens: estimatedReqTokens,
      });

      if (!rateLimitCheck.allowed) {
        const canEverFit = providerTpmLimit <= 0 || estimatedReqTokens <= providerTpmLimit;
        const hasFallback = hasAlternativeConfiguredProvider(i);

        // If TPM exceeded, request can fit in max budget, and no fallback is available, wait for rolling window
        if (
          rateLimitCheck.reason === 'TPM_EXCEEDED' &&
          canEverFit &&
          !hasFallback &&
          rateLimitCheck.retryAfterMs > 0 &&
          rateLimitCheck.retryAfterMs <= 75_000
        ) {
          const waitMs = rateLimitCheck.retryAfterMs;
          if (this.logRateLimits) {
            console.log(`[AI Router] Provider "${providerId}" rolling TPM capacity reached. Waiting ${Math.ceil(waitMs / 1000)}s for capacity...`);
          }
          await this.sleepFn(waitMs);

          // Re-check after waiting
          rateLimitCheck = this.rateLimiter.checkRateLimit(providerId, {
            requestsPerMinute: this.config.router.requestsPerMinute,
            requestsPerDay: this.config.router.requestsPerDay,
            tokensPerMinute: providerTpmLimit,
            estimatedTokens: estimatedReqTokens,
          });
        }

        if (!rateLimitCheck.allowed) {
          const error: AIProviderError = {
            code: 'RATE_LIMIT',
            message: `Rate limit reached for provider "${providerId}" (${rateLimitCheck.reason}). Retry after ${rateLimitCheck.retryAfterMs}ms.`,
            provider: providerId,
            retryable: true,
            retryAfterMs: rateLimitCheck.retryAfterMs,
          };
          lastError = error;
          attempts.push({
            provider: providerId,
            model,
            durationMs: 0,
            success: false,
            error,
          });
          continue;
        }
      }

      // 3. Check Daily Token Budgets
      const totalDailyTokens = this.usageTracker.getTotalDailyTokens();
      const providerDailyTokens = this.usageTracker.getProviderDailyTokens(providerId);

      let providerBudget = this.config.router.dailyTotalTokenBudget;
      if (providerId === 'gemini' || providerId.startsWith('gemini')) {
        providerBudget = this.config.gemini.dailyTokenBudget;
      } else if (providerId === 'groq' || providerId.startsWith('groq')) {
        providerBudget = this.config.groq.dailyTokenBudget;
      }

      if (totalDailyTokens >= this.config.router.dailyTotalTokenBudget) {
        const error: AIProviderError = {
          code: 'BUDGET_EXCEEDED',
          message: `Global daily AI token budget (${this.config.router.dailyTotalTokenBudget}) exceeded. Current: ${totalDailyTokens}.`,
          provider: providerId,
          retryable: true,
        };
        lastError = error;
        attempts.push({
          provider: providerId,
          model,
          durationMs: 0,
          success: false,
          error,
        });
        continue;
      }

      if (providerDailyTokens >= providerBudget) {
        const error: AIProviderError = {
          code: 'BUDGET_EXCEEDED',
          message: `Daily token budget for provider "${providerId}" (${providerBudget}) exceeded. Current: ${providerDailyTokens}.`,
          provider: providerId,
          retryable: true,
        };
        lastError = error;
        attempts.push({
          provider: providerId,
          model,
          durationMs: 0,
          success: false,
          error,
        });
        continue;
      }

      // 4. Attempt Generation via Provider
      try {
        const response = await provider.generate(request);
        const durationMs = Math.max(1, Date.now() - startTime);

        // Validate JSON structure if expected
        if (request.responseFormat === 'json' || request.validateJson) {
          try {
            extractAndParseJson(response.text);
          } catch (jsonErr: any) {
            const malformedError: AIProviderError = {
              code: 'MALFORMED_OUTPUT',
              message: `Provider "${providerId}" returned malformed or truncated JSON: ${jsonErr.message}`,
              provider: providerId,
              retryable: true,
              rawError: jsonErr,
            };
            throw malformedError;
          }
        }


        // Calculate / reconcile token usage
        let inputTokens = response.inputTokens;
        let outputTokens = response.outputTokens;
        let isTokenEstimate = false;

        if (inputTokens === undefined || outputTokens === undefined) {
          const estimate = estimateRequestResponseTokens(request.prompt, request.systemPrompt, response.text);
          inputTokens = inputTokens ?? estimate.inputTokens;
          outputTokens = outputTokens ?? estimate.outputTokens;
          isTokenEstimate = true;
        }

        const totalTokens = response.totalTokens ?? inputTokens + outputTokens;

        // Record Rate Limit Request & Token Usage
        this.rateLimiter.recordRequest(providerId);
        this.rateLimiter.recordTokens(providerId, totalTokens);
        this.usageTracker.recordUsage({
          provider: providerId,
          inputTokens,
          outputTokens,
          totalTokens,
          success: true,
        });

        // Record Telemetry
        const fallbackOccurred = attempts.length > 0;
        this.telemetryRecorder.recordEvent({
          requestId: request.requestId,
          taskType: request.taskType,
          provider: providerId,
          model: response.model || model,
          durationMs,
          success: true,
          inputTokens,
          outputTokens,
          totalTokens,
          isTokenEstimate,
          fallbackOccurred,
          timestamp: new Date().toISOString(),
        });

        const successAttempt: RouterAttempt = {
          provider: providerId,
          model: response.model || model,
          durationMs,
          success: true,
          tokensUsed: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens,
          },
        };

        attempts.push(successAttempt);

        return {
          success: true,
          response: {
            ...response,
            inputTokens,
            outputTokens,
            totalTokens,
          },
          provider: providerId,
          attempts,
        };
      } catch (err: any) {
        const durationMs = Math.max(1, Date.now() - startTime);

        let error: AIProviderError = err.code && err.provider ? err : {
          code: 'PROVIDER_ERROR',
          message: err.message || 'Unknown error during provider execution',
          provider: providerId,
          retryable: true,
          rawError: err,
        };

        const hasFallback = hasAlternativeConfiguredProvider(i);

        // If provider returned HTTP 429 and no fallback exists, wait and retry once if bounded
        if (error.code === 'RATE_LIMIT' && error.retryAfterMs && error.retryAfterMs <= 75_000 && !hasFallback) {
          if (providerTpmLimit > 0) {
            this.rateLimiter.recordTokens(providerId, providerTpmLimit);
          }
          if (this.logRateLimits) {
            console.log(`[AI Router] Provider "${providerId}" returned HTTP 429. Waiting ${Math.ceil(error.retryAfterMs / 1000)}s before retry...`);
          }
          await this.sleepFn(error.retryAfterMs);

          // Retry generation once after wait
          try {
            const retryStart = Date.now();
            const retryResponse = await provider.generate(request);
            const retryDuration = Math.max(1, Date.now() - retryStart);

            if (request.responseFormat === 'json' || request.validateJson) {
              extractAndParseJson(retryResponse.text);
            }


            let inputTokens = retryResponse.inputTokens;
            let outputTokens = retryResponse.outputTokens;
            let isTokenEstimate = false;

            if (inputTokens === undefined || outputTokens === undefined) {
              const estimate = estimateRequestResponseTokens(request.prompt, request.systemPrompt, retryResponse.text);
              inputTokens = inputTokens ?? estimate.inputTokens;
              outputTokens = outputTokens ?? estimate.outputTokens;
              isTokenEstimate = true;
            }

            const totalTokens = retryResponse.totalTokens ?? inputTokens + outputTokens;

            this.rateLimiter.recordRequest(providerId);
            this.rateLimiter.recordTokens(providerId, totalTokens);
            this.usageTracker.recordUsage({
              provider: providerId,
              inputTokens,
              outputTokens,
              totalTokens,
              success: true,
            });

            this.telemetryRecorder.recordEvent({
              requestId: request.requestId,
              taskType: request.taskType,
              provider: providerId,
              model: retryResponse.model || model,
              durationMs: retryDuration,
              success: true,
              inputTokens,
              outputTokens,
              totalTokens,
              isTokenEstimate,
              fallbackOccurred: attempts.length > 0,
              timestamp: new Date().toISOString(),
            });

            attempts.push({
              provider: providerId,
              model: retryResponse.model || model,
              durationMs: retryDuration,
              success: true,
              tokensUsed: { input: inputTokens, output: outputTokens, total: totalTokens },
            });

            return {
              success: true,
              response: {
                ...retryResponse,
                inputTokens,
                outputTokens,
                totalTokens,
              },
              provider: providerId,
              attempts,
            };
          } catch (retryErr: any) {
            error = retryErr.code && retryErr.provider ? retryErr : {
              code: 'PROVIDER_ERROR',
              message: retryErr.message || 'Error on retry after rate limit wait',
              provider: providerId,
              retryable: true,
              rawError: retryErr,
            };
          }
        }

        lastError = error;

        // Record Failure in usage & telemetry
        this.usageTracker.recordUsage({
          provider: providerId,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          success: false,
        });

        this.telemetryRecorder.recordEvent({
          requestId: request.requestId,
          taskType: request.taskType,
          provider: providerId,
          model,
          durationMs,
          success: false,
          errorCode: error.code,
          errorMessage: error.message,
          timestamp: new Date().toISOString(),
        });

        attempts.push({
          provider: providerId,
          model,
          durationMs,
          success: false,
          error,
        });
      }
    }

    return {
      success: false,
      error: lastError,
      attemptedProviders,
      attempts,
    };
  }
}

/**
 * Singleton instance of the default AI Router.
 */
export const defaultAIRouter = new AIRouter();
