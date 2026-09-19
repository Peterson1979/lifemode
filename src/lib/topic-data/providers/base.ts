import type { PillarSlug } from '../../../config/site.ts';
import type {
  DataDomain,
  DataSource,
  DataFetchError,
  TopicDataBlock,
  ProviderRequestOptions,
} from '../types/core.ts';
import { TopicDataCache, globalTopicDataCache } from '../cache/store.ts';

/**
 * Base abstract class for all external data providers in LifeMode.
 * Encapsulates network timeouts, bounded retries, validation, error mapping, and cache integration.
 */
export abstract class BaseTopicDataProvider<T = unknown> {
  abstract readonly providerId: string;
  abstract readonly name: string;
  abstract readonly domain: DataDomain;
  abstract readonly defaultPillar: PillarSlug;
  abstract readonly source: DataSource;

  protected cache: TopicDataCache;

  constructor(cache: TopicDataCache = globalTopicDataCache) {
    this.cache = cache;
  }

  /**
   * Primary public method to get data block.
   * Handles caching, fresh verification, fallback on error, and isolation.
   */
  public async getDataBlock(
    options: ProviderRequestOptions = {},
    customIdentifier: string = 'default'
  ): Promise<TopicDataBlock<T>> {
    const cacheKey = this.cache.makeKey(this.domain, `${this.providerId}:${customIdentifier}`);

    // Check cache unless forceFresh is requested
    if (!options.forceFresh) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached.hit && cached.block && !cached.isStale) {
        return cached.block;
      }
    }

    try {
      const rawData = await this.executeFetchWithRetry(options);
      const normalizedData = this.validateAndNormalize(rawData);
      const sourceUpdatedAt = this.extractSourceUpdatedAt(rawData);

      const block: TopicDataBlock<T> = {
        id: `block-${this.domain}-${this.providerId}-${customIdentifier}`,
        pillar: this.defaultPillar,
        domain: this.domain,
        title: this.getTitle(normalizedData),
        subtitle: this.getSubtitle(normalizedData),
        status: 'available',
        data: normalizedData,
        source: this.source,
        freshness: {
          status: 'fresh',
          fetchedAt: new Date().toISOString(),
          sourceUpdatedAt,
          expiresAt: new Date().toISOString(),
          ttlSeconds: 3600,
          ageSeconds: 0,
          label: 'Updated just now',
        },
      };

      // Store in cache
      return this.cache.set(cacheKey, block);
    } catch (error) {
      const fetchError = this.normalizeError(error);

      // Attempt to return stale cached entry as fallback if available
      const staleFallback = this.cache.get<T>(cacheKey);
      if (staleFallback.hit && staleFallback.block) {
        return {
          ...staleFallback.block,
          status: 'stale_available',
          error: fetchError,
        };
      }

      // No fallback available -> return controlled unavailable block
      return {
        id: `block-${this.domain}-${this.providerId}-${customIdentifier}`,
        pillar: this.defaultPillar,
        domain: this.domain,
        title: this.getTitle(null),
        subtitle: 'Data temporarily unavailable',
        status: 'unavailable',
        data: null,
        source: this.source,
        freshness: {
          status: 'expired',
          fetchedAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
          ttlSeconds: 0,
          ageSeconds: 0,
          label: 'Data temporarily unavailable',
        },
        error: fetchError,
      };
    }
  }

  /**
   * Executes HTTP request with timeout and bounded retries.
   */
  protected async executeFetchWithRetry(options: ProviderRequestOptions): Promise<unknown> {
    const timeoutMs = options.timeoutMs ?? 4000;
    const maxRetries = options.maxRetries ?? 1;
    const fetchImpl = options.customFetch ?? globalThis.fetch.bind(globalThis);

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const url = this.getEndpointUrl(options);
        const headers = this.getRequestHeaders(options);

        const response = await fetchImpl(url, {
          signal: controller.signal,
          headers,
        });

        clearTimeout(timer);

        if (response.status === 429) {
          throw new DataProviderException('RATE_LIMITED', `Rate limit reached for ${this.name}`, 429);
        }

        if (!response.ok) {
          throw new DataProviderException(
            'HTTP_ERROR',
            `HTTP ${response.status} from ${this.name}: ${response.statusText}`,
            response.status
          );
        }

        const json = await response.json();
        return json;
      } catch (err: unknown) {
        clearTimeout(timer);
        lastError = err;

        // If it was an explicit rate limit or abort without retries remaining, break immediately
        if (err instanceof DataProviderException && err.code === 'RATE_LIMITED') {
          break;
        }

        if (attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, 250 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError;
  }

  /**
   * Normalizes unknown error into structured DataFetchError.
   */
  protected normalizeError(err: unknown): DataFetchError {
    const nowIso = new Date().toISOString();

    if (err instanceof DataProviderException) {
      return {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        providerId: this.providerId,
        timestamp: nowIso,
      };
    }

    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
      return {
        code: 'TIMEOUT',
        message: `Request timed out for ${this.name}`,
        providerId: this.providerId,
        timestamp: nowIso,
      };
    }

    const message = err instanceof Error ? err.message : 'Unknown data provider error';
    return {
      code: 'NETWORK_ERROR',
      message,
      providerId: this.providerId,
      timestamp: nowIso,
    };
  }

  // --- Abstract / Overrideable Methods ---

  /**
   * Provider-specific URL endpoint constructor.
   */
  protected abstract getEndpointUrl(options: ProviderRequestOptions): string;

  /**
   * Provider-specific request headers (e.g. User-Agent or API keys).
   */
  protected getRequestHeaders(_options: ProviderRequestOptions): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'LifeMode/1.0 (https://lifemode.life; topic-data)',
    };
  }

  /**
   * Validates external JSON structure and produces typed output.
   * Throws DataProviderException on malformed payload.
   */
  protected abstract validateAndNormalize(raw: unknown): T;

  /**
   * Extracts upstream source update timestamp if provided by upstream API.
   */
  protected extractSourceUpdatedAt(_raw: unknown): string | undefined {
    return undefined;
  }

  /**
   * Generates card title for this block.
   */
  protected abstract getTitle(data: T | null): string;

  /**
   * Generates optional card subtitle.
   */
  protected getSubtitle(_data: T | null): string | undefined {
    return undefined;
  }
}

/**
 * Custom typed exception for data provider failures.
 */
export class DataProviderException extends Error {
  public readonly code: DataFetchError['code'];
  public readonly statusCode?: number;

  constructor(
    code: DataFetchError['code'],
    message: string,
    statusCode?: number
  ) {
    super(message);
    this.name = 'DataProviderException';
    this.code = code;
    this.statusCode = statusCode;
  }
}
