import type { SignalSourceType } from '../types.ts';
import type { DiscoveryResult } from './types.ts';

/**
 * Common configuration options for discovery adapters.
 */
export interface DiscoveryAdapterOptions {
  limit?: number;
  timeframe?: 'past_24h' | 'past_7d' | 'past_30d' | 'past_90d' | 'seasonal';
  locale?: string;
  categoryFilter?: string[];
}

/**
 * Standard contract for all future external signal discovery providers.
 * Provider-agnostic interface.
 */
export interface IDiscoveryAdapter {
  readonly sourceType: SignalSourceType | 'FIXTURE' | 'MANUAL';
  readonly name: string;
  fetchSignals(options?: DiscoveryAdapterOptions): Promise<DiscoveryResult>;
}

/**
 * Pinterest Trends signal contract payload.
 */
export interface PinterestTrendsPayload {
  searchTerm: string;
  growthRate: number; // e.g. +45%
  weeklyVolumeTier: 'low' | 'medium' | 'high' | 'viral';
  topAestheticInterests: string[];
  demographics?: Record<string, any>;
}

/**
 * Google Trends signal contract payload.
 */
export interface GoogleTrendsPayload {
  query: string;
  relativeInterestScore: number; // 0-100
  isBreakout: boolean;
  relatedQueries: string[];
  geoRegion: string;
}

/**
 * Google Search Console signal contract payload.
 */
export interface GSCDiscoveryPayload {
  query: string;
  impressions: number;
  clicks: number;
  averagePosition: number;
  opportunityType: 'high_impression_low_ctr' | 'ranking_page_2' | 'new_rising_query';
}

/**
 * Bing Webmaster signal contract payload.
 */
export interface BingWebmasterPayload {
  query: string;
  impressions: number;
  clicks: number;
}

/**
 * Reddit & Social signal contract payload.
 */
export interface RedditSocialPayload {
  subredditOrPlatform: string;
  threadTitle: string;
  upvotesOrEngagement: number;
  commentCount: number;
  sentiment: 'positive' | 'neutral' | 'curious' | 'controversial';
}

/**
 * Seasonal Calendar signal contract payload.
 */
export interface SeasonalCalendarPayload {
  seasonalEvent: string;
  targetMonth: number;
  relevanceWindowDays: number;
  historicalSpikeMultiplier: number;
}

/**
 * RSS Feeds signal contract payload.
 */
export interface RSSFeedsPayload {
  feedUrl: string;
  feedTitle: string;
  itemTitle: string;
  itemLink: string;
  publishedDate?: string;
  contentSnippet?: string;
  categories?: string[];
}

/**
 * YouTube Trends signal contract payload.
 */
export interface YouTubeTrendsPayload {
  videoTitle: string;
  videoId: string;
  channelTitle: string;
  viewCount: number;
  likeCount?: number;
  trendingRank?: number;
  tags?: string[];
}

/**
 * Internal Analytics signal contract payload.
 */
export interface InternalAnalyticsPayload {
  topicId: string;
  slug: string;
  pillar: string;
  pageviews: number;
  timeOnPageAvgSeconds: number;
  socialShares: number;
  searchImpressions: number;
}
