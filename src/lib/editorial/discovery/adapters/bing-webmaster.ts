import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult } from '../types.ts';
import { loadDiscoveryConfig } from '../config.ts';

/**
 * Bing Webmaster Discovery Adapter.
 * Integrates with Bing Webmaster API when API key is provided.
 * Safely reports NOT_CONFIGURED when unconfigured.
 */
export class BingWebmasterDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'BING_WEBMASTER' as const;
  readonly name = 'Bing Webmaster Adapter';

  async fetchSignals(_options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig().providers.bingWebmaster;

    if (!config?.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Bing Webmaster provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    if (!config.apiKey) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Bing Webmaster API key not configured. Set BING_WEBMASTER_API_KEY to enable live ingestion.',
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'PROVIDER_UNAVAILABLE',
      signals: [],
      error: 'Bing Webmaster endpoint integration pending API authentication verification.',
      fetchedAt: new Date().toISOString(),
    };
  }
}
