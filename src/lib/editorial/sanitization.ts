/**
 * Pure, deterministic sanitization utilities for LifeMode editorial content.
 *
 * Ensures internal metadata (Internal Links, Affiliate Intents, Social Hooks, SEO Targets, etc.)
 * is never leaked into reader-facing published article Markdown bodies, while preserving
 * structured metadata for editorial, monetization, and distribution systems.
 */

export interface SanitizedArticleResult {
  cleanContent: string;
  extractedMetadata: {
    internalLinks: string[];
    affiliateIntents: string[];
    socialHooks: string[];
    seoTargets: string[];
    editorialNotes: string[];
  };
  hadLeakedMetadata: boolean;
}

/**
 * Known internal metadata block titles and their corresponding field targets.
 */
const INTERNAL_METADATA_PATTERNS: Array<{
  key: 'internalLinks' | 'affiliateIntents' | 'socialHooks' | 'seoTargets' | 'editorialNotes';
  pattern: RegExp;
}> = [
  {
    key: 'internalLinks',
    pattern: /^(?:#{1,6}\s+|\*{1,2}|_{1,2})?\s*(?:Internal\s+Links?|Internal\s+Link\s+Targets?)\s*(?:\*{1,2}|_{1,2})?:?\s*$/i,
  },
  {
    key: 'affiliateIntents',
    pattern: /^(?:#{1,6}\s+|\*{1,2}|_{1,2})?\s*(?:Affiliate\s+Intents?|Affiliate\s+Categories|Monetization\s+Intents?)\s*(?:\*{1,2}|_{1,2})?:?\s*$/i,
  },
  {
    key: 'socialHooks',
    pattern: /^(?:#{1,6}\s+|\*{1,2}|_{1,2})?\s*(?:Social\s+Hooks?|Social\s+Angles?|Social\s+Copy|Social\s+Snippets?)\s*(?:\*{1,2}|_{1,2})?:?\s*$/i,
  },
  {
    key: 'seoTargets',
    pattern: /^(?:#{1,6}\s+|\*{1,2}|_{1,2})?\s*(?:SEO\s+Targets?|Search\s+Targets?|Target\s+Keywords?|Primary\s+Keyword|Secondary\s+Keywords?)\s*(?:\*{1,2}|_{1,2})?:?\s*$/i,
  },
  {
    key: 'editorialNotes',
    pattern: /^(?:#{1,6}\s+|\*{1,2}|_{1,2})?\s*(?:Editorial\s+Notes?|Review\s+Notes?|Content\s+Instructions?|Outline\s+Planning|Internal\s+Notes?)\s*(?:\*{1,2}|_{1,2})?:?\s*$/i,
  },
];

/**
 * Deterministically strips internal metadata sections from Markdown body text
 * and extracts their items into structured arrays.
 */
export function sanitizeArticleContent(rawContent: string): SanitizedArticleResult {
  if (typeof rawContent !== 'string') {
    return {
      cleanContent: '',
      extractedMetadata: {
        internalLinks: [],
        affiliateIntents: [],
        socialHooks: [],
        seoTargets: [],
        editorialNotes: [],
      },
      hadLeakedMetadata: false,
    };
  }

  const normalized = rawContent.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  const cleanLines: string[] = [];
  const extractedMetadata = {
    internalLinks: [] as string[],
    affiliateIntents: [] as string[],
    socialHooks: [] as string[],
    seoTargets: [] as string[],
    editorialNotes: [] as string[],
  };

  let activeMetadataKey: (typeof INTERNAL_METADATA_PATTERNS)[number]['key'] | null = null;
  let hadLeakedMetadata = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line is an internal metadata section header
    let matchedKey: (typeof INTERNAL_METADATA_PATTERNS)[number]['key'] | null = null;
    for (const { key, pattern } of INTERNAL_METADATA_PATTERNS) {
      if (pattern.test(trimmed)) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey) {
      activeMetadataKey = matchedKey;
      hadLeakedMetadata = true;

      // If the preceding line in cleanLines is a horizontal rule (---, ***, ___), strip it if it was immediately before metadata
      if (cleanLines.length > 0) {
        const lastNonEmptyIndex = findLastNonEmptyLineIndex(cleanLines);
        if (lastNonEmptyIndex !== -1) {
          const lastLineTrimmed = cleanLines[lastNonEmptyIndex].trim();
          if (/^(?:---|---|\*\*\*|___)$/.test(lastLineTrimmed)) {
            // Check if there are other sections before the rule
            cleanLines.splice(lastNonEmptyIndex, cleanLines.length - lastNonEmptyIndex);
          }
        }
      }
      continue;
    }

    // If we are currently inside an active metadata section
    if (activeMetadataKey) {
      // Check if this line starts a new legitimate markdown section (H1, H2, H3, H4) or a Sources section
      if (/^#{1,4}\s+/.test(trimmed) || /^\*\*(?:Sources|References|FAQ|Conclusion|Key\s+Takeaways)\*\*/i.test(trimmed)) {
        activeMetadataKey = null; // Exit metadata mode
        cleanLines.push(line);
        continue;
      }

      // If line is empty, continue
      if (!trimmed) {
        continue;
      }

      // If line is a list item or text under metadata, extract it
      const listItemMatch = trimmed.match(/^(?:[-*+]\s+|\d+\.\s+)?(.*)$/);
      if (listItemMatch && listItemMatch[1].trim()) {
        const cleanItem = listItemMatch[1].trim().replace(/^[`"']|[`"']$/g, '');
        if (cleanItem && !extractedMetadata[activeMetadataKey].includes(cleanItem)) {
          extractedMetadata[activeMetadataKey].push(cleanItem);
        }
      }
      continue;
    }

    cleanLines.push(line);
  }

  // Trim trailing blank lines
  let cleanContent = cleanLines.join('\n').trim();

  // If there's a trailing horizontal rule at the very end of the content with nothing after, remove it
  cleanContent = cleanContent.replace(/\n\s*(?:---|---|\*\*\*|___)\s*$/, '').trim();

  return {
    cleanContent,
    extractedMetadata,
    hadLeakedMetadata,
  };
}

function findLastNonEmptyLineIndex(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Helper to check if a content body contains any leaked internal metadata headers.
 */
export function hasLeakedInternalMetadata(content: string): boolean {
  if (!content) return false;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    for (const { pattern } of INTERNAL_METADATA_PATTERNS) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }
  }
  return false;
}
