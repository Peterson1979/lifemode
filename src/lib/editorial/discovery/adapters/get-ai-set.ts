import type { IDiscoveryAdapter, DiscoveryAdapterOptions } from '../contracts.ts';
import type { DiscoveryResult, DiscoverySignal } from '../types.ts';

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

/**
 * GetAISet Discovery Adapter.
 *
 * Ingests curated, mainstream AI learning & tool candidates for the LifeMode editorial pipeline.
 * Tags each candidate with targetProject: 'get-ai-set' and ensures positioning is non-technical
 * and tailored for mainstream curious readers.
 */
export class GetAISetDiscoveryAdapter implements IDiscoveryAdapter {
  readonly sourceType = 'RSS_FEEDS' as const;
  readonly name = 'GetAISet Curated AI Learning & Tools';

  async fetchSignals(options?: DiscoveryAdapterOptions): Promise<DiscoveryResult> {
    const limit = options?.limit ?? GET_AI_SET_MAINSTREAM_TOPICS.length;
    const now = new Date().toISOString();

    const signals: DiscoverySignal[] = GET_AI_SET_MAINSTREAM_TOPICS.slice(0, limit).map((topic) => ({
      source: 'RSS_FEEDS',
      sourceId: topic.id,
      rawQuery: topic.rawQuery,
      timestamp: now,
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
        curatedTags: topic.curatedTags,
        rssPayload: {
          feedTitle: topic.publisherName || 'GetAISet Learning',
          feedUrl: 'https://www.getaiset.com/',
          itemTitle: topic.rawQuery,
          itemLink: topic.sourceUrl || 'https://www.getaiset.com/',
          publishedDate: now,
          contentSnippet: topic.contentSnippet,
          categories: ['AI Education', 'AI Tools', 'Learning Paths'],
        },
      },
    }));

    return {
      provider: this.name,
      sourceType: this.sourceType,
      status: 'AVAILABLE',
      signals,
      fetchedAt: now,
    };
  }
}
