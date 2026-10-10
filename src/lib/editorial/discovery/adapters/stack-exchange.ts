import type { IDiscoveryAdapter, DiscoveryAdapterOptions, StackExchangePayload } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal, ProviderStatus } from '../types.ts';
import type { PillarSlug } from '../../types.ts';
import { loadDiscoveryConfig } from '../config.ts';

export interface StackExchangeSiteConfig {
  site: string;
  pillar: PillarSlug;
  tags?: string[];
}

export const DEFAULT_STACK_EXCHANGE_SITES: StackExchangeSiteConfig[] = [
  { site: 'lifehacks', pillar: 'life' },
  { site: 'cooking', pillar: 'home' },
  { site: 'diy', pillar: 'home' },
  { site: 'fitness', pillar: 'health' },
  { site: 'superuser', pillar: 'tech-ai' },
  { site: 'money', pillar: 'wealth' },
];

export interface StackExchangeAdapterOptions extends DiscoveryAdapterOptions {
  fetchFn?: typeof fetch;
  sites?: StackExchangeSiteConfig[];
}

/**
 * Decodes standard HTML entities commonly found in Stack Exchange question titles.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Stack Exchange Real-World Question Discovery Adapter.
 *
 * Discovers real, high-demand user questions, everyday problems, and practical curiosities
 * using the public, keyless Stack Exchange API across core LifeMode pillars:
 * - lifehacks (Life & Everyday Routines)
 * - cooking (Food & Kitchen Care)
 * - diy (Home Maintenance & Household Systems)
 * - fitness (Health & Conditioning)
 * - superuser (Tech, Software & Workflows)
 * - money (Wealth, Cashflow & Personal Finance)
 *
 * Operates purely on public demand signals without copying third-party answers.
 */
export class StackExchangeDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'STACK_EXCHANGE' as const;
  readonly name = 'Stack Exchange Public Questions';

  private fetchFn: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.fetchFn = customFetch || globalThis.fetch.bind(globalThis);
  }

  async fetchSignals(options?: StackExchangeAdapterOptions): Promise<DiscoveryResult> {
    const config = loadDiscoveryConfig();
    const fetchImpl = options?.fetchFn || this.fetchFn;
    const sitesToFetch = options?.sites || DEFAULT_STACK_EXCHANGE_SITES;
    const timeoutMs = config.requestTimeoutMs || 8000;
    const limitPerSite = Math.max(5, Math.floor((options?.limit ?? 50) / sitesToFetch.length));
    const now = new Date();

    const signals: DiscoverySignal[] = [];
    const errors: string[] = [];
    let successfulSites = 0;

    let targetSites = sitesToFetch;
    if (options?.categoryFilter && options.categoryFilter.length > 0) {
      targetSites = targetSites.filter((s) => options.categoryFilter?.includes(s.pillar));
    }

    const fetchPromises = targetSites.map(async (siteConfig) => {
      try {
        let signal: AbortSignal | undefined;
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          signal = AbortSignal.timeout(timeoutMs);
        }

        const url = `https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=${encodeURIComponent(
          siteConfig.site
        )}&pagesize=${limitPerSite}&filter=default`;

        const response = await fetchImpl(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'LifeMode-Discovery/2.0 (+https://lifemode.life)',
          },
          signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const items = Array.isArray(data?.items) ? data.items : [];

        for (const item of items) {
          if (!item.title) continue;

          const rawTitle = decodeHtmlEntities(item.title);
          const score = typeof item.score === 'number' ? item.score : 0;
          const viewCount = typeof item.view_count === 'number' ? item.view_count : 0;
          const answerCount = typeof item.answer_count === 'number' ? item.answer_count : 0;
          const tags = Array.isArray(item.tags) ? item.tags : [];

          // Require reasonable community engagement (positive score or active answers)
          if (score < 0) continue;

          // Compute engagement volume signal
          const engagementWeight = score * 2 + answerCount * 3 + Math.round(Math.log10(Math.max(1, viewCount)) * 5);

          const payload: StackExchangePayload = {
            site: siteConfig.site,
            questionId: item.question_id,
            title: rawTitle,
            link: item.link || `https://${siteConfig.site}.stackexchange.com/q/${item.question_id}`,
            score,
            viewCount,
            answerCount,
            tags,
            creationDate: item.creation_date || Math.floor(Date.now() / 1000),
          };

          signals.push({
            source: this.sourceType,
            sourceId: `se-${siteConfig.site}-${item.question_id}`,
            rawQuery: rawTitle,
            sourceUrl: payload.link,
            publisherName: `Stack Exchange (${siteConfig.site})`,
            category: siteConfig.pillar,
            timestamp: now.toISOString(),
            metrics: {
              relativeInterest: engagementWeight,
              searchVolume: viewCount,
            },
            metadata: payload,
          });
        }

        successfulSites++;
      } catch (err: any) {
        errors.push(`[${siteConfig.site}] ${err.message || String(err)}`);
      }
    });

    await Promise.all(fetchPromises);

    const status: ProviderStatus =
      successfulSites === targetSites.length
        ? 'AVAILABLE'
        : successfulSites > 0
        ? 'AVAILABLE'
        : 'FAILED';

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status,
      classification: 'REAL_EXTERNAL',
      signals: signals.slice(0, options?.limit ?? 50),
      error: errors.length > 0 ? errors.join('; ') : undefined,
      fetchedAt: now.toISOString(),
    };
  }
}
