import { PILLAR_SLUGS, type PillarSlug } from '../../config/site.ts';

/**
 * Cleans and normalizes a raw search query or topic title.
 */
export function cleanTopicString(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/[^\w\s-–—/&]/gi, '') // Remove emojis and special noise
    .replace(/[\s_]+/g, ' ')
    .trim();
}

/**
 * Generates an SEO-friendly URL slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Keyword-based heuristic to infer the most appropriate LifeMode pillar if unspecified.
 */
const PILLAR_KEYWORDS: Record<PillarSlug, string[]> = {
  life: ['life', 'home', 'living', 'routine', 'habit', 'decor', 'minimalism', 'productivity', 'organization', 'space'],
  travel: ['travel', 'trip', 'destination', 'hotel', 'flight', 'itinerary', 'vacation', 'resort', 'city', 'explore'],
  'tech-ai': ['tech', 'ai', 'artificial intelligence', 'gadget', 'software', 'prompt', 'automation', 'tool', 'app', 'hardware'],
  money: ['money', 'finance', 'invest', 'wealth', 'budget', 'saving', 'portfolio', 'income', 'crypto', 'stock', 'tax'],
  wellbeing: ['wellbeing', 'health', 'fitness', 'nutrition', 'workout', 'diet', 'sleep', 'mindfulness', 'longevity', 'mental'],
  discover: ['discover', 'culture', 'book', 'art', 'design', 'architecture', 'film', 'curation', 'history', 'exhibition'],
  now: ['now', 'trend', 'viral', 'season', 'summer', 'winter', 'autumn', 'spring', 'update', 'breaking', 'zeitgeist'],
};

/**
 * Infers the closest matching pillar from query keywords.
 */
export function inferPillarFromKeywords(text: string, defaultPillar: PillarSlug = 'life'): PillarSlug {
  const lower = text.toLowerCase();

  for (const pillar of PILLAR_SLUGS) {
    const keywords = PILLAR_KEYWORDS[pillar];
    if (keywords.some((kw) => lower.includes(kw))) {
      return pillar;
    }
  }

  return defaultPillar;
}

/**
 * Generates a unique topic ID.
 */
export function generateTopicId(pillar: PillarSlug, slug: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `lm-${pillar}-${dateStr}-${slug.slice(0, 30)}`;
}
