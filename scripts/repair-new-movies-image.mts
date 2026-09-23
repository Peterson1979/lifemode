import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { CloudflareWorkersAIImageProvider } from '../src/lib/editorial/images/providers/cloudflare.ts';
import { CloudflareR2SocialAssetStorageProvider } from '../src/lib/social/images/storage/r2.ts';
import { parseArticle, serializeArticle } from '../src/lib/editorial/storage/serializer.ts';

async function main() {
  console.log('--- Repairing "New movies streaming: what to know" Hero Image ---');

  const provider = new CloudflareWorkersAIImageProvider();
  const storage = new CloudflareR2SocialAssetStorageProvider();

  const topicId = 'lm-entertainment-20260912-new-movies-streaming';
  const slug = 'new-movies-streaming-what-to-know';
  const pillar = 'entertainment';
  const prompt = 'Editorial documentary photograph of a curated minimalist living room with a sleek ambient screen streaming cinema in soft evening light, calm technology aesthetic, 16:9, architectural digest style, no text';

  console.log('1. Generating image via Cloudflare Workers AI...');
  const imageResult = await provider.generate({
    topicId,
    slug,
    title: 'New movies streaming: what to know',
    description: 'Find out how to pick, plan, and watch new movies on streaming services while staying mindful and avoiding overload.',
    pillar,
    prompt,
    aspectRatio: '16:9',
    width: 1536,
    height: 864,
  });

  if (!imageResult.success || !imageResult.imageBuffer) {
    console.error('Image generation failed:', imageResult.error);
    process.exit(1);
  }

  console.log(`Image generated successfully! Size: ${imageResult.imageBuffer.length} bytes, mimeType: ${imageResult.mimeType}`);

  console.log('2. Uploading image to Cloudflare R2...');
  const assetHash = createHash('sha256').update(`${topicId}:${slug}:${prompt}`).digest('hex').slice(0, 16);
  const customKey = `editorial/${topicId}/${assetHash}.jpg`;

  const uploadResult = await storage.uploadAsset({
    topicId,
    pillar,
    assetHash,
    buffer: imageResult.imageBuffer,
    mimeType: imageResult.mimeType || 'image/jpeg',
    format: '1080x1350' as any,
    customKey,
  });

  if (!uploadResult.success || !uploadResult.publicUrl) {
    console.error('R2 upload failed:', uploadResult.error);
    process.exit(1);
  }

  console.log(`R2 Upload succeeded! Public URL: ${uploadResult.publicUrl}`);

  console.log('3. Verifying public URL with HTTP GET...');
  const res = await fetch(uploadResult.publicUrl);
  console.log(`HTTP Status: ${res.status} ${res.statusText}`);
  if (res.status !== 200) {
    console.error(`Verification failed: expected HTTP 200, got ${res.status}`);
    process.exit(1);
  }

  console.log('4. Updating article frontmatter...');
  const articlePath = resolve(process.cwd(), 'src', 'content', 'entertainment', 'new-movies-streaming-what-to-know.md');
  const rawFile = await fs.readFile(articlePath, 'utf-8');
  const parsed = parseArticle(rawFile, 'entertainment', slug, articlePath);

  parsed.frontmatter.image = uploadResult.publicUrl;
  parsed.frontmatter.imageAlt = 'New movies streaming: what to know';
  parsed.frontmatter.imagePrompt = prompt;
  parsed.frontmatter.imageSource = imageResult.provider;

  const updatedRaw = serializeArticle(parsed);
  await fs.writeFile(articlePath, updatedRaw, 'utf-8');

  console.log('5. Verification of updated file:');
  const verifiedRaw = await fs.readFile(articlePath, 'utf-8');
  const verifiedParsed = parseArticle(verifiedRaw, 'entertainment', slug, articlePath);
  console.log('Updated image in frontmatter:', verifiedParsed.frontmatter.image);
  console.log('Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
