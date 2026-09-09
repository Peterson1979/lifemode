import { resolve } from 'node:path';

export interface StorageConfig {
  contentRoot: string;
}

export const DEFAULT_CONTENT_ROOT = 'src/content';

/**
 * Loads storage configuration with fallback to environment variable or default Astro content path.
 */
export function loadStorageConfig(overrides?: Partial<StorageConfig>): StorageConfig {
  const rawRoot =
    overrides?.contentRoot ||
    process.env.LIFEMODE_CONTENT_ROOT ||
    DEFAULT_CONTENT_ROOT;

  return {
    contentRoot: resolve(process.cwd(), rawRoot),
  };
}
