import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { FxRatesData, FxRateItem } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface FrankfurterRawResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CHF: 'Fr.',
  CAD: 'CA$',
  AUD: 'A$',
};

export class FrankfurterFxProvider extends BaseTopicDataProvider<FxRatesData> {
  readonly providerId = 'frankfurter-fx';
  readonly name = 'Frankfurter ECB Rates';
  readonly domain: DataDomain = 'fx';
  readonly defaultPillar: PillarSlug = 'money';

  readonly source: DataSource = {
    id: 'ecb-frankfurter',
    name: 'European Central Bank (ECB)',
    url: 'https://frankfurter.dev',
    attribution: 'Reference rates published by the European Central Bank',
    license: 'Open Data',
    isOfficial: true,
  };

  protected getEndpointUrl(_options: ProviderRequestOptions): string {
    return 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP,JPY,CHF,CAD,AUD';
  }

  protected extractSourceUpdatedAt(raw: unknown): string | undefined {
    if (raw && typeof raw === 'object' && 'date' in raw) {
      const dateStr = (raw as FrankfurterRawResponse).date;
      if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return `${dateStr}T16:00:00.000Z`; // ECB releases reference rates daily ~16:00 CET
      }
    }
    return undefined;
  }

  protected validateAndNormalize(raw: unknown): FxRatesData {
    if (!raw || typeof raw !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'Frankfurter FX payload is not an object');
    }

    const payload = raw as FrankfurterRawResponse;
    if (!payload.rates || typeof payload.rates !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'Frankfurter response missing rates object');
    }

    const baseCurrency = String(payload.base || 'EUR');
    const date = String(payload.date || new Date().toISOString().split('T')[0]);
    const rateItems: FxRateItem[] = [];

    for (const [curr, rateVal] of Object.entries(payload.rates)) {
      if (typeof rateVal !== 'number') continue;
      rateItems.push({
        currency: curr,
        symbol: CURRENCY_SYMBOLS[curr] || curr,
        rate: Number(rateVal.toFixed(curr === 'JPY' ? 2 : 4)),
      });
    }

    return {
      baseCurrency,
      date,
      rates: rateItems,
      availableCurrencies: rateItems.map((r) => r.currency),
    };
  }

  protected getTitle(_data: FxRatesData | null): string {
    return 'Global Currency Reference Rates';
  }

  protected getSubtitle(data: FxRatesData | null): string {
    if (data) {
      return `Base 1 ${data.baseCurrency} — ECB Daily Reference (${data.date})`;
    }
    return 'Daily reference rates from European Central Bank';
  }
}
