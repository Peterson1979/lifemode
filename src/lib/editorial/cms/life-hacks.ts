import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { LifeHackVideo } from '../../../utils/life-hacks.ts';

const LIFE_HACKS_FILE = resolve(process.cwd(), 'data', 'content', 'life-hacks.json');

/**
 * Extracts the 11-character YouTube video ID from supported YouTube URL patterns:
 * - https://www.youtube.com/watch?v=VIDEO_ID (with any query params)
 * - https://youtu.be/VIDEO_ID (with any query params)
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();

  // youtu.be/VIDEO_ID
  const shortMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/watch?v=VIDEO_ID or youtube.com/shorts/VIDEO_ID or youtube.com/embed/VIDEO_ID
  const standardMatch = clean.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|v\/)([a-zA-Z0-9_-]{11})/);
  if (standardMatch) return standardMatch[1];

  return null;
}

/**
 * Generates the official YouTube HQ default thumbnail URL:
 * https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg
 */
export function getYouTubeThumbnailUrl(videoIdOrUrl: string): string | null {
  if (!videoIdOrUrl) return null;
  const videoId = /^[a-zA-Z0-9_-]{11}$/.test(videoIdOrUrl.trim())
    ? videoIdOrUrl.trim()
    : extractYouTubeVideoId(videoIdOrUrl);

  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

async function readLifeHacksFile(): Promise<LifeHackVideo[]> {
  try {
    const raw = await fs.readFile(LIFE_HACKS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`Life Hacks data file could not be read: ${error?.message || String(error)}`);
  }
}

async function writeLifeHacksFile(items: LifeHackVideo[]): Promise<void> {
  await fs.mkdir(dirname(LIFE_HACKS_FILE), { recursive: true });
  await fs.writeFile(LIFE_HACKS_FILE, JSON.stringify(items, null, 2) + '\n', 'utf8');
}

export async function listPublishedLifeHacks(): Promise<LifeHackVideo[]> {
  return await readLifeHacksFile();
}

export async function getPublishedLifeHack(id: string): Promise<LifeHackVideo | null> {
  const items = await readLifeHacksFile();
  return items.find((v) => v.id === id) || null;
}

export async function saveLifeHack(video: LifeHackVideo, options?: { orderIndex?: number }): Promise<LifeHackVideo> {
  const items = await readLifeHacksFile();
  const existingIdx = items.findIndex((v) => v.id === video.id);

  // If thumbnail is empty or omitted, auto-generate from YouTube URL if valid
  let thumbnail = (video.thumbnail || '').trim();
  if (!thumbnail) {
    const autoThumb = getYouTubeThumbnailUrl(video.videoUrl);
    if (autoThumb) thumbnail = autoThumb;
  }

  const cleanVideo: LifeHackVideo = {
    id: video.id.trim(),
    title: video.title.trim(),
    description: video.description.trim(),
    thumbnail,
    videoUrl: video.videoUrl.trim(),
  };

  if (video.duration && video.duration.trim()) cleanVideo.duration = video.duration.trim();
  if (video.category && video.category.trim()) cleanVideo.category = video.category.trim();
  if (video.creator && video.creator.trim()) cleanVideo.creator = video.creator.trim();
  if (video.hidden !== undefined) cleanVideo.hidden = Boolean(video.hidden);
  if (video.relatedGuide?.slug) cleanVideo.relatedGuide = { slug: video.relatedGuide.slug.trim(), title: video.relatedGuide.title.trim() };
  if (video.relatedTool?.slug) cleanVideo.relatedTool = { slug: video.relatedTool.slug.trim(), title: video.relatedTool.title.trim() };

  if (existingIdx >= 0) {
    if (options?.orderIndex !== undefined && options.orderIndex !== existingIdx) {
      items.splice(existingIdx, 1);
      const targetIdx = Math.max(0, Math.min(options.orderIndex, items.length));
      items.splice(targetIdx, 0, cleanVideo);
    } else {
      items[existingIdx] = cleanVideo;
    }
  } else {
    if (options?.orderIndex !== undefined) {
      const targetIdx = Math.max(0, Math.min(options.orderIndex, items.length));
      items.splice(targetIdx, 0, cleanVideo);
    } else {
      items.push(cleanVideo);
    }
  }

  await writeLifeHacksFile(items);
  return cleanVideo;
}

export async function deleteLifeHack(id: string): Promise<boolean> {
  const items = await readLifeHacksFile();
  const filtered = items.filter((v) => v.id !== id);
  if (filtered.length === items.length) return false;
  await writeLifeHacksFile(filtered);
  return true;
}

/**
 * Renders a visual card preview for the Editorial Operations dashboard.
 * Pure thumbnail preview with play badge — does NOT embed or host video files.
 * Links directly to the original YouTube video opening in a new tab.
 */
export function renderLifeHackPreview(video: LifeHackVideo): string {
  const thumbnail = video.thumbnail || getYouTubeThumbnailUrl(video.videoUrl) || '';
  const ytUrl = video.videoUrl || '#';

  return `
    <article class="video-entry-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);max-width:420px;font-family:system-ui,-apple-system,sans-serif;">
      <a href="${escapeHtml(ytUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;position:relative;aspect-ratio:16/9;background:#0f172a;overflow:hidden;text-decoration:none;" aria-label="Watch on YouTube">
        ${thumbnail
          ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(video.title || 'Video Thumbnail')}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">No thumbnail specified</div>`
        }
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.35);">
          <div style="width:52px;height:52px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.35);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#0f172a" style="margin-left:2px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
        ${video.duration ? `<span style="position:absolute;bottom:0.5rem;right:0.5rem;background:rgba(15,23,42,0.85);color:#fff;font-size:0.75rem;font-weight:600;padding:0.15rem 0.45rem;border-radius:4px;">${escapeHtml(video.duration)}</span>` : ''}
      </a>

      <div style="padding:1.25rem;display:flex;flex-direction:column;">
        ${video.category ? `<span style="font-size:0.725rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#0891b2;margin-bottom:0.5rem;">${escapeHtml(video.category)}</span>` : ''}
        <h3 style="font-size:1.15rem;font-weight:700;line-height:1.3;margin:0 0 0.5rem 0;color:#0f172a;">
          <a href="${escapeHtml(ytUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0f172a;text-decoration:none;">${escapeHtml(video.title || 'Untitled Video')}</a>
        </h3>
        <p style="font-size:0.875rem;color:#475569;line-height:1.5;margin:0 0 0.75rem 0;">${escapeHtml(video.description || '')}</p>
        ${video.creator ? `<span style="font-size:0.775rem;color:#94a3b8;margin-bottom:0.75rem;">By ${escapeHtml(video.creator)}</span>` : ''}
        ${video.hidden ? `<span style="font-size:0.7rem;font-weight:700;background:#fef3c7;color:#b45309;padding:0.15rem 0.45rem;border-radius:4px;width:max-content;margin-bottom:0.75rem;">Hidden Duplicate</span>` : ''}

        ${(video.relatedGuide || video.relatedTool) ? `
          <div style="margin-top:0.5rem;padding-top:0.75rem;border-top:1px solid #f1f5f9;display:flex;flex-direction:column;gap:0.35rem;">
            <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;">Companion Practical Resource:</span>
            ${video.relatedGuide?.slug ? `<a href="/guides/${escapeHtml(video.relatedGuide.slug)}/" target="_blank" style="font-size:0.8rem;font-weight:600;color:#0f766e;text-decoration:none;">📖 ${escapeHtml(video.relatedGuide.title || video.relatedGuide.slug)}</a>` : ''}
            ${video.relatedTool?.slug ? `<a href="/tools/${escapeHtml(video.relatedTool.slug)}/" target="_blank" style="font-size:0.8rem;font-weight:600;color:#0f766e;text-decoration:none;">🛠️ ${escapeHtml(video.relatedTool.title || video.relatedTool.slug)}</a>` : ''}
          </div>
        ` : ''}

        <div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid #f1f5f9;">
          <a href="${escapeHtml(ytUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.825rem;font-weight:700;color:#b91c1c;text-decoration:none;">
            <span>▶ Watch on YouTube &rarr;</span>
          </a>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
