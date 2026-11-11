import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CmsContentType, CmsDraftItem, GuideData } from './types.ts';

const DRAFTS_FILE = resolve(process.cwd(), 'data', 'editorial', 'drafts.json');

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'draft';
}

async function readDraftsFile(): Promise<CmsDraftItem[]> {
  try {
    const raw = await fs.readFile(DRAFTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      contentType: (item.contentType || 'guide') as CmsContentType,
    }));
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`Drafts file could not be read: ${error?.message || String(error)}`);
  }
}

async function writeDraftsFile(drafts: CmsDraftItem[]): Promise<void> {
  await fs.mkdir(dirname(DRAFTS_FILE), { recursive: true });
  await fs.writeFile(DRAFTS_FILE, JSON.stringify(drafts, null, 2) + '\n', 'utf8');
}

export async function listDrafts(contentTypeFilter?: CmsContentType | string): Promise<CmsDraftItem[]> {
  const drafts = await readDraftsFile();
  const filtered = contentTypeFilter
    ? drafts.filter((d) => (d.contentType || 'guide') === contentTypeFilter)
    : drafts;

  return filtered.sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || '');
    const bTime = Date.parse(b.updatedAt || b.createdAt || '');
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

export async function getDraft(id: string): Promise<CmsDraftItem | null> {
  const drafts = await readDraftsFile();
  return drafts.find((d) => d.id === id || d.slug === id) || null;
}

export async function saveDraft(input: Partial<CmsDraftItem>): Promise<CmsDraftItem> {
  const now = new Date().toISOString();
  const drafts = await readDraftsFile();

  const title = (input.title || '').trim();
  const slug = slugify(input.slug || title || 'untitled-draft');
  const id = input.id || `draft-${randomUUID()}`;
  const contentType: CmsContentType = input.contentType || 'guide';

  const existingIndex = drafts.findIndex((d) => d.id === id);
  const existing = existingIndex >= 0 ? drafts[existingIndex] : null;

  // Defaults per content type
  const defaultCategory =
    contentType === 'tool'
      ? 'food-kitchen'
      : contentType === 'checklist'
      ? 'cleaning-laundry'
      : 'home-maintenance';

  const draft: CmsDraftItem = {
    ...(existing || {}),
    ...input,
    id,
    contentType,
    title: title || existing?.title || 'Untitled Draft',
    slug: slug || existing?.slug || 'untitled-draft',
    category: input.category || existing?.category || defaultCategory,
    description: (input.description || existing?.description || input.summary || '').trim(),
    summary: (input.summary || existing?.summary || input.description || '').trim(),
    seoTitle: (input.seoTitle || existing?.seoTitle || '').trim(),
    seoDescription: (input.seoDescription || existing?.seoDescription || '').trim(),
    content: input.content ?? existing?.content ?? '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // Guide-specific fields
  if (contentType === 'guide') {
    draft.primaryKeyword = (input.primaryKeyword || existing?.primaryKeyword || '').trim();
    draft.image = input.image ?? existing?.image;
    draft.imageAlt = input.imageAlt ?? existing?.imageAlt;
    draft.tags = Array.isArray(input.tags) ? input.tags : existing?.tags || [];
  }

  // Tool-specific fields
  if (contentType === 'tool') {
    draft.toolType = input.toolType || existing?.toolType || 'cookware-selector';
    draft.badge = input.badge ?? existing?.badge;
    draft.instructions = input.instructions ?? existing?.instructions;
    draft.relatedChecklists = Array.isArray(input.relatedChecklists) ? input.relatedChecklists : existing?.relatedChecklists || [];
    draft.relatedGuides = Array.isArray(input.relatedGuides) ? input.relatedGuides : existing?.relatedGuides || [];
    draft.relatedVideos = Array.isArray(input.relatedVideos) ? input.relatedVideos : existing?.relatedVideos || [];
  }

  // Checklist-specific fields
  if (contentType === 'checklist') {
    draft.estimatedTime = input.estimatedTime ?? existing?.estimatedTime;
    draft.printSubtitle = input.printSubtitle ?? existing?.printSubtitle;
    draft.sections = Array.isArray(input.sections) ? input.sections : existing?.sections || [];
    draft.relatedTools = Array.isArray(input.relatedTools) ? input.relatedTools : existing?.relatedTools || [];
    draft.relatedGuides = Array.isArray(input.relatedGuides) ? input.relatedGuides : existing?.relatedGuides || [];
    draft.relatedVideos = Array.isArray(input.relatedVideos) ? input.relatedVideos : existing?.relatedVideos || [];
  }

  // Life Hack-specific fields
  if (contentType === 'life-hack') {
    draft.videoUrl = input.videoUrl ?? existing?.videoUrl;
    draft.thumbnail = input.thumbnail ?? existing?.thumbnail;
    draft.duration = input.duration ?? existing?.duration;
    draft.creator = input.creator ?? existing?.creator;
    draft.hidden = input.hidden !== undefined ? Boolean(input.hidden) : existing?.hidden;
    draft.relatedGuide = input.relatedGuide ?? existing?.relatedGuide;
    draft.relatedTool = input.relatedTool ?? existing?.relatedTool;
    draft.orderIndex = input.orderIndex !== undefined ? input.orderIndex : existing?.orderIndex;
  }

  if (existingIndex >= 0) {
    drafts[existingIndex] = draft;
  } else {
    drafts.push(draft);
  }

  await writeDraftsFile(drafts);
  return draft;
}

export async function deleteDraft(id: string): Promise<boolean> {
  const drafts = await readDraftsFile();
  const filtered = drafts.filter((d) => d.id !== id && d.slug !== id);
  if (filtered.length === drafts.length) return false;
  await writeDraftsFile(filtered);
  return true;
}
