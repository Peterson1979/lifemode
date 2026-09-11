import type { ISocialAssetStorageProvider, AssetUploadRequest, AssetUploadResult } from './contracts.ts';

export class FixtureSocialAssetStorageProvider implements ISocialAssetStorageProvider {
  readonly name = 'Fixture Social Asset Storage Provider';
  private publicBaseUrl: string;

  constructor(publicBaseUrl: string = 'https://media.lifemode.life') {
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return true;
  }

  getObjectKey(topicId: string, assetHash: string, mimeType: string): string {
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : mimeType.includes('svg') ? 'svg' : 'jpg';
    return `social/${topicId}/${assetHash.slice(0, 16)}.${ext}`;
  }

  async uploadAsset(request: AssetUploadRequest): Promise<AssetUploadResult> {
    const startTime = Date.now();
    const objectKey = request.customKey || this.getObjectKey(request.topicId, request.assetHash, request.mimeType);
    const publicUrl = `${this.publicBaseUrl}/${objectKey}`;

    return {
      success: true,
      status: 'SUCCESS',
      publicUrl,
      objectKey,
      contentType: request.mimeType,
      sizeBytes: request.buffer.length,
      assetHash: request.assetHash,
      provider: this.name,
      durationMs: Date.now() - startTime,
    };
  }
}
