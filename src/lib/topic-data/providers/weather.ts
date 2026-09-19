import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { WeatherData, WeatherLocationReading } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface WeatherApiRawLocation {
  name?: string;
  region?: string;
  country?: string;
  lat?: number;
  lon?: number;
  localtime?: string;
}

interface WeatherApiRawCurrent {
  last_updated_epoch?: number;
  last_updated?: string;
  temp_c?: number;
  temp_f?: number;
  is_day?: number;
  condition?: {
    text?: string;
    icon?: string;
    code?: number;
  };
  wind_kph?: number;
  humidity?: number;
}

interface WeatherApiRawResponse {
  location?: WeatherApiRawLocation;
  current?: WeatherApiRawCurrent;
  error?: {
    code?: number;
    message?: string;
  };
}

export class WeatherApiProvider extends BaseTopicDataProvider<WeatherData> {
  readonly providerId = 'weatherapi-current';
  readonly name = 'WeatherAPI.com';
  readonly domain: DataDomain = 'weather';
  readonly defaultPillar: PillarSlug = 'travel';

  readonly source: DataSource = {
    id: 'weatherapi',
    name: 'WeatherAPI.com',
    url: 'https://www.weatherapi.com',
    attribution: 'Powered by WeatherAPI.com',
    license: 'Commercial & Standard API Access',
    isOfficial: true,
  };

  protected getEndpointUrl(options: ProviderRequestOptions): string {
    const apiKey =
      options.apiKey ||
      (typeof process !== 'undefined' && process.env?.WEATHERAPI_API_KEY) ||
      '';
    // Default primary query location; multi-city aggregation is supported
    return `https://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(apiKey)}&q=Tokyo&aqi=no`;
  }

  protected extractSourceUpdatedAt(raw: unknown): string | undefined {
    if (raw && typeof raw === 'object' && 'current' in raw) {
      const current = (raw as WeatherApiRawResponse).current;
      if (current?.last_updated) {
        // e.g. "2026-09-19 23:00" -> convert to ISO string
        const parsed = new Date(current.last_updated.replace(' ', 'T') + ':00Z');
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
        return new Date(current.last_updated).toISOString();
      }
      if (typeof current?.last_updated_epoch === 'number') {
        return new Date(current.last_updated_epoch * 1000).toISOString();
      }
    }
    return undefined;
  }

  protected validateAndNormalize(raw: unknown): WeatherData {
    if (!raw || typeof raw !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'WeatherAPI response is not an object');
    }

    const payload = raw as WeatherApiRawResponse;
    if (payload.error) {
      const code = payload.error.code === 2008 ? 'UNAUTHORIZED' : 'HTTP_ERROR';
      throw new DataProviderException(code, payload.error.message || 'WeatherAPI error', payload.error.code);
    }

    // Support single location or array of location responses
    const itemsRaw: WeatherApiRawResponse[] = Array.isArray(raw) ? raw : [payload];
    const readings: WeatherLocationReading[] = [];

    for (const item of itemsRaw) {
      if (!item.location || !item.current) {
        continue;
      }

      const loc = item.location;
      const curr = item.current;

      if (typeof curr.temp_c !== 'number') {
        continue;
      }

      const tempC = Number(curr.temp_c.toFixed(1));
      const tempF = typeof curr.temp_f === 'number' ? Number(curr.temp_f.toFixed(1)) : Number(((tempC * 9) / 5 + 32).toFixed(1));

      readings.push({
        city: loc.name || 'Unknown Destination',
        country: loc.country || 'Global',
        latitude: loc.lat || 0,
        longitude: loc.lon || 0,
        temperatureCelsius: tempC,
        temperatureFahrenheit: tempF,
        condition: curr.condition?.text || 'Clear',
        conditionCode: curr.condition?.code,
        humidityPercent: Math.round(curr.humidity ?? 50),
        windSpeedKmh: Number((curr.wind_kph ?? 0).toFixed(1)),
        isDay: curr.is_day === 1,
        localTime: loc.localtime,
      });
    }

    if (readings.length === 0) {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'WeatherAPI response contained no valid location readings');
    }

    return {
      locations: readings,
      primaryLocation: readings[0],
    };
  }

  protected getTitle(_data: WeatherData | null): string {
    return 'Global Climate & Destination Weather';
  }

  protected getSubtitle(data: WeatherData | null): string {
    if (data && data.locations.length > 0) {
      return `Current readings across ${data.locations.length} cultural destination${data.locations.length === 1 ? '' : 's'}`;
    }
    return 'Latest meteorological observations via WeatherAPI.com';
  }
}
