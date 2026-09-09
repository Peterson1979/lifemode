import type { AIProviderId, AIErrorCode, AITaskType } from './types.ts';

export interface TelemetryEvent {
  requestId?: string;
  taskType: AITaskType;
  provider: AIProviderId;
  model: string;
  durationMs: number;
  success: boolean;
  errorCode?: AIErrorCode;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  isTokenEstimate?: boolean;
  fallbackOccurred?: boolean;
  timestamp: string; // ISO 8601
}

export interface TelemetrySummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  fallbackEvents: number;
  totalTokensConsumed: number;
  averageLatencyMs: number;
  byProvider: Record<
    AIProviderId,
    {
      requests: number;
      successes: number;
      failures: number;
      totalTokens: number;
      fallbackTriggered: number;
    }
  >;
}

export interface ITelemetryRecorder {
  recordEvent(event: TelemetryEvent): void;
  getEvents(): TelemetryEvent[];
  getSummary(): TelemetrySummary;
  reset(): void;
}

/**
 * In-memory telemetry recorder.
 * Strict privacy: never stores prompts, article content, or credentials.
 */
export class InMemoryTelemetryRecorder implements ITelemetryRecorder {
  private events: TelemetryEvent[] = [];

  recordEvent(event: TelemetryEvent): void {
    // Sanitize error message to ensure no API key or sensitive token leaks
    const sanitizedErrorMessage = event.errorMessage
      ? event.errorMessage.replace(/key=[A-Za-z0-9_-]+/gi, 'key=REDACTED').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED')
      : undefined;

    this.events.push({
      ...event,
      errorMessage: sanitizedErrorMessage,
      timestamp: event.timestamp || new Date().toISOString(),
    });
  }

  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  getSummary(): TelemetrySummary {
    const summary: TelemetrySummary = {
      totalRequests: this.events.length,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackEvents: 0,
      totalTokensConsumed: 0,
      averageLatencyMs: 0,
      byProvider: {},
    };

    let totalDuration = 0;

    for (const ev of this.events) {
      if (!summary.byProvider[ev.provider]) {
        summary.byProvider[ev.provider] = {
          requests: 0,
          successes: 0,
          failures: 0,
          totalTokens: 0,
          fallbackTriggered: 0,
        };
      }

      const provStat = summary.byProvider[ev.provider];
      provStat.requests += 1;
      totalDuration += ev.durationMs || 0;

      if (ev.success) {
        summary.successfulRequests += 1;
        provStat.successes += 1;
      } else {
        summary.failedRequests += 1;
        provStat.failures += 1;
      }

      if (ev.fallbackOccurred) {
        summary.fallbackEvents += 1;
        provStat.fallbackTriggered += 1;
      }

      const tokens = ev.totalTokens || (ev.inputTokens || 0) + (ev.outputTokens || 0);
      summary.totalTokensConsumed += tokens;
      provStat.totalTokens += tokens;
    }

    if (this.events.length > 0) {
      summary.averageLatencyMs = Math.round(totalDuration / this.events.length);
    }

    return summary;
  }

  reset(): void {
    this.events = [];
  }
}

/**
 * Singleton instance for process-wide telemetry.
 */
export const defaultTelemetryRecorder = new InMemoryTelemetryRecorder();
