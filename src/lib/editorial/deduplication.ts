import { slugify } from './normalization.ts';

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
 * Checks if a candidate topic is a duplicate or near-duplicate of existing topics.
 * Considers both exact slug matches, character similarity, and token overlap.
 */
export function checkTopicDuplicate(
  candidate: string,
  existingTopics: Array<{ id?: string; canonicalTopic: string; slug?: string }>,
  similarityThreshold = 0.75
): { isDuplicate: boolean; matchedTopic?: string; similarityScore: number } {
  const candidateSlug = slugify(candidate);

  for (const existing of existingTopics) {
    const existingSlug = existing.slug || slugify(existing.canonicalTopic);

    // Exact slug match
    if (candidateSlug === existingSlug) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        similarityScore: 1.0,
      };
    }

    // Token Jaccard similarity
    const jaccard = tokenJaccardSimilarity(candidate, existing.canonicalTopic);
    if (jaccard >= similarityThreshold) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        similarityScore: jaccard,
      };
    }

    // String Levenshtein ratio
    const strSim = stringSimilarity(candidate, existing.canonicalTopic);
    if (strSim >= similarityThreshold) {
      return {
        isDuplicate: true,
        matchedTopic: existing.canonicalTopic,
        similarityScore: strSim,
      };
    }
  }

  return {
    isDuplicate: false,
    similarityScore: 0,
  };
}
