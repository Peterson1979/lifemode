import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { ISocialImageProvider, ImageGenerationRequest, ImageGenerationResult } from '../contracts.ts';
import type { SocialVisualAsset } from '../../types.ts';
import { loadSocialConfig } from '../../config.ts';
import { composeSocialCard } from '../composer.ts';

const PEXELS_API = 'https://api.pexels.com/v1/search';
const MIN_SOURCE_WIDTH = 800;
const MIN_SOURCE_HEIGHT = 600;

/** Builds a short, English, topic-focused query for the Pexels search endpoint. */
export function buildPexelsQuery(request: Pick<ImageGenerationRequest, 'articleTitle' | 'pillar' | 'prompt' | 'category'>): string {
  const raw = request.articleTitle || request.prompt || request.category || request.pillar;
  const cleaned = raw
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\b(complete|ultimate|practical|guide|everything|you|need|to|know|about|202\d)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const category = (request.category || request.pillar || '').replace(/-/g, ' ');
  return `${cleaned || category} editorial lifestyle photograph`.slice(0, 120).trim();
}

export class PexelsSocialImageProvider implements ISocialImageProvider {
  readonly name = 'Pexels Social Image Provider';
  private customFetch?: typeof fetch;
  private baseDir?: string;

  constructor(options?: { customFetch?: typeof fetch; baseDir?: string } | typeof fetch) {
    if (typeof options === 'function') this.customFetch = options;
    else {
      this.customFetch = options?.customFetch;
      this.baseDir = options?.baseDir;
    }
  }

  // The provider is always usable because its deterministic branded fallback needs no credential.
  isConfigured(): boolean { return true; }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const started = Date.now();
    const config = loadSocialConfig();
    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);
    const title = (request.articleTitle || request.headlineOverlay || 'Intentional Living & Design').trim();
    const headline = (request.headlineOverlay || '').replace(/<[^>]+>/g, '').trim() || undefined;
    let sourceBuffer: Buffer | undefined;
    let sourceCredit = '';
    let failureReason = 'PEXELS_API_KEY is not configured; using branded fallback graphic.';

    if (config.imageConfig.pexelsApiKey) {
      try {
        const query = buildPexelsQuery(request);
        const searchResponse = await fetchImpl(`${PEXELS_API}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=8`, {
          headers: { Authorization: config.imageConfig.pexelsApiKey },
          signal: AbortSignal.timeout(8000),
        });
        if (!searchResponse.ok) throw new Error(`Pexels search HTTP ${searchResponse.status}`);
        const data: any = await searchResponse.json();
        const photos = Array.isArray(data?.photos) ? data.photos : [];
        for (const photo of photos) {
          // Pexels photos are covered by the Pexels license; require the API's attribution fields
          // and a source URL so malformed/arbitrary API results cannot become published assets.
          const imageUrl = photo?.src?.large2x || photo?.src?.portrait || photo?.src?.large;
          if (!imageUrl || !photo?.url || !photo?.photographer || !photo?.width || !photo?.height) continue;
          if (Number(photo.width) < MIN_SOURCE_WIDTH || Number(photo.height) < MIN_SOURCE_HEIGHT) continue;
          const imageResponse = await fetchImpl(imageUrl, { signal: AbortSignal.timeout(8000) });
          if (!imageResponse.ok) continue;
          const candidate = Buffer.from(await imageResponse.arrayBuffer());
          const metadata = await sharp(candidate).metadata();
          if (!metadata.width || !metadata.height || metadata.width < MIN_SOURCE_WIDTH || metadata.height < MIN_SOURCE_HEIGHT) continue;
          sourceBuffer = candidate;
          sourceCredit = `Photo by ${String(photo.photographer).slice(0, 120)} via Pexels`;
          failureReason = '';
          break;
        }
        if (!sourceBuffer) failureReason = `No suitable licensed Pexels photograph found for query "${buildPexelsQuery(request)}"; using branded fallback graphic.`;
      } catch (error: any) {
        failureReason = `Pexels image selection failed safely: ${error?.message || String(error)}; using branded fallback graphic.`;
      }
    }

    try {
      // composeSocialCard creates the category visual when sourceBuffer is absent. The article
      // title remains in the lower branded title panel, never over the photograph itself.
      const buffer = await composeSocialCard({
        topicId: request.topicId,
        pillar: request.pillar,
        format: request.format,
        title,
        articleImage: sourceBuffer,
        headlineOverlay: headline,
        subheadlineOverlay: request.subheadlineOverlay,
        ctaText: request.ctaText,
        customFetch: this.customFetch,
        baseDir: this.baseDir,
      });
      const assetHash = createHash('sha256').update(buffer).digest('hex');
      const asset: SocialVisualAsset = {
        assetId: `asset-${request.topicId}-${assetHash.slice(0, 8)}`,
        format: request.format,
        mimeType: 'image/jpeg',
        width: 1080,
        height: request.format === '1080x1080' ? 1080 : 1350,
        assetHash,
        altText: `${title}${sourceCredit ? ` — ${sourceCredit}` : ''}`,
        headlineOverlay: headline,
        buffer,
      };
      return { success: true, status: 'SUCCESS', asset, provider: this.name, error: failureReason || undefined, durationMs: Date.now() - started };
    } catch (error: any) {
      return { success: false, status: 'FAILED', provider: this.name, error: `${failureReason} ${error?.message || String(error)}`, durationMs: Date.now() - started };
    }
  }
}
