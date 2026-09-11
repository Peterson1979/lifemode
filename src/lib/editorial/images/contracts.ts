import type { PillarSlug } from '../types.ts';

/**
 * Normalized input passed to any editorial image generator provider.
 */
export interface EditorialImageGenerationInput {
  topicId?: string;
  slug?: string;
  title?: string;
  description?: string;
  pillar?: PillarSlug;
  tags?: string[];
  prompt: string;
  negativePrompt?: string;
  width?: number; // Target width (e.g. 1536)
  height?: number; // Target height (e.g. 864)
  aspectRatio?: string; // e.g. '16:9'
}

/**
 * Normalized output produced by an editorial image generator.
 */
export interface EditorialImageResult {
  success: boolean;
  status: 'SUCCESS' | 'NOT_CONFIGURED' | 'FAILED';
  imageBuffer?: Buffer;
  mimeType?: string;
  width?: number;
  height?: number;
  provider: string; // 'cloudflare-workers-ai' | 'bfl-flux-2-pro' | 'fixture-image'
  model: string;
  jobId?: string;
  error?: string;
  durationMs: number;
}

/**
 * Common contract for all editorial image generation providers.
 */
export interface IEditorialImageProvider {
  readonly name: string;
  readonly providerId: string;
  isConfigured(): boolean;
  generate(input: EditorialImageGenerationInput): Promise<EditorialImageResult>;
}

/**
 * Validates that a buffer starts with known valid image magic bytes (PNG, JPEG, or WebP).
 */
export function isValidImageBuffer(buffer: Buffer | Uint8Array | null | undefined): boolean {
  if (!buffer || buffer.length < 8) return false;
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // JPEG magic bytes: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return true;
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return true;
  }

  // WebP magic bytes: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }

  return false;
}
