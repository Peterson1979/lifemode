import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { EarthquakeFeedData, EarthquakeItem } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface UsgsRawFeature {
  id?: string;
  properties?: {
    mag?: number;
    place?: string;
    time?: number; // epoch ms
    updated?: number; // epoch ms
    url?: string;
    sig?: number;
    tsunami?: number;
  };
  geometry?: {
    coordinates?: [number, number, number]; // [lng, lat, depth]
  };
}

interface UsgsRawResponse {
  metadata?: {
    generated?: number;
    title?: string;
    count?: number;
  };
  features?: UsgsRawFeature[];
}

export class UsgsEarthquakeProvider extends BaseTopicDataProvider<EarthquakeFeedData> {
  readonly providerId = 'usgs-earthquake';
  readonly name = 'USGS Earthquakes';
  readonly domain: DataDomain = 'earthquakes';
  readonly defaultPillar: PillarSlug = 'travel';

  readonly source: DataSource = {
    id: 'usgs',
    name: 'U.S. Geological Survey (USGS)',
    url: 'https://earthquake.usgs.gov',
    attribution: 'Data courtesy of the U.S. Geological Survey',
    license: 'Public Domain',
    isOfficial: true,
  };

  protected getEndpointUrl(_options: ProviderRequestOptions): string {
    // Retrieve M4.5+ earthquakes in the last 24 hours (high global relevance and signal)
    return 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
  }

  protected extractSourceUpdatedAt(raw: unknown): string | undefined {
    if (raw && typeof raw === 'object' && 'metadata' in raw) {
      const meta = (raw as UsgsRawResponse).metadata;
      if (meta?.generated && typeof meta.generated === 'number') {
        return new Date(meta.generated).toISOString();
      }
    }
    return undefined;
  }

  protected validateAndNormalize(raw: unknown): EarthquakeFeedData {
    if (!raw || typeof raw !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'USGS earthquake payload is not an object');
    }

    const payload = raw as UsgsRawResponse;
    if (!Array.isArray(payload.features)) {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'USGS response missing features array');
    }

    const items: EarthquakeItem[] = [];

    for (const feature of payload.features.slice(0, 5)) {
      if (!feature.properties) continue;
      const props = feature.properties;
      if (typeof props.mag !== 'number') continue;

      const mag = props.mag;
      const coords = feature.geometry?.coordinates || [0, 0, 0];

      const item: EarthquakeItem = {
        id: String(feature.id || `eq-${props.time || Date.now()}`),
        magnitude: Number(mag.toFixed(1)),
        place: String(props.place || 'Unknown location'),
        time: new Date(props.time || Date.now()).toISOString(),
        updatedTime: props.updated ? new Date(props.updated).toISOString() : undefined,
        coordinates: {
          longitude: coords[0] ?? 0,
          latitude: coords[1] ?? 0,
          depthKm: coords[2] ?? 0,
        },
        significance: Number(props.sig || 0),
        url: String(props.url || 'https://earthquake.usgs.gov'),
        tsunamiWarning: Boolean(props.tsunami && props.tsunami > 0),
      };

      items.push(item);
    }

    return {
      summary: `Recent Significant Earthquakes (M4.5+)`,
      totalEventsCount: payload.metadata?.count ?? items.length,
      minMagnitude: 4.5,
      items,
    };
  }

  protected getTitle(data: EarthquakeFeedData | null): string {
    if (data && data.items.length > 0) {
      return `Earth Activity: ${data.items.length} Recent Global Events`;
    }
    return 'Recent Global Seismic Activity';
  }

  protected getSubtitle(data: EarthquakeFeedData | null): string {
    if (data && data.items.length > 0) {
      return `M${data.minMagnitude}+ events recorded in the last 24 hours`;
    }
    return 'Latest data from USGS Earthquake Hazards Program';
  }
}
