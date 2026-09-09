import { resolve, normalize, relative } from 'node:path';
import type { StoredArticle, AstroValidationResult, PillarSlug } from './types.ts';
import { VALID_PILLARS } from '../types.ts';

const UNRESOLVED_PATTERNS = [
  /\[insert\b[^\]]*\]/i,
  /\[todo\b[^\]]*\]/i,
  /\[placeholder\b[^\]]*\]/i,
  /\{\{[^}]+\}\}/,
  /\[draft\b[^\]]*\]/i,
];

/**
 * Validates stored article content against Astro collection specifications and publication requirements.
 */
export function validateAstroArticle(
  article: StoredArticle,
  options?: {
    gitRepoRoot?: string;
    contentRoot?: string;
  }
): AstroValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!article || typeof article !== 'object') {
    return {
      isValid: false,
      errors: ['Article must be a valid non-null object.'],
      warnings: [],
    };
  }

  // 1. Pillar validation
  if (!article.pillar || !VALID_PILLARS.includes(article.pillar as PillarSlug)) {
    errors.push(`Invalid or unsupported pillar "${article.pillar}". Must be one of: ${VALID_PILLARS.join(', ')}`);
  }

  // 2. Slug validation
  if (!article.slug || typeof article.slug !== 'string' || !article.slug.trim()) {
    errors.push('Article slug is required.');
  } else if (article.slug.includes('/') || article.slug.includes('\\') || article.slug.includes('..')) {
    errors.push(`Article slug "${article.slug}" contains path traversal sequences or directory separators.`);
  }

  // 3. File path validation
  if (!article.filePath || typeof article.filePath !== 'string') {
    errors.push('Article file path is required.');
  } else {
    const normalizedFilePath = normalize(resolve(article.filePath));

    if (!normalizedFilePath.endsWith('.md') && !normalizedFilePath.endsWith('.mdx')) {
      errors.push(`Target article file must be a Markdown (.md/.mdx) file, received: "${article.filePath}"`);
    }

    if (options?.gitRepoRoot) {
      const normalizedRepoRoot = normalize(resolve(options.gitRepoRoot));
      const relPath = relative(normalizedRepoRoot, normalizedFilePath);
      if (relPath.startsWith('..') || resolve(normalizedRepoRoot, relPath) !== normalizedFilePath) {
        errors.push(`Target article path "${article.filePath}" is outside the Git repository root "${options.gitRepoRoot}".`);
      }
    }
  }

  // 4. Frontmatter validation
  if (!article.frontmatter || typeof article.frontmatter !== 'object') {
    errors.push('Article frontmatter must be a valid object.');
  } else {
    if (!article.frontmatter.title || !article.frontmatter.title.trim()) {
      errors.push('Article title is required in frontmatter.');
    }

    if (!article.frontmatter.description || !article.frontmatter.description.trim()) {
      errors.push('Article description is required in frontmatter.');
    }

    if (!article.frontmatter.pubDate) {
      errors.push('Article pubDate is required in frontmatter.');
    }

    if (article.frontmatter.lifecycleStatus === 'ARCHIVED') {
      errors.push('Cannot publish an article with "ARCHIVED" lifecycle status.');
    }
  }

  // 5. Content body validation
  if (typeof article.content !== 'string' || !article.content.trim()) {
    errors.push('Article Markdown content body is empty.');
  } else {
    for (const pattern of UNRESOLVED_PATTERNS) {
      if (pattern.test(article.content)) {
        errors.push(`Article content contains unresolved placeholder matching: ${pattern.toString()}`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
