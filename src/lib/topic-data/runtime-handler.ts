import { PILLAR_SLUGS, type PillarSlug } from '../../config/site.ts';
import { TopicDataService, globalTopicDataService } from './service.ts';
import type { DataDomain, TopicDataBlock } from './types/core.ts';

export const CURRENT_DATA_DOMAINS: DataDomain[] = ['earthquakes', 'weather', 'air_quality'];

export function isCurrentDataDomain(domain: DataDomain): boolean {
  return CURRENT_DATA_DOMAINS.includes(domain);
}

export interface TopicDataApiResponse {
  success: boolean;
  pillar?: PillarSlug;
  timestamp: string;
  blocks: TopicDataBlock[];
  error?: string;
}

/**
 * Universal request handler for the LifeMode Topic Data runtime endpoint.
 * Works seamlessly across Cloudflare Pages Functions, Astro endpoints, and Node tests.
 */
export async function handleTopicDataApiRequest(
  request: Request,
  env: Record<string, string | undefined> = {},
  service: TopicDataService = globalTopicDataService
): Promise<Response> {
  const url = new URL(request.url);
  const pillarParam = (url.searchParams.get('pillar') || '').toLowerCase();
  const currentOnlyParam = url.searchParams.get('currentOnly') === 'true';

  if (!pillarParam || !PILLAR_SLUGS.includes(pillarParam as PillarSlug)) {
    return new Response(
      JSON.stringify({
        success: false,
        timestamp: new Date().toISOString(),
        blocks: [],
        error: `Invalid or missing pillar parameter. Valid pillars: ${PILLAR_SLUGS.join(', ')}`,
      } satisfies TopicDataApiResponse),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const pillar = pillarParam as PillarSlug;
  const weatherApiKey = env.WEATHERAPI_API_KEY || (typeof process !== 'undefined' ? process.env?.WEATHERAPI_API_KEY : undefined);
  const openAqApiKey = env.OPENAQ_API_KEY || (typeof process !== 'undefined' ? process.env?.OPENAQ_API_KEY : undefined);

  try {
    let blocks = await service.getTopicData(pillar, {
      apiKey: weatherApiKey || openAqApiKey,
    });

    if (currentOnlyParam) {
      blocks = blocks.filter((b) => isCurrentDataDomain(b.domain));
    }

    // Cache-Control header: Allow edge cache for 5 minutes for current data, while allowing instant stale-while-revalidate
    const maxAgeSeconds = currentOnlyParam ? 300 : 900;

    return new Response(
      JSON.stringify({
        success: true,
        pillar,
        timestamp: new Date().toISOString(),
        blocks,
      } satisfies TopicDataApiResponse),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${maxAgeSeconds}, stale-while-revalidate=600`,
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown runtime data error';
    return new Response(
      JSON.stringify({
        success: false,
        pillar,
        timestamp: new Date().toISOString(),
        blocks: [],
        error: message,
      } satisfies TopicDataApiResponse),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
