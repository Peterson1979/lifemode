import type { SocialImageFormat, PillarSlug } from '../../types.ts';

/**
 * Request payload for uploading a generated visual asset to public storage.
 */
export interface AssetUploadRequest {
  topicId: string;
  pillar: PillarSlug;
  assetHash: string;
  buffer: Buffer | Uint8Array;
  mimeType: string;
  format: SocialImageFormat;
  customKey?: string;
}

/**
 * Normalized result of an asset upload operation.
 */
export interface AssetUploadResult {
  success: boolean;
  status: 'SUCCESS' | 'NOT_CONFIGURED' | 'FAILED';
  publicUrl?: string;
  objectKey?: string;
  contentType?: string;
  sizeBytes?: number;
  assetHash?: string;
  provider: string;
  error?: string;
  durationMs: number;
}

/**
 * Contract for provider-independent social media asset storage.
 */
export interface ISocialAssetStorageProvider {
  readonly name: string;
  isConfigured(): boolean;
  getObjectKey(topicId: string, assetHash: string, mimeType: string): string;
  uploadAsset(request: AssetUploadRequest): Promise<AssetUploadResult>;
}
