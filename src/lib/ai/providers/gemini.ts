import type { IAIProvider, AIRequest, AIResponse, AIProviderError } from '../types.ts';
import { loadAIConfig } from '../config.ts';

export interface GeminiProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  fetchFn?: typeof fetch;
}

/**
 * Google Gemini AI Provider Implementation.
 * Uses official Gemini REST API with clean timeout, error mapping, and usage extraction.
 */
export class GeminiProvider implements IAIProvider {
  readonly id = 'gemini' as const;
  readonly defaultModel: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: GeminiProviderOptions = {}) {
    const config = loadAIConfig().gemini;
    this.apiKey = options.apiKey !== undefined ? options.apiKey : config.apiKey;
    this.defaultModel = options.defaultModel || config.model || 'gemini-2.5-flash';
    this.fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.isConfigured()) {
      const error: AIProviderError = {
        code: 'NOT_CONFIGURED',
        message: 'Gemini API key is missing. Set GEMINI_API_KEY environment variable.',
        provider: this.id,
        retryable: false,
      };
      throw error;
    }

    const model = request.model || this.defaultModel;
    const timeoutMs = request.timeoutMs || loadAIConfig().router.timeoutMs || 30_000;
    const startTime = Date.now();

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    // Construct Gemini v1beta payload
    const contents: any[] = [];
    contents.push({
      role: 'user',
      parts: [{ text: request.prompt }],
    });

    const body: any = {
      contents,
    };

    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    if (request.maxOutputTokens || request.temperature !== undefined) {
      body.generationConfig = {};
      if (request.maxOutputTokens) {
        body.generationConfig.maxOutputTokens = request.maxOutputTokens;
      }
      if (request.temperature !== undefined) {
        body.generationConfig.temperature = request.temperature;
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      if (err.name === 'AbortError' || controller.signal.aborted) {
        const error: AIProviderError = {
          code: 'TIMEOUT',
          message: `Gemini request timed out after ${timeoutMs}ms.`,
          provider: this.id,
          retryable: true,
          rawError: err,
        };
        throw error;
      }
      const error: AIProviderError = {
        code: 'NETWORK',
        message: `Network error connecting to Gemini API: ${err.message || 'connection failed'}`,
        provider: this.id,
        retryable: true,
        rawError: err,
      };
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }

    const durationMs = Math.max(1, Date.now() - startTime);

    if (!response.ok) {
      let errorBody: any = null;
      try {
        errorBody = await response.json();
      } catch {
        // Ignored
      }

      const status = response.status;
      const rawMsg = errorBody?.error?.message || response.statusText || 'Unknown provider error';
      // Sanitize error message to ensure no keys leaked
      const sanitizedMsg = rawMsg.replace(/key=[A-Za-z0-9_-]+/gi, 'key=REDACTED');

      let code: AIProviderError['code'] = 'PROVIDER_ERROR';
      let retryable = true;

      if (status === 401 || status === 403) {
        code = 'AUTH';
        retryable = false;
      } else if (status === 429) {
        code = sanitizedMsg.toLowerCase().includes('quota') ? 'QUOTA' : 'RATE_LIMIT';
        retryable = true;
      } else if (status === 400) {
        code = 'INVALID_REQUEST';
        retryable = false;
      } else if (status >= 500) {
        code = 'PROVIDER_ERROR';
        retryable = true;
      }

      const providerError: AIProviderError = {
        code,
        message: `Gemini API returned HTTP ${status}: ${sanitizedMsg}`,
        provider: this.id,
        retryable,
        statusCode: status,
      };
      throw providerError;
    }

    let data: any;
    try {
      data = await response.json();
    } catch (parseErr: any) {
      const error: AIProviderError = {
        code: 'PROVIDER_ERROR',
        message: 'Failed to parse Gemini response JSON.',
        provider: this.id,
        retryable: true,
        rawError: parseErr,
      };
      throw error;
    }

    const candidate = data?.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0]?.text || '';

    // Extract official Gemini usage metadata
    const usage = data?.usageMetadata;
    const inputTokens = usage?.promptTokenCount;
    const outputTokens = usage?.candidatesTokenCount;
    const totalTokens = usage?.totalTokenCount || (inputTokens && outputTokens ? inputTokens + outputTokens : undefined);

    return {
      text: textPart,
      provider: this.id,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      durationMs,
    };
  }
}
