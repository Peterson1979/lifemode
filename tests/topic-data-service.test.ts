import test from 'node:test';
import assert from 'node:assert/strict';

import { TopicDataService } from '../src/lib/topic-data/service.ts';
import { TopicDataProviderRegistry } from '../src/lib/topic-data/registry.ts';
import { TopicDataCache } from '../src/lib/topic-data/cache/store.ts';
import { handleTopicDataApiRequest, isCurrentDataDomain } from '../src/lib/topic-data/runtime-handler.ts';
import type { PillarSlug } from '../src/config/site.ts';

test('1. TopicDataService: Retrieves configured data blocks across all 8 LifeMode pillars', async () => {
  const cache = new TopicDataCache();
  const registry = new TopicDataProviderRegistry(cache);
  const service = new TopicDataService({ registry });

  // Dummy mock fetch for all network calls
  const mockFetch = async () =>
    new Response(
      JSON.stringify({
        // Generic response matching minimal shapes
        features: [],
        metadata: { generated: Date.now() },
        base: 'EUR',
        date: '2026-09-18',
        rates: { USD: 1.08 },
        location: { name: 'Tokyo', country: 'Japan', lat: 35.69, lon: 139.69, localtime: '2026-09-19 23:00' },
        current: { temp_c: 22.0, temp_f: 71.6, condition: { text: 'Clear' }, humidity: 55, wind_kph: 10, last_updated: '2026-09-19 23:00' },
        results: [],
        foods: [{ description: 'Ingredient', foodNutrients: [] }],
        name: 'test-repo',
        html_url: 'https://github.com/test',
        title: 'Culture Title',
        extract: 'Culture extract',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const pillars: PillarSlug[] = [
    'now',
    'money',
    'travel',
    'wellbeing',
    'food-drink',
    'tech-ai',
    'discover',
    'life',
  ];

  for (const pillar of pillars) {
    const blocks = await service.getTopicData(pillar, {
      customFetch: mockFetch,
      forceFresh: true,
    });

    assert.ok(Array.isArray(blocks), `Blocks for ${pillar} should be an array`);
    assert.ok(blocks.length > 0, `Pillar ${pillar} must have at least 1 data block configured`);

    for (const block of blocks) {
      assert.equal(block.pillar, pillar);
      assert.ok(block.id);
      assert.ok(block.domain);
      assert.ok(block.source.name);
      assert.ok(block.freshness.status);
    }
  }
});

test('2. Failure Isolation: One provider failure does not break the other topic blocks', async () => {
  const cache = new TopicDataCache();
  const registry = new TopicDataProviderRegistry(cache);
  const service = new TopicDataService({ registry });

  // Mock fetch that fails only for earthquakes endpoint
  const selectiveFetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    if (urlStr.includes('earthquake.usgs.gov')) {
      return new Response(JSON.stringify({ error: 'USGS down' }), { status: 500 });
    }
    // Weather succeeds
    return new Response(
      JSON.stringify({
        location: { name: 'Tokyo', country: 'Japan', lat: 35.69, lon: 139.69 },
        current: { temp_c: 21.0, condition: { text: 'Clear' }, humidity: 50, wind_kph: 8 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const blocks = await service.getTopicData('now', {
    customFetch: selectiveFetch,
    forceFresh: true,
    maxRetries: 0,
  });

  assert.equal(blocks.length, 3); // now has 3 providers: news, weather, earthquakes
  const newsBlock = blocks[0];
  const weatherBlock = blocks[1];
  const earthquakeBlock = blocks[2];

  // News must always be the first displayed data block in Now
  assert.equal(newsBlock.domain, 'news', 'First block in Now must be News');
  assert.equal(weatherBlock.domain, 'weather', 'Second block in Now must be Weather');
  assert.equal(earthquakeBlock.domain, 'earthquakes', 'Third block in Now must be Earthquakes');

  assert.ok(earthquakeBlock);
  assert.equal(earthquakeBlock?.status, 'unavailable');
  assert.equal(earthquakeBlock?.data, null);

  assert.ok(weatherBlock);
  assert.equal(weatherBlock?.status, 'available');
  assert.ok(weatherBlock?.data);
});

test('3. Article Opt-In: getArticleData successfully resolves targeted queries', async () => {
  const cache = new TopicDataCache();
  const registry = new TopicDataProviderRegistry(cache);
  const service = new TopicDataService({ registry });

  const mockFxFetch = async () =>
    new Response(
      JSON.stringify({
        base: 'EUR',
        date: '2026-09-18',
        rates: { USD: 1.085 },
      }),
      { status: 200 }
    );

  const result = await service.getArticleData(
    {
      articleId: 'travel-kyoto-guide-2026',
      pillar: 'travel',
      domain: 'fx',
      params: {
        currency: { base: 'EUR', targets: ['JPY', 'USD'] },
      },
    },
    { customFetch: mockFxFetch, forceFresh: true }
  );

  assert.equal(result.articleId, 'travel-kyoto-guide-2026');
  assert.equal(result.domain, 'fx');
  assert.equal(result.isApplicable, true);
  assert.equal(result.block.status, 'available');
  assert.ok(result.block.data);
});

test('4. Runtime Endpoint: handleTopicDataApiRequest returns normalized topic data and handles invalid input', async () => {
  const cache = new TopicDataCache();
  const registry = new TopicDataProviderRegistry(cache);
  const service = new TopicDataService({ registry });

  // 1. Invalid pillar -> 400
  const invalidReq = new Request('https://lifemode.life/api/topic-data?pillar=invalid_pillar');
  const res400 = await handleTopicDataApiRequest(invalidReq, {}, service);
  assert.equal(res400.status, 400);
  const body400 = await res400.json();
  assert.equal(body400.success, false);
  assert.ok(body400.error.includes('Invalid or missing pillar'));

  // 2. Valid pillar with currentOnly=true
  const validReq = new Request('https://lifemode.life/api/topic-data?pillar=now&currentOnly=true');
  const res200 = await handleTopicDataApiRequest(validReq, { WEATHERAPI_API_KEY: 'test-key' }, service);
  assert.equal(res200.status, 200);
  assert.ok(res200.headers.get('Content-Type')?.includes('application/json'));
  assert.ok(res200.headers.get('Cache-Control')?.includes('public'));

  const body200 = await res200.json();
  assert.equal(body200.success, true);
  assert.equal(body200.pillar, 'now');
  assert.ok(Array.isArray(body200.blocks));
  // All returned blocks must be current data domains
  for (const block of body200.blocks) {
    assert.equal(isCurrentDataDomain(block.domain), true);
  }
});

test('5. Provider Separation: Server-side environment keys are never exposed in API responses', async () => {
  const cache = new TopicDataCache();
  const registry = new TopicDataProviderRegistry(cache);
  const service = new TopicDataService({ registry });

  const secretKey = 'super_secret_weatherapi_key_12345';
  const req = new Request('https://lifemode.life/api/topic-data?pillar=travel');
  const res = await handleTopicDataApiRequest(req, { WEATHERAPI_API_KEY: secretKey }, service);

  const rawJson = await res.text();
  assert.equal(rawJson.includes(secretKey), false, 'API response must never leak secret environment keys');
});
