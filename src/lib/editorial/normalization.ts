import { PILLAR_SLUGS, type PillarSlug } from '../../config/site.ts';

const LOWERCASE_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'with', 'in', 'of', 'into', 'over'
]);

/**
 * Converts a string into clean, publication-ready Editorial Title Case.
 */
export function toEditorialTitleCase(input: string): string {
  if (!input) return '';
  const words = input.trim().split(/\s+/);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      // Always capitalize the first and last word, or words not in the lowercase word list
      if (index === 0 || index === words.length - 1 || !LOWERCASE_WORDS.has(lower)) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join(' ');
}

/**
 * Question and conversational query prefix patterns to strip.
 */
const QUERY_PREFIX_PATTERNS = [
  /^(?:how\s+(?:do|can|to|should|would)\s+(?:i|we|you)\s+(?:make|get|do|build|create|optimize|organize|set\s+up|start|choose)\s+(?:a\s+|an\s+|the\s+)?)/i,
  /^(?:what\s+(?:is|are)\s+(?:the\s+)?(?:best\s+)?)/i,
  /^(?:why\s+(?:do|are|is|does)\s+)/i,
  /^(?:the\s+ultimate\s+guide\s+to\s+)/i,
  /^(?:a\s+complete\s+guide\s+to\s+)/i,
  /^(?:best\s+(?:ways|ideas|tips|methods|practices|tools|strategies)\s+(?:to|for)\s+)/i,
  /^(?:top\s+\d+\s+(?:ways|ideas|tips|methods|tools)\s+(?:to|for)\s+)/i,
  /^(?:ideas\s+for\s+)/i,
  /^(?:guide\s+to\s+)/i,
];

/**
 * Normalizes synonym concepts to canonical phrasing for deduplication and grouping.
 */
const SYNONYM_MAP: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(?:decluttering|clutter-free|less\s+cluttered|uncluttered)\b/gi, replacement: 'decluttering' },
  { pattern: /\b(?:storage\s+ideas|organization\s+tips|organizing\s+ideas)\b/gi, replacement: 'organization and storage' },
  { pattern: /\b(?:tiny\s+bedroom|small\s+bedroom)\b/gi, replacement: 'small bedroom' },
  { pattern: /\b(?:desk\s+setup|workspace\s+setup)\b/gi, replacement: 'desk setup' },
  { pattern: /\b(?:morning\s+routine|morning\s+habits|morning\s+rituals)\b/gi, replacement: 'morning routines' },
];

/**
 * Cleans and normalizes a raw search query or topic title.
 */
export function cleanTopicString(raw: string): string {
  if (!raw) return '';
  let cleaned = raw
    .trim()
    .replace(/[^\w\s-–—/&]/gi, '') // Remove emojis and special noise
    .replace(/[\s_]+/g, ' ')
    .trim();

  // Strip conversational query prefixes
  for (const prefix of QUERY_PREFIX_PATTERNS) {
    if (prefix.test(cleaned)) {
      cleaned = cleaned.replace(prefix, '').trim();
      break;
    }
  }

  // Remove trailing punctuation or question marks
  cleaned = cleaned.replace(/[?!:;.,]+$/, '').trim();

  return cleaned;
}

/**
 * Normalizes a query into its canonical topic representation for deduplication and matching.
 */
export function normalizeTopicQuery(raw: string): {
  canonicalTopic: string;
  canonicalSlug: string;
  normalizedConcept: string;
} {
  const cleaned = cleanTopicString(raw);
  let concept = cleaned.toLowerCase();

  // Apply synonym mappings to canonical concept
  for (const { pattern, replacement } of SYNONYM_MAP) {
    concept = concept.replace(pattern, replacement);
  }

  const titleCased = toEditorialTitleCase(cleaned);
  const slug = slugify(titleCased);

  return {
    canonicalTopic: titleCased,
    canonicalSlug: slug,
    normalizedConcept: concept,
  };
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
  life: ['life', 'home', 'living', 'routine', 'habit', 'decor', 'minimalism', 'productivity', 'organization', 'space', 'workspace', 'desk', 'declutter', 'bedroom', 'interior'],
  travel: ['travel', 'trip', 'destination', 'hotel', 'flight', 'itinerary', 'vacation', 'resort', 'city', 'explore', 'island', 'coastal', 'stay', 'kyoto', 'azores', 'europe'],
  'tech-ai': ['tech', 'ai', 'artificial intelligence', 'gadget', 'software', 'prompt', 'automation', 'tool', 'app', 'hardware', 'llm', 'computing', 'digital', 'workflow'],
  money: ['money', 'finance', 'invest', 'wealth', 'budget', 'saving', 'portfolio', 'income', 'crypto', 'stock', 'tax', 'yield', 'treasury', 'cash', 'asset'],
  wellbeing: ['wellbeing', 'health', 'fitness', 'nutrition', 'workout', 'diet', 'sleep', 'mindfulness', 'longevity', 'mental', 'vitality', 'circadian', 'recovery', 'sauna', 'light'],
  discover: ['discover', 'culture', 'book', 'art', 'design', 'architecture', 'film', 'curation', 'history', 'exhibition', 'minka', 'prefab', 'monograph', 'ceramic'],
  now: ['now', 'trend', 'viral', 'season', 'summer', 'winter', 'autumn', 'spring', 'update', 'breaking', 'zeitgeist', 'shift', 'cultural', 'intentionality', 'friction'],
};

/**
 * Infers the closest matching pillar from query keywords using weighted scoring.
 */
export function inferPillarFromKeywords(text: string, defaultPillar: PillarSlug = 'life'): PillarSlug {
  const lower = text.toLowerCase();

  let bestPillar = defaultPillar;
  let highestScore = 0;

  for (const pillar of PILLAR_SLUGS) {
    const keywords = PILLAR_KEYWORDS[pillar];
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        // Longer keyword matches receive higher weight
        score += kw.length > 5 ? 2 : 1;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestPillar = pillar;
    }
  }

  return bestPillar;
}

/**
 * Generates a unique topic ID.
 */
export function generateTopicId(pillar: PillarSlug, slug: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `lm-${pillar}-${dateStr}-${slug.slice(0, 30)}`;
}
