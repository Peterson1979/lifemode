import type { SocialImageFormat, SocialVisualAsset, PillarSlug } from '../types.ts';

export interface ImageGenerationRequest {
  topicId: string;
  pillar: PillarSlug;
  prompt: string;
  format: SocialImageFormat;
  headlineOverlay?: string;
  subheadlineOverlay?: string;
}

export interface ImageGenerationResult {
  success: boolean;
  status: 'SUCCESS' | 'NOT_CONFIGURED' | 'FAILED';
  asset?: SocialVisualAsset;
  provider: string;
  error?: string;
  durationMs: number;
}

export interface ISocialImageProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
