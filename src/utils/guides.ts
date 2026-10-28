import type { CollectionEntry } from 'astro:content';

/**
 * Publication-state convention (see src/lib/editorial/storage/publishing-adapter.ts):
 * - DRAFT / REVIEWED / APPROVED: internal editorial pipeline states.
 * - STORED: article is only confirmed as stored on the filesystem; it does not
 *   claim external publication.
 * - PUBLISHED: article is publicly published.
 * - ARCHIVED: retired content; never publicly listed.
 *
 * A guide is therefore publicly visible only when it is not marked as a draft
 * and its lifecycleStatus is exactly 'PUBLISHED'. Anything else (including
 * DRAFT and ARCHIVED) is excluded from public listing and static route
 * generation.
 */
export function isPubliclyVisibleGuide(entry: CollectionEntry<'guides'>): boolean {
  return entry.data.draft !== true && entry.data.lifecycleStatus === 'PUBLISHED';
}

/**
 * Extracts the URL slug from a guides collection entry id
 * (e.g. "small-kitchen-organization.md" -> "small-kitchen-organization").
 */
export function guideSlug(id: string): string {
  return id.replace(/\.[^/.]+$/, '');
}
