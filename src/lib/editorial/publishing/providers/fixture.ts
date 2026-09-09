import type { IPublishingProvider, ProviderPublishResult, PublishExecutionOptions } from './types.ts';
import type { PublishPackage } from '../types.ts';

export interface FixturePublishingOptions {
  name?: string;
  forcedError?: string;
}

/**
 * Deterministic In-Memory Fixture Publishing Provider for testing and dry-run execution.
 * Completely offline: never writes to external APIs, CMS, or remote services.
 */
export class FixturePublishingProvider implements IPublishingProvider {
  readonly name: string;
  private publishedRegistry: Set<string> = new Set();
  private forcedError?: string;

  constructor(options: FixturePublishingOptions = {}) {
    this.name = options.name || 'Fixture Publishing Provider';
    this.forcedError = options.forcedError;
  }

  setForcedError(error?: string): void {
    this.forcedError = error;
  }

  async isPublished(publicationId: string): Promise<boolean> {
    return this.publishedRegistry.has(publicationId);
  }

  async publish(pkg: PublishPackage, options: PublishExecutionOptions = {}): Promise<ProviderPublishResult> {
    const isDryRun = options.dryRun ?? true;

    if (this.forcedError) {
      return {
        success: false,
        publicationId: pkg.id,
        dryRun: isDryRun,
        error: {
          code: 'PROVIDER_REJECTED',
          message: this.forcedError,
        },
      };
    }

    // Idempotency / Duplicate Check
    if (this.publishedRegistry.has(pkg.id) && !isDryRun) {
      return {
        success: false,
        publicationId: pkg.id,
        dryRun: false,
        error: {
          code: 'DUPLICATE_PUBLICATION',
          message: `Publication ID "${pkg.id}" has already been published.`,
        },
      };
    }

    const publishedAt = new Date().toISOString();

    if (!isDryRun) {
      this.publishedRegistry.add(pkg.id);
    }

    return {
      success: true,
      publicationId: pkg.id,
      publishedAt: isDryRun ? undefined : publishedAt,
      dryRun: isDryRun,
      metadata: {
        simulatedEndpoint: 'memory://lifemode/content',
        articleSlug: pkg.slug,
        pillar: pkg.pillar,
        author: pkg.publicationMetadata.author,
        dryRun: isDryRun,
      },
    };
  }

  reset(): void {
    this.publishedRegistry.clear();
  }
}
