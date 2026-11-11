import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';
import { renderMarkdownToHtml } from '../../../utils/markdown-renderer.ts';
import type { ChecklistCategory, ChecklistSection, ChecklistData } from './types.ts';

const CHECKLISTS_DIR = resolve(process.cwd(), 'src', 'content', 'checklists');

export function parseChecklistMarkdown(raw: string): { frontmatter: Record<string, any>; content: string } {
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

export function formatChecklistMarkdown(checklist: ChecklistData): string {
  const frontmatter: Record<string, any> = {
    title: checklist.title.trim(),
  };

  if (checklist.seoTitle && checklist.seoTitle.trim()) {
    frontmatter.seoTitle = checklist.seoTitle.trim();
  }
  if (checklist.seoDescription && checklist.seoDescription.trim()) {
    frontmatter.seoDescription = checklist.seoDescription.trim();
  }

  frontmatter.category = checklist.category;
  frontmatter.summary = checklist.summary.trim();

  if (checklist.estimatedTime && checklist.estimatedTime.trim()) {
    frontmatter.estimatedTime = checklist.estimatedTime.trim();
  }
  if (checklist.printSubtitle && checklist.printSubtitle.trim()) {
    frontmatter.printSubtitle = checklist.printSubtitle.trim();
  }

  // Sanitize sections
  frontmatter.sections = (checklist.sections || []).map((sec) => ({
    title: sec.title.trim(),
    items: (sec.items || []).map((it) => {
      const itemObj: Record<string, any> = {
        id: it.id.trim(),
        text: it.text.trim(),
      };
      if (it.note && it.note.trim()) itemObj.note = it.note.trim();
      if (it.frequency && it.frequency.trim()) itemObj.frequency = it.frequency.trim();
      return itemObj;
    }),
  }));

  if (Array.isArray(checklist.relatedTools) && checklist.relatedTools.length > 0) {
    frontmatter.relatedTools = checklist.relatedTools;
  }
  if (Array.isArray(checklist.relatedGuides) && checklist.relatedGuides.length > 0) {
    frontmatter.relatedGuides = checklist.relatedGuides;
  }
  if (Array.isArray(checklist.relatedVideos) && checklist.relatedVideos.length > 0) {
    frontmatter.relatedVideos = checklist.relatedVideos;
  }

  const yamlBlock = yaml.dump(frontmatter, { lineWidth: -1, quotingType: '"', forceQuotes: false }).trim();

  return `---\n${yamlBlock}\n---\n\n${(checklist.content || '').trim()}\n`;
}

export async function listPublishedChecklists(): Promise<Array<{
  slug: string;
  title: string;
  category: ChecklistCategory;
  summary: string;
  estimatedTime?: string;
  totalTasksCount: number;
  filePath: string;
}>> {
  try {
    const files = await fs.readdir(CHECKLISTS_DIR);
    const results = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const slug = file.replace(/\.md$/, '');
      const filePath = join(CHECKLISTS_DIR, file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const { frontmatter } = parseChecklistMarkdown(raw);
        const sections = Array.isArray(frontmatter.sections) ? frontmatter.sections : [];
        const totalTasksCount = sections.reduce((acc: number, s: any) => acc + (Array.isArray(s.items) ? s.items.length : 0), 0);

        results.push({
          slug,
          title: frontmatter.title || slug,
          category: (frontmatter.category || 'cleaning-laundry') as ChecklistCategory,
          summary: frontmatter.summary || '',
          estimatedTime: frontmatter.estimatedTime,
          totalTasksCount,
          filePath,
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

export async function getPublishedChecklist(slug: string): Promise<ChecklistData | null> {
  const filePath = join(CHECKLISTS_DIR, `${slug}.md`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const { frontmatter, content } = parseChecklistMarkdown(raw);
    return {
      slug,
      title: frontmatter.title || slug,
      seoTitle: frontmatter.seoTitle || '',
      seoDescription: frontmatter.seoDescription || '',
      category: frontmatter.category as ChecklistCategory,
      summary: frontmatter.summary || '',
      estimatedTime: frontmatter.estimatedTime || '',
      printSubtitle: frontmatter.printSubtitle || '',
      sections: Array.isArray(frontmatter.sections) ? frontmatter.sections : [],
      relatedTools: Array.isArray(frontmatter.relatedTools) ? frontmatter.relatedTools : [],
      relatedGuides: Array.isArray(frontmatter.relatedGuides) ? frontmatter.relatedGuides : [],
      relatedVideos: Array.isArray(frontmatter.relatedVideos) ? frontmatter.relatedVideos : [],
      content: content.trim(),
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeChecklistFile(slug: string, checklist: ChecklistData): Promise<string> {
  await fs.mkdir(CHECKLISTS_DIR, { recursive: true });
  const filePath = join(CHECKLISTS_DIR, `${slug}.md`);
  const markdown = formatChecklistMarkdown(checklist);
  await fs.writeFile(filePath, markdown, 'utf8');
  return filePath;
}

export function renderChecklistStructuredPreview(checklist: ChecklistData): string {
  const sections = checklist.sections || [];
  const totalTasks = sections.reduce((acc, s) => acc + (s.items?.length || 0), 0);

  let html = `<div class="checklist-preview-wrapper" style="font-family:system-ui,-apple-system,sans-serif;color:#1e293b;">`;

  // Header card
  html += `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;">
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
        <span style="font-size:0.75rem;font-weight:700;padding:0.25rem 0.65rem;border-radius:9999px;background:#ecfdf5;color:#059669;border:1px solid rgba(5,150,105,0.2);">📋 Interactive & Printable</span>
        <span style="font-size:0.75rem;font-weight:700;padding:0.25rem 0.65rem;border-radius:9999px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;">${checklist.category || 'General'}</span>
      </div>
      <h2 style="font-size:1.6rem;font-weight:700;margin:0 0 0.5rem 0;color:#0f172a;">${escapePreviewHtml(checklist.title || 'Untitled Checklist')}</h2>
      <p style="font-size:0.95rem;color:#475569;margin:0 0 1rem 0;line-height:1.5;">${escapePreviewHtml(checklist.summary || '')}</p>
      
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:1rem;border-top:1px solid #e2e8f0;font-size:0.85rem;color:#64748b;">
        <div><strong>⏱ Estimated Time:</strong> ${escapePreviewHtml(checklist.estimatedTime || 'Self-paced')}</div>
        <div><strong>Total Tasks:</strong> ${totalTasks} items across ${sections.length} sections</div>
      </div>
    </div>
  `;

  // Sections and items
  if (sections.length === 0) {
    html += `<div style="text-align:center;padding:2rem;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:8px;">No sections or items added yet.</div>`;
  } else {
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];
      html += `
        <div style="margin-bottom:1.5rem;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="background:#f1f5f9;padding:0.75rem 1.25rem;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:1.05rem;color:#1e293b;">
            Section ${sIdx + 1}: ${escapePreviewHtml(section.title || 'Untitled Section')}
          </div>
          <div style="padding:0.5rem 1.25rem;">
      `;

      if (!section.items || section.items.length === 0) {
        html += `<div style="padding:0.75rem 0;color:#94a3b8;font-style:italic;">No tasks in this section.</div>`;
      } else {
        for (const item of section.items) {
          html += `
            <div style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.65rem 0;border-bottom:1px solid #f8fafc;">
              <input type="checkbox" style="margin-top:0.25rem;width:16px;height:16px;accent-color:#059669;cursor:pointer;" />
              <div style="flex:1;">
                <div style="font-size:0.95rem;color:#1e293b;line-height:1.4;">
                  ${escapePreviewHtml(item.text || '')}
                  ${item.frequency ? `<span style="display:inline-block;margin-left:0.5rem;font-size:0.7rem;font-weight:600;padding:0.1rem 0.45rem;border-radius:4px;background:#e0f2fe;color:#0369a1;">${escapePreviewHtml(item.frequency)}</span>` : ''}
                </div>
                ${item.note ? `<div style="font-size:0.8rem;color:#64748b;margin-top:0.2rem;">💡 ${escapePreviewHtml(item.note)}</div>` : ''}
              </div>
            </div>
          `;
        }
      }

      html += `</div></div>`;
    }
  }

  // Guidelines Body
  if (checklist.content && checklist.content.trim()) {
    html += `
      <div style="margin-top:2rem;padding-top:1.5rem;border-top:2px solid #e2e8f0;">
        <h3 style="font-size:1.25rem;font-weight:700;color:#0f172a;margin-bottom:1rem;">Practical Guidelines & Best Practices</h3>
        <div class="prose" style="line-height:1.6;color:#334155;">
          ${renderMarkdownToHtml(checklist.content)}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function escapePreviewHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

