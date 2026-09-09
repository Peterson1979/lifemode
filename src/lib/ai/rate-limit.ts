import type { AIProviderId } from './types.ts';

export interface RateLimitOptions {
  requestsPerMinute?: number;
  requestsPerDay?: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMs: number;
  currentMinuteCount: number;
  currentDayCount: number;
  limitMinute: number;
  limitDay: number;
  reason?: 'RPM_EXCEEDED' | 'RPD_EXCEEDED';
}

export interface IRateLimiter {
  checkRateLimit(provider: AIProviderId, options?: RateLimitOptions): RateLimitCheckResult;
  recordRequest(provider: AIProviderId): void;
  reset(): void;
}

/**
 * Sliding window in-memory rate limiter for AI Providers.
 */
export class InMemoryRateLimiter implements IRateLimiter {
  // Map<Provider, timestamp[]>
  private minuteWindows: Map<AIProviderId, number[]> = new Map();
  // Map<Provider, timestamp[]>
  private dayWindows: Map<AIProviderId, number[]> = new Map();

  private pruneOldTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
    const cutoff = now - windowMs;
    return timestamps.filter((t) => t > cutoff);
  }

  checkRateLimit(
    provider: AIProviderId,
    options: RateLimitOptions = {}
  ): RateLimitCheckResult {
    const now = Date.now();
    const limitRpm = options.requestsPerMinute ?? 30;
    const limitRpd = options.requestsPerDay ?? 1_000;

    // 1 Minute Window (60,000 ms)
    const rawMinuteList = this.minuteWindows.get(provider) || [];
    const minuteList = this.pruneOldTimestamps(rawMinuteList, 60_000, now);
    this.minuteWindows.set(provider, minuteList);

    // 24 Hour Day Window (86,400,000 ms)
    const rawDayList = this.dayWindows.get(provider) || [];
    const dayList = this.pruneOldTimestamps(rawDayList, 86_400_000, now);
    this.dayWindows.set(provider, dayList);

    const currentMinuteCount = minuteList.length;
    const currentDayCount = dayList.length;

    // Check RPM
    if (limitRpm > 0 && currentMinuteCount >= limitRpm) {
      const oldestInMinute = minuteList[0];
      const retryAfterMs = Math.max(100, 60_000 - (now - oldestInMinute));
      return {
        allowed: false,
        retryAfterMs,
        currentMinuteCount,
        currentDayCount,
        limitMinute: limitRpm,
        limitDay: limitRpd,
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
        limitMinute: limitRpm,
        limitDay: limitRpd,
        reason: 'RPD_EXCEEDED',
      };
    }

    return {
      allowed: true,
      retryAfterMs: 0,
      currentMinuteCount,
      currentDayCount,
      limitMinute: limitRpm,
      limitDay: limitRpd,
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

  reset(): void {
    this.minuteWindows.clear();
    this.dayWindows.clear();
  }
}

/**
 * Singleton instance for process-wide rate limiting.
 */
export const defaultRateLimiter = new InMemoryRateLimiter();
