import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { AirQualityData, AirQualityReading } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface OpenAqRawMeasurement {
  parameter?: string;
  value?: number;
  lastUpdated?: string;
  unit?: string;
}

interface OpenAqRawLocation {
  location?: string;
  city?: string;
  country?: string;
  measurements?: OpenAqRawMeasurement[];
}

interface OpenAqRawResponse {
  results?: OpenAqRawLocation[];
}

function calculateAqiCategory(
  pm25: number
): 'Good' | 'Moderate' | 'Unhealthy for Sensitive Groups' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous' {
  if (pm25 <= 12.0) return 'Good';
  if (pm25 <= 35.4) return 'Moderate';
  if (pm25 <= 55.4) return 'Unhealthy for Sensitive Groups';
  if (pm25 <= 150.4) return 'Unhealthy';
  if (pm25 <= 250.4) return 'Very Unhealthy';
  return 'Hazardous';
}

export class OpenAqAirQualityProvider extends BaseTopicDataProvider<AirQualityData> {
  readonly providerId = 'openaq-air-quality';
  readonly name = 'OpenAQ Global Air Quality';
  readonly domain: DataDomain = 'air_quality';
  readonly defaultPillar: PillarSlug = 'wellbeing';

  readonly source: DataSource = {
    id: 'openaq',
    name: 'OpenAQ Community',
    url: 'https://openaq.org',
    attribution: 'Air quality data aggregated by OpenAQ under Open Data Commons',
    license: 'Open Data Commons',
    isOfficial: true,
  };

  protected getEndpointUrl(_options: ProviderRequestOptions): string {
    return 'https://api.openaq.org/v2/latest?limit=5&parameter=pm25&order_by=lastUpdated&sort=desc';
  }

  protected getRequestHeaders(options: ProviderRequestOptions): Record<string, string> {
    const headers = super.getRequestHeaders(options);
    const apiKey =
      options.apiKey ||
      (typeof process !== 'undefined' && process.env?.OPENAQ_API_KEY) ||
      '';
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    return headers;
  }

  protected extractSourceUpdatedAt(raw: unknown): string | undefined {
    if (raw && typeof raw === 'object' && 'results' in raw) {
      const results = (raw as OpenAqRawResponse).results;
      if (Array.isArray(results) && results[0]?.measurements?.[0]?.lastUpdated) {
        return new Date(results[0].measurements[0].lastUpdated).toISOString();
      }
    }
    return undefined;
  }

  protected validateAndNormalize(raw: unknown): AirQualityData {
    if (!raw || typeof raw !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'OpenAQ payload is not an object');
    }

    const payload = raw as OpenAqRawResponse;
    if (!Array.isArray(payload.results)) {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'OpenAQ response missing results array');
    }

    const readings: AirQualityReading[] = [];

    for (const item of payload.results) {
      const pm25Measurement = item.measurements?.find((m) => m.parameter === 'pm25') || item.measurements?.[0];
      if (!pm25Measurement || typeof pm25Measurement.value !== 'number' || pm25Measurement.value < 0) {
        continue;
      }

      const pm25Val = Number(pm25Measurement.value.toFixed(1));
      const category = calculateAqiCategory(pm25Val);
      // Rough EPA AQI conversion estimate for UI visual gauge
      const estimatedAqi = Math.min(500, Math.round(pm25Val * 4.16));

      readings.push({
        city: item.city || item.location || 'Observation Station',
        country: item.country || 'Global',
        aqi: estimatedAqi,
        aqiCategory: category,
        pm25: pm25Val,
        dominantPollutant: 'PM2.5',
        recordedAt: pm25Measurement.lastUpdated
          ? new Date(pm25Measurement.lastUpdated).toISOString()
          : new Date().toISOString(),
      });

      if (readings.length >= 4) break;
    }

    return {
      readings,
      featuredCity: readings[0],
    };
  }

  protected getTitle(_data: AirQualityData | null): string {
    return 'Environmental Air Quality Index';
  }

  protected getSubtitle(data: AirQualityData | null): string {
    if (data && data.readings.length > 0) {
      return `Fine particulate matter (PM2.5) readings from global stations`;
    }
    return 'Real-time air pollution data from OpenAQ';
  }
}
