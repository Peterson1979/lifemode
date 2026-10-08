/**
 * LifeMode Editorial Cadence & Scheduling Helper.
 *
 * Implements a deterministic, calendar-based weekly cadence:
 * - Every day has a total editorial article target of 3 articles.
 *
 * - 3 GetAISet days per week (Tuesday, Thursday, Saturday UTC):
 *   - 1 GetAISet article per day (AI learning / practical AI tools for everyday non-technical users)
 *   - 2 regular LifeMode articles per day across the active pillars
 *   - Total: 3 articles/day (1 GetAISet + 2 regular LifeMode)
 *
 * - 4 Regular LifeMode editorial days per week (Sunday, Monday, Wednesday, Friday UTC):
 *   - 3 regular articles per day across the active pillars
 *   - Total: 3 articles/day (3 regular LifeMode)
 *
 * - Overall Weekly Total: 21 articles/week (3 GetAISet + 18 regular LifeMode).
 *
 * - Life Hacks Cadence (separate): 3 video opportunities/week (Tuesday, Thursday, Saturday UTC).
 * - Tools Cadence (separate): 1 tool opportunity/week (Sunday UTC).
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
 * Evaluates whether a given date is a scheduled GetAISet Publishing Day.
 *
 * Deterministic weekly schedule (3 days / week):
 * - Tuesday (2), Thursday (4), Saturday (6) -> GetAISet Day (1 AI article + 2 regular articles = 3 total)
 * - Sunday (0), Monday (1), Wednesday (3), Friday (5) -> Regular LifeMode Editorial Day (3 regular articles)
 */
export function isAiCadenceDay(dateInput?: string | Date): boolean {
  const ms = parseUtcDateMidnight(dateInput);
  const dayOfWeek = new Date(ms).getUTCDay();
  return dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 6;
}

/**
 * Evaluates whether a given date is a scheduled Life Hacks Publishing Day.
 * Target: 3 videos per week (Tuesday, Thursday, Saturday UTC).
 */
export function isLifeHacksCadenceDay(dateInput?: string | Date): boolean {
  const ms = parseUtcDateMidnight(dateInput);
  const dayOfWeek = new Date(ms).getUTCDay();
  return dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 6;
}

/**
 * Evaluates whether a given date is a scheduled Tools Publishing Day.
 * Target: 1 tool item per week (Sunday UTC).
 */
export function isToolsCadenceDay(dateInput?: string | Date): boolean {
  const ms = parseUtcDateMidnight(dateInput);
  const dayOfWeek = new Date(ms).getUTCDay();
  return dayOfWeek === 0;
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
  customTotalTarget?: number
): EditorialDailyPlan {
  const targetDate = formatUtcDateString(dateInput);
  const isAiDay = isAiCadenceDay(dateInput);

  // Every day has a total target of 3 articles:
  // - AI Day: 1 GetAISet + 2 regular LifeMode articles = 3 total articles
  // - Non-AI Day: 3 regular LifeMode articles = 3 total articles
  const baseTarget = 3;
  const totalArticlesTarget = customTotalTarget !== undefined ? customTotalTarget : baseTarget;

  const aiArticlesTarget = isAiDay ? Math.min(1, totalArticlesTarget) : 0;
  const dynamicArticlesTarget = Math.max(0, totalArticlesTarget - aiArticlesTarget);

  const description = isAiDay
    ? `GetAISet Editorial Day: 1 mainstream practical AI learning / tool article + ${dynamicArticlesTarget} dynamic trending LifeMode articles across the active pillars`
    : `Standard LifeMode Editorial Day: ${dynamicArticlesTarget} dynamic trending LifeMode articles across the active pillars`;

  return {
    targetDate,
    isAiDay,
    totalArticlesTarget,
    aiArticlesTarget,
    dynamicArticlesTarget,
    description,
  };
}
