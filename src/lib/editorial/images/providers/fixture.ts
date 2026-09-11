import type {
  IEditorialImageProvider,
  EditorialImageGenerationInput,
  EditorialImageResult,
} from '../contracts.ts';

// 1x1 Minimal valid PNG
const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export class FixtureEditorialImageProvider implements IEditorialImageProvider {
  readonly name = 'Fixture Editorial Image Provider';
  readonly providerId = 'fixture-image';

  private shouldSucceed: boolean;
  private customBuffer?: Buffer;

  constructor(shouldSucceed = true, customBuffer?: Buffer) {
    this.shouldSucceed = shouldSucceed;
    this.customBuffer = customBuffer;
  }

  isConfigured(): boolean {
    return true;
  }

  async generate(input: EditorialImageGenerationInput): Promise<EditorialImageResult> {
    const startTime = Date.now();

    if (!this.shouldSucceed) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerId,
        model: 'fixture-model-v1',
        error: 'Simulated fixture image generation error.',
        durationMs: Date.now() - startTime,
      };
    }

    const imageBuffer = this.customBuffer || Buffer.from(FIXTURE_PNG_BASE64, 'base64');

    return {
      success: true,
      status: 'SUCCESS',
      imageBuffer,
      mimeType: 'image/png',
      width: input.width || 1536,
      height: input.height || 864,
      provider: this.providerId,
      model: 'fixture-model-v1',
      jobId: `fix-job-${input.topicId}`,
      durationMs: Date.now() - startTime,
    };
  }
}
