import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';
export type { GuideCategory, GuideData } from './types.ts';
import { slugify } from './drafts.ts';
import { AIRouter } from '../../ai/router.ts';

const GUIDES_DIR = resolve(process.cwd(), 'src', 'content', 'guides');

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

export function formatGuideMarkdown(guide: GuideData, lifecycleStatus: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED', baseFrontmatter: Record<string, any> = {}): string {
  const now = new Date();
  const dateStr = guide.pubDate || baseFrontmatter.pubDate || baseFrontmatter.publishedDate || now.toISOString().slice(0, 10);
  const updatedStr = now.toISOString().slice(0, 10);
  const readingTime = guide.readingTime || baseFrontmatter.readingTime || computeReadingTime(guide.content || '');

  const merged: Record<string, any> = {
    ...baseFrontmatter,
    title: guide.title || baseFrontmatter.title || 'Untitled Guide',
    seoTitle: guide.seoTitle || baseFrontmatter.seoTitle || guide.title || 'Untitled Guide',
    description: guide.description || baseFrontmatter.description || '',
    seoDescription: guide.seoDescription || baseFrontmatter.seoDescription || guide.description || '',
    category: guide.category || baseFrontmatter.category || 'home-maintenance',
    pubDate: dateStr,
    publishedDate: dateStr,
    updatedDate: updatedStr,
    author: guide.author || baseFrontmatter.author || 'LifeMode Editorial',
    tags: guide.tags || baseFrontmatter.tags || [(guide.category || 'home-maintenance').replace(/-/g, ' ')],
    draft: lifecycleStatus === 'DRAFT',
    lifecycleStatus: lifecycleStatus,
    format: baseFrontmatter.format || 'practical-guide',
    primaryIntent: baseFrontmatter.primaryIntent || 'informational',
    contentType: (guide.contentType && ['reference', 'decision', 'protocol', 'explainer'].includes(guide.contentType))
      ? guide.contentType
      : (baseFrontmatter.contentType && ['reference', 'decision', 'protocol', 'explainer'].includes(baseFrontmatter.contentType))
        ? baseFrontmatter.contentType
        : 'protocol',
    readingTime: readingTime,
    readTime: baseFrontmatter.readTime || readingTime,
    quickSummary: guide.quickSummary || baseFrontmatter.quickSummary || guide.description || '',
  };

  if (guide.primaryKeyword || baseFrontmatter.primaryKeyword) {
    merged.primaryKeyword = guide.primaryKeyword || baseFrontmatter.primaryKeyword;
  }

  if (guide.image) {
    merged.image = guide.image;
    merged.imageAlt = guide.imageAlt || baseFrontmatter.imageAlt || guide.title || 'Guide image';
  } else if (guide.image === '') {
    delete merged.image;
    delete merged.imageAlt;
  }

  // Preserve any other custom fields passed in guide object
  for (const [k, v] of Object.entries(guide)) {
    if (!['id', 'slug', 'content', 'title', 'category', 'description', 'seoTitle', 'seoDescription', 'primaryKeyword', 'image', 'imageAlt', 'author', 'tags', 'pubDate', 'updatedDate', 'readingTime', 'quickSummary', 'createdAt', 'updatedAt', 'contentType'].includes(k)) {
      if (v !== undefined) {
        merged[k] = v;
      }
    }
  }

  // Clean undefined values
  const cleanFrontmatter: Record<string, any> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) {
      cleanFrontmatter[k] = v;
    }
  }
  if (!cleanFrontmatter.image) {
    delete cleanFrontmatter.image;
    delete cleanFrontmatter.imageAlt;
  }

  // Strip leading duplicate H1 from markdown body
  let bodyContent = (guide.content || '').trim();
  const cleanTitleForRegex = (guide.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const specificH1Regex = new RegExp(`^#\\s+${cleanTitleForRegex}\\s*\\r?\\n+`, 'i');
  if (specificH1Regex.test(bodyContent)) {
    bodyContent = bodyContent.replace(specificH1Regex, '').trim();
  } else {
    const genericH1Regex = /^#\s+[^\r\n]+\s*\r?\n+/;
    if (genericH1Regex.test(bodyContent)) {
      bodyContent = bodyContent.replace(genericH1Regex, '').trim();
    }
  }

  const yamlStr = yaml.dump(cleanFrontmatter, { lineWidth: -1, noCompatMode: true });
  return `---\n${yamlStr}---\n\n${bodyContent}\n`;
}

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot',
  'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'itself', 'let', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you',
  'your', 'yours', 'yourself', 'yourselves', 'best', 'top', 'guide', 'complete', 'simple', 'easy'
]);

export function parseArticleTitleAndBody(raw: string): { title: string; body: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { title: 'Untitled Guide', body: '' };
  }

  const lines = trimmed.split(/\r?\n/);
  let title = '';
  let headingIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for Markdown H1: # Title
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      title = h1Match[1].replace(/[*_#`]/g, '').trim();
      headingIndex = i;
      break;
    }

    // Fallback: if the first non-empty line has no heading markers but is relatively short (< 120 chars)
    if (!title) {
      title = line.replace(/^[#*_\s]+|[#*_\s]+$/g, '').trim();
      headingIndex = i;
      break;
    }
  }

  if (!title) {
    title = 'Untitled Guide';
  }

  let body = '';
  if (headingIndex >= 0) {
    const remaining = lines.slice(headingIndex + 1).join('\n').trim();
    body = remaining.length > 0 ? remaining : trimmed;
  } else {
    body = trimmed;
  }

  return { title, body };
}

export function generateDeterministicMetadata(title: string, body: string, category: GuideCategory = 'home-maintenance'): {
  slug: string;
  seoTitle: string;
  primaryKeyword: string;
  seoDescription: string;
  readingTime: string;
} {
  const cleanTitle = title.trim() || 'Untitled Guide';
  const slug = slugify(cleanTitle);

  // SEO Title: Clean and under 60 characters
  let seoTitle = cleanTitle;
  if (seoTitle.length <= 48) {
    seoTitle = `${cleanTitle} | LifeMode`;
  } else if (seoTitle.length > 60) {
    seoTitle = seoTitle.slice(0, 57).trim() + '...';
  }

  // Primary Keyword: extract significant words from title
  const words = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  const primaryKeyword = words.slice(0, 4).join(' ') || slug.replace(/-/g, ' ');

  // SEO Description: extract first substantive paragraph from body
  let seoDescription = '';
  const paragraphs = body.split(/\r?\n\r?\n/);
  for (const para of paragraphs) {
    const clean = para.trim().replace(/^#{1,6}\s+/gm, '').replace(/[*_`~[\]]/g, '').replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').trim();
    // Must not be a list item, table row, image, or too short
    if (clean.length >= 25 && !clean.startsWith('-') && !clean.startsWith('*') && !clean.startsWith('|') && !clean.startsWith('1.')) {
      if (clean.length > 155) {
        const sub = clean.slice(0, 152);
        const lastSpace = sub.lastIndexOf(' ');
        seoDescription = (lastSpace > 60 ? sub.slice(0, lastSpace) : sub).trim() + '...';
      } else {
        seoDescription = clean;
      }
      break;
    }
  }

  if (!seoDescription || seoDescription.length < 15) {
    seoDescription = `${cleanTitle}. A comprehensive practical guide with actionable instructions and expert tips.`;
  }

  const readingTime = computeReadingTime(body);

  return {
    slug,
    seoTitle,
    primaryKeyword,
    seoDescription,
    readingTime,
  };
}

export async function processArticleMetadata(rawContent: string, category: GuideCategory = 'home-maintenance'): Promise<{
  title: string;
  slug: string;
  seoTitle: string;
  primaryKeyword: string;
  seoDescription: string;
  readingTime: string;
  cleanBody: string;
  source: 'ai' | 'fallback';
}> {
  const { title, body } = parseArticleTitleAndBody(rawContent);
  const fallback = generateDeterministicMetadata(title, body, category);

  try {
    const router = new AIRouter();
    const prompt = `You are an expert SEO editorial assistant. Analyze this article:
Title: "${title}"
Category: "${category}"
Excerpt: "${body.slice(0, 600)}"

Generate optimal SEO metadata in JSON format:
{
  "seoTitle": "Engaging SERP title strictly under 60 characters",
  "primaryKeyword": "2-4 word high-intent primary keyword",
  "seoDescription": "Engaging meta description between 120 and 155 characters summarizing the guide"
}
Return ONLY valid raw JSON without markdown code fences or extra commentary.`;

    const res = await router.route({
      prompt,
      temperature: 0.2,
      maxOutputTokens: 250,
    });

    if (res.success && res.response?.text) {
      let rawText = res.response.text.trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.seoTitle && parsed.seoDescription) {
          return {
            title,
            slug: fallback.slug,
            seoTitle: String(parsed.seoTitle).trim(),
            primaryKeyword: String(parsed.primaryKeyword || fallback.primaryKeyword).trim(),
            seoDescription: String(parsed.seoDescription).trim(),
            readingTime: fallback.readingTime,
            cleanBody: body,
            source: 'ai',
          };
        }
      }
    }
  } catch (err) {
    // Graceful fallback to deterministic metadata
  }

  return {
    title,
    ...fallback,
    cleanBody: body,
    source: 'fallback',
  };
}

export async function listPublishedGuides(): Promise<Array<{
  slug: string;
  title: string;
  category: GuideCategory;
  pubDate: string;
  description: string;
  filePath: string;
  hasImage: boolean;
}>> {
  try {
    const files = await fs.readdir(GUIDES_DIR);
    const results = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const slug = file.replace(/\.md$/, '');
      const filePath = join(GUIDES_DIR, file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const { frontmatter } = parseMarkdownFile(raw);
        results.push({
          slug,
          title: frontmatter.title || slug,
          category: (frontmatter.category || 'home-maintenance') as GuideCategory,
          pubDate: frontmatter.pubDate || frontmatter.publishedDate || '',
          description: frontmatter.description || '',
          filePath,
          hasImage: Boolean(frontmatter.image),
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

export async function getPublishedGuide(slug: string): Promise<GuideData | null> {
  const filePath = join(GUIDES_DIR, `${slug}.md`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const { frontmatter, content } = parseMarkdownFile(raw);
    return {
      ...frontmatter,
      slug,
      title: frontmatter.title || slug,
      category: (frontmatter.category || 'home-maintenance') as GuideCategory,
      description: frontmatter.description || '',
      seoTitle: frontmatter.seoTitle || '',
      seoDescription: frontmatter.seoDescription || '',
      primaryKeyword: frontmatter.primaryKeyword || '',
      image: frontmatter.image || frontmatter.featuredImage || frontmatter.heroImage || '',
      imageAlt: frontmatter.imageAlt || frontmatter.image_alt || frontmatter.featuredImageAlt || '',
      author: frontmatter.author || 'LifeMode Editorial',
      pubDate: frontmatter.pubDate || frontmatter.publishedDate || '',
      updatedDate: frontmatter.updatedDate || '',
      readingTime: frontmatter.readingTime || '',
      quickSummary: frontmatter.quickSummary || '',
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      content: content.trim(),
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeGuideFile(slug: string, guide: GuideData, lifecycleStatus: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED'): Promise<string> {
  await fs.mkdir(GUIDES_DIR, { recursive: true });
  const filePath = join(GUIDES_DIR, `${slug}.md`);

  let baseFrontmatter: Record<string, any> = {};
  try {
    const existingRaw = await fs.readFile(filePath, 'utf8');
    const parsed = parseMarkdownFile(existingRaw);
    baseFrontmatter = parsed.frontmatter || {};
  } catch {
    // New file, no existing frontmatter
  }

  const markdown = formatGuideMarkdown(guide, lifecycleStatus, baseFrontmatter);
  await fs.writeFile(filePath, markdown, 'utf8');
  return filePath;
}

