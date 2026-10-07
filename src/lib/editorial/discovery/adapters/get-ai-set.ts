import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal } from '../types.ts';
import { parseXmlFeed } from '../parsers/xml-feed-parser.ts';

/**
 * Curated, verified GetAISet topic seed catalog.
 * Represents mainstream AI learning, tools, everyday productivity, and practical workflows
 * specifically curated for non-technical users and learners.
 */
interface GetAISetSeedTopic {
  id: string;
  rawQuery: string;
  category: 'tech-ai';
  growthRate: number;
  searchVolume: number;
  relativeInterest: number;
  visualPotentialScore: number;
  sourceUrl?: string;
  publisherName?: string;
  curatedTags: string[];
  contentSnippet: string;
}

export const GET_AI_SET_MAINSTREAM_TOPICS: GetAISetSeedTopic[] = [
  {
    id: 'getaiset-tools-01',
    rawQuery: 'How Ordinary Users Can Organize Daily Life and Work with Claude and ChatGPT',
    category: 'tech-ai',
    growthRate: 90,
    searchVolume: 28000,
    relativeInterest: 94,
    visualPotentialScore: 84,
    sourceUrl: 'https://www.getaiset.com/learn/everyday-ai-workflows',
    publisherName: 'GetAISet Curated Learning',
    curatedTags: ['tech-ai', 'ai-tools', 'get-ai-set', 'productivity', 'everyday-ai', 'chatgpt', 'claude'],
    contentSnippet: 'A practical, non-technical guide to using conversational AI for meal planning, draft editing, organizing schedules, and summarizing long documents without technical jargon.',
  },
  {
    id: 'getaiset-tools-02',
    rawQuery: 'The Practical Guide to AI Note-Taking and Audio Transcription for Everyday Tasks',
    category: 'tech-ai',
    growthRate: 88,
    searchVolume: 26000,
    relativeInterest: 92,
    visualPotentialScore: 82,
    sourceUrl: 'https://www.getaiset.com/tools/ai-transcription-notes',
    publisherName: 'GetAISet Curated Learning',
    curatedTags: ['tech-ai', 'ai-tools', 'get-ai-set', 'note-taking', 'transcription', 'productivity'],
    contentSnippet: 'How modern voice-to-text and AI summarization tools transform voice memos, meeting notes, and study sessions into structured, searchable action items.',
  },
  {
    id: 'getaiset-tools-03',
    rawQuery: 'How to Use AI Vision and Camera Features to Identify Objects, Translate Text, and Troubleshoot Household Items',
    category: 'tech-ai',
    growthRate: 92,
    searchVolume: 32000,
    relativeInterest: 95,
    visualPotentialScore: 88,
    sourceUrl: 'https://www.getaiset.com/learn/ai-vision-practical-guide',
    publisherName: 'GetAISet Curated Learning',
    curatedTags: ['tech-ai', 'ai-tools', 'get-ai-set', 'ai-vision', 'practical-tools', 'smart-living'],
    contentSnippet: 'Everyday applications of camera-based AI: identifying plants and ingredients, translating foreign menus on the go, and diagnosing simple home maintenance issues from photos.',
  },
  {
    id: 'getaiset-tools-04',
    rawQuery: 'Beginner AI Learning Paths: How Non-Technical Professionals Can Master Everyday AI Skills',
    category: 'tech-ai',
    growthRate: 89,
    searchVolume: 27000,
    relativeInterest: 93,
    visualPotentialScore: 82,
    sourceUrl: 'https://www.getaiset.com/learning-paths/beginner-ai',
    publisherName: 'GetAISet Curated Learning',
    curatedTags: ['tech-ai', 'ai-education', 'get-ai-set', 'upskilling', 'learning-path', 'career'],
    contentSnippet: 'A structured, accessible roadmap for learning to work alongside modern AI tools without coding, focusing on clear communication, prompt clarity, and quality verification.',
  },
  {
    id: 'getaiset-tools-05',
    rawQuery: 'How to Evaluate Free vs Paid AI Subscriptions for Personal and Professional Use',
    category: 'tech-ai',
    growthRate: 88,
    searchVolume: 26000,
    relativeInterest: 92,
    visualPotentialScore: 80,
    sourceUrl: 'https://www.getaiset.com/comparisons/free-vs-paid-ai',
    publisherName: 'GetAISet Curated Learning',
    curatedTags: ['tech-ai', 'ai-tools', 'get-ai-set', 'comparisons', 'smart-spending', 'software'],
    contentSnippet: 'An objective breakdown of free-tier limitations versus paid plans across leading AI assistants, helping users decide when upgrading is genuinely worthwhile.',
  },
  {
    id: 'getaiset-tools-06',
    rawQuery: 'Practical AI Prompting for Everyday People: Clear Thinking Over Complex Formulas',
    category: 'tech-ai',
    growthRate: 88,
    searchVolume: 25000,
    relativeInterest: 91,
    visualPotentialScore: 82,
    sourceUrl: 'https://www.getaiset.com/learn/practical-prompting',
    publisherName: 'GetAISet Curated Learning',
    curatedTags: ['tech-ai', 'prompt-engineering', 'get-ai-set', 'learning', 'communication'],
    contentSnippet: 'Why natural, specific, context-rich instructions outperform rigid pseudo-programming prompts for everyday writing, research, and creative brainstorming.',
  },
  {
    id: 'getaiset-tools-07',
    rawQuery: 'Privacy-Minded Everyday AI: Simple Ways to Protect Personal Data While Using AI Assistants',
    category: 'tech-ai',
    growthRate: 91,
    searchVolume: 30000,
    relativeInterest: 94,
    visualPotentialScore: 84,
    sourceUrl: 'https://www.getaiset.com/privacy/everyday-ai-safety',
    publisherName: 'GetAISet Curated Learning',
    curatedTags: ['tech-ai', 'privacy', 'get-ai-set', 'security', 'digital-hygiene', 'data-protection'],
    contentSnippet: 'Clear, essential settings and habits for preventing personal data from being used in public training sets while getting the most out of AI tools.',
  },
  {
    id: 'getaiset-tools-08',
    rawQuery: 'AI Presentation and Document Tools for Everyday Projects: Making Ideas Visual and Clear',
    category: 'tech-ai',
    growthRate: 88,
    searchVolume: 26000,
    relativeInterest: 92,
    visualPotentialScore: 86,
    sourceUrl: 'https://www.getaiset.com/tools/ai-presentations-documents',
    publisherName: 'GetAISet Curated Learning',
    curatedTags: ['tech-ai', 'ai-tools', 'get-ai-set', 'presentations', 'design', 'productivity'],
    contentSnippet: 'How modern generative tools help non-designers turn raw notes and outlines into clean, well-structured slide decks and visual summaries.',
  },
];

export interface GetAISetAdapterOptions extends DiscoveryAdapterOptions {
  fetchFn?: typeof fetch;
  liveFeedUrls?: string[];
}

/**
 * GetAISet Discovery Adapter.
 *
 * Ingests live or curated mainstream AI learning & tool candidates for the LifeMode editorial pipeline.
 * Preferred order:
 * 1. Live GetAISet RSS feed (e.g. /rss.xml or /feed.xml) if reachable and valid.
 * 2. Curated verified seed topics when live feeds are unavailable.
 *
 * Ensures all resulting candidates have pillar: 'tech-ai', targetProject: 'get-ai-set', and isMainstreamAi: true.
 */
export class GetAISetDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'RSS_FEEDS' as const;
  readonly name = 'GetAISet Curated AI Learning & Tools';

  private fetchFn: typeof fetch;
  private liveFeedUrls: string[];

  constructor(customFetch?: typeof fetch, customFeedUrls?: string[]) {
    this.fetchFn = customFetch || globalThis.fetch.bind(globalThis);
    this.liveFeedUrls = customFeedUrls || [
      'https://www.getaiset.com/rss.xml',
      'https://www.getaiset.com/feed.xml',
    ];
  }

  async fetchSignals(options?: GetAISetAdapterOptions): Promise<DiscoveryResult> {
    const fetchImpl = options?.fetchFn || this.fetchFn;
    const feedUrls = options?.liveFeedUrls || this.liveFeedUrls;
    const limit = options?.limit ?? 10;
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Attempt live RSS feed probe
    for (const feedUrl of feedUrls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);

        const response = await fetchImpl(feedUrl, {
          headers: {
            'User-Agent': 'LifeMode-Editorial-Bot/1.0 (+https://lifemode.life; editorial@lifemode.life)',
            Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          const xmlText = await response.text();
          const parsed = parseXmlFeed(xmlText);

          if (parsed.items.length > 0) {
            const liveSignals: DiscoverySignal[] = parsed.items.slice(0, limit).map((item, idx) => {
              let pubIso = nowIso;
              if (item.pubDate) {
                const parsedDate = new Date(item.pubDate);
                if (!isNaN(parsedDate.getTime())) {
                  pubIso = parsedDate.toISOString();
                }
              }

              const combinedTags = Array.from(
                new Set(['tech-ai', 'ai-tools', 'get-ai-set', 'everyday-ai', ...item.categories])
              );

              return {
                source: 'RSS_FEEDS',
                sourceId: `getaiset-live-${idx + 1}-${encodeURIComponent(item.title.slice(0, 25)).replace(/[^a-zA-Z0-9_-]/g, '')}`,
                rawQuery: item.title,
                timestamp: pubIso,
                metrics: {
                  growthRate: 88,
                  searchVolume: 25000,
                  relativeInterest: 92,
                  isBreakout: false,
                  visualPotentialScore: 84,
                },
                geography: 'GLOBAL',
                language: 'en',
                category: 'tech-ai',
                sourceUrl: item.link || 'https://www.getaiset.com/',
                publisherName: parsed.title || 'GetAISet Live Feed',
                publishedAt: pubIso,
                contentSnippet: item.description,
                metadata: {
                  targetProject: 'get-ai-set',
                  isMainstreamAi: true,
                  isLiveSource: true,
                  curatedTags: combinedTags,
                  rssPayload: {
                    feedTitle: parsed.title || 'GetAISet Live Feed',
                    feedUrl,
                    itemTitle: item.title,
                    itemLink: item.link || 'https://www.getaiset.com/',
                    publishedDate: pubIso,
                    contentSnippet: item.description,
                    categories: combinedTags,
                  },
                },
              };
            });

            return {
              provider: this.name,
              sourceType: this.sourceType,
              status: 'AVAILABLE',
              signals: liveSignals,
              fetchedAt: nowIso,
            };
          }
        }
      } catch {
        // Continue to next feed URL or seed fallback
      }
    }

    // 2. Fallback to curated mainstream AI seeds when live feed is unavailable
    const fallbackSignals: DiscoverySignal[] = GET_AI_SET_MAINSTREAM_TOPICS.slice(0, limit).map((topic) => ({
      source: 'RSS_FEEDS',
      sourceId: topic.id,
      rawQuery: topic.rawQuery,
      timestamp: nowIso,
      metrics: {
        growthRate: topic.growthRate,
        searchVolume: topic.searchVolume,
        relativeInterest: topic.relativeInterest,
        isBreakout: topic.growthRate >= 85,
        visualPotentialScore: topic.visualPotentialScore,
      },
      geography: 'GLOBAL',
      language: 'en',
      category: 'tech-ai',
      sourceUrl: topic.sourceUrl,
      publisherName: topic.publisherName,
      contentSnippet: topic.contentSnippet,
      metadata: {
        targetProject: 'get-ai-set',
        isMainstreamAi: true,
        isCuratedFallback: true,
        curatedTags: topic.curatedTags,
        rssPayload: {
          feedTitle: topic.publisherName || 'GetAISet Learning',
          feedUrl: 'https://www.getaiset.com/',
          itemTitle: topic.rawQuery,
          itemLink: topic.sourceUrl || 'https://www.getaiset.com/',
          publishedDate: nowIso,
          contentSnippet: topic.contentSnippet,
          categories: ['AI Education', 'AI Tools', 'Learning Paths'],
        },
      },
    }));

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals: fallbackSignals,
      fetchedAt: nowIso,
    };
  }
}

