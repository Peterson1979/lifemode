import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult } from '../types.ts';
import { loadDiscoveryConfig } from '../config.ts';

/**
 * Internal Analytics Discovery Adapter.
 * Identifies high-performing topics and gaps from internal LifeMode telemetry.
 * Safely reports NOT_CONFIGURED when unconfigured.
 */
export class InternalAnalyticsDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'INTERNAL_ANALYTICS' as const;
  readonly name = 'Internal Analytics Adapter';

  async fetchSignals(_options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig().providers.internalAnalytics;

    if (!config?.enabled) {
      return {
        provider: this.name,
        sourceType: this.sourceType,
        status: 'NOT_CONFIGURED',
        signals: [],
        error: 'Internal Analytics provider is disabled in configuration.',
        fetchedAt: new Date().toISOString(),
      };
    }

    // In a live system, this reads from analytics database/logs
    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'NOT_CONFIGURED',
      signals: [],
      error: 'Internal Analytics data store not configured.',
      fetchedAt: new Date().toISOString(),
    };
  }
}
