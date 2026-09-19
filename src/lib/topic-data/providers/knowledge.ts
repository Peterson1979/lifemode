import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { KnowledgeFactData, KnowledgeFactItem } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface WikimediaRawSummary {
  title?: string;
  extract?: string;
  description?: string;
  thumbnail?: {
    source?: string;
    width?: number;
    height?: number;
  };
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
  timestamp?: string;
}

export class WikimediaKnowledgeProvider extends BaseTopicDataProvider<KnowledgeFactData> {
  readonly providerId = 'wikimedia-knowledge';
  readonly name = 'Wikimedia Open Knowledge';
  readonly domain: DataDomain = 'knowledge';
  readonly defaultPillar: PillarSlug = 'discover';

  readonly source: DataSource = {
    id: 'wikimedia',
    name: 'Wikimedia Foundation',
    url: 'https://en.wikipedia.org',
    attribution: 'Knowledge text courtesy of Wikipedia under CC-BY-SA 4.0',
    license: 'CC-BY-SA 4.0',
    isOfficial: true,
  };

  protected getEndpointUrl(_options: ProviderRequestOptions): string {
    // Katsura Imperial Villa (Masterpiece of Japanese traditional architecture and garden design)
    return 'https://en.wikipedia.org/api/rest_v1/page/summary/Katsura_Imperial_Villa';
  }

  protected extractSourceUpdatedAt(raw: unknown): string | undefined {
    if (raw && typeof raw === 'object' && 'timestamp' in raw) {
      const ts = (raw as WikimediaRawSummary).timestamp;
      if (ts) return new Date(ts).toISOString();
    }
    return undefined;
  }

  protected validateAndNormalize(raw: unknown): KnowledgeFactData {
    if (!raw || typeof raw !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'Wikimedia response is not an object');
    }

    const summary = raw as WikimediaRawSummary;
    if (!summary.title || !summary.extract) {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'Wikimedia response missing title or extract');
    }

    const fact: KnowledgeFactItem = {
      title: summary.title,
      extract: summary.extract,
      pageUrl: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`,
      thumbnailUrl: summary.thumbnail?.source,
      category: summary.description || 'Cultural & Architectural Heritage',
    };

    return {
      facts: [fact],
      featuredFact: fact,
    };
  }

  protected getTitle(_data: KnowledgeFactData | null): string {
    return 'Architectural & Cultural Heritage Reference';
  }

  protected getSubtitle(data: KnowledgeFactData | null): string {
    if (data && data.featuredFact) {
      return `Curated context on ${data.featuredFact.title} (${data.featuredFact.category})`;
    }
    return 'Open knowledge facts from Wikimedia';
  }
}
