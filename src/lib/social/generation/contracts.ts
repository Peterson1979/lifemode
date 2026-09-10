import type { SocialBrief, GeneratedSocialContent } from '../types.ts';

export interface SocialGenerationResult {
  success: boolean;
  content?: GeneratedSocialContent;
  rawResponse?: string;
  durationMs: number;
  provider: string;
  model?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface ISocialGenerationProvider {
  readonly name: string;
  readonly model?: string;
  generateSocialContent(brief: SocialBrief): Promise<SocialGenerationResult>;
}
