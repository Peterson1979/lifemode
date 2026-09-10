import { normalizeTopicQuery } from './normalization.ts';

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

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedTopic?: string;
  matchedTopicId?: string;
  matchedPillar?: string;
  similarityScore: number;
  reason?: 'EXACT_SLUG' | 'EXACT_TOPIC' | 'CONCEPT_MATCH' | 'TOKEN_SIMILARITY' | 'STRING_SIMILARITY' | 'URL_MATCH';
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

  for (const existing of existingTopics) {
    const existingNorm = normalizeTopicQuery(existing.canonicalTopic);
    const existingSlug = existing.slug || existingNorm.canonicalSlug;

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
