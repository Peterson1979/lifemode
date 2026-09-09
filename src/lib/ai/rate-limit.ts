import type { AIProviderId } from './types.ts';

export interface RateLimitOptions {
  requestsPerMinute?: number;
  requestsPerDay?: number;
  tokensPerMinute?: number;
  estimatedTokens?: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMs: number;
  currentMinuteCount: number;
  currentDayCount: number;
  currentMinuteTokens: number;
  limitMinute: number;
  limitDay: number;
  limitTpm?: number;
  reason?: 'RPM_EXCEEDED' | 'RPD_EXCEEDED' | 'TPM_EXCEEDED';
}

export interface IRateLimiter {
  checkRateLimit(provider: AIProviderId, options?: RateLimitOptions): RateLimitCheckResult;
  recordRequest(provider: AIProviderId): void;
  recordTokens(provider: AIProviderId, tokens: number, timestamp?: number): void;
  reset(): void;
}

/**
 * Sliding window in-memory rate limiter for AI Providers.
 * Supports requests-per-minute (RPM), requests-per-day (RPD), and tokens-per-minute (TPM).
 */
export class InMemoryRateLimiter implements IRateLimiter {
  // Map<Provider, timestamp[]>
  private minuteWindows: Map<AIProviderId, number[]> = new Map();
  // Map<Provider, timestamp[]>
  private dayWindows: Map<AIProviderId, number[]> = new Map();
  // Map<Provider, Array<{ timestamp: number; tokens: number }>>
  private minuteTokenWindows: Map<AIProviderId, Array<{ timestamp: number; tokens: number }>> = new Map();

  private pruneOldTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
    const cutoff = now - windowMs;
    return timestamps.filter((t) => t > cutoff);
  }

  private pruneOldTokenEntries(
    entries: Array<{ timestamp: number; tokens: number }>,
    windowMs: number,
    now: number
  ): Array<{ timestamp: number; tokens: number }> {
    const cutoff = now - windowMs;
    return entries.filter((e) => e.timestamp > cutoff);
  }

  checkRateLimit(
    provider: AIProviderId,
    options: RateLimitOptions = {}
  ): RateLimitCheckResult {
    const now = Date.now();
    const limitRpm = options.requestsPerMinute ?? 30;
    const limitRpd = options.requestsPerDay ?? 1_000;
    const limitTpm = options.tokensPerMinute;
    const estimatedTokens = options.estimatedTokens ?? 0;

    // 1 Minute Request Window (60,000 ms)
    const rawMinuteList = this.minuteWindows.get(provider) || [];
    const minuteList = this.pruneOldTimestamps(rawMinuteList, 60_000, now);
    this.minuteWindows.set(provider, minuteList);

    // 24 Hour Day Request Window (86,400,000 ms)
    const rawDayList = this.dayWindows.get(provider) || [];
    const dayList = this.pruneOldTimestamps(rawDayList, 86_400_000, now);
    this.dayWindows.set(provider, dayList);

    // 1 Minute Token Window (60,000 ms)
    const rawTokenList = this.minuteTokenWindows.get(provider) || [];
    const tokenList = this.pruneOldTokenEntries(rawTokenList, 60_000, now);
    this.minuteTokenWindows.set(provider, tokenList);

    const currentMinuteCount = minuteList.length;
    const currentDayCount = dayList.length;
    const currentMinuteTokens = tokenList.reduce((sum, e) => sum + e.tokens, 0);

    // Check TPM
    if (limitTpm !== undefined && limitTpm > 0 && currentMinuteTokens + estimatedTokens > limitTpm) {
      if (estimatedTokens > limitTpm) {
        // Request can NEVER fit in this provider's TPM capacity
        return {
          allowed: false,
          retryAfterMs: 0,
          currentMinuteCount,
          currentDayCount,
          currentMinuteTokens,
          limitMinute: limitRpm,
          limitDay: limitRpd,
          limitTpm,
          reason: 'TPM_EXCEEDED',
        };
      }

      // Request can fit once enough old tokens age out of the 60s sliding window
      const targetRemaining = limitTpm - estimatedTokens;
      let runningSum = currentMinuteTokens;
      let safeTimestamp = now;

      for (const entry of tokenList) {
        runningSum -= entry.tokens;
        if (runningSum <= targetRemaining) {
          safeTimestamp = entry.timestamp;
          break;
        }
      }

      const retryAfterMs = Math.max(500, (safeTimestamp + 60_000 + 200) - now);
      return {
        allowed: false,
        retryAfterMs,
        currentMinuteCount,
        currentDayCount,
        currentMinuteTokens,
        limitMinute: limitRpm,
        limitDay: limitRpd,
        limitTpm,
        reason: 'TPM_EXCEEDED',
      };
    }

    // Check RPM
    if (limitRpm > 0 && currentMinuteCount >= limitRpm) {
      const oldestInMinute = minuteList[0];
      const retryAfterMs = Math.max(100, 60_000 - (now - oldestInMinute));
      return {
        allowed: false,
        retryAfterMs,
        currentMinuteCount,
        currentDayCount,
        currentMinuteTokens,
        limitMinute: limitRpm,
        limitDay: limitRpd,
        limitTpm,
        reason: 'RPM_EXCEEDED',
      };
    }

    // Check RPD
    if (limitRpd > 0 && currentDayCount >= limitRpd) {
      const oldestInDay = dayList[0];
      const retryAfterMs = Math.max(1000, 86_400_000 - (now - oldestInDay));
      return {
        allowed: false,
        retryAfterMs,
        currentMinuteCount,
        currentDayCount,
        currentMinuteTokens,
        limitMinute: limitRpm,
        limitDay: limitRpd,
        limitTpm,
        reason: 'RPD_EXCEEDED',
      };
    }

    return {
      allowed: true,
      retryAfterMs: 0,
      currentMinuteCount,
      currentDayCount,
      currentMinuteTokens,
      limitMinute: limitRpm,
      limitDay: limitRpd,
      limitTpm,
    };
  }

  recordRequest(provider: AIProviderId): void {
    const now = Date.now();
    const minuteList = this.minuteWindows.get(provider) || [];
    minuteList.push(now);
    this.minuteWindows.set(provider, minuteList);

    const dayList = this.dayWindows.get(provider) || [];
    dayList.push(now);
    this.dayWindows.set(provider, dayList);
  }

  recordTokens(provider: AIProviderId, tokens: number, timestamp: number = Date.now()): void {
    if (tokens <= 0) return;
    const tokenList = this.minuteTokenWindows.get(provider) || [];
    tokenList.push({ timestamp, tokens });
    this.minuteTokenWindows.set(provider, tokenList);
  }

  reset(): void {
    this.minuteWindows.clear();
    this.dayWindows.clear();
    this.minuteTokenWindows.clear();
  }
}

/**
 * Singleton instance for process-wide rate limiting.
 */
export const defaultRateLimiter = new InMemoryRateLimiter();
