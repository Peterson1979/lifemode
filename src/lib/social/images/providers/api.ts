import { createHash } from 'node:crypto';
import type { ISocialImageProvider, ImageGenerationRequest, ImageGenerationResult } from '../contracts.ts';
import type { SocialVisualAsset } from '../../types.ts';
import { loadSocialConfig } from '../../config.ts';

export class APISocialImageProvider implements ISocialImageProvider {
  readonly name = 'API Social Image Provider';
  private customFetch?: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.customFetch = customFetch;
  }

  isConfigured(): boolean {
    const config = loadSocialConfig();
    return Boolean(config.imageConfig.apiKey);
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const config = loadSocialConfig();

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
      // If configured with OpenAI DALL-E / external endpoint
      if (config.imageConfig.provider === 'openai') {
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

        const buffer = Buffer.from(b64, 'base64');
        const assetHash = createHash('sha256').update(buffer).digest('hex');

        const asset: SocialVisualAsset = {
          assetId: `asset-${request.topicId}-${assetHash.slice(0, 8)}`,
          format: request.format,
          mimeType: 'image/png',
          width,
          height,
          assetHash,
          altText: `LifeMode ${request.pillar.toUpperCase()}: ${request.headlineOverlay || 'Editorial image'}`,
          headlineOverlay: request.headlineOverlay,
          buffer,
        };

        return {
          success: true,
          status: 'SUCCESS',
          asset,
          provider: 'OpenAI DALL-E',
          durationMs: Date.now() - startTime,
        };
      }

      // Default Cloudflare / Generic API
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        provider: this.name,
        error: `Image generation provider "${config.imageConfig.provider}" endpoint not wired for live generation.`,
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
