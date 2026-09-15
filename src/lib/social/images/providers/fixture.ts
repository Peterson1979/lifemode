import { createHash } from 'node:crypto';
import type { ISocialImageProvider, ImageGenerationRequest, ImageGenerationResult } from '../contracts.ts';
import type { SocialVisualAsset } from '../../types.ts';
import { composeSocialCard } from '../composer.ts';

/**
 * Validates that a buffer is a non-empty, valid JPEG with standard magic bytes (0xFF, 0xD8, 0xFF).
 */
export function isValidJpegBuffer(buffer: Buffer | Uint8Array): boolean {
  if (!buffer || buffer.length < 100) {
    return false;
  }
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export class FixtureSocialImageProvider implements ISocialImageProvider {
  readonly name = 'Fixture Social Image Provider';
  private customFetch?: typeof fetch;
  private baseDir?: string;

  constructor(options?: { customFetch?: typeof fetch; baseDir?: string }) {
    this.customFetch = options?.customFetch;
    this.baseDir = options?.baseDir;
  }

  isConfigured(): boolean {
    return true;
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const width = 1080;
    const height = request.format === '1080x1080' ? 1080 : 1350;

    const title = request.articleTitle || request.headlineOverlay || 'Intentional Living & Design';
    const headline = (request.headlineOverlay || title).replace(/<[^>]+>/g, '').trim();

    try {
      const jpegBuffer = await composeSocialCard({
        topicId: request.topicId,
        pillar: request.pillar,
        format: request.format,
        title,
        articleImage: request.articleImage,
        headlineOverlay: headline,
        subheadlineOverlay: request.subheadlineOverlay,
        ctaText: request.ctaText,
        customFetch: this.customFetch,
        baseDir: this.baseDir,
      });

      if (!isValidJpegBuffer(jpegBuffer)) {
        throw new Error('Rendered social asset produced invalid JPEG output bytes.');
      }

      const assetHash = createHash('sha256').update(jpegBuffer).digest('hex');

      const asset: SocialVisualAsset = {
        assetId: `asset-${request.topicId}-${request.format}-${assetHash.slice(0, 8)}`,
        format: request.format,
        mimeType: 'image/jpeg',
        width,
        height,
        assetHash,
        altText: `LifeMode ${request.pillar.toUpperCase()}: ${headline}`,
        headlineOverlay: headline,
        buffer: jpegBuffer,
        isFixture: true,
      };

      return {
        success: true,
        status: 'SUCCESS',
        asset,
        provider: this.name,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.name,
        error: `Rasterization failed for social visual asset: ${err?.message || String(err)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
