import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult } from '../types.ts';
import { loadDiscoveryConfig } from '../config.ts';

/**
 * Pinterest Trends Discovery Adapter.
 * Integrates with Pinterest API when credentials are provided.
 * Gracefully reports NOT_CONFIGURED or PROVIDER_UNAVAILABLE when external API access is unconfigured.
 */
export class PinterestTrendsDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'PINTEREST_TRENDS' as const;
  readonly name = 'Pinterest Trends Adapter';

  async fetchSignals(_options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig().providers.pinterest;

    if (!config.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Pinterest Trends provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    if (!config.apiKey) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Pinterest Trends credentials not configured. Set PINTEREST_ACCESS_TOKEN to enable live ingestion.',
        fetchedAt: new Date().toISOString(),
      };
    }

    // In a live integration, fetch from Pinterest API here.
    // For now, if key exists but external endpoint is not yet wired, report provider_unavailable gracefully.
    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'PROVIDER_UNAVAILABLE',
      signals: [],
      error: 'Pinterest Trends endpoint integration is pending official API permissions verification.',
      fetchedAt: new Date().toISOString(),
    };
  }
}
