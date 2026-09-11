import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EditorialImageCostGuard,
  InMemoryCostGuardStore,
  CloudflareKVCostGuardStore,
  getDailyKey,
  getMonthlyKey,
  orchestrateEditorialImage,
  FixtureEditorialImageProvider,
  loadEditorialImageConfig,
} from '../src/lib/editorial/images/index.ts';

import type { PublishPackage } from '../src/lib/editorial/publishing/types.ts';
import type { ISocialAssetStorageProvider, AssetUploadRequest, AssetUploadResult } from '../src/lib/social/images/storage/contracts.ts';

const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_PNG_BUFFER = Buffer.from(FIXTURE_PNG_BASE64, 'base64');

class MockStorageProvider implements ISocialAssetStorageProvider {
  readonly name = 'Mock R2 Storage Provider';
  public uploadCalls: AssetUploadRequest[] = [];

  isConfigured(): boolean {
    return true;
  }

  getObjectKey(topicId: string, assetHash: string, _mimeType: string): string {
    return `editorial/${topicId}/${assetHash}.jpg`;
  }

  async uploadAsset(request: AssetUploadRequest): Promise<AssetUploadResult> {
    this.uploadCalls.push(request);
    return {
      success: true,
      status: 'SUCCESS',
      publicUrl: `https://cdn.lifemode.life/editorial/${request.topicId}/${request.assetHash}.jpg`,
      objectKey: request.customKey || `editorial/${request.topicId}/${request.assetHash}.jpg`,
      contentType: request.mimeType,
      sizeBytes: request.buffer.length,
      assetHash: request.assetHash,
      provider: this.name,
      durationMs: 5,
    };
  }
}

function createSamplePublishPackage(): PublishPackage {
  return {
    id: 'pub-test-cost-guard-01',
    topicId: 'test-topic-cg',
    slug: 'cost-guard-test-article',
    title: 'Mindful Spaces and Architectural Silence',
    description: 'An exploration of quiet architecture and minimal interior aesthetics.',
    excerpt: 'Exploring quiet architecture and minimal interior aesthetics.',
    content: 'Quiet spaces allow creative reflection and intentional living...',
    pillar: 'life',
    format: 'guide',
    audience: 'Design-conscious readers',
    primaryIntent: 'informational',
    riskLevel: 'low',
    tags: ['life', 'design', 'architecture'],
    sources: [],
    internalLinks: [],
    affiliateIntent: false,
    faq: [],
    socialHooks: [],
    imageMetadata: {
      prompt: 'Editorial photography of a minimalist Scandinavian interior, morning sunlight.',
      alt: 'Mindful Spaces — editorial photography',
    },
    publicationMetadata: {
      targetDate: '2026-09-11T12:00:00.000Z',
      version: 1,
      author: 'LifeMode Editorial',
    },
    qualitySummary: {
      overallScore: 92,
      safetyScore: 95,
      factualityScore: 90,
      reviewedAt: '2026-09-11T12:00:00.000Z',
      reviewer: 'Lead Reviewer',
      decision: 'PASS',
    },
  };
}

test('1. getDailyKey and getMonthlyKey generate standard UTC keys', () => {
  const testDate = new Date('2026-09-11T15:30:00.000Z');
  assert.equal(getDailyKey(testDate), 'lifemode:image-count:2026-09-11');
  assert.equal(getMonthlyKey(testDate), 'lifemode:image-count:2026-09');
});

test('2. InMemoryCostGuardStore gets, increments, and resets counters', async () => {
  const store = new InMemoryCostGuardStore();
  const key = 'test:counter';

  assert.equal(await store.get(key), 0);
  assert.equal(await store.increment(key, 1), 1);
  assert.equal(await store.increment(key, 2), 3);
  assert.equal(await store.get(key), 3);

  await store.reset();
  assert.equal(await store.get(key), 0);
});

test('3. Generation allowed when usage is strictly below daily and monthly limits', async () => {
  const store = new InMemoryCostGuardStore();
  const guard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 120,
    store,
  });

  const decision = await guard.canGenerateImage();
  assert.equal(decision.allowed, true);
  assert.equal(decision.dailyUsage, 0);
  assert.equal(decision.monthlyUsage, 0);
  assert.equal(decision.dailyLimit, 5);
  assert.equal(decision.monthlyLimit, 120);
});

test('4. Generation blocked when daily limit is reached', async () => {
  const store = new InMemoryCostGuardStore();
  const testDate = new Date('2026-09-11T10:00:00.000Z');

  // Pre-seed 5 generations for today
  await store.increment(getDailyKey(testDate), 5);
  await store.increment(getMonthlyKey(testDate), 5);

  const guard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 120,
    store,
  });

  const decision = await guard.canGenerateImage(testDate);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'DAILY_LIMIT_EXCEEDED');
  assert.equal(decision.dailyUsage, 5);
  assert.equal(decision.monthlyUsage, 5);
});

test('5. Generation blocked when monthly limit is reached', async () => {
  const store = new InMemoryCostGuardStore();
  const testDate = new Date('2026-09-11T10:00:00.000Z');

  // Pre-seed 2 generations for today, but 120 for the month
  await store.increment(getDailyKey(testDate), 2);
  await store.increment(getMonthlyKey(testDate), 120);

  const guard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 120,
    store,
  });

  const decision = await guard.canGenerateImage(testDate);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'MONTHLY_LIMIT_EXCEEDED');
  assert.equal(decision.dailyUsage, 2);
  assert.equal(decision.monthlyUsage, 120);
});

test('6. Guard disabled permits generation regardless of usage counters', async () => {
  const store = new InMemoryCostGuardStore();
  const testDate = new Date('2026-09-11T10:00:00.000Z');

  await store.increment(getDailyKey(testDate), 10);
  await store.increment(getMonthlyKey(testDate), 200);

  const guard = new EditorialImageCostGuard({
    enabled: false,
    dailyLimit: 5,
    monthlyLimit: 120,
    store,
  });

  const decision = await guard.canGenerateImage(testDate);
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'GUARD_DISABLED');
  assert.equal(decision.dailyUsage, 10);
  assert.equal(decision.monthlyUsage, 200);
});

test('7. recordGeneration increments both daily and monthly counters', async () => {
  const store = new InMemoryCostGuardStore();
  const testDate = new Date('2026-09-11T10:00:00.000Z');

  const guard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 120,
    store,
  });

  const result1 = await guard.recordGeneration(testDate);
  assert.equal(result1.dailyUsage, 1);
  assert.equal(result1.monthlyUsage, 1);

  const result2 = await guard.recordGeneration(testDate);
  assert.equal(result2.dailyUsage, 2);
  assert.equal(result2.monthlyUsage, 2);

  assert.equal(await guard.getDailyUsage(testDate), 2);
  assert.equal(await guard.getMonthlyUsage(testDate), 2);
});

test('8. Image orchestrator blocks provider call when cost guard daily limit is reached', async () => {
  const store = new InMemoryCostGuardStore();
  const testDate = new Date('2026-09-11T10:00:00.000Z');
  await store.increment(getDailyKey(testDate), 5); // Maxed out

  const guard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 120,
    store,
  });

  const pkg = createSamplePublishPackage();
  let providerCalled = false;

  class TrackingProvider extends FixtureEditorialImageProvider {
    async generate(input: any) {
      providerCalled = true;
      return super.generate(input);
    }
  }

  const primaryProvider = new TrackingProvider(true, VALID_PNG_BUFFER);
  const mockStorage = new MockStorageProvider();
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    primaryProvider,
    storageProvider: mockStorage,
    costGuard: guard,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.success, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'cost-guard-blocked');
  assert.equal(providerCalled, false);
  assert.equal(mockStorage.uploadCalls.length, 0);
  assert.equal(pkg.imageMetadata?.url, undefined);

  assert.ok(logs.some((l) => l.includes('editorial_image_generation_blocked')));
  assert.ok(logs.some((l) => l.includes('reason=cost-guard-blocked')));
});

test('9. Image orchestrator logs allowed event and records usage when generation succeeds', async () => {
  const store = new InMemoryCostGuardStore();
  const guard = new EditorialImageCostGuard({
    enabled: true,
    dailyLimit: 5,
    monthlyLimit: 120,
    store,
  });

  const pkg = createSamplePublishPackage();
  const primaryProvider = new FixtureEditorialImageProvider(true, VALID_PNG_BUFFER);
  const mockStorage = new MockStorageProvider();
  const logs: string[] = [];

  const result = await orchestrateEditorialImage(pkg, {
    dryRun: false,
    config: loadEditorialImageConfig({ enabled: true }),
    primaryProvider,
    storageProvider: mockStorage,
    costGuard: guard,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(result.success, true);
  assert.equal(result.skipped, false);
  assert.ok(result.publicUrl);
  assert.equal(mockStorage.uploadCalls.length, 1);

  assert.ok(logs.some((l) => l.includes('editorial_image_generation_allowed')));
  assert.equal(await guard.getDailyUsage(), 1);
  assert.equal(await guard.getMonthlyUsage(), 1);
});

test('10. CloudflareKVCostGuardStore gets, increments, and handles 404 cleanly with mocked fetch', async () => {
  const mockKvStorage = new Map<string, string>();

  const customFetch: typeof fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    const key = decodeURIComponent(urlStr.split('/values/')[1] || '');

    if (init?.method === 'PUT') {
      mockKvStorage.set(key, String(init.body));
      return new Response(null, { status: 200 });
    }

    if (mockKvStorage.has(key)) {
      return new Response(mockKvStorage.get(key)!, { status: 200 });
    }

    return new Response('Key not found', { status: 404 });
  };

  const kvStore = new CloudflareKVCostGuardStore({
    accountId: 'mock-account',
    apiToken: 'mock-token',
    namespaceId: 'mock-namespace',
    customFetch,
  });

  const testKey = 'lifemode:image-count:2026-09-11';

  // Initially not found -> returns 0
  assert.equal(await kvStore.get(testKey), 0);

  // Increment to 1
  assert.equal(await kvStore.increment(testKey, 1), 1);
  assert.equal(await kvStore.get(testKey), 1);

  // Increment by 2 -> 3
  assert.equal(await kvStore.increment(testKey, 2), 3);
  assert.equal(await kvStore.get(testKey), 3);
});
