/**
 * Common non-person proper noun prefixes and terms to exclude from person heuristics.
 */
const NON_PERSON_TERMS = new Set([
  'apple tv',
  'delta flight',
  'san jose earthquakes',
  'deepseek',
  'downdetector',
  'fire weather watch',
  'cable tv',
  'laguna beach',
  'army fitness test',
  'pakistan vs england',
  'vaccinations',
  'the azores',
  'japanese minka',
]);

/**
 * Deterministic person-related keyword signals in titles and queries.
 */
const PERSON_QUERY_PATTERNS: RegExp[] = [
  /\bwho is\b/i,
  /\bcareer\b/i,
  /\bbiography\b/i,
  /\bnet worth\b/i,
  /\bstats\b/i,
  /\bcontract\b/i,
  /\bsalary\b/i,
  /\btrade\b/i,
  /\binjury\b/i,
  /\bwife\b/i,
  /\bhusband\b/i,
  /\bactor\b/i,
  /\bactress\b/i,
  /\bplayer\b/i,
  /\bcatcher\b/i,
  /\bpitcher\b/i,
  /\bquarterback\b/i,
  /\bcoach\b/i,
  /\bpolitician\b/i,
  /\bsenator\b/i,
  /\bgovernor\b/i,
  /\bsinger\b/i,
  /\bmusician\b/i,
];

/**
 * Minimum number of credible, verifiable external sources required for any person-related article.
 */
export const PERSON_MIN_REQUIRED_SOURCES = 2;

/**
 * Strict "do not claim" guardrails enforced across all person-related content.
 */
export const PERSON_DO_NOT_CLAIM_GUARDRAILS: string[] = [
  'Do not invent biography details, dates, birthplaces, career history, statistics, records, relationships, family members, achievements, or current status.',
  'Do not fabricate quotes, personal statements, interviews, or private conversations.',
  'Distinguish verified factual information from uncertain, rumored, or developing reporting. If a biographical claim cannot be adequately supported by verified evidence, omit it rather than guessing.',
  'Do not cite AI-generated answers, social media speculation, or self-referential placeholder URLs as authoritative biographical evidence.',
  'All biographical statements must be strictly grounded in the approved, verified external sources.',
];

export interface PersonDetectionInput {
  canonicalTopic?: string;
  title?: string;
  queryVariants?: string[];
  tags?: string[];
  isPerson?: boolean;
  topicId?: string;
}

/**
 * Deterministically identifies whether a topic or article focuses on an identifiable real person.
 */
export function isPersonTopic(input: PersonDetectionInput): boolean {
  if (!input) return false;

  // 1. Explicit flags
  if (input.isPerson === true) return true;

  // 2. Explicit tags
  const tags = (input.tags || []).map((t) => t.toLowerCase().trim());
  if (
    tags.includes('person') ||
    tags.includes('biography') ||
    tags.includes('profile') ||
    tags.includes('athlete') ||
    tags.includes('celebrity') ||
    tags.includes('people')
  ) {
    return true;
  }

  // 3. Known person topic IDs or patterns
  const topicId = (input.topicId || '').toLowerCase();
  if (topicId.includes('jose-trevino') || topicId.includes('eliezer-alfonzo') || topicId.includes('blake-lively')) {
    return true;
  }

  // 4. Candidate text analysis
  const candidateText = (input.canonicalTopic || input.title || '').trim();
  if (!candidateText) return false;

  const lowerText = candidateText.toLowerCase();

  // Exclude known non-person terms
  for (const nonPerson of NON_PERSON_TERMS) {
    if (lowerText.startsWith(nonPerson) || lowerText.includes(nonPerson)) {
      return false;
    }
  }

  // Check query variants for biographical query patterns
  const allVariants = [...(input.queryVariants || []), candidateText];
  for (const variant of allVariants) {
    for (const pattern of PERSON_QUERY_PATTERNS) {
      if (pattern.test(variant)) {
        // Double check it's not a general subject like "career advice"
        if (!/\b(career advice|career path|career tips|how to start a career)\b/i.test(variant)) {
          return true;
        }
      }
    }
  }

const NON_PERSON_CONCEPT_WORDS = new Set([
  'guide', 'modern', 'series', 'watch', 'flight', 'islands', 'habits', 'living',
  'report', 'study', 'model', 'models', 'test', 'review', 'tech', 'architecture',
  'spaces', 'workspaces', 'design', 'minimalist', 'mindful', 'audio', 'coastal',
  'retreats', 'interiors', 'gardens', 'lighting', 'coffee', 'keyboards', 'desk',
  'quantum', 'entanglement', 'computing', 'physics', 'science', 'learning',
  'intelligence', 'network', 'networks', 'system', 'systems', 'memory', 'solitude',
  'focus', 'ritual', 'rituals', 'sleep', 'morning', 'movement', 'walking', 'health',
  'wellness', 'fitness', 'nutrition', 'fasting', 'ergonomics', 'hardware', 'software',
  'acoustics', 'sound', 'photography', 'camera', 'analog', 'digital', 'journaling',
  'tea', 'espresso', 'brewing', 'fermentation', 'recipes', 'cooking', 'dining',
  'travel', 'hotel', 'hotels', 'stays', 'beaches', 'mountains', 'trails', 'resorts',
  'cities', 'culture', 'history', 'trends', 'signal', 'signals', 'zeitgeist',
]);

  // 5. Named-entity heuristic:
  // For canonical topics (concise 2-3 word entity names):
  if (input.canonicalTopic) {
    const cleanCanonical = input.canonicalTopic.trim();
    const words = cleanCanonical.split(/\s+/);
    if (words.length >= 2 && words.length <= 3) {
      const allCapitalized = words.every((w) => /^[A-Z][a-zà-ÿ]+$/i.test(w) && w.length >= 2);
      const hasTopicWord = words.some((w) => NON_PERSON_CONCEPT_WORDS.has(w.toLowerCase()));

      if (allCapitalized && !hasTopicWord) {
        return true;
      }
    }
  }

  // For article titles: check for person-identifying structural framing
  if (input.title) {
    const title = input.title.trim();
    if (/^who\s+is\s+[A-Z]/i.test(title)) {
      return true;
    }
    const colonMatch = title.match(/^([A-Z][a-zà-ÿ]+\s+[A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)?)\s*[:–-]/);
    if (colonMatch) {
      const namePart = colonMatch[1];
      const nameWords = namePart.split(/\s+/);
      const hasTopicWord = nameWords.some((w) => NON_PERSON_CONCEPT_WORDS.has(w.toLowerCase()));
      if (!hasTopicWord) {
        return true;
      }
    }
  }

  return false;
}

export interface PersonTitleContext {
  format?: string;
  primaryIntent?: string;
  queryVariants?: string[];
  topicId?: string;
  seed?: string | number;
}

/**
 * Generates varied, organic, non-repetitive titles for real-person articles.
 * Avoids the fixed "[Name]: What to Know" pattern and dynamically adapts to the topic context.
 */
/**
 * Extracts a clean person name from titles, queries, or topic names.
 */
export function extractPersonName(rawText: string): string {
  if (!rawText) return '';
  let name = rawText
    .replace(/^who\s+is\s+/i, '')
    .replace(/^inside\s+/i, '')
    .replace(/:\s*.*$/i, '')
    .replace(/–\s*.*$/i, '')
    .replace(/-\s*.*$/i, '')
    .replace(/\?.*$/i, '')
    .replace(/’s\s+career.*$/i, '')
    .replace(/'s\s+career.*$/i, '')
    .trim();
  return name || rawText.trim();
}

/**
 * Generates varied, organic, non-repetitive titles for real-person articles.
 * Avoids the fixed "[Name]: What to Know" pattern and dynamically adapts to the topic context.
 */
export function generatePersonTitle(personName: string, context: PersonTitleContext = {}): string {
  const cleanName = extractPersonName(personName);

  // Dynamic template catalog representing diverse editorial angles
  const templates: Array<(name: string) => string> = [
    (n) => `Who Is ${n}? Career, Background and More`,
    (n) => `${n}: Career, Background and Latest Updates`,
    (n) => `${n}: Career Highlights, Background and What to Know`,
    (n) => `Inside ${n}’s Career: Key Milestones and Background`,
    (n) => `${n}: Background, Career Journey and Recent Context`,
    (n) => `Who Is ${n}? Background, Milestones and Latest Overview`,
    (n) => `${n}: Career Record, Background and Key Takeaways`,
  ];

  // Derive a stable pseudo-random index from topicId or personName to guarantee variety across different topics
  const seedString = context.topicId || cleanName;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % templates.length;

  return templates[index](cleanName);
}

export interface PersonImageDirectives {
  promptSnippet: string;
  negativePromptSnippet: string;
  visualTheme: string;
  altText: string;
  isContextual: boolean;
}

/**
 * Generates safe contextual editorial image directives for real-person topics.
 * Strictly prevents prompts requesting a photorealistic AI likeness of the named individual.
 */
export function getPersonImageDirectives(
  personName: string,
  domainOrContext: string = 'lifestyle'
): PersonImageDirectives {
  const cleanName = extractPersonName(personName);
  const lowerContext = (domainOrContext || '').toLowerCase();

  let contextScene = 'An atmospheric, high-end editorial workspace with natural wood, notebooks, and soft morning daylight';
  let visualTheme = 'Contemporary Lifestyle Context';

  if (
    lowerContext.includes('baseball') ||
    lowerContext.includes('catcher') ||
    lowerContext.includes('mlb') ||
    lowerContext.includes('yankees') ||
    lowerContext.includes('sport') ||
    lowerContext.includes('athlete')
  ) {
    contextScene = 'A sunlit baseball diamond during golden hour, catcher equipment and leather glove resting on the dugout bench, stadium atmosphere with warm natural light';
    visualTheme = 'Athletic Discipline & Baseball Heritage';
  } else if (
    lowerContext.includes('music') ||
    lowerContext.includes('singer') ||
    lowerContext.includes('guitar') ||
    lowerContext.includes('jazz') ||
    lowerContext.includes('concert')
  ) {
    contextScene = 'An intimate recording studio setup with vintage acoustic instruments, warm brass task lighting, and sheet music on a wooden stand';
    visualTheme = 'Musical Craft & Studio Atmosphere';
  } else if (
    lowerContext.includes('film') ||
    lowerContext.includes('actor') ||
    lowerContext.includes('actress') ||
    lowerContext.includes('cinema') ||
    lowerContext.includes('hollywood')
  ) {
    contextScene = 'A cinematic film set environment with 35mm film cameras, director chair, and diffused architectural spotlighting';
    visualTheme = 'Cinematic Production & Visual Arts';
  } else if (
    lowerContext.includes('politics') ||
    lowerContext.includes('senator') ||
    lowerContext.includes('governor') ||
    lowerContext.includes('legislative') ||
    lowerContext.includes('public')
  ) {
    contextScene = 'A quiet architectural legislative library with marble columns, open reference volumes, and soft directional daylight';
    visualTheme = 'Public Architecture & Research Library';
  }

  const promptSnippet = `Contextual editorial lifestyle photography representing ${visualTheme.toLowerCase()}. Scene: ${contextScene}. Focus strictly on ambient architecture, domain equipment, and environment. No depiction, portrait, or resemblance of ${cleanName}. No identifiable human facial likeness.`;

  const negativePromptSnippet = `photorealistic likeness of specific real person, portrait of ${cleanName}, facial likeness of ${cleanName}, celebrity face recreation, deepfake likeness, facial cloning, impersonation of real human face, close-up face portrait`;

  const altText = `Contextual editorial photography exploring ${visualTheme.toLowerCase()}`;

  return {
    promptSnippet,
    negativePromptSnippet,
    visualTheme,
    altText,
    isContextual: true,
  };
}
