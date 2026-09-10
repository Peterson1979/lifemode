import { createHash, createHmac } from 'node:crypto';
import type { ISocialAssetStorageProvider, AssetUploadRequest, AssetUploadResult } from './contracts.ts';
import { loadSocialConfig } from '../../config.ts';

export interface CloudflareR2Options {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicBaseUrl?: string;
  region?: string;
  customFetch?: typeof fetch;
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export class CloudflareR2SocialAssetStorageProvider implements ISocialAssetStorageProvider {
  readonly name = 'Cloudflare R2 Storage Provider';
  private options: CloudflareR2Options;

  constructor(options: CloudflareR2Options = {}) {
    this.options = options;
  }

  isConfigured(): boolean {
    const config = loadSocialConfig();
    const accountId = this.options.accountId || config.storageConfig.accountId;
    const accessKeyId = this.options.accessKeyId || config.storageConfig.accessKeyId;
    const secretAccessKey = this.options.secretAccessKey || config.storageConfig.secretAccessKey;
    const bucketName = this.options.bucketName || config.storageConfig.bucketName;
    const publicBaseUrl = this.options.publicBaseUrl || config.storageConfig.publicBaseUrl;

    return Boolean(accountId && accessKeyId && secretAccessKey && bucketName && publicBaseUrl);
  }

  getObjectKey(topicId: string, assetHash: string, mimeType: string): string {
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const cleanTopic = topicId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return `social/${cleanTopic}/${assetHash.slice(0, 16)}.${ext}`;
  }

  async uploadAsset(request: AssetUploadRequest): Promise<AssetUploadResult> {
    const startTime = Date.now();
    const config = loadSocialConfig();

    const accountId = this.options.accountId || config.storageConfig.accountId;
    const accessKeyId = this.options.accessKeyId || config.storageConfig.accessKeyId;
    const secretAccessKey = this.options.secretAccessKey || config.storageConfig.secretAccessKey;
    const bucketName = this.options.bucketName || config.storageConfig.bucketName;
    const publicBaseUrl = (this.options.publicBaseUrl || config.storageConfig.publicBaseUrl || '').replace(/\/$/, '');
    const region = this.options.region || 'auto';

    if (!this.isConfigured() || !accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        provider: this.name,
        error: 'Cloudflare R2 storage credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL) not configured.',
        durationMs: Date.now() - startTime,
      };
    }

    const objectKey = request.customKey || this.getObjectKey(request.topicId, request.assetHash, request.mimeType);
    const contentType = request.mimeType || 'image/jpeg';
    const buffer = Buffer.isBuffer(request.buffer) ? request.buffer : Buffer.from(request.buffer);

    const fetchImpl = this.options.customFetch || globalThis.fetch.bind(globalThis);
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const endpoint = `https://${host}/${bucketName}/${objectKey}`;

    try {
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
      const dateStamp = amzDate.slice(0, 8); // YYYYMMDD
      const payloadHash = sha256Hex(buffer);

      // Canonical Request
      const canonicalUri = `/${bucketName}/${objectKey}`;
      const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
      const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
      const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      // String to Sign
      const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

      // Calculate Signature
      const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
      const kRegion = hmacSha256(kDate, region);
      const kService = hmacSha256(kRegion, 's3');
      const kSigning = hmacSha256(kService, 'aws4_request');
      const signature = hmacSha256(kSigning, stringToSign).toString('hex');

      const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const response = await fetchImpl(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          Host: host,
          'x-amz-date': amzDate,
          'x-amz-content-sha256': payloadHash,
          Authorization: authorizationHeader,
        },
        body: new Uint8Array(buffer),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`R2 upload HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const publicUrl = `${publicBaseUrl}/${objectKey}`;

      return {
        success: true,
        status: 'SUCCESS',
        publicUrl,
        objectKey,
        contentType,
        sizeBytes: buffer.length,
        assetHash: request.assetHash,
        provider: this.name,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.name,
        error: `R2 asset upload failed: ${err?.message || String(err)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
