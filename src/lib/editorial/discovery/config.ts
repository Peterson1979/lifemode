import type { ProviderConfig } from './types.ts';

function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key]) {
    return (import.meta as any).env[key];
  }
  const proc = (globalThis as any).process;
  if (proc?.env?.[key]) {
    return proc.env[key];
  }
  return undefined;
}

export interface GlobalDiscoveryConfig {
  minScoreThreshold: number;
  similarityThreshold: number;
  defaultGeography: string;
  defaultLanguage: string;
  providers: {
    pinterest: ProviderConfig;
    googleTrends: ProviderConfig;
    fixture: ProviderConfig;
  };
}

export function loadDiscoveryConfig(): GlobalDiscoveryConfig {
  const pinterestToken = getEnvVar('PINTEREST_ACCESS_TOKEN');
  const googleTrendsKey = getEnvVar('GOOGLE_TRENDS_API_KEY');

  return {
    minScoreThreshold: 80,
    similarityThreshold: 0.75,
    defaultGeography: 'US',
    defaultLanguage: 'en',
    providers: {
      pinterest: {
        enabled: true,
        name: 'Pinterest Trends',
        sourceType: 'PINTEREST_TRENDS',
        geography: 'US',
        language: 'en',
        maxSignals: 50,
        apiKey: pinterestToken,
      },
      googleTrends: {
        enabled: true,
        name: 'Google Trends',
        sourceType: 'GOOGLE_TRENDS',
        geography: 'US',
        language: 'en',
        maxSignals: 50,
        apiKey: googleTrendsKey,
      },
      fixture: {
        enabled: true,
        name: 'LifeMode Fixture Signals',
        sourceType: 'FIXTURE',
        geography: 'GLOBAL',
        language: 'en',
        maxSignals: 20,
      },
    },
  };
}
