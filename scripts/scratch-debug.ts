import {
  runDailyEditorialAutomation,
  FilesystemContentRepository,
  AstroGitPublisher,
  type IDiscoveryAdapter,
  type DiscoveryResult,
  type IEditorialImageProvider,
  type EditorialImageResult,
  type EditorialImageGenerationInput,
} from '../src/lib/editorial/index.ts';
import type { ISocialAssetStorageProvider, AssetUploadRequest, AssetUploadResult } from '../src/lib/social/images/storage/contracts.ts';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_PNG_BUFFER = Buffer.from(FIXTURE_PNG_BASE64, 'base64');

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
        error: 'Simulated R2 storage upload error.',
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

class MockImageProvider implements IEditorialImageProvider {
  public generateCalls: EditorialImageGenerationInput[] = [];
  public shouldSucceed: boolean;
  public name: string;
  public providerId: string;

  constructor(name = 'Mock Image Provider', providerId = 'mock-provider', shouldSucceed = true) {
    this.name = name;
    this.providerId = providerId;
    this.shouldSucceed = shouldSucceed;
  }

  isConfigured(): boolean {
    return true;
  }

  async generate(input: EditorialImageGenerationInput): Promise<EditorialImageResult> {
    this.generateCalls.push(input);
    const startTime = Date.now();

    if (!this.shouldSucceed) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerId,
        model: 'mock-model',
        error: 'Simulated image generation provider failure.',
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      status: 'SUCCESS',
      imageBuffer: VALID_PNG_BUFFER,
      mimeType: 'image/png',
      width: 1536,
      height: 864,
      provider: this.providerId,
      model: 'mock-model',
      durationMs: Date.now() - startTime,
    };
  }
}

class MockTopicDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'FIXTURE' as const;
  readonly name = 'Mock Topic Discovery Adapter';
  private topics: Array<{ topic: string; pillar: any; score: number; searchVolume: string }>;

  constructor(topics: Array<{ topic: string; pillar: any; score: number; searchVolume: string }>) {
    this.topics = topics;
  }

  isConfigured(): boolean {
    return true;
  }

  async fetchSignals(): Promise<DiscoveryResult> {
    const signals = this.topics.map((t, idx) => ({
      source: 'FIXTURE' as const,
      sourceId: `mock-top-${idx + 1}`,
      rawQuery: t.topic,
      timestamp: new Date().toISOString(),
      category: t.pillar,
      sourceUrl: `https://example.com/topic-${idx + 1}`,
      metrics: {
        relativeInterest: t.score,
        searchVolume: 12000,
        visualPotentialScore: 90,
      },
      metadata: {
        mockIdx: idx + 1,
      },
    }));

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals,
      fetchedAt: new Date().toISOString(),
    };
  }
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-debug-'));
  const repoDir = path.join(tmpDir, 'repo');
  const contentDir = path.join(repoDir, 'src', 'content');
  fs.mkdirSync(path.join(contentDir, 'travel'), { recursive: true });

  const repository = new FilesystemContentRepository({ contentRoot: contentDir });
  const gitPublisher = new AstroGitPublisher({ defaultOptions: { gitRepoRoot: repoDir, contentRoot: contentDir } });
  const imageProvider = new MockImageProvider('Mock Cloudflare Workers AI', 'cloudflare-workers-ai', true);
  const storageProvider = new MockStorageProvider(true, 'https://assets.lifemode.life/editorial/travel/nordic-sauna.png');

  const discoveryAdapter = new MockTopicDiscoveryAdapter([
    {
      topic: 'Nordic Sauna Culture and Architecture',
      pillar: 'travel',
      score: 95,
      searchVolume: 'high',
    },
  ]);

  const result = await runDailyEditorialAutomation({
    enabled: true,
    dryRun: false,
    allowCommit: true,
    allowUnrelatedChanges: true,
    maxOpportunities: 1,
    minScoreThreshold: 70,
    providerMode: 'fixture',
    storagePath: path.join(repoDir, 'candidates.json'),
    discoveryAdapters: [discoveryAdapter],
    contentRepository: repository,
    gitPublisher,
    gitRepoRoot: repoDir,
    contentRoot: contentDir,
    imageConfig: {
      enabled: true,
      strategy: 'cloudflare',
      cloudflare: { model: '@cf/black-forest-labs/flux-1-schnell', configured: true },
      bfl: { model: 'flux-pro-1.1', configured: false },
      targetWidth: 1536,
      targetHeight: 864,
      aspectRatio: '16:9',
      maxRetries: 1,
      costGuard: {
        enabled: true,
        dailyLimit: 5,
        monthlyLimit: 120,
      },
    },
    imagePrimaryProvider: imageProvider,
    imageStorageProvider: storageProvider,
  });

  console.log('STATUS:', result.status);
  console.log('SUMMARY:', result.summary);
  console.log('OPPORTUNITIES:', JSON.stringify(result.opportunities, null, 2));

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(console.error);
