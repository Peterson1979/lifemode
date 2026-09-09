import type { PublishPackage } from '../types.ts';

export interface ProviderPublishResult {
  success: boolean;
  publicationId: string;
  publishedAt?: string;
  dryRun: boolean;
  error?: {
    code: string;
    message: string;
  };
  metadata?: Record<string, any>;
}

export interface PublishExecutionOptions {
  dryRun?: boolean;
}

/**
 * Provider-agnostic interface for article publishing engines.
 * Decoupled from Astro, Cloudflare, GitHub, WordPress, or external headless CMS.
 */
export interface IPublishingProvider {
  readonly name: string;

  /**
   * Publishes or dry-runs publication of a normalized PublishPackage.
   */
  publish(pkg: PublishPackage, options?: PublishExecutionOptions): Promise<ProviderPublishResult>;

  /**
   * Checks whether an article with the given publication ID is already published.
   */
  isPublished(publicationId: string): Promise<boolean>;
}
