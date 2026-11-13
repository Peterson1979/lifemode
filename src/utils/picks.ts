import type { CollectionEntry } from 'astro:content';
import { getPicksCategory, type PicksCategoryMeta } from './picks-categories';

export function isPubliclyVisiblePicksArticle(entry: CollectionEntry<'picks'>): boolean {
  return entry.data.draft !== true;
}

export function picksArticleSlug(id: string): string {
  return id.replace(/\.[^/.]+$/, '');
}

export function getPicksArticleCategories(entry: CollectionEntry<'picks'>): PicksCategoryMeta[] {
  const result: PicksCategoryMeta[] = [];
  const rawCategories = entry.data.categories || [];
  for (const cat of rawCategories) {
    const meta = getPicksCategory(cat);
    if (meta && !result.some((m) => m.slug === meta.slug)) {
      result.push(meta);
    }
  }
  return result;
}

