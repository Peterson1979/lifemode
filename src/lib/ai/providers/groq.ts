import type { IAIProvider, AIRequest, AIResponse, AIProviderError } from '../types.ts';
import { loadAIConfig } from '../config.ts';

export interface GroqProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  fetchFn?: typeof fetch;
}

/**
 * Groq Cloud AI Provider Implementation.
 * Uses official Groq OpenAI-compatible REST API with clean timeout, error mapping, and usage extraction.
 */
export class GroqProvider implements IAIProvider {
  readonly id = 'groq' as const;
  readonly defaultModel: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: GroqProviderOptions = {}) {
    const config = loadAIConfig().groq;
    this.apiKey = options.apiKey !== undefined ? options.apiKey : config.apiKey;
    this.defaultModel = options.defaultModel || config.model || 'openai/gpt-oss-20b';
    this.fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.isConfigured()) {
      const error: AIProviderError = {
        code: 'NOT_CONFIGURED',
        message: 'Groq API key is missing. Set GROQ_API_KEY environment variable.',
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

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: request.prompt,
    });

    const isJsonExpected = request.responseFormat === 'json' ||
      request.taskType === 'content_generation' ||
      request.taskType === 'content_review';

    const body: any = {
      model,
      messages,
    };

    if (isJsonExpected) {
      body.response_format = { type: 'json_object' };
    }

    const maxTokens = request.maxOutputTokens || (
      request.taskType === 'content_generation' ? 6000 :
      request.taskType === 'content_review' ? 2000 : undefined
    );
    if (maxTokens) {
      body.max_tokens = maxTokens;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    const url = 'https://api.groq.com/openai/v1/chat/completions';

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      if (err.name === 'AbortError' || controller.signal.aborted) {
        const error: AIProviderError = {
          code: 'TIMEOUT',
          message: `Groq request timed out after ${timeoutMs}ms.`,
          provider: this.id,
          retryable: true,
          rawError: err,
        };
        throw error;
      }
      const error: AIProviderError = {
        code: 'NETWORK',
        message: `Network error connecting to Groq API: ${err.message || 'connection failed'}`,
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
      // Sanitize Bearer tokens or sensitive headers from error messages
      const sanitizedMsg = rawMsg.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED');

      let code: AIProviderError['code'] = 'PROVIDER_ERROR';
      let retryable = true;
      let retryAfterMs: number | undefined;

      if (status === 401 || status === 403) {
        code = 'AUTH';
        retryable = false;
      } else if (status === 429) {
        code = sanitizedMsg.toLowerCase().includes('quota') ? 'QUOTA' : 'RATE_LIMIT';
        retryable = true;

        const retryAfterHeader = response.headers?.get ? response.headers.get('retry-after') : null;
        if (retryAfterHeader) {
          const seconds = parseFloat(retryAfterHeader);
          if (!isNaN(seconds) && seconds > 0) {
            retryAfterMs = Math.ceil(seconds * 1000);
          }
        }
        if (!retryAfterMs) {
          const match = sanitizedMsg.match(/try again in ([0-9.]+)s/i);
          if (match) {
            const seconds = parseFloat(match[1]);
            if (!isNaN(seconds) && seconds > 0) {
              retryAfterMs = Math.ceil(seconds * 1000);
            }
          }
        }
      } else if (status === 400) {
        code = 'INVALID_REQUEST';
        retryable = false;
      } else if (status >= 500) {
        code = 'PROVIDER_ERROR';
        retryable = true;
      }

      const providerError: AIProviderError = {
        code,
        message: `Groq API returned HTTP ${status}: ${sanitizedMsg}`,
        provider: this.id,
        retryable,
        statusCode: status,
        retryAfterMs,
      };
      throw providerError;
    }

    let data: any;
    try {
      data = await response.json();
    } catch (parseErr: any) {
      const error: AIProviderError = {
        code: 'PROVIDER_ERROR',
        message: 'Failed to parse Groq response JSON.',
        provider: this.id,
        retryable: true,
        rawError: parseErr,
      };
      throw error;
    }

    const choice = data?.choices?.[0];
    const text = choice?.message?.content || '';

    // Validate structured JSON if expected
    if (isJsonExpected || request.validateJson) {
      let clean = text.trim();
      if (clean.startsWith('```json')) {
        clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (clean.startsWith('```')) {
        clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      try {
        JSON.parse(clean);
      } catch (jsonErr: any) {
        const error: AIProviderError = {
          code: 'MALFORMED_OUTPUT',
          message: `Groq returned truncated or malformed JSON output: ${jsonErr.message}`,
          provider: this.id,
          retryable: true,
          rawError: jsonErr,
        };
        throw error;
      }
    }

    // Extract official Groq usage
    const usage = data?.usage;
    const inputTokens = usage?.prompt_tokens;
    const outputTokens = usage?.completion_tokens;
    const totalTokens = usage?.total_tokens || (inputTokens && outputTokens ? inputTokens + outputTokens : undefined);

    return {
      text,
      provider: this.id,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      durationMs,
    };
  }
}
