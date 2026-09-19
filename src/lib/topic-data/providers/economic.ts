import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { EconomicData, EconomicIndicator } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface WorldBankRawIndicatorItem {
  indicator?: {
    id?: string;
    value?: string;
  };
  country?: {
    id?: string;
    value?: string;
  };
  countryiso3code?: string;
  date?: string;
  value?: number | null;
}

export class WorldBankEconomicProvider extends BaseTopicDataProvider<EconomicData> {
  readonly providerId = 'world-bank-data';
  readonly name = 'World Bank Open Data';
  readonly domain: DataDomain = 'economic';
  readonly defaultPillar: PillarSlug = 'money';

  readonly source: DataSource = {
    id: 'world-bank',
    name: 'World Bank Open Data',
    url: 'https://data.worldbank.org',
    attribution: 'World Bank Open Data under CC-BY 4.0',
    license: 'CC-BY 4.0',
    isOfficial: true,
  };

  protected getEndpointUrl(_options: ProviderRequestOptions): string {
    // Inflation (Consumer Prices %) across major economic centers
    return 'https://api.worldbank.org/v2/country/USA;JPN;GBR;DEU/indicator/FP.CPI.TOTL.ZG?format=json&per_page=10&mrv=1';
  }

  protected extractSourceUpdatedAt(raw: unknown): string | undefined {
    if (Array.isArray(raw) && Array.isArray(raw[1]) && raw[1][0]?.date) {
      const year = raw[1][0].date;
      return `${year}-12-31T00:00:00.000Z`;
    }
    return undefined;
  }

  protected validateAndNormalize(raw: unknown): EconomicData {
    if (!Array.isArray(raw) || raw.length < 2 || !Array.isArray(raw[1])) {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'World Bank API payload structure invalid');
    }

    const rawList = raw[1] as WorldBankRawIndicatorItem[];
    const indicators: EconomicIndicator[] = [];

    for (const item of rawList) {
      if (item.value === null || typeof item.value === 'undefined') continue;

      indicators.push({
        indicatorId: item.indicator?.id || 'FP.CPI.TOTL.ZG',
        indicatorName: item.indicator?.value || 'Inflation, Consumer Prices (Annual %)',
        countryCode: item.countryiso3code || item.country?.id || 'GLOBAL',
        countryName: item.country?.value || 'Global Economy',
        value: Number(item.value.toFixed(2)),
        unit: '%',
        year: parseInt(item.date || '2025', 10),
      });
    }

    return {
      indicators,
      regionOrGlobalSummary: 'Annual inflation & consumer price stability indicators across major economies',
    };
  }

  protected getTitle(_data: EconomicData | null): string {
    return 'Global Macro & Economic Indicators';
  }

  protected getSubtitle(data: EconomicData | null): string {
    if (data && data.indicators.length > 0) {
      return `Annual Consumer Price Index benchmarks (World Bank Reference)`;
    }
    return 'Official macroeconomic data from World Bank';
  }
}
