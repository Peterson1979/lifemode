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

export const DEFAULT_CURATED_RSS_FEEDS: ConfiguredRSSFeed[] = [
  // Tech & AI
  {
    id: 'ars-technica',
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    pillar: 'tech-ai',
    categories: ['tech', 'ai', 'computing', 'hardware'],
  },
  {
    id: 'the-verge',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    pillar: 'tech-ai',
    categories: ['tech', 'ai', 'gadgets', 'future'],
  },
  {
    id: 'mit-tech-review',
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    pillar: 'tech-ai',
    categories: ['emerging-tech', 'ai', 'biotech', 'computing'],
  },

  // Life & Intentional Living
  {
    id: 'fast-company',
    name: 'Fast Company',
    url: 'https://www.fastcompany.com/rss',
    pillar: 'life',
    categories: ['productivity', 'work', 'design', 'lifestyle'],
  },
  {
    id: 'lifehacker',
    name: 'Lifehacker',
    url: 'https://lifehacker.com/rss',
    pillar: 'life',
    categories: ['habits', 'productivity', 'organization', 'life'],
  },

  // Travel & Slow Exploration
  {
    id: 'bbc-world',
    name: 'BBC World & Culture',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    pillar: 'travel',
    categories: ['travel', 'global', 'destinations', 'culture'],
  },
  {
    id: 'cntraveler',
    name: 'Conde Nast Traveler',
    url: 'https://www.cntraveler.com/feed/rss',
    pillar: 'travel',
    categories: ['travel', 'destinations', 'hotels', 'culture'],
  },

  // Wellbeing & Longevity
  {
    id: 'psychology-today',
    name: 'Psychology Today',
    url: 'https://www.psychologytoday.com/us/blog-feed.rss',
    pillar: 'wellbeing',
    categories: ['mindfulness', 'mental-health', 'psychology', 'wellbeing'],
  },
  {
    id: 'medical-news-today',
    name: 'Medical News Today',
    url: 'https://rss.medicalnewstoday.com/featurednews.xml',
    pillar: 'wellbeing',
    categories: ['health', 'longevity', 'nutrition', 'vitality'],
  },

  // Discover & Architecture / Design
  {
    id: 'dezeen',
    name: 'Dezeen Architecture & Design',
    url: 'https://www.dezeen.com/feed/',
    pillar: 'discover',
    categories: ['architecture', 'interiors', 'design', 'sustainability'],
  },
  {
    id: 'design-milk',
    name: 'Design Milk',
    url: 'https://design-milk.com/feed/',
    pillar: 'discover',
    categories: ['design', 'interiors', 'home', 'art'],
  },

  // Money & Personal Finance
  {
    id: 'cnbc-personal-finance',
    name: 'CNBC Personal Finance',
    url: 'https://search.cnbc.com/rs/search/view.html?partnerId=2000&keywords=personal%20finance&sort=date&output=rss',
    pillar: 'money',
    categories: ['investing', 'savings', 'personal-finance', 'wealth'],
  },
];

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
