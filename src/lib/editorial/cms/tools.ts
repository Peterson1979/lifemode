import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';
import type { ToolCategory, ToolType, ToolData } from './types.ts';

const TOOLS_DIR = resolve(process.cwd(), 'src', 'content', 'tools');

export function parseToolMarkdown(raw: string): { frontmatter: Record<string, any>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: raw };
  }
  try {
    const frontmatter = (yaml.load(match[1]) as Record<string, any>) || {};
    return { frontmatter, content: match[2] || '' };
  } catch {
    return { frontmatter: {}, content: match[2] || '' };
  }
}

export function formatToolMarkdown(tool: ToolData): string {
  const frontmatter: Record<string, any> = {
    title: tool.title.trim(),
  };

  if (tool.seoTitle && tool.seoTitle.trim()) {
    frontmatter.seoTitle = tool.seoTitle.trim();
  }
  if (tool.seoDescription && tool.seoDescription.trim()) {
    frontmatter.seoDescription = tool.seoDescription.trim();
  }

  frontmatter.category = tool.category;
  frontmatter.toolType = tool.toolType;
  frontmatter.summary = tool.summary.trim();

  if (tool.badge && tool.badge.trim()) {
    frontmatter.badge = tool.badge.trim();
  }
  if (tool.instructions && tool.instructions.trim()) {
    frontmatter.instructions = tool.instructions.trim();
  }
  if (Array.isArray(tool.relatedGuides) && tool.relatedGuides.length > 0) {
    frontmatter.relatedGuides = tool.relatedGuides;
  }
  if (Array.isArray(tool.relatedChecklists) && tool.relatedChecklists.length > 0) {
    frontmatter.relatedChecklists = tool.relatedChecklists;
  }
  if (Array.isArray(tool.relatedVideos) && tool.relatedVideos.length > 0) {
    frontmatter.relatedVideos = tool.relatedVideos;
  }

  const yamlBlock = yaml.dump(frontmatter, { lineWidth: -1, quotingType: '"', forceQuotes: false }).trim();

  return `---\n${yamlBlock}\n---\n\n${(tool.content || '').trim()}\n`;
}

export async function listPublishedTools(): Promise<Array<{
  slug: string;
  title: string;
  category: ToolCategory;
  toolType: ToolType;
  summary: string;
  badge?: string;
  filePath: string;
  relatedGuidesCount: number;
}>> {
  try {
    const files = await fs.readdir(TOOLS_DIR);
    const results = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const slug = file.replace(/\.md$/, '');
      const filePath = join(TOOLS_DIR, file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const { frontmatter } = parseToolMarkdown(raw);
        results.push({
          slug,
          title: frontmatter.title || slug,
          category: (frontmatter.category || 'food-kitchen') as ToolCategory,
          toolType: (frontmatter.toolType || 'cookware-selector') as ToolType,
          summary: frontmatter.summary || '',
          badge: frontmatter.badge,
          filePath,
          relatedGuidesCount: Array.isArray(frontmatter.relatedGuides) ? frontmatter.relatedGuides.length : 0,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return results.sort((a, b) => a.title.localeCompare(b.title));
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function getPublishedTool(slug: string): Promise<ToolData | null> {
  const filePath = join(TOOLS_DIR, `${slug}.md`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const { frontmatter, content } = parseToolMarkdown(raw);
    return {
      slug,
      title: frontmatter.title || slug,
      seoTitle: frontmatter.seoTitle || '',
      seoDescription: frontmatter.seoDescription || '',
      category: frontmatter.category as ToolCategory,
      toolType: frontmatter.toolType as ToolType,
      summary: frontmatter.summary || '',
      badge: frontmatter.badge || '',
      instructions: frontmatter.instructions || '',
      relatedChecklists: Array.isArray(frontmatter.relatedChecklists) ? frontmatter.relatedChecklists : [],
      relatedGuides: Array.isArray(frontmatter.relatedGuides) ? frontmatter.relatedGuides : [],
      relatedVideos: Array.isArray(frontmatter.relatedVideos) ? frontmatter.relatedVideos : [],
      content: content.trim(),
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeToolFile(slug: string, tool: ToolData): Promise<string> {
  await fs.mkdir(TOOLS_DIR, { recursive: true });
  const filePath = join(TOOLS_DIR, `${slug}.md`);
  const markdown = formatToolMarkdown(tool);
  await fs.writeFile(filePath, markdown, 'utf8');
  return filePath;
}

