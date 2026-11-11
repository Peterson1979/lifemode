import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import type { GuideCategory, GuideData } from './types.ts';

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
  const frontmatter: Record<string, any> = {};

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

  return { frontmatter, content };
}

export function formatGuideMarkdown(guide: GuideData, lifecycleStatus: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED'): string {
  const now = new Date();
  const dateStr = guide.pubDate || now.toISOString().slice(0, 10);
  const updatedStr = now.toISOString().slice(0, 10);
  const readingTime = guide.readingTime || computeReadingTime(guide.content);
  const quote = (val: string) => JSON.stringify(val ?? '');

  const lines: string[] = [
    '---',
    `title: ${quote(guide.title)}`,
    `seoTitle: ${quote(guide.seoTitle || guide.title)}`,
    `description: ${quote(guide.description)}`,
    `seoDescription: ${quote(guide.seoDescription || guide.description)}`,
    `category: ${quote(guide.category)}`,
    `pubDate: ${quote(dateStr)}`,
    `publishedDate: ${quote(dateStr)}`,
    `updatedDate: ${quote(updatedStr)}`,
    `author: ${quote(guide.author || 'LifeMode Editorial')}`,
    `tags: ${JSON.stringify(guide.tags || [guide.category.replace(/-/g, ' ')])}`,
    `draft: ${lifecycleStatus === 'DRAFT'}`,
    `lifecycleStatus: ${quote(lifecycleStatus)}`,
    'format: "practical-guide"',
    'primaryIntent: "informational"',
    'contentType: "protocol"',
    `readingTime: ${quote(readingTime)}`,
    `readTime: ${quote(readingTime)}`,
    `quickSummary: ${quote(guide.quickSummary || guide.description)}`,
  ];

  if (guide.primaryKeyword) {
    lines.push(`primaryKeyword: ${quote(guide.primaryKeyword)}`);
  }
  if (guide.image) {
    lines.push(`image: ${quote(guide.image)}`);
    if (guide.imageAlt) {
      lines.push(`imageAlt: ${quote(guide.imageAlt)}`);
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(guide.content.trim());
  lines.push('');

  return lines.join('\n');
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
      slug,
      title: frontmatter.title || slug,
      category: (frontmatter.category || 'home-maintenance') as GuideCategory,
      description: frontmatter.description || '',
      seoTitle: frontmatter.seoTitle || '',
      seoDescription: frontmatter.seoDescription || '',
      primaryKeyword: frontmatter.primaryKeyword || '',
      image: frontmatter.image || '',
      imageAlt: frontmatter.imageAlt || '',
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
  const markdown = formatGuideMarkdown(guide, lifecycleStatus);
  await fs.writeFile(filePath, markdown, 'utf8');
  return filePath;
}

