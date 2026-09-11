import type { SocialPlatform } from './types.ts';

function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key]) {
    return (import.meta as any).env[key];
  }
  const proc = (globalThis as any).process;
  if (proc?.env?.[key]) {
    return proc.env[key];
  }
  return undefined;
}

export interface PlatformCredentials {
  facebook: {
    pageAccessToken?: string;
    pageId?: string;
    configured: boolean;
  };
  instagram: {
    accessToken?: string;
    businessAccountId?: string;
    configured: boolean;
  };
  pinterest: {
    accessToken?: string;
    boardId?: string;
    configured: boolean;
  };
}

export interface SocialImageConfig {
  provider: 'fixture' | 'cloudflare' | 'openai' | 'custom';
  apiKey?: string;
  accountId?: string;
  endpointUrl?: string;
  defaultFormat: '1080x1350';
}

export interface SocialStorageConfig {
  provider: 'fixture' | 'r2' | 'custom';
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicBaseUrl?: string;
  configured: boolean;
}

export interface SocialAutomationConfig {
  enabled: boolean;
  dryRun: boolean;
  allowPublish: boolean;
  storageTest?: boolean;
  maxOpportunities: number;
  minScoreThreshold: number;
  providerMode: 'fixture' | 'router';
  imageProviderMode: 'fixture' | 'cloudflare' | 'openai' | 'custom';
  baseUrl: string;
  storageDir: string;
  platforms: Record<SocialPlatform, boolean>;
  credentials: PlatformCredentials;
  imageConfig: SocialImageConfig;
  storageConfig: SocialStorageConfig;
}

export function loadSocialConfig(overrides: Partial<SocialAutomationConfig> = {}): SocialAutomationConfig {
  const envStorageTestRaw = getEnvVar('LIFEMODE_SOCIAL_STORAGE_TEST') ?? getEnvVar('SOCIAL_STORAGE_TEST');
  const storageTest = overrides.storageTest ?? (envStorageTestRaw === 'true');

  const envEnabledRaw = getEnvVar('LIFEMODE_SOCIAL_ENABLED') ?? getEnvVar('SOCIAL_AUTOMATION_ENABLED');
  const enabled = overrides.enabled ?? (storageTest || envEnabledRaw === 'true');

  const envDryRunRaw = getEnvVar('LIFEMODE_SOCIAL_DRY_RUN') ?? getEnvVar('SOCIAL_AUTOMATION_DRY_RUN');
  const dryRun = overrides.dryRun ?? (storageTest ? true : envDryRunRaw !== 'false');

  const envPublishRaw = getEnvVar('LIFEMODE_SOCIAL_PUBLISH') ?? getEnvVar('SOCIAL_AUTOMATION_PUBLISH');
  const allowPublish = overrides.allowPublish ?? (storageTest ? false : envPublishRaw === 'true');

  const envMaxOppRaw = getEnvVar('LIFEMODE_SOCIAL_MAX_OPPORTUNITIES') ?? getEnvVar('SOCIAL_MAX_OPPORTUNITIES');
  const maxOpportunities = overrides.maxOpportunities ?? (envMaxOppRaw ? parseInt(envMaxOppRaw, 10) : (storageTest ? 1 : 3));

  const envMinScoreRaw = getEnvVar('LIFEMODE_SOCIAL_MIN_SCORE') ?? getEnvVar('SOCIAL_MIN_SCORE');
  const minScoreThreshold = overrides.minScoreThreshold ?? (envMinScoreRaw ? parseInt(envMinScoreRaw, 10) : 80);

  const envProvider = (getEnvVar('LIFEMODE_SOCIAL_PROVIDER') as any) || (getEnvVar('LIFEMODE_AUTOMATION_PROVIDER') as any) || 'fixture';
  const providerMode = overrides.providerMode ?? (envProvider === 'router' ? 'router' : 'fixture');

  const envImageProvider = (getEnvVar('LIFEMODE_SOCIAL_IMAGE_PROVIDER') as any) || 'fixture';
  const imageProviderMode = overrides.imageProviderMode ?? (storageTest ? 'fixture' : envImageProvider);

  const baseUrl = getEnvVar('LIFEMODE_BASE_URL') || 'https://lifemode.life';
  const storageDir = overrides.storageDir || getEnvVar('LIFEMODE_SOCIAL_STORAGE_DIR') || 'data/social';

  // Facebook credentials
  const fbToken = getEnvVar('FACEBOOK_PAGE_ACCESS_TOKEN') || getEnvVar('FB_PAGE_TOKEN');
  const fbPageId = getEnvVar('FACEBOOK_PAGE_ID') || getEnvVar('FB_PAGE_ID');

  // Instagram credentials
  const igToken = getEnvVar('INSTAGRAM_ACCESS_TOKEN') || fbToken;
  const igAccountId = getEnvVar('INSTAGRAM_BUSINESS_ACCOUNT_ID') || getEnvVar('IG_ACCOUNT_ID');

  // Pinterest credentials
  const pinToken = getEnvVar('PINTEREST_ACCESS_TOKEN') || getEnvVar('PIN_ACCESS_TOKEN');
  const pinBoardId = getEnvVar('PINTEREST_BOARD_ID') || getEnvVar('PIN_BOARD_ID');

  // Image provider credentials
  const cfImageApiKey = getEnvVar('CLOUDFLARE_IMAGE_API_KEY') || getEnvVar('CF_API_TOKEN');
  const cfAccountId = getEnvVar('CLOUDFLARE_ACCOUNT_ID');
  const openaiKey = getEnvVar('OPENAI_API_KEY');

  // Storage credentials (Cloudflare R2 / S3-compatible)
  const r2AccountId = getEnvVar('R2_ACCOUNT_ID') || getEnvVar('CLOUDFLARE_ACCOUNT_ID');
  const r2AccessKeyId = getEnvVar('R2_ACCESS_KEY_ID') || getEnvVar('CLOUDFLARE_R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = getEnvVar('R2_SECRET_ACCESS_KEY') || getEnvVar('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
  const r2BucketName = getEnvVar('R2_BUCKET_NAME') || getEnvVar('CLOUDFLARE_R2_BUCKET_NAME');
  const r2PublicBaseUrl = getEnvVar('R2_PUBLIC_BASE_URL') || getEnvVar('CLOUDFLARE_R2_PUBLIC_DOMAIN') || getEnvVar('R2_PUBLIC_DOMAIN');
  const envStorageProvider = (getEnvVar('LIFEMODE_SOCIAL_STORAGE_PROVIDER') as any) || (storageTest || (r2AccessKeyId && r2SecretAccessKey) ? 'r2' : 'fixture');
  const storageProviderMode = overrides.storageConfig?.provider ?? (storageTest ? 'r2' : envStorageProvider);

  const storageConfig: SocialStorageConfig = {
    provider: storageProviderMode,
    accountId: overrides.storageConfig?.accountId || r2AccountId,
    accessKeyId: overrides.storageConfig?.accessKeyId || r2AccessKeyId,
    secretAccessKey: overrides.storageConfig?.secretAccessKey || r2SecretAccessKey,
    bucketName: overrides.storageConfig?.bucketName || r2BucketName,
    publicBaseUrl: overrides.storageConfig?.publicBaseUrl || r2PublicBaseUrl,
    configured: Boolean(
      (overrides.storageConfig?.accountId || r2AccountId) &&
      (overrides.storageConfig?.accessKeyId || r2AccessKeyId) &&
      (overrides.storageConfig?.secretAccessKey || r2SecretAccessKey) &&
      (overrides.storageConfig?.bucketName || r2BucketName) &&
      (overrides.storageConfig?.publicBaseUrl || r2PublicBaseUrl)
    ),
  };

  const credentials: PlatformCredentials = {
    facebook: {
      pageAccessToken: fbToken,
      pageId: fbPageId,
      configured: Boolean(fbToken && fbPageId),
    },
    instagram: {
      accessToken: igToken,
      businessAccountId: igAccountId,
      configured: Boolean(igToken && igAccountId),
    },
    pinterest: {
      accessToken: pinToken,
      boardId: pinBoardId,
      configured: Boolean(pinToken && pinBoardId),
    },
  };

  const imageConfig: SocialImageConfig = {
    provider: imageProviderMode,
    apiKey: cfImageApiKey || openaiKey,
    accountId: cfAccountId,
    defaultFormat: '1080x1350',
  };

  return {
    enabled,
    dryRun,
    allowPublish,
    storageTest,
    maxOpportunities: isNaN(maxOpportunities) ? (storageTest ? 1 : 3) : maxOpportunities,
    minScoreThreshold: isNaN(minScoreThreshold) ? 80 : minScoreThreshold,
    providerMode,
    imageProviderMode,
    baseUrl,
    storageDir,
    platforms: {
      facebook: true,
      instagram: true,
      pinterest: true,
    },
    credentials,
    imageConfig,
    storageConfig,
  };
}
