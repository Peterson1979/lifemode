import type {
  SocialPlatform,
  GeneratedSocialContent,
  SocialVisualAsset,
  SocialPlatformPackage,
  SocialPlatformPublishResult,
} from '../types.ts';
import type { SocialValidationResult } from '../validation.ts';

export interface PlatformPrepareOptions {
  destinationUrl?: string;
  boardId?: string;
}

export interface PlatformPublishOptions {
  dryRun?: boolean;
}

export interface ISocialPlatformAdapter {
  readonly platform: SocialPlatform;
  readonly name: string;
  isConfigured(): boolean;
  validate(pkg: SocialPlatformPackage): SocialValidationResult;
  prepare(
    content: GeneratedSocialContent,
    asset: SocialVisualAsset,
    options?: PlatformPrepareOptions
  ): Promise<SocialPlatformPackage>;
  publish(
    pkg: SocialPlatformPackage,
    options?: PlatformPublishOptions
  ): Promise<SocialPlatformPublishResult>;
}
