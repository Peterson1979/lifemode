import type {
  IEditorialImageProvider,
  EditorialImageGenerationInput,
  EditorialImageResult,
} from '../contracts.ts';
import { isValidImageBuffer } from '../contracts.ts';
import { loadEditorialImageConfig } from '../config.ts';

export interface CloudflareWorkersAIOptions {
  accountId?: string;
  apiToken?: string;
  model?: string;
  customFetch?: typeof fetch;
}

/**
 * Cloudflare Workers AI Image Generation Provider (Primary Provider).
 *
 * REST endpoint:
 * POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
 */
export class CloudflareWorkersAIImageProvider implements IEditorialImageProvider {
  readonly name = 'Cloudflare Workers AI';
  readonly providerId = 'cloudflare-workers-ai';

  private options: CloudflareWorkersAIOptions;

  constructor(options: CloudflareWorkersAIOptions = {}) {
    this.options = options;
  }

  isConfigured(): boolean {
    const config = loadEditorialImageConfig();
    const accountId = this.options.accountId || config.cloudflare.accountId;
    const apiToken = this.options.apiToken || config.cloudflare.apiToken;
    return Boolean(accountId && apiToken);
  }

  async generate(input: EditorialImageGenerationInput): Promise<EditorialImageResult> {
    const startTime = Date.now();
    const config = loadEditorialImageConfig();

    const accountId = this.options.accountId || config.cloudflare.accountId;
    const apiToken = this.options.apiToken || config.cloudflare.apiToken;
    const model = this.options.model || config.cloudflare.model;

    if (!accountId || !apiToken) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        provider: this.providerId,
        model,
        error: 'Cloudflare credentials (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN) not configured.',
        durationMs: Date.now() - startTime,
      };
    }

    const fetchImpl = this.options.customFetch || globalThis.fetch.bind(globalThis);
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    const width = input.width || config.targetWidth;
    const height = input.height || config.targetHeight;

    const payload = {
      prompt: input.prompt,
    };

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(
          `Cloudflare Workers AI HTTP ${response.status} (${response.statusText}): ${errText.slice(0, 300)}`
        );
      }

      const contentType = response.headers.get('content-type') || '';
      let imageBuffer: Buffer;
      let mimeType = 'image/jpeg';

      if (contentType.includes('application/json')) {
        const data: any = await response.json();
        const base64Data =
          data?.result?.image ||
          data?.image ||
          (typeof data?.result === 'string' ? data.result : null);

        if (!base64Data || typeof base64Data !== 'string') {
          throw new Error('Cloudflare Workers AI response missing base64 image data in JSON payload.');
        }

        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        // Binary stream response
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
        if (contentType.includes('png')) {
          mimeType = 'image/png';
        } else if (contentType.includes('webp')) {
          mimeType = 'image/webp';
        }
      }

      if (!isValidImageBuffer(imageBuffer)) {
        throw new Error('Cloudflare Workers AI returned invalid or corrupted image bytes.');
      }

      return {
        success: true,
        status: 'SUCCESS',
        imageBuffer,
        mimeType,
        width,
        height,
        provider: this.providerId,
        model,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerId,
        model,
        error: err?.message || String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }
}
