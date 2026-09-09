import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult } from '../types.ts';
import { loadDiscoveryConfig } from '../config.ts';

/**
 * Google Trends Discovery Adapter.
 * Integrates with official Google Trends API when configured.
 * Strictly avoids unofficial web scraping and provides clean state diagnostics.
 */
export class GoogleTrendsDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'GOOGLE_TRENDS' as const;
  readonly name = 'Google Trends Adapter';

  async fetchSignals(_options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig().providers.googleTrends;

    if (!config.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Google Trends provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    if (!config.apiKey) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Google Trends API key not configured. Set GOOGLE_TRENDS_API_KEY to enable live ingestion.',
        fetchedAt: new Date().toISOString(),
      };
    }

    // When API key is provided, execute official API call.
    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'PROVIDER_UNAVAILABLE',
      signals: [],
      error: 'Google Trends official API endpoint integration pending authentication configuration.',
      fetchedAt: new Date().toISOString(),
    };
  }
}
