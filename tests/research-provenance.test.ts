import test from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { RSSFeedsDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/rss-feeds.ts';
import { transformSignalToCandidate, applyCrossSourceCorroboration } from '../src/lib/editorial/discovery/transform.ts';
import { saveCandidates, loadCandidates } from '../src/lib/editorial/discovery/storage.ts';
import {
  WebEditorialResearchProvider,
  classifyUrlAuthority,
  calculateEvidenceScore,
} from '../src/lib/editorial/research/providers/web.ts';
import { buildContentBrief } from '../src/lib/editorial/brief.ts';
import type { DiscoverySignal } from '../src/lib/editorial/discovery/types.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';
import type { EvidenceItem } from '../src/lib/editorial/research/types.ts';

const SAMPLE_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Dezeen Architecture</title>
    <link>https://www.dezeen.com</link>
    <description>Architecture and design magazine</description>
    <item>
      <title>Mindful Japanese Tea Pavilions: Sukiya Architecture Today</title>
      <link>https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/?utm_source=rss&amp;utm_medium=feed</link>
      <pubDate>Mon, 10 Feb 2026 09:00:00 GMT</pubDate>
      <description><![CDATA[An exploration of minimalist Sukiya-style timber proportions in modern Kyoto and Kamakura homes.]]></description>
      <category>Architecture</category>
    </item>
  </channel>
</rss>`;

const GOOGLE_NEWS_MOCK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Google News - Search</title>
    <item>
      <title>Tokyo Cultural Heritage Board Expands Historic Timber Protection - The Japan Times</title>
      <link>https://www.japantimes.co.jp/news/2026/02/12/heritage-timber-protection/?utm_source=google_news</link>
      <pubDate>Wed, 12 Feb 2026 14:00:00 GMT</pubDate>
      <description><![CDATA[New cultural property legislation designates 18 historic tea houses for restorative preservation.]]></description>
    </item>
    <item>
      <title>National Institute of Architecture Releases Sukiya Proportion Guidelines - Architecture Institute</title>
      <link>https://tobunken.go.jp/research/sukiya-guidelines.html</link>
      <pubDate>Thu, 13 Feb 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[Official academic documentation on joinery and unpeeled cedar columns.]]></description>
    </item>
  </channel>
</rss>`;

test('1. RSS discovery adapter preserves rich provenance fields (sourceUrl, publisherName, publishedAt, contentSnippet)', async () => {
  const mockFetch = async () => new Response(SAMPLE_RSS_XML, {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml' },
  });

  const adapter = new RSSFeedsDiscoveryAdapter(mockFetch as typeof fetch);

  const result = await adapter.fetchSignals({
    feeds: [
      {
        id: 'dezeen-test',
        name: 'Dezeen Architecture',
        url: 'https://www.dezeen.com/feed',
        pillar: 'culture',
      },
    ],
  });
  assert.equal(result.signals.length, 1);

  const signal = result.signals[0];
  assert.equal(signal.source, 'RSS_FEEDS');
  assert.equal(signal.publisherName, 'Dezeen Architecture');
  assert.equal(signal.sourceUrl, 'https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/?utm_source=rss&utm_medium=feed');
  assert.equal(signal.publishedAt, '2026-02-10T09:00:00.000Z');
  assert.ok(signal.contentSnippet?.includes('minimalist Sukiya-style'));
});

test('2. Candidate transform and cross-source corroboration retain provenance in SourceSignal', () => {
  const signal: DiscoverySignal = {
    source: 'RSS_FEEDS',
    rawQuery: 'Mindful Japanese Tea Pavilions: Sukiya Architecture Today',
    category: 'culture',
    sourceUrl: 'https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/',
    publisherName: 'Dezeen Architecture',
    publishedAt: '2026-02-10T09:00:00.000Z',
    contentSnippet: 'An exploration of minimalist Sukiya-style timber proportions.',
    timestamp: '2026-02-10T09:30:00.000Z',
  };

  const candidate = transformSignalToCandidate(signal);
  assert.equal(candidate.sourceSignals.length, 1);

  const src = candidate.sourceSignals[0];
  assert.equal(src.source, 'RSS_FEEDS');
  assert.equal(src.sourceUrl, 'https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/');
  assert.equal(src.publisherName, 'Dezeen Architecture');
  assert.equal(src.publishedAt, '2026-02-10T09:00:00.000Z');
  assert.equal(src.contentSnippet, 'An exploration of minimalist Sukiya-style timber proportions.');

  // Corroboration with a Reddit signal must preserve both signals with their respective attributes
  const redditSignal: DiscoverySignal = {
    source: 'REDDIT_SOCIAL',
    rawQuery: 'Japanese tea house architecture discussion',
    category: 'culture',
    timestamp: '2026-02-10T10:00:00.000Z',
  };

  const corroborated = applyCrossSourceCorroboration(candidate, redditSignal);
  assert.equal(corroborated.sourceSignals.length, 2);

  const rssSignalFound = corroborated.sourceSignals.find((s) => s.source === 'RSS_FEEDS');
  assert.ok(rssSignalFound);
  assert.equal(rssSignalFound?.publisherName, 'Dezeen Architecture');
  assert.equal(rssSignalFound?.sourceUrl, 'https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/');
});

test('3. Candidate serialization and restoration preserves all provenance fields across filesystem persistence', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-provenance-test-'));
  const filePath = path.join(tmpDir, 'candidates.json');

  try {
    const topic: EditorialTopic = {
      id: 'lm-culture-provenance-01',
      canonicalTopic: 'Mindful Japanese Tea Pavilions: Sukiya Architecture Today',
      slug: 'mindful-japanese-tea-pavilions-sukiya-architecture-today',
      pillar: 'culture',
      sourceSignals: [
        {
          source: 'RSS_FEEDS',
          query: 'Mindful Japanese Tea Pavilions',
          recordedAt: '2026-02-10T09:00:00.000Z',
          sourceUrl: 'https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/',
          publisherName: 'Dezeen Architecture',
          publishedAt: '2026-02-10T09:00:00.000Z',
          contentSnippet: 'An exploration of minimalist Sukiya-style timber proportions.',
        },
        {
          source: 'REDDIT_SOCIAL',
          query: 'Japanese tea house discussions',
          recordedAt: '2026-02-10T10:00:00.000Z',
        },
      ],
      queryVariants: ['sukiya architecture', 'tea pavilion design'],
      scoring: {
        searchPotential: 85,
        pinterestPotential: 90,
        socialPotential: 80,
        lifeModeRelevance: 90,
        commercialPotential: 60,
        freshness: 95,
        competitionOpportunity: 70,
        originalityPotential: 85,
      },
      totalScore: 84.0,
      priorityTier: 'PRIORITY',
      opportunityType: 'ARTICLE',
      status: 'BRIEF_READY',
      freshnessScore: 95,
      createdAt: '2026-02-10T09:00:00.000Z',
      updatedAt: '2026-02-10T09:00:00.000Z',
      tags: ['architecture', 'tea house', 'japan'],
    };

    await saveCandidates([topic], filePath);
    const loaded = await loadCandidates(filePath);

    assert.equal(loaded.length, 1);
    const restored = loaded[0];
    assert.equal(restored.sourceSignals.length, 2);

    const rssRestored = restored.sourceSignals.find((s) => s.source === 'RSS_FEEDS');
    assert.ok(rssRestored);
    assert.equal(rssRestored?.sourceUrl, 'https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/');
    assert.equal(rssRestored?.publisherName, 'Dezeen Architecture');
    assert.equal(rssRestored?.publishedAt, '2026-02-10T09:00:00.000Z');
    assert.equal(rssRestored?.contentSnippet, 'An exploration of minimalist Sukiya-style timber proportions.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('4. Web research provider ingests candidate-origin RSS source as verified context and strips tracking parameters', async () => {
  const topic: EditorialTopic = {
    id: 'lm-travel-research-01',
    canonicalTopic: 'Mindful Japanese Tea Pavilions: Sukiya Architecture Guide',
    slug: 'mindful-japanese-tea-pavilions-sukiya-architecture-guide',
    pillar: 'travel',
    sourceSignals: [
      {
        source: 'RSS_FEEDS',
        query: 'Mindful Japanese Tea Pavilions',
        recordedAt: '2026-02-10T09:00:00.000Z',
        sourceUrl: 'https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/?utm_source=feed&utm_campaign=daily&fbclid=abc123xyz',
        publisherName: 'Dezeen Architecture',
        publishedAt: '2026-02-10T09:00:00.000Z',
        contentSnippet: 'Verified exploration of timber proportions.',
      },
    ],
    queryVariants: ['sukiya architecture'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 90,
      socialPotential: 80,
      lifeModeRelevance: 90,
      commercialPotential: 60,
      freshness: 95,
      competitionOpportunity: 70,
      originalityPotential: 85,
    },
    totalScore: 84.0,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'BRIEF_READY',
    freshnessScore: 95,
    createdAt: '2026-02-10T09:00:00.000Z',
    updatedAt: '2026-02-10T09:00:00.000Z',
    tags: ['travel', 'architecture'],
  };

  const brief = buildContentBrief(topic);
  const provider = new WebEditorialResearchProvider({ enableLiveSearch: false });

  const result = await provider.research(topic, brief);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(result.items.length >= 1);

  const originEvidence = result.items.find((i) => i.publisher === 'Dezeen Architecture');
  assert.ok(originEvidence, 'Candidate origin RSS article must be included in research evidence');
  assert.equal(originEvidence?.url, 'https://www.dezeen.com/2026/02/10/japanese-tea-pavilions-architecture/');
  assert.equal(originEvidence?.sourceType, 'reputable_media');
  assert.equal(originEvidence?.reliability, 'high');
  assert.equal(originEvidence?.publishedAt, '2026-02-10T09:00:00.000Z');
});

test('5. Web research provider strictly excludes discovery-only signals (Reddit, Google Trends, Pinterest, YouTube) from factual evidence', async () => {
  const topic: EditorialTopic = {
    id: 'lm-trend-signals-01',
    canonicalTopic: 'The Minimalist Espresso Setup of 2026',
    slug: 'the-minimalist-espresso-setup-of-2026',
    pillar: 'life',
    sourceSignals: [
      {
        source: 'REDDIT_SOCIAL',
        query: 'r/espresso setup trends',
        recordedAt: '2026-02-10T09:00:00.000Z',
        sourceUrl: 'https://reddit.com/r/espresso/comments/abc123',
        publisherName: 'Reddit r/espresso',
      },
      {
        source: 'GOOGLE_TRENDS',
        query: 'lever espresso machine surge',
        recordedAt: '2026-02-10T09:00:00.000Z',
        sourceUrl: 'https://trends.google.com/trends/explore?q=espresso',
        publisherName: 'Google Trends',
      },
      {
        source: 'PINTEREST_TRENDS',
        query: 'coffee bar aesthetic',
        recordedAt: '2026-02-10T09:00:00.000Z',
        sourceUrl: 'https://pinterest.com/pin/123456',
        publisherName: 'Pinterest',
      },
    ],
    queryVariants: ['espresso machine'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 90,
      socialPotential: 80,
      lifeModeRelevance: 90,
      commercialPotential: 60,
      freshness: 95,
      competitionOpportunity: 70,
      originalityPotential: 85,
    },
    totalScore: 84.0,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'BRIEF_READY',
    freshnessScore: 95,
    createdAt: '2026-02-10T09:00:00.000Z',
    updatedAt: '2026-02-10T09:00:00.000Z',
    tags: ['coffee', 'life'],
  };

  const brief = buildContentBrief(topic);
  const provider = new WebEditorialResearchProvider({ enableLiveSearch: false });

  const result = await provider.research(topic, brief);
  assert.equal(result.status, 'SUCCESS');

  // Verify none of Reddit, Google Trends, or Pinterest URLs made it into factual evidence
  for (const item of result.items) {
    assert.ok(!item.url.includes('reddit.com'), 'Reddit URL must not appear in evidence');
    assert.ok(!item.url.includes('trends.google.com'), 'Google Trends URL must not appear in evidence');
    assert.ok(!item.url.includes('pinterest.com'), 'Pinterest URL must not appear in evidence');
    assert.ok((item.sourceType as string) !== 'social', 'Social sources must not be accepted as factual evidence');
  }
});

test('6. Authority classification and evidence scoring correctly prioritize official / academic / government > reputable_media > industry', () => {
  const gov = classifyUrlAuthority('https://treasurydirect.gov/marketable-securities', 'TreasuryDirect');
  assert.equal(gov.sourceType, 'government');
  assert.equal(gov.reliability, 'high');

  const academic = classifyUrlAuthority('https://tobunken.go.jp/english/research', 'National Research Institute');
  assert.equal(academic.sourceType, 'academic');
  assert.equal(academic.reliability, 'high');

  const media = classifyUrlAuthority('https://www.nytimes.com/2026/02/architecture', 'The New York Times');
  assert.equal(media.sourceType, 'reputable_media');
  assert.equal(media.reliability, 'high');

  const industry = classifyUrlAuthority('https://shop.example.com/products/kettle', 'Generic Retailer');
  assert.equal(industry.sourceType, 'industry');
  assert.equal(industry.reliability, 'medium');

  const itemGov: EvidenceItem = {
    title: 'Treasury Guidance',
    url: 'https://treasurydirect.gov/marketable-securities',
    publisher: 'U.S. Treasury',
    publishedAt: '2026-01-01T00:00:00.000Z',
    accessedAt: '2026-02-01T00:00:00.000Z',
    claimSummary: 'Official treasury security specifications.',
    sourceType: 'government',
    reliability: 'high',
  };

  const itemMedia: EvidenceItem = {
    title: 'Market Overview',
    url: 'https://www.nytimes.com/market-overview',
    publisher: 'The New York Times',
    publishedAt: '2026-01-01T00:00:00.000Z',
    accessedAt: '2026-02-01T00:00:00.000Z',
    claimSummary: 'Journalistic overview of market trends.',
    sourceType: 'reputable_media',
    reliability: 'high',
  };

  const itemIndustry: EvidenceItem = {
    title: 'Commercial Product Guide',
    url: 'https://example.com/guide',
    publisher: 'Brand Inc',
    accessedAt: '2026-02-01T00:00:00.000Z',
    claimSummary: 'Brand guide to products.',
    sourceType: 'industry',
    reliability: 'medium',
  };

  const itemAcademic: EvidenceItem = {
    title: 'Sukiya Architecture Study',
    url: 'https://tobunken.go.jp/english/research',
    publisher: 'National Research Institute',
    accessedAt: '2026-02-01T00:00:00.000Z',
    claimSummary: 'Academic documentation of joinery proportions.',
    sourceType: 'academic',
    reliability: 'high',
  };

  const itemOfficial: EvidenceItem = {
    title: 'Kyoto Cultural Guide',
    url: 'https://kyoto.travel/culture',
    publisher: 'Kyoto Tourism Board',
    accessedAt: '2026-02-01T00:00:00.000Z',
    claimSummary: 'Official cultural registry.',
    sourceType: 'official',
    reliability: 'high',
  };

  const scoreGov = calculateEvidenceScore(itemGov, false);
  const scoreOfficial = calculateEvidenceScore(itemOfficial, false);
  const scoreAcademic = calculateEvidenceScore(itemAcademic, false);
  const scoreMedia = calculateEvidenceScore(itemMedia, false);
  const scoreIndustry = calculateEvidenceScore(itemIndustry, false);

  assert.ok(scoreGov > scoreOfficial, `Gov score (${scoreGov}) must exceed Official score (${scoreOfficial})`);
  assert.ok(scoreOfficial > scoreAcademic, `Official score (${scoreOfficial}) must exceed Academic score (${scoreAcademic})`);
  assert.ok(scoreAcademic > scoreMedia, `Academic score (${scoreAcademic}) must exceed Media score (${scoreMedia})`);
  assert.ok(scoreMedia > scoreIndustry, `Media score (${scoreMedia}) must exceed Industry score (${scoreIndustry})`);

  // Origin boost (+10) test
  const scoreMediaAsOrigin = calculateEvidenceScore(itemMedia, true);
  assert.equal(scoreMediaAsOrigin, scoreMedia + 10);

  // Authority hierarchy invariant: Primary/authoritative sources must outrank origin publisher
  assert.ok(scoreGov > scoreMediaAsOrigin, `Gov (${scoreGov}) must outrank Media+Origin (${scoreMediaAsOrigin})`);
  assert.ok(scoreOfficial > scoreMediaAsOrigin, `Official (${scoreOfficial}) must outrank Media+Origin (${scoreMediaAsOrigin})`);
  assert.ok(scoreAcademic > scoreMediaAsOrigin, `Academic (${scoreAcademic}) must outrank Media+Origin (${scoreMediaAsOrigin})`);

  const scoreIndustryAsOrigin = calculateEvidenceScore(itemIndustry, true);
  assert.ok(scoreMedia > scoreIndustryAsOrigin, `Media (${scoreMedia}) must outrank Industry+Origin (${scoreIndustryAsOrigin})`);
});

test('7. Web research provider queries public search feed and isolates upstream network errors gracefully', async () => {
  let searchUrlCalled = '';

  const mockFetch = async (input: RequestInfo | URL) => {
    searchUrlCalled = typeof input === 'string' ? input : input.toString();
    return new Response(GOOGLE_NEWS_MOCK_XML, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml' },
    });
  };

  const topic: EditorialTopic = {
    id: 'lm-live-search-01',
    canonicalTopic: 'Sukiya Timber Preservation Practices',
    slug: 'sukiya-timber-preservation-practices',
    pillar: 'travel',
    sourceSignals: [],
    queryVariants: ['sukiya timber'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 90,
      socialPotential: 80,
      lifeModeRelevance: 90,
      commercialPotential: 60,
      freshness: 95,
      competitionOpportunity: 70,
      originalityPotential: 85,
    },
    totalScore: 84.0,
    priorityTier: 'PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'BRIEF_READY',
    freshnessScore: 95,
    createdAt: '2026-02-10T09:00:00.000Z',
    updatedAt: '2026-02-10T09:00:00.000Z',
    tags: ['travel'],
  };

  const brief = buildContentBrief(topic);
  const provider = new WebEditorialResearchProvider({
    fetchFn: mockFetch as typeof fetch,
    enableLiveSearch: true,
  });

  const result = await provider.research(topic, brief);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(searchUrlCalled.includes('news.google.com'));
  assert.ok(result.items.some((i) => i.publisher === 'The Japan Times' || i.publisher === 'Architecture Institute'));

  // Test network failure fallback isolation:
  const failingFetch = async () => {
    throw new Error('ETIMEDOUT: upstream search network connection lost');
  };

  const fallbackProvider = new WebEditorialResearchProvider({
    fetchFn: failingFetch as typeof fetch,
    enableLiveSearch: true,
  });

  const fallbackResult = await fallbackProvider.research(topic, brief);
  assert.equal(fallbackResult.status, 'SUCCESS');
  assert.ok(fallbackResult.items.length >= 1, 'Provider must fall back to curated reference rather than crashing');
});
