import { PILLARS, type PillarSlug } from '../../config/site.ts';

export interface SubtopicDefinition {
  slug: string;
  name: string;
  pillar: PillarSlug;
  description: string;
  keywords: string[];
}

/**
 * Keyword dictionaries tailored to the 22 defined LifeMode editorial subtopics.
 */
const SUBTOPIC_KEYWORDS: Record<string, string[]> = {
  // Health (5)
  'longevity-aging': ['longevity', 'aging', 'lifespan', 'healthspan', 'epigenetic', 'methylation', 'cellular', 'nad+', 'senescence', 'telomere', 'biological age'],
  'metabolic-health': ['metabolic', 'metabolism', 'glucose', 'insulin', 'cgm', 'glycemic', 'postprandial', 'ketosis', 'blood sugar', 'fasting'],
  'weight-fitness': ['fitness', 'workout', 'exercise', 'zone 2', 'cardio', 'hypertrophy', 'aerobic', 'strength', 'vo2', 'endurance', 'resistance training'],
  'sleep-recovery': ['sleep', 'circadian', 'recovery', 'rem', 'deep sleep', 'insomnia', 'melatonin', 'light timing', 'rest', 'sleep staging'],
  'wellness-tech': ['wellness tech', 'wearable', 'whoop', 'oura', 'apple watch', 'hrv', 'heart rate variability', 'biohacking', 'tracker', 'smart ring'],

  // Wealth (5)
  'online-side-hustles': ['side hustle', 'micro-consulting', 'online business', 'micro-agency', 'cashflow', 'service business', 'solopreneur', 'hustle'],
  'digital-products': ['digital product', 'notion', 'spreadsheet', 'template', 'workflow kit', 'digital assets', 'gumroad', 'ebook'],
  'freelancing-remote': ['freelance', 'freelancing', 'remote work', 'contractor', 'retainer', 'client acquisition', 'hourly rate', 'consulting rate'],
  'creator-economy': ['creator', 'newsletter', 'substack', 'audience', 'sponsorship', 'micro-sponsorship', 'media kit', 'subscribers'],
  'ecommerce-selling': ['ecommerce', 'e-commerce', 'online store', 'shopify', 'fulfillment', 'inventory', 'margins', 'selling online', 'merchandise'],

  // Home (4)
  'food-kitchen': ['food', 'kitchen', 'cooking', 'cookware', 'cast iron', 'carbon steel', 'pantry', 'seasoning', 'refrigerator', 'leftovers', 'culinary'],
  'cleaning-laundry': ['cleaning', 'laundry', 'stain', 'detergent', 'washing machine', 'enzyme', 'fabric care', 'odor', 'bleach', 'sanitizing'],
  'home-maintenance': ['home maintenance', 'maintenance', 'hvac', 'plumbing', 'envelope', 'filter', 'gutter', 'insulation', 'moisture', 'leak'],
  'storage-organization': ['storage', 'closet', 'organization', 'declutter', 'small space', 'shelving', 'modular storage', 'pantry organization'],

  // Life (3)
  'style-beauty': ['style', 'wardrobe', 'capsule wardrobe', 'tailoring', 'fabric', 'cost-per-wear', 'grooming', 'textile', 'clothing', 'apparel'],
  'productivity-daily': ['productivity', 'daily routine', 'focus', 'time blocking', 'habit stacking', 'morning routine', 'distraction', 'workflow'],
  'travel-experiences': ['travel', 'transit', 'field journey', 'slow travel', 'culinary heritage', 'regional market', 'itinerary', 'rail'],

  // Tech & AI (5)
  'ai-tools': ['ai tools', 'llm', 'chatgpt', 'claude', 'gemini', 'models', 'context window', 'prompt', 'assistant', 'reasoning model'],
  'ai-workflows': ['ai workflow', 'automation', 'n8n', 'webhook', 'local model', 'pipeline', 'zapier', 'agentic', 'practical ai'],
  'everyday-software': ['software', 'apps', 'markdown', 'obsidian', 'local-first', 'crdt', 'browser extension', 'plain-text', 'operating system'],
  'modern-tech-hardware': ['hardware', 'peripherals', 'monitor', 'keyboard', 'ergonomic', 'workspace hardware', 'desk setup', 'screen', 'laptop'],
  'privacy-security': ['privacy', 'security', 'threat model', 'password', 'hardware key', 'fido2', '2fa', 'encryption', 'backup', 'sovereignty'],
};

/**
 * Extracts and compiles all subtopic definitions across all active pillars.
 */
export function getSubtopicDefinitions(): SubtopicDefinition[] {
  const definitions: SubtopicDefinition[] = [];

  for (const [pillarSlug, config] of Object.entries(PILLARS)) {
    if (!config.subtopics || config.subtopics.length === 0) continue;

    for (const sub of config.subtopics) {
      const slug = sub.slug || sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      definitions.push({
        slug,
        name: sub.name,
        pillar: pillarSlug as PillarSlug,
        description: sub.description,
        keywords: SUBTOPIC_KEYWORDS[slug] || [sub.name.toLowerCase()],
      });
    }
  }

  return definitions;
}

export const ALL_SUBTOPIC_DEFINITIONS = getSubtopicDefinitions();
export const EDITORIAL_ARTICLE_SUBTOPICS = ALL_SUBTOPIC_DEFINITIONS.filter((s) => s.pillar !== 'tools');
export const TOOL_SUBTOPICS = ALL_SUBTOPIC_DEFINITIONS.filter((s) => s.pillar === 'tools');

/**
 * Resolves the appropriate subtopic slug for a given topic or article candidate.
 */
export function resolveTopicSubtopic(topic: {
  pillar?: string;
  canonicalTopic?: string;
  title?: string;
  slug?: string;
  tags?: string[];
  subtopic?: string;
}): string | undefined {
  // 1. Explicit subtopic already provided
  if (topic.subtopic) {
    const exists = ALL_SUBTOPIC_DEFINITIONS.some(
      (s) => s.slug === topic.subtopic && (!topic.pillar || s.pillar === topic.pillar)
    );
    if (exists) return topic.subtopic;
  }

  const pillar = topic.pillar as PillarSlug | undefined;
  const pillarSubtopics = ALL_SUBTOPIC_DEFINITIONS.filter(
    (s) => !pillar || s.pillar === pillar
  );

  // 2. Check tags for direct subtopic slug match
  if (topic.tags && Array.isArray(topic.tags)) {
    for (const tag of topic.tags) {
      const normalizedTag = tag.toLowerCase().trim();
      const matched = pillarSubtopics.find((s) => s.slug === normalizedTag);
      if (matched) return matched.slug;
    }
  }

  // 3. Keyword matching against canonical topic / title text
  const textToScan = `${topic.canonicalTopic || ''} ${topic.title || ''} ${topic.slug || ''}`.toLowerCase();

  let bestMatch: { slug: string; matches: number } | null = null;

  for (const def of pillarSubtopics) {
    let matchCount = 0;
    for (const kw of def.keywords) {
      if (textToScan.includes(kw.toLowerCase())) {
        matchCount++;
      }
    }
    if (matchCount > 0 && (!bestMatch || matchCount > bestMatch.matches)) {
      bestMatch = { slug: def.slug, matches: matchCount };
    }
  }

  return bestMatch?.slug;
}

/**
 * Calculates published article count per subtopic slug.
 */
export function calculateSubtopicCoverage(
  articles: Array<{
    pillar?: string;
    slug?: string;
    tags?: string[];
    subtopic?: string;
    frontmatter?: any;
    data?: any;
  }>
): Record<string, number> {
  const coverage: Record<string, number> = {};

  // Initialize all known subtopics with 0
  for (const def of ALL_SUBTOPIC_DEFINITIONS) {
    coverage[def.slug] = 0;
  }

  for (const art of articles) {
    const rawSubtopic =
      art.subtopic ||
      art.frontmatter?.subtopic ||
      art.data?.subtopic;

    const tags = art.tags || art.frontmatter?.tags || art.data?.tags || [];
    const pillar = art.pillar || art.frontmatter?.pillar || art.data?.pillar;
    const title = art.frontmatter?.title || art.data?.title || '';
    const slug = art.slug || '';

    const resolved = resolveTopicSubtopic({
      subtopic: rawSubtopic,
      tags,
      pillar,
      title,
      slug,
    });

    if (resolved && coverage[resolved] !== undefined) {
      coverage[resolved]++;
    }
  }

  return coverage;
}

/**
 * Calculates a dynamic anti-starvation boost for candidate topics belonging to under-covered subtopics.
 * Boost amounts:
 * - 0 articles published in subtopic: +10 points (maximum urgency boost)
 * - 1 article published in subtopic:  +5 points
 * - 2 articles published in subtopic:  +2 points
 * - 3+ articles published:             0 points
 */
export function calculateSubtopicStarvationBoost(
  subtopic: string | undefined,
  coverage: Record<string, number>
): number {
  if (!subtopic || coverage[subtopic] === undefined) return 0;

  const count = coverage[subtopic];
  if (count === 0) return 10;
  if (count === 1) return 5;
  if (count === 2) return 2;
  return 0;
}

export interface SubtopicCoverageReport {
  totalSubtopics: number;
  coveredSubtopics: number;
  emptySubtopics: number;
  coveragePercent: number;
  byPillar: Record<
    string,
    Array<{
      slug: string;
      name: string;
      count: number;
    }>
  >;
}

/**
 * Generates an audit report of subtopic content coverage.
 */
export function getSubtopicCoverageReport(
  coverage: Record<string, number>,
  definitions: SubtopicDefinition[] = EDITORIAL_ARTICLE_SUBTOPICS
): SubtopicCoverageReport {
  let covered = 0;
  let empty = 0;
  const byPillar: SubtopicCoverageReport['byPillar'] = {};

  for (const def of definitions) {
    const count = coverage[def.slug] ?? 0;
    if (count > 0) covered++;
    else empty++;

    if (!byPillar[def.pillar]) byPillar[def.pillar] = [];
    byPillar[def.pillar].push({
      slug: def.slug,
      name: def.name,
      count,
    });
  }

  const total = definitions.length;
  const coveragePercent = total > 0 ? Math.round((covered / total) * 100) : 0;

  return {
    totalSubtopics: total,
    coveredSubtopics: covered,
    emptySubtopics: empty,
    coveragePercent,
    byPillar,
  };
}
