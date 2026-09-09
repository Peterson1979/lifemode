import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type {
  IContentRepository,
  StoredArticle,
  StoredArticleInput,
  StorageResult,
  PillarSlug,
  StoredArticleFrontmatter,
} from './types.ts';
import { resolveSafeArticlePath, validatePillar } from './path-security.ts';
import { serializeArticle, parseArticle } from './serializer.ts';
import { VALID_PILLARS } from '../types.ts';

export interface FilesystemContentRepositoryOptions {
  contentRoot: string;
}

/**
 * Filesystem-backed repository for storing and managing LifeMode articles
 * in canonical `src/content/<pillar>/<slug>.md` Markdown files.
 */
export class FilesystemContentRepository implements IContentRepository {
  private readonly contentRoot: string;

  constructor(options: FilesystemContentRepositoryOptions) {
    if (!options?.contentRoot) {
      throw new Error('Content root is required for FilesystemContentRepository.');
    }
    this.contentRoot = options.contentRoot;
  }

  /**
   * Creates and persists a new article.
   * Fails if an article already exists at the target path (duplicate protection).
   */
  async create(article: StoredArticleInput): Promise<StorageResult> {
    const timestamp = new Date().toISOString();

    try {
      if (!article.frontmatter?.title || typeof article.frontmatter.title !== 'string' || !article.frontmatter.title.trim()) {
        return {
          status: 'INVALID',
          operation: 'create',
          timestamp,
          error: {
            code: 'INVALID_TITLE',
            message: 'Article title is required and must be a non-empty string.',
          },
        };
      }

      if (!article.frontmatter?.description || typeof article.frontmatter.description !== 'string' || !article.frontmatter.description.trim()) {
        return {
          status: 'INVALID',
          operation: 'create',
          timestamp,
          error: {
            code: 'INVALID_DESCRIPTION',
            message: 'Article description is required and must be a non-empty string.',
          },
        };
      }

      const { safePath, pillar, slug } = resolveSafeArticlePath(
        this.contentRoot,
        article.pillar,
        article.slug
      );

      const articleId = `${pillar}/${slug}`;

      // Check if file already exists
      const fileExists = await this.fileExists(safePath);
      if (fileExists) {
        return {
          status: 'EXISTS',
          articleId,
          path: safePath,
          slug,
          pillar,
          operation: 'create',
          timestamp,
          error: {
            code: 'ARTICLE_EXISTS',
            message: `Article already exists at destination path: ${articleId}`,
          },
        };
      }

      const todayDate = timestamp.split('T')[0];

      const frontmatter: StoredArticleFrontmatter = {
        title: article.frontmatter.title.trim(),
        description: article.frontmatter.description.trim(),
        pubDate: article.frontmatter.pubDate || todayDate,
        updatedDate: article.frontmatter.updatedDate,
        author: article.frontmatter.author || 'LifeMode Editorial',
        tags: Array.isArray(article.frontmatter.tags) ? [...article.frontmatter.tags] : [],
        featured: Boolean(article.frontmatter.featured),
        draft: Boolean(article.frontmatter.draft),
        format: article.frontmatter.format || 'standard',
        topicId: article.topicId || article.frontmatter.topicId,
        audience: article.frontmatter.audience,
        primaryIntent: article.frontmatter.primaryIntent || 'informational',
        secondaryIntent: article.frontmatter.secondaryIntent,
        affiliateIntent: Boolean(article.frontmatter.affiliateIntent),
        riskLevel: article.frontmatter.riskLevel || 'low',
        sources: Array.isArray(article.frontmatter.sources)
          ? article.frontmatter.sources.map((s) => ({ name: s.name, url: s.url || '' }))
          : [],
        image: article.frontmatter.image,
        readingTime: article.frontmatter.readingTime,
        version: 1,
        lifecycleStatus: article.frontmatter.lifecycleStatus || 'STORED',
      };

      const rawMarkdown = serializeArticle({
        frontmatter,
        content: article.content || '',
      });

      // Ensure pillar directory exists
      await fs.mkdir(dirname(safePath), { recursive: true });

      // Write content safely
      await fs.writeFile(safePath, rawMarkdown, 'utf-8');

      const storedArticle: StoredArticle = {
        identity: {
          topicId: frontmatter.topicId,
          slug,
          pillar,
        },
        pillar,
        slug,
        frontmatter,
        content: (article.content || '').trim(),
        filePath: safePath,
      };

      return {
        status: 'STORED',
        articleId,
        path: safePath,
        slug,
        pillar,
        operation: 'create',
        timestamp,
        version: 1,
        article: storedArticle,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        operation: 'create',
        timestamp,
        error: {
          code: 'STORAGE_ERROR',
          message: err?.message || 'Unknown storage error occurred during create.',
        },
      };
    }
  }

  /**
   * Updates an existing stored article and increments its version.
   * Fails if the article does not exist.
   */
  async update(article: StoredArticleInput): Promise<StorageResult> {
    const timestamp = new Date().toISOString();

    try {
      const { safePath, pillar, slug } = resolveSafeArticlePath(
        this.contentRoot,
        article.pillar,
        article.slug
      );

      const articleId = `${pillar}/${slug}`;

      // Check if file exists
      const fileExists = await this.fileExists(safePath);
      if (!fileExists) {
        return {
          status: 'NOT_FOUND',
          articleId,
          path: safePath,
          slug,
          pillar,
          operation: 'update',
          timestamp,
          error: {
            code: 'NOT_FOUND',
            message: `Article not found at destination path: ${articleId}`,
          },
        };
      }

      // Read existing article to retrieve previous version and metadata
      const existingRaw = await fs.readFile(safePath, 'utf-8');
      const existingArticle = parseArticle(existingRaw, pillar, slug, safePath);

      const nextVersion = (existingArticle.frontmatter.version || 1) + 1;
      const todayDate = timestamp.split('T')[0];

      const frontmatter: StoredArticleFrontmatter = {
        title: (article.frontmatter.title || existingArticle.frontmatter.title).trim(),
        description: (article.frontmatter.description || existingArticle.frontmatter.description).trim(),
        pubDate: article.frontmatter.pubDate || existingArticle.frontmatter.pubDate,
        updatedDate: article.frontmatter.updatedDate || todayDate,
        author: article.frontmatter.author || existingArticle.frontmatter.author,
        tags: Array.isArray(article.frontmatter.tags)
          ? [...article.frontmatter.tags]
          : existingArticle.frontmatter.tags,
        featured: article.frontmatter.featured !== undefined
          ? Boolean(article.frontmatter.featured)
          : existingArticle.frontmatter.featured,
        draft: article.frontmatter.draft !== undefined
          ? Boolean(article.frontmatter.draft)
          : existingArticle.frontmatter.draft,
        format: article.frontmatter.format || existingArticle.frontmatter.format,
        topicId: article.topicId || article.frontmatter.topicId || existingArticle.frontmatter.topicId,
        audience: article.frontmatter.audience || existingArticle.frontmatter.audience,
        primaryIntent: article.frontmatter.primaryIntent || existingArticle.frontmatter.primaryIntent,
        secondaryIntent: article.frontmatter.secondaryIntent || existingArticle.frontmatter.secondaryIntent,
        affiliateIntent: article.frontmatter.affiliateIntent !== undefined
          ? Boolean(article.frontmatter.affiliateIntent)
          : existingArticle.frontmatter.affiliateIntent,
        riskLevel: article.frontmatter.riskLevel || existingArticle.frontmatter.riskLevel,
        sources: Array.isArray(article.frontmatter.sources)
          ? article.frontmatter.sources.map((s) => ({ name: s.name, url: s.url || '' }))
          : existingArticle.frontmatter.sources,
        image: article.frontmatter.image || existingArticle.frontmatter.image,
        readingTime: article.frontmatter.readingTime || existingArticle.frontmatter.readingTime,
        version: nextVersion,
        lifecycleStatus: article.frontmatter.lifecycleStatus || existingArticle.frontmatter.lifecycleStatus || 'STORED',
      };

      const content = article.content !== undefined ? article.content : existingArticle.content;

      const rawMarkdown = serializeArticle({
        frontmatter,
        content,
      });

      await fs.writeFile(safePath, rawMarkdown, 'utf-8');

      const updatedArticle: StoredArticle = {
        identity: {
          topicId: frontmatter.topicId,
          slug,
          pillar,
        },
        pillar,
        slug,
        frontmatter,
        content: content.trim(),
        filePath: safePath,
      };

      return {
        status: 'UPDATED',
        articleId,
        path: safePath,
        slug,
        pillar,
        operation: 'update',
        timestamp,
        version: nextVersion,
        article: updatedArticle,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        operation: 'update',
        timestamp,
        error: {
          code: 'STORAGE_ERROR',
          message: err?.message || 'Unknown storage error occurred during update.',
        },
      };
    }
  }

  /**
   * Retrieves a single stored article by pillar and slug.
   */
  async get(pillar: PillarSlug, slug: string): Promise<StoredArticle | null> {
    try {
      const { safePath, pillar: validPillar, slug: validSlug } = resolveSafeArticlePath(
        this.contentRoot,
        pillar,
        slug
      );

      const exists = await this.fileExists(safePath);
      if (!exists) {
        return null;
      }

      const rawContent = await fs.readFile(safePath, 'utf-8');
      return parseArticle(rawContent, validPillar, validSlug, safePath);
    } catch {
      return null;
    }
  }

  /**
   * Checks whether an article exists in storage.
   */
  async exists(pillar: PillarSlug, slug: string): Promise<boolean> {
    try {
      const { safePath } = resolveSafeArticlePath(this.contentRoot, pillar, slug);
      return await this.fileExists(safePath);
    } catch {
      return false;
    }
  }

  /**
   * Lists stored articles, optionally filtered by pillar.
   */
  async list(pillar?: PillarSlug): Promise<StoredArticle[]> {
    const pillarsToScan: PillarSlug[] = pillar ? [validatePillar(pillar)] : [...VALID_PILLARS];
    const articles: StoredArticle[] = [];

    for (const p of pillarsToScan) {
      const pillarDir = resolveSafeArticlePath(this.contentRoot, p, 'index').safePath.replace(/index\.md$/, '');

      try {
        const files = await fs.readdir(pillarDir);
        for (const file of files) {
          if (!file.endsWith('.md') && !file.endsWith('.mdx')) {
            continue;
          }

          const slug = file.replace(/\.(md|mdx)$/, '');
          try {
            const article = await this.get(p, slug);
            if (article) {
              articles.push(article);
            }
          } catch {
            // Ignore unparseable or temporary files in listing
          }
        }
      } catch {
        // Directory may not exist yet, treat as empty
      }
    }

    // Deterministic sort: by pubDate desc, then slug asc
    return articles.sort((a, b) => {
      const dateA = new Date(a.frontmatter.pubDate).getTime() || 0;
      const dateB = new Date(b.frontmatter.pubDate).getTime() || 0;
      if (dateB !== dateA) return dateB - dateA;
      return a.slug.localeCompare(b.slug);
    });
  }

  /**
   * Removes an article from storage.
   */
  async remove(pillar: PillarSlug, slug: string): Promise<StorageResult> {
    const timestamp = new Date().toISOString();

    try {
      const { safePath, pillar: validPillar, slug: validSlug } = resolveSafeArticlePath(
        this.contentRoot,
        pillar,
        slug
      );

      const articleId = `${validPillar}/${validSlug}`;

      const exists = await this.fileExists(safePath);
      if (!exists) {
        return {
          status: 'NOT_FOUND',
          articleId,
          path: safePath,
          slug: validSlug,
          pillar: validPillar,
          operation: 'remove',
          timestamp,
          error: {
            code: 'NOT_FOUND',
            message: `Article not found at path: ${articleId}`,
          },
        };
      }

      await fs.unlink(safePath);

      return {
        status: 'REMOVED',
        articleId,
        path: safePath,
        slug: validSlug,
        pillar: validPillar,
        operation: 'remove',
        timestamp,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        operation: 'remove',
        timestamp,
        error: {
          code: 'STORAGE_ERROR',
          message: err?.message || 'Unknown error occurred during remove.',
        },
      };
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}
