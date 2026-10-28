import { normalizeTopicQuery } from './normalization.ts';
import { extractPersonName } from './person-policy.ts';

/**
 * Calculates Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[bn][an];
}

/**
 * Calculates normalized string similarity ratio (0 to 1).
 */
export function stringSimilarity(a: string, b: string): number {
  const cleanA = a.toLowerCase().trim();
  const cleanB = b.toLowerCase().trim();
  if (cleanA === cleanB) return 1.0;

  const maxLen = Math.max(cleanA.length, cleanB.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(cleanA, cleanB);
  return 1.0 - distance / maxLen;
}

/**
 * Calculates Jaccard token similarity (0 to 1) based on word tokens.
 */
export function tokenJaccardSimilarity(a: string, b: string): number {
  const getTokens = (str: string) =>
    new Set(
      str
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

  const tokensA = getTokens(a);
  const tokensB = getTokens(b);

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersectionSize = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {
      intersectionSize++;
    }
  });

  const unionSize = tokensA.size + tokensB.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0.0;
}

/**
 * Generic words that do not establish topic identity on their own. They are
 * removed before comparing normalized topic tokens so that a shared "how to"
 * or "daily guide" phrase is never treated as evidence of duplicate coverage.
 */
const IDENTITY_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from',
  'by', 'with', 'in', 'of', 'into', 'over', 'how', 'what', 'why', 'when', 'where',
  'which', 'who', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does',
  'did', 'can', 'could', 'should', 'would', 'will', 'your', 'you', 'our', 'we',
  'i', 'it', 'its', 'this', 'that', 'these', 'those', 'my', 'me', 'us', 'they',
  'their', 'them', 'he', 'she', 'his', 'her', 'use', 'using', 'used', 'get',
  'getting', 'make', 'making', 'need', 'needs', 'want', 'wants', 'best', 'guide',
  'guides', 'practical', 'everyday', 'daily', 'life', 'work', 'home', 'topic',
  'topics', 'part', 'complete', 'ultimate', 'essential', 'modern', 'new', 'ways',
  'tips', 'methods', 'strategies', 'ideas', 'checklist', 'planner', 'care',
]);

interface TopicIdentityConcept {
  id: string;
  strong: boolean;
  patterns: RegExp[];
}

/**
 * High-signal editorial concepts used to recognize a topic rewrite even when
 * the title, slug, or generated topic ID has changed. Each pattern list is
 * conjunctive: all patterns must match for the concept to be present.
 *
 * Strong concepts are specific enough to establish duplicate coverage on their
 * own. Weaker concepts must be corroborated by at least one other concept.
 */
const TOPIC_IDENTITY_CONCEPTS: TopicIdentityConcept[] = [
  {
    id: 'claude-chatgpt-assistance',
    strong: false,
    patterns: [/\b(?:claude|chatgpt|chat\s*gpt)\b/i],
  },
  {
    id: 'everyday-task-organization',
    strong: false,
    patterns: [/\b(?:organiz(?:e|es|ed|ing|ation)|schedules?|calendars?|task\s+management|workflows?)\b/i],
  },
  {
    id: 'winter-home-preparation',
    strong: true,
    patterns: [
      /\b(?:winter|winteriz(?:e|es|ed|ing|ation)|freeze|frost)\b/i,
      /\b(?:home|house|property|maintenance|inspection|appliance|gutter|draft|pipe|insulat)\w*\b/i,
    ],
  },
  {
    id: 'circadian-light-sleep',
    strong: true,
    patterns: [
      /\b(?:circadian|morning\s+(?:sun|sunlight|light)|sunlight|blue[\s-]*light|light\s+(?:timing|exposure|therapy|management)|melatonin)\b/i,
      /\b(?:sleep|circadian|melatonin|insomnia|recovery)\b/i,
    ],
  },
];

/**
 * Lightweight deterministic stemming for identity tokens. This intentionally
 * handles only common English suffixes so behavior stays predictable.
 */
function stemIdentityToken(token: string): string {
  let stem = token;
  if (stem.length > 5 && stem.endsWith('ies')) return `${stem.slice(0, -3)}y`;
  if (stem.length > 5 && stem.endsWith('ing')) stem = stem.slice(0, -3);
  else if (stem.length > 4 && stem.endsWith('ed')) stem = stem.slice(0, -2);
  else if (stem.length > 4 && stem.endsWith('es')) stem = stem.slice(0, -2);
  else if (stem.length > 3 && stem.endsWith('s')) stem = stem.slice(0, -1);
  if (stem.length > 4 && stem.endsWith('e')) stem = stem.slice(0, -1);
  return stem;
}

/**
 * Builds a normalized identity signature for a topic. The signature combines
 * stemmed content tokens with recognized editorial concepts so that rewrites
 * such as "Organizing everyday tasks with Claude and ChatGPT" and "How
 * Ordinary Users Can Organize Daily Life and Work with Claude and Chatgpt"
 * resolve to the same identity.
 */
export function topicIdentitySignature(text: string): Set<string> {
  const normalized = normalizeTopicQuery(text).normalizedConcept;
  const signature = new Set<string>();

  for (const token of normalized.replace(/[^\w\s]/g, ' ').split(/\s+/)) {
    if (token.length < 3 || IDENTITY_STOPWORDS.has(token)) continue;
    signature.add(stemIdentityToken(token));
  }

  for (const concept of TOPIC_IDENTITY_CONCEPTS) {
    if (concept.patterns.every((pattern) => pattern.test(normalized))) {
      signature.add(`concept:${concept.id}`);
    }
  }

  return signature;
}

function checkIdentityDuplicate(
  candidate: string,
  existing: string
): { isDuplicate: boolean; similarityScore: number } {
  const candidateSignature = topicIdentitySignature(candidate);
  const existingSignature = topicIdentitySignature(existing);

  const sharedConcepts = [...candidateSignature].filter(
    (token) => token.startsWith('concept:') && existingSignature.has(token)
  );
  const hasStrongConcept = sharedConcepts.some((token) => {
    const conceptId = token.slice('concept:'.length);
    return TOPIC_IDENTITY_CONCEPTS.some((concept) => concept.id === conceptId && concept.strong);
  });

  if (hasStrongConcept || sharedConcepts.length >= 2) {
    return { isDuplicate: true, similarityScore: 0.9 };
  }

  // Secondary guard: substantial overlap of stemmed content tokens. This
  // catches paraphrases that are not covered by a named concept while still
  // requiring at least three shared meaningful words.
  const candidateTokens = new Set([...candidateSignature].filter((token) => !token.startsWith('concept:')));
  const existingTokens = new Set([...existingSignature].filter((token) => !token.startsWith('concept:')));
  let intersection = 0;
  for (const token of candidateTokens) {
    if (existingTokens.has(token)) intersection++;
  }

  if (intersection >= 3) {
    const union = candidateTokens.size + existingTokens.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;
    const containment = Math.min(candidateTokens.size, existingTokens.size) > 0
      ? intersection / Math.min(candidateTokens.size, existingTokens.size)
      : 0;
    if (jaccard >= 0.5 || containment >= 0.7) {
      return { isDuplicate: true, similarityScore: Math.max(jaccard, containment) };
    }
  }

  return { isDuplicate: false, similarityScore: 0 };
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedTopic?: string;
  matchedTopicId?: string;
  matchedPillar?: string;
  similarityScore: number;
  reason?: 'EXACT_SLUG' | 'EXACT_TOPIC' | 'CONCEPT_MATCH' | 'TOKEN_SIMILARITY' | 'STRING_SIMILARITY' | 'URL_MATCH' | 'SLUG_PREFIX_MATCH' | 'NAMED_ENTITY_MATCH' | 'TOPIC_PREFIX_MATCH' | 'TOPIC_IDENTITY_MATCH';
}

/**
 * Checks if a candidate topic is a duplicate or near-duplicate of existing topics.
 * Considers exact slug matches, normalized concept similarity, token overlap, and Levenshtein similarity.
 */
export function checkTopicDuplicate(
  candidate: string,
  existingTopics: Array<{ id?: string; canonicalTopic: string; slug?: string; pillar?: string; sourceUrl?: string; sourceSignals?: Array<{ metadata?: any }> }>,
  similarityThreshold = 0.75
): DuplicateCheckResult {
  const candidateNorm = normalizeTopicQuery(candidate);
  const candidateSlug = candidateNorm.canonicalSlug;
  const candidatePerson = extractPersonName(candidate);

  for (const existing of existingTopics) {
    const existingNorm = normalizeTopicQuery(existing.canonicalTopic);
    const existingSlug = existing.slug || existingNorm.canonicalSlug;
    const existingPerson = extractPersonName(existing.canonicalTopic);

    // 1. Exact slug match
    if (candidateSlug === existingSlug) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: 1.0,
        reason: 'EXACT_SLUG',
      };
    }

    // 1b. Slug prefix / sub-slug boundary match (e.g. "alexandra-eala" vs "alexandra-eala-rising-star-of-the-hard-court-swing")
    if (
      candidateSlug.length >= 6 &&
      existingSlug.length >= 6 &&
      (existingSlug.startsWith(`${candidateSlug}-`) || candidateSlug.startsWith(`${existingSlug}-`))
    ) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: 0.95,
        reason: 'SLUG_PREFIX_MATCH',
      };
    }

    // 2. Exact canonical topic match
    if (candidateNorm.canonicalTopic.toLowerCase() === existing.canonicalTopic.toLowerCase()) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: 1.0,
        reason: 'EXACT_TOPIC',
      };
    }

    // 2b. Named entity identity match (e.g. "Alexandra Eala" vs "Alexandra Eala: Rising Star...")
    if (
      candidatePerson &&
      existingPerson &&
      candidatePerson.length >= 4 &&
      existingPerson.length >= 4 &&
      candidatePerson.toLowerCase() === existingPerson.toLowerCase()
    ) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: 0.95,
        reason: 'NAMED_ENTITY_MATCH',
      };
    }

    // 2c. Topic prefix with colon match (e.g. "Name: Subtitle" vs "Name")
    const candidateLower = candidateNorm.canonicalTopic.toLowerCase();
    const existingLower = existing.canonicalTopic.toLowerCase();
    if (
      existingLower.startsWith(`${candidateLower}:`) ||
      existingLower.startsWith(`${candidateLower} -`) ||
      existingLower.startsWith(`${candidateLower} –`) ||
      candidateLower.startsWith(`${existingLower}:`) ||
      candidateLower.startsWith(`${existingLower} -`) ||
      candidateLower.startsWith(`${existingLower} –`)
    ) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: 0.92,
        reason: 'TOPIC_PREFIX_MATCH',
      };
    }

    // 3. Normalized concept equality (synonym/stem normalized)
    if (candidateNorm.normalizedConcept === existingNorm.normalizedConcept) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: 0.95,
        reason: 'CONCEPT_MATCH',
      };
    }

    // 4. Token Jaccard similarity
    const jaccard = tokenJaccardSimilarity(candidate, existing.canonicalTopic);
    if (jaccard >= similarityThreshold) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: jaccard,
        reason: 'TOKEN_SIMILARITY',
      };
    }

    // 5. String Levenshtein ratio
    const strSim = stringSimilarity(candidate, existing.canonicalTopic);
    if (strSim >= similarityThreshold) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: strSim,
        reason: 'STRING_SIMILARITY',
      };
    }

    // 6. Normalized topic identity (concepts + stemmed content tokens). This
    // catches rewrites that change the title, slug, and generated ID while
    // describing the same underlying topic.
    const identity = checkIdentityDuplicate(candidate, existing.canonicalTopic);
    if (identity.isDuplicate) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        matchedTopicId: existing.id,
        matchedPillar: existing.pillar,
        similarityScore: identity.similarityScore,
        reason: 'TOPIC_IDENTITY_MATCH',
      };
    }
  }

  return {
    isDuplicate: false,
    similarityScore: 0,
  };
}

/**
 * Checks if a source URL is already present in existing topics.
 */
export function checkSourceUrlDuplicate(
  sourceUrl: string,
  existingTopics: Array<{ sourceSignals?: Array<{ metadata?: any }> }>
): boolean {
  if (!sourceUrl) return false;
  const cleanUrl = sourceUrl.trim().toLowerCase().replace(/\/+$/, '');

  for (const topic of existingTopics) {
    if (topic.sourceSignals) {
      for (const sig of topic.sourceSignals) {
        const sigUrl = sig.metadata?.sourceUrl || sig.metadata?.rssPayload?.itemLink;
        if (sigUrl && typeof sigUrl === 'string') {
          if (sigUrl.trim().toLowerCase().replace(/\/+$/, '') === cleanUrl) {
            return true;
          }
        }
      }
    }
  }

  return false;
}
