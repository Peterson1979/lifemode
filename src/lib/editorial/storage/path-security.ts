import { resolve, normalize } from 'node:path';
import type { PillarSlug } from '../types.ts';
import { VALID_PILLARS } from '../types.ts';

/**
 * Validates that a string matches one of the 7 supported LifeMode pillar slugs.
 */
export function validatePillar(pillar: string): PillarSlug {
  if (!pillar || typeof pillar !== 'string') {
    throw new Error('Pillar name must be a non-empty string.');
  }

  const normalized = pillar.trim().toLowerCase();
  if (!VALID_PILLARS.includes(normalized as PillarSlug)) {
    throw new Error(`Unsupported pillar "${pillar}". Must be one of: ${VALID_PILLARS.join(', ')}`);
  }

  return normalized as PillarSlug;
}

/**
 * Sanitizes and normalizes an article slug into strict kebab-case.
 */
export function sanitizeSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') {
    throw new Error('Article slug must be a non-empty string.');
  }

  // Reject path separators or traversal sequences explicitly
  if (slug.includes('/') || slug.includes('\\') || slug.includes('..') || slug.includes('%2e')) {
    throw new Error(`Invalid slug "${slug}". Slugs cannot contain path separators or directory traversal sequences.`);
  }

  const sanitized = slug
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-alphanumeric except hyphen and space
    .replace(/\s+/g, '-') // spaces to hyphens
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens

  if (!sanitized) {
    throw new Error(`Slug "${slug}" produced an empty sanitized string.`);
  }

  return sanitized;
}

/**
 * Resolves a safe, normalized filesystem path confined strictly within the configured content root.
 *
 * Security checks:
 * - Prevents `../` and `..\` directory traversal
 * - Blocks absolute Windows/Unix paths
 * - Confines write destination strictly to `<contentRoot>/<pillar>/<slug>.md`
 */
export function resolveSafeArticlePath(
  contentRoot: string,
  rawPillar: string,
  rawSlug: string
): { safePath: string; pillar: PillarSlug; slug: string } {
  if (!contentRoot || typeof contentRoot !== 'string') {
    throw new Error('Content root path must be a valid non-empty string.');
  }

  // Check for suspicious characters in raw inputs before resolution
  if (rawPillar.includes('..') || rawPillar.includes('/') || rawPillar.includes('\\')) {
    throw new Error(`Invalid pillar "${rawPillar}" containing path traversal or directory separators.`);
  }

  const pillar = validatePillar(rawPillar);
  const slug = sanitizeSlug(rawSlug);

  const resolvedRoot = resolve(normalize(contentRoot));
  const expectedPillarDir = resolve(resolvedRoot, pillar);
  const safePath = resolve(expectedPillarDir, `${slug}.md`);

  // Path confinement verification
  const normalizedSafePath = normalize(safePath);
  const normalizedPillarDir = normalize(expectedPillarDir);

  // Must strictly reside inside expectedPillarDir
  if (
    !normalizedSafePath.startsWith(normalizedPillarDir + (process.platform === 'win32' ? '\\' : '/')) &&
    normalizedSafePath !== normalizedPillarDir
  ) {
    throw new Error(`Path traversal attempt detected. Path "${safePath}" escapes target pillar directory "${expectedPillarDir}".`);
  }

  return {
    safePath,
    pillar,
    slug,
  };
}
