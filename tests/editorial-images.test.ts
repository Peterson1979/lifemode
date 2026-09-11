import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDeterministicAssetKey,
  orchestrateEditorialImage,
  loadEditorialImageConfig,
  CloudflareWorkersAIImageProvider,
  BFLImageProvider,
  FixtureEditorialImageProvider,
  isValidImageBuffer,
} from '../src/lib/editorial/images/index.ts';

import { runPublishingPipeline } from '../src/lib/editorial/publishing/runner.ts';
import type { PublishingRequest, PublishPackage } from '../src/lib/editorial/publishing/types.ts';
import type { ISocialAssetStorageProvider, AssetUploadRequest, AssetUploadResult } from '../src/lib/social/images/storage/contracts.ts';

// Valid 1x1 PNG Buffer
const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_PNG_BUFFER = Buffer.from(FIXTURE_PNG_BASE64, 'base64');

// Mock Storage Provider
class MockStorageProvider implements ISocialAssetStorageProvider {
  readonly name = 'Mock R2 Storage Provider';
  public uploadCalls: AssetUploadRequest[] = [];
  public shouldSucceed: boolean;
  public returnPublicUrl: string;

  constructor(shouldSucceed = true, returnPublicUrl = 'https://assets.lifemode.life/editorial/test/sample.jpg') {
    this.shouldSucceed = shouldSucceed;
    this.returnPublicUrl = returnPublicUrl;
  }

  isConfigured(): boolean {
    return true;
  }

  getObjectKey(topicId: string, assetHash: string, _mimeType: string): string {
    return `editorial/${topicId}/${assetHash}.jpg`;
  }

  async uploadAsset(request: AssetUploadRequest): Promise<AssetUploadResult> {
    this.uploadCalls.push(request);
    const startTime = Date.now();

    if (!this.shouldSucceed) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.name,
        error: 'Simulated R2 bucket network upload error.',
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      status: 'SUCCESS',
      publicUrl: this.returnPublicUrl,
      objectKey: request.customKey || `editorial/${request.topicId}/${request.assetHash}.jpg`,
      contentType: request.mimeType,
      sizeBytes: request.buffer.length,
      assetHash: request.assetHash,
      provider: this.name,
      durationMs: Date.now() - startTime,
    };
  }
}

function createSamplePublishPackage(overrides: Partial<PublishPackage> = {}): PublishPackage {
  return {
    id: 'pub-test-01-mindful-living',
    topicId: 'test-topic-01',
    slug: 'mindful-living-principles',
    title: 'Mindful Living Principles for the Modern Era',
    description: 'An exploration of calm rituals and intentional daily design.',
    excerpt: 'Exploring calm rituals and intentional daily design in modern life.',
    content: '## Introduction\n\nIntentionality begins with quiet observation...',
    pillar: 'life',
    format: 'guide',
    audience: 'Thoughtful readers',
    primaryIntent: 'informational',
    riskLevel: 'low',
    tags: ['life', 'rituals', 'mindfulness'],
    sources: [{ name: 'LifeMode Editorial', url: 'https://lifemode.life' }],
    internalLinks: ['/life'],
    affiliateIntent: false,
    faq: [],
    socialHooks: ['How quiet routines reshape focus.'],
    imageMetadata: {
      prompt: 'Editorial photography of a quiet morning desk with ceramic coffee cup.',
      alt: 'Mindful Living Principles — editorial photography',
      visualTheme: 'Intentional Living & Daily Rituals',
      recommendedAspectRatio: '16:9',
    },
    publicationMetadata: {
      targetDate: '2026-09-10T12:00:00.000Z',
      version: 1,
      author: 'LifeMode Editorial',
    },
    qualitySummary: {
      overallScore: 92,
      safetyScore: 95,
      factualityScore: 90,
      reviewedAt: '2026-09-10T12:00:00.000Z',
      reviewer: 'Lead Reviewer',
      decision: 'PASS',
    },
    ...overrides,
  };
}

test('1. Deterministic asset key generation produces stable hash and path', () => {
  const { assetHash: hash1, objectKey: key1 } = getDeterministicAssetKey(
    'topic-123',
    'slug-abc',
    'Editorial prompt text',
    'jpg'
  );
  const { assetHash: hash2, objectKey: key2 } = getDeterministicAssetKey(
    'topic-123',
    'slug-abc',
    'Editorial prompt text',
    'jpg'
  );

  assert.equal(hash1, hash2);
  assert.equal(key1, key2);
  assert.equal(key1, `editorial/topic-123/${hash1}.jpg`);
});

test('2. isValidImageBuffer validates PNG, JPEG, and WebP headers correctly', () => {
  assert.equal(isValidImageBuffer(VALID_PNG_BUFFER), true);

  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  assert.equal(isValidImageBuffer(validJpeg), true);

  const invalidBytes = Buffer.from('<html><body>Not an image</body></html>');
  assert.equal(isValidImageBuffer(invalidBytes), false);
  assert.equal(isValidImageBuffer(null), false);
  assert.equal(isValidImageBuffer(Buffer.alloc(4)), false);
});

test('3. Image generation is skipped when LIFEMODE_IMAGE_ENABLED is false', async () => {
  const pkg = createSamplePublishPackage();
  const mockStorage = new MockStorageProvider();
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: false }),
    storageProvider: mockStorage,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'disabled');
  assert.equal(mockStorage.uploadCalls.length, 0);
  assert.equal(pkg.imageMetadata?.url, undefined);
  assert.ok(logs.some((l) => l.includes('status=skipped reason=disabled')));
});

test('4. Image generation is skipped during dry-run', async () => {
  const pkg = createSamplePublishPackage();
  const mockStorage = new MockStorageProvider();
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: true,
    config: loadEditorialImageConfig({ enabled: true }),
    storageProvider: mockStorage,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'dry-run');
  assert.equal(mockStorage.uploadCalls.length, 0);
  assert.equal(pkg.imageMetadata?.url, undefined);
  assert.ok(logs.some((l) => l.includes('status=skipped reason=dry-run')));
});

test('5. Existing image is never overwritten (idempotency)', async () => {
  const existingUrl = 'https://assets.lifemode.life/editorial/existing/manual-photo.jpg';
  const pkg = createSamplePublishPackage({
    imageMetadata: {
      url: existingUrl,
      source: 'manual',
      alt: 'Manual photo alt',
      prompt: 'Original prompt',
    },
  });

  const mockStorage = new MockStorageProvider();
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    storageProvider: mockStorage,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'already-has-image');
  assert.equal(result.publicUrl, existingUrl);
  assert.equal(pkg.imageMetadata?.url, existingUrl);
  assert.equal(pkg.imageMetadata?.source, 'manual');
  assert.equal(mockStorage.uploadCalls.length, 0);
  assert.ok(logs.some((l) => l.includes('status=skipped reason=already-has-image')));
});

test('6. Primary provider (Cloudflare Workers AI) succeeds -> R2 upload -> URL persisted', async () => {
  const pkg = createSamplePublishPackage();
  const primaryProvider = new FixtureEditorialImageProvider(true, VALID_PNG_BUFFER);
  const fallbackProvider = new FixtureEditorialImageProvider(false);
  const mockStorage = new MockStorageProvider(true, 'https://cdn.lifemode.life/editorial/test-topic-01/asset123.png');
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    primaryProvider,
    fallbackProvider,
    storageProvider: mockStorage,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.success, true);
  assert.equal(result.skipped, false);
  assert.equal(result.publicUrl, 'https://cdn.lifemode.life/editorial/test-topic-01/asset123.png');
  assert.equal(pkg.imageMetadata?.url, 'https://cdn.lifemode.life/editorial/test-topic-01/asset123.png');
  assert.equal(pkg.imageMetadata?.source, 'fixture-image');
  assert.equal(mockStorage.uploadCalls.length, 1);
  assert.ok(logs.some((l) => l.includes('provider=cloudflare status=success')));
});

test('7. Primary provider fails -> Fallback provider (BFL) succeeds -> R2 upload -> URL persisted', async () => {
  const pkg = createSamplePublishPackage();
  const primaryProvider = new FixtureEditorialImageProvider(false); // Fails
  const fallbackProvider = new FixtureEditorialImageProvider(true, VALID_PNG_BUFFER); // Succeeds
  const mockStorage = new MockStorageProvider(true, 'https://cdn.lifemode.life/editorial/test-topic-01/bfl-asset.png');
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    primaryProvider,
    fallbackProvider,
    storageProvider: mockStorage,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.success, true);
  assert.equal(result.publicUrl, 'https://cdn.lifemode.life/editorial/test-topic-01/bfl-asset.png');
  assert.equal(pkg.imageMetadata?.url, 'https://cdn.lifemode.life/editorial/test-topic-01/bfl-asset.png');
  assert.equal(mockStorage.uploadCalls.length, 1);
  assert.ok(logs.some((l) => l.includes('provider=cloudflare status=failed fallback=bfl')));
  assert.ok(logs.some((l) => l.includes('provider=bfl status=success')));
});

test('8. Both providers fail -> publication continues without image, prompt/alt preserved', async () => {
  const pkg = createSamplePublishPackage();
  const primaryProvider = new FixtureEditorialImageProvider(false);
  const fallbackProvider = new FixtureEditorialImageProvider(false);
  const mockStorage = new MockStorageProvider();
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    primaryProvider,
    fallbackProvider,
    storageProvider: mockStorage,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, 'generation-failed');
  assert.equal(pkg.imageMetadata?.url, undefined);
  // Prompt and Alt are still preserved
  assert.ok(pkg.imageMetadata?.prompt);
  assert.ok(pkg.imageMetadata?.alt);
  assert.equal(mockStorage.uploadCalls.length, 0);
  assert.ok(logs.some((l) => l.includes('status=failed publication=continued')));
});

test('9. R2 upload failure is handled gracefully without throwing or blocking', async () => {
  const pkg = createSamplePublishPackage();
  const primaryProvider = new FixtureEditorialImageProvider(true, VALID_PNG_BUFFER);
  const mockStorage = new MockStorageProvider(false); // Storage fails
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    primaryProvider,
    storageProvider: mockStorage,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, 'r2-upload-failed');
  assert.equal(pkg.imageMetadata?.url, undefined);
  assert.ok(logs.some((l) => l.includes('status=failed reason=r2-upload-failed publication=continued')));
});

test('10. CloudflareWorkersAIImageProvider correctly parses base64 JSON payload', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        result: {
          image: FIXTURE_PNG_BASE64,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  };

  const provider = new CloudflareWorkersAIImageProvider({
    accountId: 'mock-cf-acc',
    apiToken: 'mock-cf-token',
    customFetch: mockFetch,
  });

  const res = await provider.generate({
    topicId: 'test-topic',
    title: 'Test',
    description: 'Desc',
    pillar: 'tech-ai',
    prompt: 'A sleek mechanical keyboard',
  });

  assert.equal(res.success, true);
  assert.equal(res.status, 'SUCCESS');
  assert.ok(res.imageBuffer);
  assert.equal(isValidImageBuffer(res.imageBuffer), true);
  assert.equal(res.provider, 'cloudflare-workers-ai');
});

test('11. BFLImageProvider submits job, polls get_result, and downloads image', async () => {
  let pollCallCount = 0;

  const mockFetch: typeof fetch = async (url: any) => {
    const urlStr = String(url);

    if (urlStr.includes('/flux-pro')) {
      // Submission response
      return new Response(
        JSON.stringify({
          id: 'job-bfl-999',
          polling_url: 'https://api.bfl.ml/v1/get_result?id=job-bfl-999',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('/get_result')) {
      pollCallCount++;
      if (pollCallCount === 1) {
        return new Response(
          JSON.stringify({ status: 'Processing' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          status: 'Ready',
          result: {
            sample: 'https://assets.bfl.ai/downloads/job-bfl-999.png',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('/downloads/job-bfl-999.png')) {
      return new Response(VALID_PNG_BUFFER, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }

    return new Response('Not found', { status: 404 });
  };

  const provider = new BFLImageProvider({
    apiKey: 'mock-bfl-key',
    pollIntervalMs: 1,
    maxPollAttempts: 5,
    customFetch: mockFetch,
  });

  const res = await provider.generate({
    topicId: 'test-topic',
    title: 'Test',
    description: 'Desc',
    pillar: 'life',
    prompt: 'Linen curtains in morning light',
  });

  assert.equal(res.success, true);
  assert.equal(res.status, 'SUCCESS');
  assert.equal(res.jobId, 'job-bfl-999');
  assert.ok(res.imageBuffer);
  assert.equal(isValidImageBuffer(res.imageBuffer), true);
  assert.equal(res.provider, 'bfl-flux-2-pro');
});

test('12. End-to-end publishing pipeline with image generation persistence (Workers AI success)', async () => {
  const fullContent = [
    'In contemporary lifestyle design, intentionality represents a foundational shift toward clarity and sustainable daily focus.',
    '',
    '## 1. The Modern Shift: Signal Over Noise',
    'Navigating digital overload requires cultivating a calm, deliberate relationship with our tools and physical spaces.',
    'Rather than reacting to every new impulse, we establish clear boundaries and structured daily rhythms.',
    '',
    '## 2. Practical Framework & Daily Protocols',
    'Implementing intentional design begins with small, repeatable workflows that compound over time.',
    'By focusing on essential priorities, modern knowledge workers preserve cognitive bandwidth for deep, meaningful work.',
  ].join('\n');

  const pubRequest: PublishingRequest = {
    article: {
      title: 'The Art of Mindful Solitude',
      slug: 'the-art-of-mindful-solitude',
      description: 'How quiet contemplation fosters mental clarity and daily balance.',
      excerpt: 'Exploring quiet contemplation and rest in modern life.',
      content: fullContent,
      sources: [{ name: 'LifeMode Editorial Standards', url: 'https://lifemode.life' }],
      internalLinks: ['/wellbeing'],
      affiliateIntents: [],
      faq: [],
      socialHooks: ['How quiet contemplation fosters mental clarity.'],
    },
    review: {
      decision: 'PASS',
      overallScore: 94,
      dimensions: {
        safety: { score: 95, rationale: 'Safe', issues: [] },
        factuality: { score: 92, rationale: 'Accurate', issues: [] },
        readability: { score: 90, rationale: 'Good', issues: [] },
        structure: { score: 90, rationale: 'Good', issues: [] },
        usefulness: { score: 90, rationale: 'Good', issues: [] },
        originality: { score: 90, rationale: 'Good', issues: [] },
        searchIntent: { score: 90, rationale: 'Good', issues: [] },
        seo: { score: 90, rationale: 'Good', issues: [] },
        editorialFit: { score: 90, rationale: 'Good', issues: [] },
        monetizationFit: { score: 90, rationale: 'Good', issues: [] },
      },
      criticalIssues: [],
      warnings: [],
      reviewer: 'Senior Reviewer',
      metadata: {
        provider: 'fixture',
        model: 'fixture-v1',
        reviewedAt: '2026-09-10T12:00:00.000Z',
        durationMs: 10,
      },
      gatePassed: true,
    },
    context: {
      topicId: 'topic-wellbeing-solitude',
      pillar: 'wellbeing',
      format: 'guide',
      audience: 'Intentional readers',
      primaryIntent: 'informational',
      riskLevel: 'low',
      tags: ['wellbeing', 'solitude', 'mindfulness'],
    },
    options: {
      dryRun: false,
    },
  };

  const primaryImageProvider = new FixtureEditorialImageProvider(true, VALID_PNG_BUFFER);
  const mockStorage = new MockStorageProvider(true, 'https://cdn.lifemode.life/editorial/topic-wellbeing-solitude/master.jpg');

  const result = await runPublishingPipeline({
    request: pubRequest,
    imageConfig: loadEditorialImageConfig({ enabled: true }),
    imagePrimaryProvider: primaryImageProvider,
    imageStorageProvider: mockStorage,
  });

  assert.equal(result.status, 'PUBLISHED');
  assert.ok(result.publishPackage);
  assert.equal(result.publishPackage.imageMetadata?.url, 'https://cdn.lifemode.life/editorial/topic-wellbeing-solitude/master.jpg');
  assert.equal(result.publishPackage.imageMetadata?.source, 'fixture-image');
  assert.ok(result.publishPackage.imageMetadata?.prompt);
  assert.ok(result.publishPackage.imageMetadata?.alt);
});

test('13. End-to-end publishing pipeline with BFL fallback on Workers AI failure', async () => {
  const fullContent = [
    'In contemporary lifestyle design, intentionality represents a foundational shift toward clarity and sustainable daily focus.',
    '',
    '## 1. The Modern Shift: Signal Over Noise',
    'Navigating digital overload requires cultivating a calm, deliberate relationship with our tools and physical spaces.',
    'Rather than reacting to every new impulse, we establish clear boundaries and structured daily rhythms.',
    '',
    '## 2. Practical Framework & Daily Protocols',
    'Implementing intentional design begins with small, repeatable workflows that compound over time.',
    'By focusing on essential priorities, modern knowledge workers preserve cognitive bandwidth for deep, meaningful work.',
  ].join('\n');

  const pubRequest: PublishingRequest = {
    article: {
      title: 'The Art of Mindful Solitude',
      slug: 'the-art-of-mindful-solitude',
      description: 'How quiet contemplation fosters mental clarity and daily balance.',
      excerpt: 'Exploring quiet contemplation and rest in modern life.',
      content: fullContent,
      sources: [{ name: 'LifeMode Editorial Standards', url: 'https://lifemode.life' }],
      internalLinks: ['/wellbeing'],
      affiliateIntents: [],
      faq: [],
      socialHooks: ['How quiet contemplation fosters mental clarity.'],
    },
    review: {
      decision: 'PASS',
      overallScore: 94,
      dimensions: {
        safety: { score: 95, rationale: 'Safe', issues: [] },
        factuality: { score: 92, rationale: 'Accurate', issues: [] },
        readability: { score: 90, rationale: 'Good', issues: [] },
        structure: { score: 90, rationale: 'Good', issues: [] },
        usefulness: { score: 90, rationale: 'Good', issues: [] },
        originality: { score: 90, rationale: 'Good', issues: [] },
        searchIntent: { score: 90, rationale: 'Good', issues: [] },
        seo: { score: 90, rationale: 'Good', issues: [] },
        editorialFit: { score: 90, rationale: 'Good', issues: [] },
        monetizationFit: { score: 90, rationale: 'Good', issues: [] },
      },
      criticalIssues: [],
      warnings: [],
      reviewer: 'Senior Reviewer',
      metadata: {
        provider: 'fixture',
        model: 'fixture-v1',
        reviewedAt: '2026-09-10T12:00:00.000Z',
        durationMs: 10,
      },
      gatePassed: true,
    },
    context: {
      topicId: 'topic-wellbeing-solitude',
      pillar: 'wellbeing',
      format: 'guide',
      audience: 'Intentional readers',
      primaryIntent: 'informational',
      riskLevel: 'low',
      tags: ['wellbeing', 'solitude', 'mindfulness'],
    },
    options: {
      dryRun: false,
    },
  };

  const primaryImageProvider = new FixtureEditorialImageProvider(false); // Workers AI fails
  const fallbackImageProvider = new FixtureEditorialImageProvider(true, VALID_PNG_BUFFER); // BFL succeeds
  const mockStorage = new MockStorageProvider(true, 'https://cdn.lifemode.life/editorial/topic-wellbeing-solitude/bfl-master.jpg');

  const result = await runPublishingPipeline({
    request: pubRequest,
    imageConfig: loadEditorialImageConfig({ enabled: true }),
    imagePrimaryProvider: primaryImageProvider,
    imageFallbackProvider: fallbackImageProvider,
    imageStorageProvider: mockStorage,
  });

  assert.equal(result.status, 'PUBLISHED');
  assert.ok(result.publishPackage);
  assert.equal(result.publishPackage.imageMetadata?.url, 'https://cdn.lifemode.life/editorial/topic-wellbeing-solitude/bfl-master.jpg');
  assert.equal(result.publishPackage.imageMetadata?.source, 'fixture-image');
});

