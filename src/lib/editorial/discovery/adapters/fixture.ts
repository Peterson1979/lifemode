import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal } from '../types.ts';
import { FIXTURE_DISCOVERY_SIGNALS } from '../fixtures/sample-signals.ts';

/**
 * Fixture Discovery Adapter.
 * Provides deterministic discovery signals for local testing and development.
 */
export class FixtureDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'FIXTURE' as const;
  readonly name = 'LifeMode Fixture Signals';

  async fetchSignals(options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const limit = options?.limit ?? FIXTURE_DISCOVERY_SIGNALS.length;
    let signals = [...FIXTURE_DISCOVERY_SIGNALS];

    if (options?.categoryFilter && options.categoryFilter.length > 0) {
      signals = signals.filter((s) => s.category && options.categoryFilter?.includes(s.category));
    }

    const outputSignals: DiscoverySignal[] = signals.slice(0, limit);

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals: outputSignals,
      fetchedAt: new Date().toISOString(),
    };
  }
}
