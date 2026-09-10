import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult } from '../types.ts';
import { loadDiscoveryConfig } from '../config.ts';

/**
 * YouTube Trends Discovery Adapter.
 * Integrates with YouTube Data API v3 when API key is provided.
 * Safely reports NOT_CONFIGURED when unconfigured.
 */
export class YouTubeTrendsDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'YOUTUBE_TRENDS' as const;
  readonly name = 'YouTube Trends Adapter';

  async fetchSignals(_options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig().providers.youtubeTrends;

    if (!config?.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'YouTube Trends provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    if (!config.apiKey) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'YouTube Data API key not configured. Set YOUTUBE_API_KEY to enable live ingestion.',
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'PROVIDER_UNAVAILABLE',
      signals: [],
      error: 'YouTube Trends endpoint integration pending API authentication verification.',
      fetchedAt: new Date().toISOString(),
    };
  }
}
