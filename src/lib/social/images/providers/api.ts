import { createHash } from 'node:crypto';
import type { ISocialImageProvider, ImageGenerationRequest, ImageGenerationResult } from '../contracts.ts';
import type { SocialVisualAsset } from '../../types.ts';
import { loadSocialConfig } from '../../config.ts';
import { composeSocialCard } from '../composer.ts';
import { isValidJpegBuffer } from './fixture.ts';

export class APISocialImageProvider implements ISocialImageProvider {
  readonly name = 'API Social Image Provider';
  private customFetch?: typeof fetch;
  private baseDir?: string;

  constructor(options?: { customFetch?: typeof fetch; baseDir?: string } | (typeof fetch)) {
    if (typeof options === 'function') {
      this.customFetch = options;
    } else if (options && typeof options === 'object') {
      this.customFetch = options.customFetch;
      this.baseDir = options.baseDir;
    }
  }

  isConfigured(): boolean {
    const config = loadSocialConfig();
    return Boolean(config.imageConfig.apiKey);
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const config = loadSocialConfig();

    const title = request.articleTitle || request.headlineOverlay || 'Intentional Living & Design';
    const headline = (request.headlineOverlay || title).replace(/<[^>]+>/g, '').trim();

    if (!this.isConfigured() || !config.imageConfig.apiKey) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        provider: this.name,
        error: 'External Image Generation API is not configured. Set CLOUDFLARE_IMAGE_API_KEY or OPENAI_API_KEY.',
        durationMs: Date.now() - startTime,
      };
    }

    const fetchImpl = this.customFetch || globalThis.fetch.bind(globalThis);
    const width = 1080;
    const height = request.format === '1080x1080' ? 1080 : 1350;

    try {
      let heroImageBuffer: Buffer | undefined;

      // If request already has an article image, use it directly
      if (request.articleImage) {
        if (Buffer.isBuffer(request.articleImage) || request.articleImage instanceof Uint8Array) {
          heroImageBuffer = Buffer.from(request.articleImage);
        }
      }

      // If configured with OpenAI DALL-E / external endpoint and no article image supplied
      if (!request.articleImage && !heroImageBuffer && config.imageConfig.provider === 'openai') {
        const response = await fetchImpl('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.imageConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: `Editorial lifestyle photograph representing ${request.prompt}. Serene natural lighting, minimalist composition, 8k resolution, elegant contemporary aesthetics, zero text.`,
            n: 1,
            size: request.format === '1080x1080' ? '1024x1024' : '1024x1792',
            response_format: 'b64_json',
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenAI Image API HTTP ${response.status}: ${response.statusText}`);
        }

        const data: any = await response.json();
        const b64 = data.data?.[0]?.b64_json;
        if (!b64) throw new Error('No image payload returned by OpenAI API.');

        heroImageBuffer = Buffer.from(b64, 'base64');
      }

      // Compose into standard LifeMode 1080x1350 social card with pillar background
      const jpegBuffer = await composeSocialCard({
        topicId: request.topicId,
        pillar: request.pillar,
        format: request.format,
        title,
        articleImage: heroImageBuffer || request.articleImage,
        headlineOverlay: headline,
        subheadlineOverlay: request.subheadlineOverlay,
        ctaText: request.ctaText,
        customFetch: this.customFetch,
        baseDir: this.baseDir,
      });

      if (!isValidJpegBuffer(jpegBuffer)) {
        throw new Error('Composed social card produced invalid JPEG bytes.');
      }

      const assetHash = createHash('sha256').update(jpegBuffer).digest('hex');

      const asset: SocialVisualAsset = {
        assetId: `asset-${request.topicId}-${assetHash.slice(0, 8)}`,
        format: request.format,
        mimeType: 'image/jpeg',
        width,
        height,
        assetHash,
        altText: `LifeMode ${request.pillar.toUpperCase()}: ${headline}`,
        headlineOverlay: headline,
        buffer: jpegBuffer,
      };

      return {
        success: true,
        status: 'SUCCESS',
        asset,
        provider: 'API Social Card Composer',
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.name,
        error: err?.message || String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }
}
