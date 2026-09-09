/**
 * Formats a Date object or ISO string into a deterministic English date string.
 * Example output: "September 9, 2026" or "Sep 9, 2026"
 */
export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return '';
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  };

  return new Intl.DateTimeFormat('en-US', defaultOptions).format(d);
}

/**
 * Returns an ISO 8601 formatted string for machine-readable time elements.
 */
export function toISODate(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    return '';
  }
  return d.toISOString();
}
