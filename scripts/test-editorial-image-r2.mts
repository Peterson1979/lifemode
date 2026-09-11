import { createHash } from 'node:crypto';
import { CloudflareWorkersAIImageProvider } from '../src/lib/editorial/images/providers/cloudflare.ts';
import { CloudflareR2SocialAssetStorageProvider } from '../src/lib/social/images/storage/r2.ts';

async function main() {
  const provider = new CloudflareWorkersAIImageProvider();
  const storage = new CloudflareR2SocialAssetStorageProvider();

  const prompt =
    'A warm editorial lifestyle photograph of a quiet morning reading corner, natural sunlight, linen textures, plants, architecture magazine aesthetic, no text';

  const imageResult = await provider.generate({
    prompt,
    aspectRatio: '16:9',
    width: 1536,
    height: 864,
  });

  if (!imageResult.success || !imageResult.imageBuffer) {
    console.log(
      JSON.stringify(
        {
          success: false,
          provider: imageResult.provider,
          error: imageResult.error || 'Failed to generate image bytes.',
        },
        null,
        2
      )
    );
    return;
  }

  const customKey = 'editorial/test/cloudflare-image-test.jpg';
  const assetHash = createHash('sha256').update(imageResult.imageBuffer).digest('hex').slice(0, 16);

  const uploadResult = await storage.uploadAsset({
    topicId: 'test-topic',
    pillar: 'life',
    assetHash,
    buffer: imageResult.imageBuffer,
    mimeType: imageResult.mimeType || 'image/jpeg',
    format: '1080x1350' as any,
    customKey,
  });

  if (!uploadResult.success || !uploadResult.publicUrl) {
    console.log(
      JSON.stringify(
        {
          success: false,
          provider: imageResult.provider,
          error: uploadResult.error || 'Failed to upload image to R2.',
        },
        null,
        2
      )
    );
    return;
  }

  const output = {
    success: true,
    provider: imageResult.provider,
    mimeType: imageResult.mimeType || 'image/jpeg',
    size: imageResult.imageBuffer.length,
    r2Key: customKey,
    publicUrl: uploadResult.publicUrl,
  };

  console.log(JSON.stringify(output, null, 2));
}

await main();

