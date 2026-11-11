import { promises as fs } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { CloudflareR2SocialAssetStorageProvider } from '../../social/images/storage/r2.ts';
import type { MediaAsset } from './types.ts';

const MEDIA_INDEX_FILE = resolve(process.cwd(), 'data', 'editorial', 'media-library.json');
const LOCAL_UPLOADS_DIR = resolve(process.cwd(), 'public', 'images', 'guides');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'image/svg+xml',
]);

async function readMediaIndex(): Promise<MediaAsset[]> {
  try {
    const raw = await fs.readFile(MEDIA_INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`Media index could not be read: ${error?.message || String(error)}`);
  }
}

async function writeMediaIndex(items: MediaAsset[]): Promise<void> {
  await fs.mkdir(dirname(MEDIA_INDEX_FILE), { recursive: true });
  await fs.writeFile(MEDIA_INDEX_FILE, JSON.stringify(items, null, 2) + '\n', 'utf8');
}

export async function listMediaAssets(): Promise<MediaAsset[]> {
  const assets = await readMediaIndex();
  return assets.sort((a, b) => Date.parse(b.uploadedAt || '') - Date.parse(a.uploadedAt || ''));
}

export async function uploadMediaAsset(input: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  topicId?: string;
}): Promise<MediaAsset> {
  const { fileName, mimeType, base64Data } = input;

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported media format: "${mimeType}". Allowed formats: JPEG, PNG, WebP, PDF, SVG.`);
  }

  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const maxBytes = 8 * 1024 * 1024; // 8 MB

  if (buffer.length > maxBytes) {
    throw new Error(`File exceeds the maximum allowed size of 8 MB (actual: ${(buffer.length / 1024 / 1024).toFixed(1)} MB).`);
  }

  const hash = createHash('sha256').update(buffer).digest('hex');
  let ext = 'bin';
  if (mimeType === 'image/jpeg') ext = 'jpg';
  else if (mimeType === 'image/png') ext = 'png';
  else if (mimeType === 'image/webp') ext = 'webp';
  else if (mimeType === 'application/pdf') ext = 'pdf';
  else if (mimeType === 'image/svg+xml') ext = 'svg';

  const cleanBaseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 30);
  const objectName = `${cleanBaseName || 'asset'}-${hash.slice(0, 12)}.${ext}`;
  const folder = 'guides';

  let publicUrl: string;

  const r2Storage = new CloudflareR2SocialAssetStorageProvider();
  if (r2Storage.isConfigured()) {
    const r2Result = await r2Storage.uploadAsset({
      topicId: input.topicId || 'editorial',
      pillar: 'guides',
      assetHash: hash,
      buffer,
      mimeType,
      format: '1080x1350',
      customKey: `${folder}/${objectName}`,
    });

    if (!r2Result.success || !r2Result.publicUrl) {
      throw new Error(`R2 upload failed: ${r2Result.error || 'Unknown error'}`);
    }
    publicUrl = r2Result.publicUrl;
  } else {
    // Local development fallback
    await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
    const localFilePath = join(LOCAL_UPLOADS_DIR, objectName);
    await fs.writeFile(localFilePath, buffer);
    publicUrl = `/images/guides/${objectName}`;
  }

  const newAsset: MediaAsset = {
    id: `med-${hash.slice(0, 8)}`,
    fileName,
    url: publicUrl,
    mimeType,
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
  };

  const existingAssets = await readMediaIndex();
  const filtered = existingAssets.filter((a) => a.url !== publicUrl);
  filtered.unshift(newAsset);
  await writeMediaIndex(filtered);

  return newAsset;
}
