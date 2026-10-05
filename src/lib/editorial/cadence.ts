/**
 * LifeMode Editorial Cadence & Scheduling Helper.
 *
 * Implements a deterministic, calendar-based cadence for AI-focused editorial content:
 * - An AI article (GetAISet-derived mainstream AI tools/learning) is scheduled every THIRD day.
 * - Non-AI days select 3 dynamic trending LifeMode articles with no forced pillar rotation.
 * - The cadence is purely derived from the UTC calendar date, ensuring that workflow retries,
 *   watchdog catch-up windows, and workflow_dispatch executions on the same UTC date resolve
 *   to the exact same cadence decision.
 */

// Fixed UTC anchor date: 2026-01-01 (Day 0 of 2026)
const ANCHOR_UTC_MS = Date.UTC(2026, 0, 1);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parses a date input into standard UTC midnight timestamp (ms).
 */
export function parseUtcDateMidnight(dateInput?: string | Date): number {
  if (!dateInput) {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }

  if (dateInput instanceof Date) {
    return Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate());
  }

  // Handle YYYY-MM-DD or ISO 8601 string
  const cleaned = dateInput.trim().split('T')[0];
  const parts = cleaned.split('-').map((p) => parseInt(p, 10));
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
  }

  const parsed = new Date(dateInput);
  if (!isNaN(parsed.getTime())) {
    return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }

  const fallback = new Date();
  return Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate());
}

/**
 * Formats a date or timestamp to standard UTC date string (YYYY-MM-DD).
 */
export function formatUtcDateString(dateInput?: string | Date | number): string {
  const ms = typeof dateInput === 'number' ? dateInput : parseUtcDateMidnight(dateInput);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calculates elapsed integer days since the fixed reference anchor.
 */
export function getElapsedUtcDays(dateInput?: string | Date): number {
  const targetMs = parseUtcDateMidnight(dateInput);
  return Math.floor((targetMs - ANCHOR_UTC_MS) / MS_PER_DAY);
}

/**
 * Evaluates whether a given date is a scheduled AI Publishing Day (every 3rd day).
 *
 * Deterministic formula:
 * (elapsedDays % 3) === 0 -> AI Day
 *
 * Example cadence:
 * - 2026-10-03 -> Non-AI Day
 * - 2026-10-04 -> Non-AI Day
 * - 2026-10-05 -> AI Day (GetAISet + 2 dynamic)
 * - 2026-10-06 -> Non-AI Day
 * - 2026-10-07 -> Non-AI Day
 * - 2026-10-08 -> AI Day (GetAISet + 2 dynamic)
 */
export function isAiCadenceDay(dateInput?: string | Date): boolean {
  const elapsedDays = getElapsedUtcDays(dateInput);
  // Support both positive and negative modulo safely
  return ((elapsedDays % 3) + 3) % 3 === 0;
}

export interface EditorialDailyPlan {
  targetDate: string;
  isAiDay: boolean;
  totalArticlesTarget: number;
  aiArticlesTarget: number;
  dynamicArticlesTarget: number;
  description: string;
}

/**
 * Resolves the structured editorial publishing plan for a given target date.
 */
export function getEditorialDailyPlan(
  dateInput?: string | Date,
  totalArticlesTarget = 3
): EditorialDailyPlan {
  const targetDate = formatUtcDateString(dateInput);
  const isAiDay = isAiCadenceDay(dateInput);

  const aiArticlesTarget = isAiDay ? Math.min(1, totalArticlesTarget) : 0;
  const dynamicArticlesTarget = Math.max(0, totalArticlesTarget - aiArticlesTarget);

  const description = isAiDay
    ? `AI Cadence Day: 1 GetAISet mainstream AI article + ${dynamicArticlesTarget} dynamic trending LifeMode articles`
    : `Standard Editorial Day: ${dynamicArticlesTarget} dynamic trending LifeMode articles`;

  return {
    targetDate,
    isAiDay,
    totalArticlesTarget,
    aiArticlesTarget,
    dynamicArticlesTarget,
    description,
  };
}
