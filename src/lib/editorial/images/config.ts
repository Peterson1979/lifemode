export interface EditorialImageProviderConfig {
  accountId?: string;
  apiToken?: string;
  model: string;
  configured: boolean;
}

export interface BFLProviderConfig {
  apiKey?: string;
  model: string;
  configured: boolean;
}

export interface EditorialImageCostGuardConfig {
  enabled: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  kvNamespaceId?: string;
}

export interface EditorialImageConfig {
  enabled: boolean;
  strategy: 'cloudflare' | 'bfl';
  cloudflare: EditorialImageProviderConfig;
  bfl: BFLProviderConfig;
  costGuard: EditorialImageCostGuardConfig;
  maxRetries: number;
  targetWidth: number;
  targetHeight: number;
  aspectRatio: string;
}

function getEnv(key: string, defaultValue = ''): string {
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
    return process.env[key] as string;
  }
  const metaEnv = (import.meta as any)?.env;
  if (metaEnv && metaEnv[key] !== undefined) {
    return String(metaEnv[key]);
  }
  return defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const val = getEnv(key);
  if (!val) return defaultValue;
  const num = Number(val);
  return Number.isFinite(num) ? num : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const val = getEnv(key);
  if (!val) return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
}

/**
 * Loads typed configuration for the editorial image generation pipeline.
 */
export function loadEditorialImageConfig(
  overrides: Partial<EditorialImageConfig> = {}
): EditorialImageConfig {
  const cfAccountId =
    getEnv('CLOUDFLARE_ACCOUNT_ID') ||
    getEnv('CF_ACCOUNT_ID') ||
    getEnv('R2_ACCOUNT_ID');

  const cfApiToken =
    getEnv('CLOUDFLARE_API_TOKEN') ||
    getEnv('CF_API_TOKEN') ||
    getEnv('CLOUDFLARE_IMAGE_API_KEY');

  const cfModel =
    getEnv('LIFEMODE_IMAGE_PRIMARY_MODEL') ||
    '@cf/black-forest-labs/flux-1-schnell';

  const bflApiKey =
    getEnv('BFL_API_KEY') ||
    getEnv('BLACK_FOREST_LABS_API_KEY');

  const bflModel =
    getEnv('LIFEMODE_IMAGE_FALLBACK_MODEL') ||
    'flux-pro-1.1';

  const rawStrategy = getEnv('LIFEMODE_IMAGE_PROVIDER', 'cloudflare').toLowerCase();
  const strategy: 'cloudflare' | 'bfl' = rawStrategy === 'bfl' ? 'bfl' : 'cloudflare';

  const enabled = getEnvBoolean('LIFEMODE_IMAGE_ENABLED', false);
  const maxRetries = Math.max(0, Math.min(3, getEnvNumber('LIFEMODE_IMAGE_MAX_RETRIES', 1)));

  const costGuardEnabled = getEnv('LIFEMODE_IMAGE_COST_GUARD') !== undefined
    ? getEnvBoolean('LIFEMODE_IMAGE_COST_GUARD', true)
    : true;
  const dailyLimit = Math.max(1, getEnvNumber('LIFEMODE_IMAGE_DAILY_LIMIT', 5));
  const monthlyLimit = Math.max(1, getEnvNumber('LIFEMODE_IMAGE_MONTHLY_LIMIT', 120));
  const kvNamespaceId =
    getEnv('CLOUDFLARE_KV_NAMESPACE_ID') ||
    getEnv('CF_KV_NAMESPACE_ID') ||
    getEnv('CLOUDFLARE_IMAGE_KV_NAMESPACE_ID');

  const baseConfig: EditorialImageConfig = {
    enabled,
    strategy,
    cloudflare: {
      accountId: cfAccountId || undefined,
      apiToken: cfApiToken || undefined,
      model: cfModel,
      configured: Boolean(cfAccountId && cfApiToken),
    },
    bfl: {
      apiKey: bflApiKey || undefined,
      model: bflModel,
      configured: Boolean(bflApiKey),
    },
    costGuard: {
      enabled: costGuardEnabled,
      dailyLimit,
      monthlyLimit,
      kvNamespaceId: kvNamespaceId || undefined,
    },
    maxRetries,
    targetWidth: 1536,
    targetHeight: 864,
    aspectRatio: '16:9',
  };

  return {
    ...baseConfig,
    ...overrides,
    cloudflare: {
      ...baseConfig.cloudflare,
      ...(overrides.cloudflare || {}),
    },
    bfl: {
      ...baseConfig.bfl,
      ...(overrides.bfl || {}),
    },
    costGuard: {
      ...baseConfig.costGuard,
      ...(overrides.costGuard || {}),
    },
  };
}
