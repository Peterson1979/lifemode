import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';
import type { PicksArticleData } from './types.ts';
import { normalizePicksCategories } from '../../../utils/picks-categories.ts';

const PICKS_DIR = resolve(process.cwd(), 'src', 'content', 'picks');

export function computeReadingTime(content: string): string {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
}

export function parseMarkdownFile(raw: string): { frontmatter: Record<string, any>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: raw };
  }
  const yamlBlock = match[1];
  const content = match[2];
  let frontmatter: Record<string, any> = {};

  try {
    const parsed = yaml.load(yamlBlock);
    if (parsed && typeof parsed === 'object') {
      frontmatter = parsed as Record<string, any>;
    }
  } catch {
    for (const line of yamlBlock.split(/\r?\n/)) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;
      const key = line.slice(0, colonIndex).trim();
      let val = line.slice(colonIndex + 1).trim();

      if (val.startsWith('"') && val.endsWith('"')) {
        try {
          val = JSON.parse(val);
        } catch {
          val = val.slice(1, -1);
        }
      } else if (val.startsWith('[') && val.endsWith(']')) {
        try {
          val = JSON.parse(val);
        } catch {
          val = [];
        }
      } else if (val === 'true') {
        val = true as any;
      } else if (val === 'false') {
        val = false as any;
      }
      frontmatter[key] = val;
    }
  }

  return { frontmatter, content };
}

export function formatPicksArticleMarkdown(
  article: PicksArticleData,
  lifecycleStatus: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
  baseFrontmatter: Record<string, any> = {}
): string {
  const now = new Date();
  const dateStr = article.pubDate || baseFrontmatter.pubDate || now.toISOString().slice(0, 10);
  const updatedStr = now.toISOString().slice(0, 10);
  const readingTime = article.readingTime || baseFrontmatter.readingTime || computeReadingTime(article.content || '');

  const categories = normalizePicksCategories(
    article.categories || baseFrontmatter.categories || (article.category ? [article.category] : ['home-living'])
  );

  const merged: Record<string, any> = {
    ...baseFrontmatter,
    title: article.title || baseFrontmatter.title || 'Untitled Picks Article',
    description: article.description || baseFrontmatter.description || '',
    seoTitle: article.seoTitle || baseFrontmatter.seoTitle || article.title || 'Untitled Picks Article',
    seoDescription: article.seoDescription || baseFrontmatter.seoDescription || article.description || '',
    categories: categories.length > 0 ? categories : ['home-living'],
    pubDate: dateStr,
    updatedDate: updatedStr,
    author: article.author || baseFrontmatter.author || 'LifeMode Editorial',
    tags: Array.isArray(article.tags) ? article.tags : baseFrontmatter.tags || categories,
    draft: lifecycleStatus === 'DRAFT',
    readingTime: readingTime,
  };

  if (article.image) {
    merged.image = article.image;
    merged.imageAlt = article.imageAlt || baseFrontmatter.imageAlt || article.title || 'Picks image';
  } else if (article.image === '') {
    delete merged.image;
    delete merged.imageAlt;
  }

  if (article.affiliateProducts && article.affiliateProducts.length > 0) {
    merged.affiliateProducts = article.affiliateProducts;
  } else if (baseFrontmatter.affiliateProducts) {
    merged.affiliateProducts = baseFrontmatter.affiliateProducts;
  }

  if (article.affiliateDisclosure) {
    merged.affiliateDisclosure = article.affiliateDisclosure;
  }

  // Preserve other custom fields
  for (const [k, v] of Object.entries(article)) {
    if (!['id', 'slug', 'content', 'title', 'categories', 'category', 'description', 'seoTitle', 'seoDescription', 'image', 'imageAlt', 'author', 'tags', 'pubDate', 'updatedDate', 'readingTime', 'createdAt', 'updatedAt', 'draft', 'affiliateProducts', 'affiliateDisclosure'].includes(k)) {
      if (v !== undefined) {
        merged[k] = v;
      }
    }
  }

  // Strip leading duplicate H1 from markdown body
  let bodyContent = (article.content || '').trim();
  const cleanTitleForRegex = (article.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const specificH1Regex = new RegExp(`^#\\s+${cleanTitleForRegex}\\s*\\r?\\n+`, 'i');
  if (specificH1Regex.test(bodyContent)) {
    bodyContent = bodyContent.replace(specificH1Regex, '').trim();
  } else {
    const genericH1Regex = /^#\s+[^\r\n]+\s*\r?\n+/;
    if (genericH1Regex.test(bodyContent)) {
      bodyContent = bodyContent.replace(genericH1Regex, '').trim();
    }
  }

  const yamlStr = yaml.dump(merged, { lineWidth: -1, noCompatMode: true });
  return `---\n${yamlStr}---\n\n${bodyContent}\n`;
}

export async function listPublishedPicksArticles(): Promise<Array<{
  slug: string;
  title: string;
  categories: string[];
  pubDate: string;
  description: string;
  filePath: string;
  hasImage: boolean;
  draft: boolean;
}>> {
  try {
    const files = await fs.readdir(PICKS_DIR);
    const results = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const slug = file.replace(/\.md$/, '');
      const filePath = join(PICKS_DIR, file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const { frontmatter } = parseMarkdownFile(raw);
        results.push({
          slug,
          title: frontmatter.title || slug,
          categories: Array.isArray(frontmatter.categories) ? frontmatter.categories : (frontmatter.category ? [frontmatter.category] : []),
          pubDate: frontmatter.pubDate || frontmatter.publishedDate || '',
          description: frontmatter.description || '',
          filePath,
          hasImage: Boolean(frontmatter.image),
          draft: frontmatter.draft === true,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return results.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function getPublishedPicksArticle(slug: string): Promise<PicksArticleData | null> {
  const filePath = join(PICKS_DIR, `${slug}.md`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const { frontmatter, content } = parseMarkdownFile(raw);
    return {
      ...frontmatter,
      slug,
      title: frontmatter.title || slug,
      categories: Array.isArray(frontmatter.categories) ? frontmatter.categories : (frontmatter.category ? [frontmatter.category] : []),
      description: frontmatter.description || '',
      seoTitle: frontmatter.seoTitle || '',
      seoDescription: frontmatter.seoDescription || '',
      image: frontmatter.image || '',
      imageAlt: frontmatter.imageAlt || '',
      author: frontmatter.author || 'LifeMode Editorial',
      pubDate: frontmatter.pubDate || '',
      updatedDate: frontmatter.updatedDate || '',
      readingTime: frontmatter.readingTime || '',
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      affiliateProducts: Array.isArray(frontmatter.affiliateProducts) ? frontmatter.affiliateProducts : [],
      affiliateDisclosure: frontmatter.affiliateDisclosure || '',
      draft: frontmatter.draft === true,
      content: content.trim(),
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writePicksArticleFile(
  slug: string,
  article: PicksArticleData,
  lifecycleStatus: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED'
): Promise<string> {
  await fs.mkdir(PICKS_DIR, { recursive: true });
  const filePath = join(PICKS_DIR, `${slug}.md`);

  let baseFrontmatter: Record<string, any> = {};
  try {
    const existingRaw = await fs.readFile(filePath, 'utf8');
    const parsed = parseMarkdownFile(existingRaw);
    baseFrontmatter = parsed.frontmatter || {};
  } catch {
    // New file
  }

  const markdown = formatPicksArticleMarkdown(article, lifecycleStatus, baseFrontmatter);
  await fs.writeFile(filePath, markdown, 'utf8');
  return filePath;
}

export async function deletePublishedPicksArticle(slug: string): Promise<boolean> {
  const filePath = join(PICKS_DIR, `${slug}.md`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

