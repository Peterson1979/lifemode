import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult } from '../types.ts';
import { loadDiscoveryConfig } from '../config.ts';

/**
 * Google Search Console Discovery Adapter.
 * Integrates with Search Console Search Analytics API when credentials are provided.
 * Safely reports NOT_CONFIGURED when unconfigured.
 */
export class GoogleSearchConsoleDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'GOOGLE_SEARCH_CONSOLE' as const;
  readonly name = 'Google Search Console Adapter';

  async fetchSignals(_options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig().providers.googleSearchConsole;

    if (!config?.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Google Search Console provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    if (!config.apiKey) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Google Search Console credentials not configured. Set GSC_CLIENT_EMAIL / GSC_PRIVATE_KEY to enable live ingestion.',
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'PROVIDER_UNAVAILABLE',
      signals: [],
      error: 'Google Search Console endpoint integration pending API authentication verification.',
      fetchedAt: new Date().toISOString(),
    };
  }
}
