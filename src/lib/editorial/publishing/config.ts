import type { PublishingGateThresholds } from './types.ts';

export interface PublishingConfig {
  provider: string;
  dryRun: boolean;
  defaultAuthor: string;
  thresholds: PublishingGateThresholds;
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
 * Loads and returns typed Publishing configuration with safe defaults (defaults to dryRun).
 */
export function loadPublishingConfig(overrides: Partial<PublishingConfig> = {}): PublishingConfig {
  const defaultConfig: PublishingConfig = {
    provider: getEnv('PUBLISHING_PROVIDER', 'fixture'),
    dryRun: getEnv('PUBLISHING_DRY_RUN') ? getEnvBoolean('PUBLISHING_DRY_RUN', true) : true,
    defaultAuthor: getEnv('PUBLISHING_DEFAULT_AUTHOR', 'LifeMode Editorial'),
    thresholds: {
      minOverallScore: getEnvNumber('PUBLISHING_MIN_SCORE', 85),
      minSafetyScore: getEnvNumber('PUBLISHING_MIN_SAFETY_SCORE', 85),
      minFactualityScore: getEnvNumber('PUBLISHING_MIN_FACTUALITY_SCORE', 85),
      requirePassDecision: true,
      disallowUnresolvedPlaceholders: true,
    },
  };

  return {
    ...defaultConfig,
    ...overrides,
    thresholds: {
      ...defaultConfig.thresholds,
      ...overrides.thresholds,
    },
  };
}
