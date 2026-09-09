import type { EditorialMemory, PillarSlug, ArticleFormat } from './types.ts';

/**
 * Creates an empty initial Editorial Memory state.
 */
export function createInitialEditorialMemory(): EditorialMemory {
  return {
    successfulTopics: [],
    underperformingTopics: [],
    successfulFormats: {
      standard: 0,
      guide: 0,
      listicle: 0,
      'deep-dive': 0,
      dispatch: 0,
      curation: 0,
    },
    underperformingFormats: {
      standard: 0,
      guide: 0,
      listicle: 0,
      'deep-dive': 0,
      dispatch: 0,
      curation: 0,
    },
    highPerformingPinterestThemes: [],
    affiliateWinners: [],
    contentGaps: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Records performance feedback for a topic.
 */
export function recordTopicPerformance(
  memory: EditorialMemory,
  entry: {
    topicId: string;
    canonicalTopic: string;
    pillar: PillarSlug;
    performanceScore: number; // 0-100
    format?: ArticleFormat;
    pinterestTheme?: string;
  }
): EditorialMemory {
  const updated = { ...memory };

  if (entry.performanceScore >= 75) {
    updated.successfulTopics = [
      ...updated.successfulTopics,
      {
        topicId: entry.topicId,
        canonicalTopic: entry.canonicalTopic,
        pillar: entry.pillar,
        performanceScore: entry.performanceScore,
        recordedAt: new Date().toISOString(),
      },
    ];

    if (entry.format) {
      updated.successfulFormats[entry.format] = (updated.successfulFormats[entry.format] || 0) + 1;
    }
    if (entry.pinterestTheme && !updated.highPerformingPinterestThemes.includes(entry.pinterestTheme)) {
      updated.highPerformingPinterestThemes.push(entry.pinterestTheme);
    }
  } else if (entry.performanceScore < 40) {
    updated.underperformingTopics = [
      ...updated.underperformingTopics,
      {
        topicId: entry.topicId,
        canonicalTopic: entry.canonicalTopic,
        pillar: entry.pillar,
        performanceScore: entry.performanceScore,
        recordedAt: new Date().toISOString(),
      },
    ];

    if (entry.format) {
      updated.underperformingFormats[entry.format] = (updated.underperformingFormats[entry.format] || 0) + 1;
    }
  }

  updated.lastUpdated = new Date().toISOString();
  return updated;
}
