import type {
  IEditorialImageProvider,
  EditorialImageGenerationInput,
  EditorialImageResult,
} from '../contracts.ts';
import { isValidImageBuffer } from '../contracts.ts';
import { loadEditorialImageConfig } from '../config.ts';

export interface BFLImageProviderOptions {
  apiKey?: string;
  model?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  customFetch?: typeof fetch;
}

/**
 * Black Forest Labs FLUX.2 [pro] / FLUX 1.1 [pro] Image Provider (Fallback Provider).
 *
 * Official REST endpoints:
 * POST https://api.bfl.ml/v1/{model} (Header: x-key: {BFL_API_KEY})
 * GET https://api.bfl.ml/v1/get_result?id={request_id}
 */
export class BFLImageProvider implements IEditorialImageProvider {
  readonly name = 'Black Forest Labs FLUX';
  readonly providerId = 'bfl-flux-2-pro';

  private options: BFLImageProviderOptions;

  constructor(options: BFLImageProviderOptions = {}) {
    this.options = options;
  }

  isConfigured(): boolean {
    const config = loadEditorialImageConfig();
    const apiKey = this.options.apiKey || config.bfl.apiKey;
    return Boolean(apiKey);
  }

  async generate(input: EditorialImageGenerationInput): Promise<EditorialImageResult> {
    const startTime = Date.now();
    const config = loadEditorialImageConfig();

    const apiKey = this.options.apiKey || config.bfl.apiKey;
    const model = this.options.model || config.bfl.model;

    if (!apiKey) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        provider: this.providerId,
        model,
        error: 'Black Forest Labs API key (BFL_API_KEY) not configured.',
        durationMs: Date.now() - startTime,
      };
    }

    const fetchImpl = this.options.customFetch || globalThis.fetch.bind(globalThis);
    const endpoint = `https://api.bfl.ml/v1/${model}`;

    const width = input.width || config.targetWidth;
    const height = input.height || config.targetHeight;

    const payload = {
      prompt: input.prompt,
      width,
      height,
      prompt_upsampling: false,
    };

    try {
      // 1. Submit Generation Job
      const submitResponse = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'x-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!submitResponse.ok) {
        const errText = await submitResponse.text().catch(() => '');
        throw new Error(
          `BFL API submission HTTP ${submitResponse.status} (${submitResponse.statusText}): ${errText.slice(0, 300)}`
        );
      }

      const submitData: any = await submitResponse.json();
      const jobId = submitData.id || submitData.request_id;
      if (!jobId) {
        throw new Error('BFL API response did not contain a valid generation request ID.');
      }

      // 2. Poll for Result
      const pollIntervalMs = this.options.pollIntervalMs ?? 1000;
      const maxPollAttempts = this.options.maxPollAttempts ?? 30; // 30 seconds max
      let pollUrl = submitData.polling_url || `https://api.bfl.ml/v1/get_result?id=${jobId}`;
      let downloadUrl: string | undefined;

      for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
        // Sleep between polls (skip on first attempt if already ready)
        if (attempt > 0 && pollIntervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        const pollResponse = await fetchImpl(pollUrl, {
          method: 'GET',
          headers: {
            'x-key': apiKey,
          },
        });

        if (!pollResponse.ok) {
          const errText = await pollResponse.text().catch(() => '');
          throw new Error(`BFL polling HTTP ${pollResponse.status}: ${errText.slice(0, 300)}`);
        }

        const pollData: any = await pollResponse.json();
        const status = (pollData.status || '').toLowerCase();

        if (status === 'ready') {
          downloadUrl =
            pollData.result?.sample ||
            pollData.result?.url ||
            pollData.result?.image ||
            pollData.sample ||
            pollData.url;
          break;
        } else if (status === 'failed' || status === 'error') {
          const reason = pollData.error || pollData.message || 'Generation failed on BFL cluster.';
          throw new Error(`BFL generation job failed: ${reason}`);
        }
      }

      if (!downloadUrl) {
        throw new Error(`BFL generation timed out after ${maxPollAttempts} polling attempts.`);
      }

      // 3. Download Generated Image Bytes
      const downloadResponse = await fetchImpl(downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error(`Failed to download image from BFL URL HTTP ${downloadResponse.status}`);
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      if (!isValidImageBuffer(imageBuffer)) {
        throw new Error('Downloaded BFL asset returned invalid image bytes.');
      }

      const mimeType = downloadUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';

      return {
        success: true,
        status: 'SUCCESS',
        imageBuffer,
        mimeType,
        width,
        height,
        provider: this.providerId,
        model,
        jobId,
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
