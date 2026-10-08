import {
  ACTIVE_EDITORIAL_PILLARS,
  type ActivePillarSlug,
  PILLAR_SLUGS,
  type PillarSlug,
} from '../../config/site.ts';

const LOWERCASE_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'with', 'in', 'of', 'into', 'over'
]);

/**
 * Deterministic legacy-to-active pillar normalization map.
 * Strictly maps valid practical sub-categories to the 6 active LifeMode editorial pillars.
 * Excluded areas (entertainment, style, travel, culture, gaming, sports, celebrity) return null.
 */
export const LEGACY_PILLAR_MAP: Record<string, ActivePillarSlug> = {
  health: 'health',
  wealth: 'wealth',
  home: 'home',
  life: 'life',
  'tech-ai': 'tech-ai',
  tools: 'tools',
  wellbeing: 'health',
  longevity: 'health',
  money: 'wealth',
  'personal-finance': 'wealth',
  'food-drink': 'home',
  'food-kitchen': 'home',
  'cleaning-laundry': 'home',
  'home-maintenance': 'home',
  'storage-organization': 'home',
  'everyday-how-to': 'life',
};

/**
 * Normalizes any category or pillar string to one of the 6 active LifeMode editorial pillars.
 * Returns null if the category represents an excluded legacy area (e.g. entertainment, style, travel, gaming).
 */
export function normalizePillar(input?: string): ActivePillarSlug | null {
  if (!input) return null;
  const lower = input.toLowerCase().trim();
  if (ACTIVE_EDITORIAL_PILLARS.includes(lower as ActivePillarSlug)) {
    return lower as ActivePillarSlug;
  }
  if (LEGACY_PILLAR_MAP[lower]) {
    return LEGACY_PILLAR_MAP[lower];
  }
  return null;
}

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
 * Patterns representing entertainment, gaming, gossip, crime, disaster, sports, coupon spam, and generic filler to exclude.
 */
const EXCLUDED_TOPIC_PATTERNS: RegExp[] = [
  // Entertainment, Movies, Television, Awards, Streaming
  /\b(?:movie|movies|film|films|cinema|blockbuster|blockbusters|box office|trailer|soundtrack|oscars?|grammys?|emmys?|music awards?|awards? nominees?|cannes|sundance|actress|actor|director|hollywood|celebrity|celebrities|red carpet|sequel|premiere|screening|theatre|theater|streaming show|tv show|season \d+|episode \d+|spoilers|recap|binge-watch|screen storytelling)\b/i,
  // Video Games, Gaming Servers, MMOs, Esports
  /\b(?:gaming|gameplay|video game|esports|playstation|xbox|nintendo|steam|twitch|streamer|patch notes|server maintenance|scheduled maintenance|server downtime|raid reset|patch update|mmo|rpg|fps|aion|warcraft|fortnite|minecraft|genshin|roblox|gta|league of legends|zelda|pokemon|elden ring|final fantasy)\b/i,
  // Gossip, Dating, Romance, Scandal
  /\b(?:dating|divorce|cheating|affair|spotted with|boyfriend|girlfriend|fiance|engaged|wardrobe malfunction|net worth|paparazzi|rumor|rumors|gossip|drama on twitter|tiktok drama|viral clip|influencer drama)\b/i,
  // Crime, Disasters, Accidents, Tragedies
  /\b(?:arrested|charged with|shooting|killed|murder|homicide|robbery|car crash|plane crash|explosion|death row|inmate|spy|stashed gold|scandal|trial|court verdict)\b/i,
  // Sports & Scores (without banning comparison 'vs')
  /\b(?:game score|final score|game recap|halftime|touchdown|pitcher|box score|quarterback|nba|nfl|mlb|nhl|fifa|world cup|super bowl|playoffs|transfer fee|championship match|premier league|football match)\b/i,
  // Commercial Promo, Coupon Codes, Prime Day Deals Spam
  /\b(?:coupon|promo code|discount code|prime day deals|clearance sale|black friday sale|cyber monday deal|affiliate code|cashback)\b/i,
  // Generic Travel Listicles & Tourism Inspiration
  /\b(?:tourist destination|tourist attractions|travel destinations|destinations in|resort vacation|hotel booking|flight deals|weekend getaway)\b/i,
  // Abstract philosophical musings lacking practical task & generic trend buzz
  /\b(?:art of living|elevating daily living|contemplative modern|poetry of|philosophical reflection|meditations on modern life|philosophy of|modern living aesthetics|everyone is talking about|vibe shift|reimagining everything|trend is transforming|transforming modern homes|why this .*? trend|what is .*? and why everyone)\b/i,
];

/**
 * Checks whether a topic query represents meaningful, high-signal LifeMode editorial intent.
 */
export function isMeaningfulEditorialTopic(raw: string): { isValid: boolean; reason?: string } {
  if (!raw || typeof raw !== 'string') {
    return { isValid: false, reason: 'Empty or non-string topic query.' };
  }

  const cleaned = cleanTopicString(raw);
  const words = cleaned.replace(/[-–—/]+/g, ' ').split(/\s+/).filter((w) => w.length > 0);

  // Reject single-word filler topics (e.g. "Fitness", "Money", "Travel", "Tech")
  if (words.length < 2) {
    return { isValid: false, reason: 'Single-word query lacks editorial intent and depth.' };
  }

  // Reject 2-word generic filler unless it contains substantial keyword semantics
  if (words.length === 2 && words.every((w) => w.length < 4)) {
    return { isValid: false, reason: 'Short 2-word query lacks substance.' };
  }

  // Check against excluded entertainment/gaming/gossip/news/crime/sports patterns
  for (const pattern of EXCLUDED_TOPIC_PATTERNS) {
    if (pattern.test(cleaned) || pattern.test(raw)) {
      return { isValid: false, reason: 'Query matches excluded entertainment/gaming/gossip/crime/sports pattern.' };
    }
  }

  return { isValid: true };
}

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
 * Keyword-based heuristic to infer the most appropriate active LifeMode pillar.
 * Refined around EverydayGuide practical problem-solving domains.
 */
const ACTIVE_PILLAR_KEYWORDS: Record<ActivePillarSlug, string[]> = {
  health: [
    'health', 'longevity', 'metabolic', 'glucose', 'blood sugar', 'protein', 'nutrition',
    'sleep', 'recovery', 'fitness', 'workout', 'circadian', 'sauna', 'cold plunge',
    'biohacking', 'hydration', 'strength', 'zone 2', 'cardio', 'muscle', 'electrolytes',
    'supplements', 'heart rate', 'vo2 max', 'macronutrients', 'dietary'
  ],
  wealth: [
    'wealth', 'personal finance', 'investing', 'invest', 'budget', 'saving', 'portfolio',
    'treasury', 'yield', 'cash flow', 'dividends', 'emergency fund', 'high-yield savings',
    'hysa', 'treasury bills', 't-bills', 'index funds', 'roth ira', '401k', 'tax strategy',
    'tax deductions', 'side hustle', 'cash management', 'freelancing rates'
  ],
  home: [
    'home', 'kitchen', 'cooking', 'cleaning', 'laundry', 'stain removal', 'home maintenance',
    'appliance', 'cookware', 'cast iron', 'decluttering', 'sourdough', 'fermentation',
    'food storage', 'cooked rice', 'food safety', 'pantry organization', 'hvac filter',
    'dryer vent', 'pipe insulation', 'winterize', 'fabric care', 'baking protocol',
    'dish care', 'countertop care'
  ],
  life: [
    'life', 'routine', 'morning routine', 'evening routine', 'productivity', 'desk ergonomics',
    'workspace setup', 'digital decluttering', 'time blocking', 'habit stacking', 'clothing care',
    'shoe care', 'seasonal wardrobe storage', 'intentional systems', 'daily protocols',
    'organization system'
  ],
  'tech-ai': [
    'tech', 'ai', 'artificial intelligence', 'prompt', 'prompting', 'automation', 'tool',
    'tools', 'app', 'apps', 'software', 'local llm', 'ollama', 'ai workflow', 'chatgpt',
    'claude', 'vision ai', 'camera ai', 'transcription', 'audio transcription', 'voice to text',
    'get-ai-set', 'smart home', 'document search', 'privacy settings'
  ],
  tools: [
    'calculator', 'finder', 'solver', 'cheat sheet', 'checklist', 'planner', 'selector',
    'decision matrix', 'comparison table', 'formula', 'intake calculator', 'sizing guide',
    'stain solver', 'food calculator', 'care advisor'
  ],
};

/**
 * Infers the closest matching active LifeMode pillar from query keywords.
 */
export function inferPillarFromKeywords(
  text: string,
  defaultPillar: ActivePillarSlug = 'life'
): ActivePillarSlug {
  const lower = text.toLowerCase();

  let bestPillar = defaultPillar;
  let highestScore = 0;

  for (const pillar of ACTIVE_EDITORIAL_PILLARS) {
    const keywords = ACTIVE_PILLAR_KEYWORDS[pillar];
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
 * Generates a unique topic ID using the active pillar.
 */
export function generateTopicId(pillar: PillarSlug, slug: string): string {
  const normPillar = normalizePillar(pillar) || 'life';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `lm-${normPillar}-${dateStr}-${slug.slice(0, 30)}`;
}
