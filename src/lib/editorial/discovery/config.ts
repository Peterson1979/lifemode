import type { ProviderConfig } from './types.ts';
import type { PillarSlug } from '../types.ts';

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

export interface ConfiguredRSSFeed {
  id: string;
  name: string;
  url: string;
  pillar: PillarSlug;
  categories?: string[];
}

export interface ConfiguredRedditCommunity {
  subreddit: string;
  pillar: PillarSlug;
  sort?: 'top' | 'hot' | 'rising';
  timeframe?: 'day' | 'week' | 'month';
  minScore?: number;
}

import { getDiscoveryFeedsFromRegistry } from '../sources/registry.ts';

export const DEFAULT_CURATED_RSS_FEEDS: ConfiguredRSSFeed[] = getDiscoveryFeedsFromRegistry();

export const DEFAULT_CURATED_SUBREDDITS: ConfiguredRedditCommunity[] = [
  { subreddit: 'minimalism', pillar: 'life', sort: 'top', timeframe: 'day', minScore: 20 },
  { subreddit: 'productivity', pillar: 'life', sort: 'top', timeframe: 'day', minScore: 30 },
  { subreddit: 'simpleliving', pillar: 'now', sort: 'top', timeframe: 'day', minScore: 25 },
  { subreddit: 'solotravel', pillar: 'travel', sort: 'top', timeframe: 'day', minScore: 30 },
  { subreddit: 'travel', pillar: 'travel', sort: 'top', timeframe: 'day', minScore: 40 },
  { subreddit: 'LocalLLaMA', pillar: 'tech-ai', sort: 'top', timeframe: 'day', minScore: 35 },
  { subreddit: 'technology', pillar: 'tech-ai', sort: 'top', timeframe: 'day', minScore: 50 },
  { subreddit: 'personalfinance', pillar: 'money', sort: 'top', timeframe: 'day', minScore: 40 },
  { subreddit: 'FinancialPlanning', pillar: 'money', sort: 'top', timeframe: 'day', minScore: 25 },
  { subreddit: 'longevity', pillar: 'wellbeing', sort: 'top', timeframe: 'day', minScore: 20 },
  { subreddit: 'RoomPorn', pillar: 'discover', sort: 'top', timeframe: 'day', minScore: 50 },
  { subreddit: 'ArchitecturePorn', pillar: 'discover', sort: 'top', timeframe: 'day', minScore: 40 },
];

export interface GlobalDiscoveryConfig {
  minScoreThreshold: number;
  similarityThreshold: number;
  defaultGeography: string;
  defaultLanguage: string;
  requestTimeoutMs: number;
  rssFeedsList: ConfiguredRSSFeed[];
  redditCommunities: ConfiguredRedditCommunity[];
  googleTrends: {
    geo: string;
    rssEndpoint: string;
  };
  providers: {
    pinterest: ProviderConfig;
    googleTrends: ProviderConfig;
    redditSocial: ProviderConfig;
    rssFeeds: ProviderConfig;
    seasonalCalendar: ProviderConfig;
    googleSearchConsole: ProviderConfig;
    bingWebmaster: ProviderConfig;
    youtubeTrends: ProviderConfig;
    internalAnalytics: ProviderConfig;
    fixture: ProviderConfig;
  };
}

export function loadDiscoveryConfig(): GlobalDiscoveryConfig {
  const pinterestToken = getEnvVar('PINTEREST_ACCESS_TOKEN');
  const googleTrendsKey = getEnvVar('GOOGLE_TRENDS_API_KEY');
  const googleTrendsGeo = getEnvVar('GOOGLE_TRENDS_GEO') || 'US';
  const gscKey = getEnvVar('GSC_CLIENT_EMAIL') || getEnvVar('GSC_API_KEY');
  const bingKey = getEnvVar('BING_WEBMASTER_API_KEY');
  const youtubeKey = getEnvVar('YOUTUBE_API_KEY');
  const timeoutMs = parseInt(getEnvVar('DISCOVERY_REQUEST_TIMEOUT_MS') || '8000', 10);

  return {
    minScoreThreshold: 80,
    similarityThreshold: 0.75,
    defaultGeography: googleTrendsGeo,
    defaultLanguage: 'en',
    requestTimeoutMs: isNaN(timeoutMs) ? 8000 : timeoutMs,
    rssFeedsList: DEFAULT_CURATED_RSS_FEEDS,
    redditCommunities: DEFAULT_CURATED_SUBREDDITS,
    googleTrends: {
      geo: googleTrendsGeo,
      rssEndpoint: `https://trends.google.com/trending/rss?geo=${encodeURIComponent(googleTrendsGeo)}`,
    },
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
        name: 'Google Trends (Public RSS)',
        sourceType: 'GOOGLE_TRENDS',
        geography: googleTrendsGeo,
        language: 'en',
        maxSignals: 50,
        apiKey: googleTrendsKey,
      },
      redditSocial: {
        enabled: true,
        name: 'Reddit Public Discussion Signals',
        sourceType: 'REDDIT_SOCIAL',
        geography: 'GLOBAL',
        language: 'en',
        maxSignals: 50,
      },
      rssFeeds: {
        enabled: true,
        name: 'Curated RSS & Publication Feeds',
        sourceType: 'RSS_FEEDS',
        geography: 'GLOBAL',
        language: 'en',
        maxSignals: 50,
      },
      seasonalCalendar: {
        enabled: true,
        name: 'Seasonal Calendar',
        sourceType: 'SEASONAL_CALENDAR',
        geography: 'GLOBAL',
        language: 'en',
        maxSignals: 20,
      },
      googleSearchConsole: {
        enabled: true,
        name: 'Google Search Console',
        sourceType: 'GOOGLE_SEARCH_CONSOLE',
        geography: 'US',
        language: 'en',
        maxSignals: 50,
        apiKey: gscKey,
      },
      bingWebmaster: {
        enabled: true,
        name: 'Bing Webmaster',
        sourceType: 'BING_WEBMASTER',
        geography: 'US',
        language: 'en',
        maxSignals: 50,
        apiKey: bingKey,
      },
      youtubeTrends: {
        enabled: true,
        name: 'YouTube Trends',
        sourceType: 'YOUTUBE_TRENDS',
        geography: 'US',
        language: 'en',
        maxSignals: 50,
        apiKey: youtubeKey,
      },
      internalAnalytics: {
        enabled: true,
        name: 'Internal Analytics',
        sourceType: 'INTERNAL_ANALYTICS',
        geography: 'GLOBAL',
        language: 'en',
        maxSignals: 20,
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
