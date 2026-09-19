import test from 'node:test';
import assert from 'node:assert/strict';

import { UsgsEarthquakeProvider } from '../src/lib/topic-data/providers/earthquake.ts';
import { FrankfurterFxProvider } from '../src/lib/topic-data/providers/fx.ts';
import { WeatherApiProvider } from '../src/lib/topic-data/providers/weather.ts';
import { OpenAqAirQualityProvider } from '../src/lib/topic-data/providers/air-quality.ts';
import { WorldBankEconomicProvider } from '../src/lib/topic-data/providers/economic.ts';
import { UsdaFoodDataProvider } from '../src/lib/topic-data/providers/food.ts';
import { GitHubTechActivityProvider } from '../src/lib/topic-data/providers/tech.ts';
import { WikimediaKnowledgeProvider } from '../src/lib/topic-data/providers/knowledge.ts';
import { TopicDataCache } from '../src/lib/topic-data/cache/store.ts';

// Helper to create a mock fetch returning JSON
function createMockFetch(jsonPayload: unknown, status: number = 200, statusText: string = 'OK') {
  return async () =>
    new Response(JSON.stringify(jsonPayload), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' },
    });
}

// Helper to create a mock fetch that times out
function createTimeoutFetch() {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    throw new DOMException('The operation was aborted.', 'AbortError');
  };
}

test('1. USGS Earthquake Provider: Successfully normalizes valid GeoJSON feed', async () => {
  const cache = new TopicDataCache();
  const provider = new UsgsEarthquakeProvider(cache);

  const mockGeoJson = {
    metadata: {
      generated: 1773936000000,
      title: 'USGS Earthquakes',
      count: 2,
    },
    features: [
      {
        id: 'us7000test1',
        properties: {
          mag: 5.4,
          place: '62 km S of Honshu, Japan',
          time: 1773935000000,
          updated: 1773935500000,
          url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test1',
          sig: 450,
          tsunami: 0,
        },
        geometry: {
          coordinates: [139.5, 35.2, 30.5],
        },
      },
    ],
  };

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockGeoJson),
    forceFresh: true,
  });

  assert.equal(block.status, 'available');
  assert.equal(block.domain, 'earthquakes');
  assert.equal(block.source.id, 'usgs');
  assert.ok(block.data);
  assert.equal(block.data.items.length, 1);
  assert.equal(block.data.items[0].magnitude, 5.4);
  assert.equal(block.data.items[0].place, '62 km S of Honshu, Japan');
  assert.equal(block.data.items[0].coordinates.depthKm, 30.5);
  assert.ok(block.freshness.sourceUpdatedAt);
});

test('2. USGS Earthquake Provider: Rejects malformed payload cleanly with unavailable state', async () => {
  const cache = new TopicDataCache();
  const provider = new UsgsEarthquakeProvider(cache);

  const block = await provider.getDataBlock({
    customFetch: createMockFetch({ invalid: 'no features' }),
    forceFresh: true,
  });

  assert.equal(block.status, 'unavailable');
  assert.equal(block.data, null);
  assert.ok(block.error);
  assert.equal(block.error.code, 'MALFORMED_PAYLOAD');
});

test('3. Frankfurter FX Provider: Normalizes EUR reference rates and currency symbols', async () => {
  const cache = new TopicDataCache();
  const provider = new FrankfurterFxProvider(cache);

  const mockFx = {
    amount: 1.0,
    base: 'EUR',
    date: '2026-09-18',
    rates: {
      USD: 1.0852,
      GBP: 0.8541,
      JPY: 162.45,
    },
  };

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockFx),
    forceFresh: true,
  });

  assert.equal(block.status, 'available');
  assert.equal(block.domain, 'fx');
  assert.ok(block.data);
  assert.equal(block.data.baseCurrency, 'EUR');
  assert.equal(block.data.rates.length, 3);
  assert.equal(block.data.rates[0].currency, 'USD');
  assert.equal(block.data.rates[0].symbol, '$');
  assert.equal(block.data.rates[0].rate, 1.0852);
  assert.ok(block.freshness.sourceUpdatedAt?.includes('2026-09-18'));
});

test('4. Frankfurter FX Provider: Handles HTTP 429 rate limit without fabricating data', async () => {
  const cache = new TopicDataCache();
  const provider = new FrankfurterFxProvider(cache);

  const block = await provider.getDataBlock({
    customFetch: createMockFetch({ error: 'Too many requests' }, 429, 'Too Many Requests'),
    forceFresh: true,
  });

  assert.equal(block.status, 'unavailable');
  assert.equal(block.data, null);
  assert.ok(block.error);
  assert.equal(block.error.code, 'RATE_LIMITED');
  assert.equal(block.error.statusCode, 429);
});

test('5. WeatherAPI Provider: Normalizes current weather, temperatures, and conditions', async () => {
  const cache = new TopicDataCache();
  const provider = new WeatherApiProvider(cache);

  const mockWeatherApi = {
    location: {
      name: 'Tokyo',
      country: 'Japan',
      lat: 35.69,
      lon: 139.69,
      localtime: '2026-09-19 23:00',
    },
    current: {
      last_updated_epoch: 1773936000,
      last_updated: '2026-09-19 23:00',
      temp_c: 22.0,
      temp_f: 71.6,
      is_day: 0,
      condition: {
        text: 'Clear',
        icon: '//cdn.weatherapi.com/weather/64x64/night/113.png',
        code: 1000,
      },
      wind_kph: 11.2,
      humidity: 58,
    },
  };

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockWeatherApi),
    forceFresh: true,
    apiKey: 'test-server-key',
  });

  assert.equal(block.status, 'available');
  assert.equal(block.domain, 'weather');
  assert.equal(block.source.id, 'weatherapi');
  assert.equal(block.source.name, 'WeatherAPI.com');
  assert.ok(block.data);
  assert.equal(block.data.locations.length, 1);
  assert.equal(block.data.locations[0].city, 'Tokyo');
  assert.equal(block.data.locations[0].country, 'Japan');
  assert.equal(block.data.locations[0].temperatureCelsius, 22.0);
  assert.equal(block.data.locations[0].temperatureFahrenheit, 71.6);
  assert.equal(block.data.locations[0].condition, 'Clear');
  assert.equal(block.data.locations[0].humidityPercent, 58);
  assert.equal(block.data.locations[0].windSpeedKmh, 11.2);
  assert.ok(block.freshness.sourceUpdatedAt);
});

test('6. WeatherAPI Provider: Rejects invalid or error response gracefully', async () => {
  const cache = new TopicDataCache();
  const provider = new WeatherApiProvider(cache);

  const mockError = {
    error: {
      code: 2008,
      message: 'API key has been disabled.',
    },
  };

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockError),
    forceFresh: true,
  });

  assert.equal(block.status, 'unavailable');
  assert.equal(block.data, null);
  assert.ok(block.error);
  assert.equal(block.error.code, 'UNAUTHORIZED');
});

test('7. OpenAQ Air Quality Provider: Computes EPA AQI category and PM2.5 readings', async () => {
  const cache = new TopicDataCache();
  const provider = new OpenAqAirQualityProvider(cache);

  const mockOpenAq = {
    results: [
      {
        city: 'Tokyo',
        country: 'JP',
        measurements: [
          {
            parameter: 'pm25',
            value: 9.2,
            lastUpdated: '2026-09-19T13:30:00Z',
          },
        ],
      },
    ],
  };

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockOpenAq),
    forceFresh: true,
  });

  assert.equal(block.status, 'available');
  assert.equal(block.domain, 'air_quality');
  assert.ok(block.data);
  assert.equal(block.data.readings.length, 1);
  assert.equal(block.data.readings[0].city, 'Tokyo');
  assert.equal(block.data.readings[0].pm25, 9.2);
  assert.equal(block.data.readings[0].aqiCategory, 'Good');
});

test('8. World Bank Economic Provider: Normalizes multi-country inflation indicators', async () => {
  const cache = new TopicDataCache();
  const provider = new WorldBankEconomicProvider(cache);

  const mockWb = [
    { page: 1, pages: 1, total: 2 },
    [
      {
        indicator: { id: 'FP.CPI.TOTL.ZG', value: 'Inflation, consumer prices (annual %)' },
        country: { id: 'US', value: 'United States' },
        countryiso3code: 'USA',
        date: '2025',
        value: 2.85,
      },
      {
        indicator: { id: 'FP.CPI.TOTL.ZG', value: 'Inflation, consumer prices (annual %)' },
        country: { id: 'JP', value: 'Japan' },
        countryiso3code: 'JPN',
        date: '2025',
        value: 2.15,
      },
    ],
  ];

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockWb),
    forceFresh: true,
  });

  assert.equal(block.status, 'available');
  assert.equal(block.domain, 'economic');
  assert.ok(block.data);
  assert.equal(block.data.indicators.length, 2);
  assert.equal(block.data.indicators[0].countryCode, 'USA');
  assert.equal(block.data.indicators[0].value, 2.85);
  assert.equal(block.data.indicators[0].unit, '%');
});

test('9. USDA FoodData Provider: Normalizes macronutrients and caloric values', async () => {
  const cache = new TopicDataCache();
  const provider = new UsdaFoodDataProvider(cache);

  const mockFdc = {
    foods: [
      {
        fdcId: 175171,
        description: 'Fish, salmon, Atlantic, wild, raw',
        foodCategory: 'Finifish and Shellfish Products',
        servingSize: 100,
        servingSizeUnit: 'g',
        foodNutrients: [
          { nutrientName: 'Energy', value: 142, unitName: 'kcal' },
          { nutrientName: 'Protein', value: 19.8, unitName: 'g' },
          { nutrientName: 'Total lipid (fat)', value: 6.34, unitName: 'g' },
          { nutrientName: 'Carbohydrate, by difference', value: 0.0, unitName: 'g' },
        ],
      },
    ],
  };

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockFdc),
    forceFresh: true,
  });

  assert.equal(block.status, 'available');
  assert.equal(block.domain, 'nutrition');
  assert.ok(block.data);
  assert.equal(block.data.items.length, 1);
  assert.equal(block.data.items[0].nutrients.calories, 142);
  assert.equal(block.data.items[0].nutrients.proteinGrams, 19.8);
  assert.equal(block.data.items[0].nutrients.fatGrams, 6.3);
});

test('10. GitHub Tech Activity Provider: Normalizes repo activity and metadata', async () => {
  const cache = new TopicDataCache();
  const provider = new GitHubTechActivityProvider(cache);

  const mockGithub = {
    name: 'ollama',
    full_name: 'ollama/ollama',
    description: 'Get up and running with Llama 3, Mistral, Gemma, and other large language models.',
    language: 'Go',
    stargazers_count: 98000,
    forks_count: 7500,
    html_url: 'https://github.com/ollama/ollama',
    license: {
      name: 'MIT License',
      spdx_id: 'MIT',
    },
    owner: {
      login: 'ollama',
    },
    updated_at: '2026-09-19T12:00:00Z',
  };

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockGithub),
    forceFresh: true,
  });

  assert.equal(block.status, 'available');
  assert.equal(block.domain, 'tech_activity');
  assert.ok(block.data);
  assert.equal(block.data.projects.length, 1);
  assert.equal(block.data.projects[0].repoName, 'ollama/ollama');
  assert.equal(block.data.projects[0].starsCount, 98000);
  assert.equal(block.data.projects[0].licenseName, 'MIT');
  assert.ok(block.freshness.sourceUpdatedAt);
});

test('11. Wikimedia Knowledge Provider: Normalizes cultural summary and extract', async () => {
  const cache = new TopicDataCache();
  const provider = new WikimediaKnowledgeProvider(cache);

  const mockWiki = {
    title: 'Katsura Imperial Villa',
    extract: 'The Katsura Imperial Villa is a cultural property and villa in the western suburbs of Kyoto, Japan.',
    description: 'Imperial villa in Kyoto, Japan',
    thumbnail: {
      source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/test.jpg',
      width: 320,
      height: 240,
    },
    content_urls: {
      desktop: {
        page: 'https://en.wikipedia.org/wiki/Katsura_Imperial_Villa',
      },
    },
    timestamp: '2026-09-10T08:00:00Z',
  };

  const block = await provider.getDataBlock({
    customFetch: createMockFetch(mockWiki),
    forceFresh: true,
  });

  assert.equal(block.status, 'available');
  assert.equal(block.domain, 'knowledge');
  assert.ok(block.data);
  assert.equal(block.data.facts.length, 1);
  assert.equal(block.data.facts[0].title, 'Katsura Imperial Villa');
  assert.ok(block.data.facts[0].extract.includes('Kyoto'));
  assert.equal(block.data.facts[0].category, 'Imperial villa in Kyoto, Japan');
});

test('12. Timeout handling: Provider aborts request and returns controlled error state', async () => {
  const cache = new TopicDataCache();
  const provider = new UsgsEarthquakeProvider(cache);

  const block = await provider.getDataBlock({
    customFetch: createTimeoutFetch(),
    timeoutMs: 50,
    maxRetries: 0,
    forceFresh: true,
  });

  assert.equal(block.status, 'unavailable');
  assert.equal(block.data, null);
  assert.ok(block.error);
  assert.equal(block.error.code, 'TIMEOUT');
});
