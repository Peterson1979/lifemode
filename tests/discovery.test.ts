import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';

import { parseXmlFeed, unescapeXml, stripHtml } from '../src/lib/editorial/discovery/parsers/xml-feed-parser.ts';
import { RSSFeedsDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/rss-feeds.ts';
import { RedditSocialDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/reddit-social.ts';
import {
  GoogleTrendsDiscoveryAdapter,
  classifyTrendingQueryPillar,
} from '../src/lib/editorial/discovery/adapters/google-trends.ts';
import { SeasonalCalendarDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/seasonal-calendar.ts';
import { GoogleSearchConsoleDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/google-search-console.ts';
import { BingWebmasterDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/bing-webmaster.ts';
import { YouTubeTrendsDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/youtube-trends.ts';
import { InternalAnalyticsDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/internal-analytics.ts';
import { PinterestTrendsDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/pinterest.ts';
import { FixtureDiscoveryAdapter } from '../src/lib/editorial/discovery/adapters/fixture.ts';
import { transformSignalToCandidate, applyCrossSourceCorroboration } from '../src/lib/editorial/discovery/transform.ts';
import { runDiscoveryPipeline } from '../src/lib/editorial/discovery/runner.ts';
import { normalizeTopicQuery, toEditorialTitleCase } from '../src/lib/editorial/normalization.ts';
import type { DiscoverySignal } from '../src/lib/editorial/discovery/types.ts';

// Sample mock RSS 2.0 XML
const MOCK_RSS_2_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Dezeen Design Wire</title>
    <link>https://www.dezeen.com</link>
    <description>Architecture, interiors and design</description>
    <item>
      <title><![CDATA[Minimalist Japanese Timber Cabin in Nagano Forest &amp; Mountains]]></title>
      <link>https://www.dezeen.com/2026/09/10/minimalist-timber-cabin/</link>
      <pubDate>Thu, 10 Sep 2026 08:00:00 +0000</pubDate>
      <description><![CDATA[<p>Architects craft an off-grid sanctuary using sustainable cedar wood.</p>]]></description>
      <category>Architecture</category>
      <category>Minimalism</category>
    </item>
    <item>
      <title>Biophilic Workspaces: The New Ergonomic Paradigm</title>
      <link>https://www.dezeen.com/2026/09/09/biophilic-workspaces/</link>
      <pubDate>Wed, 09 Sep 2026 14:30:00 +0000</pubDate>
      <description>Integrating living walls and acoustic cedar into modern offices.</description>
      <category>Interiors</category>
    </item>
  </channel>
</rss>`;

// Sample mock Atom 1.0 XML
const MOCK_ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Ars Technica</title>
  <link href="https://arstechnica.com" />
  <updated>2026-09-10T08:00:00Z</updated>
  <entry>
    <title type="html">Running Local LLMs on Apple Silicon: Privacy and Latency Benchmarks</title>
    <link rel="alternate" href="https://arstechnica.com/information-technology/2026/09/local-llm-benchmarks/" />
    <published>2026-09-10T07:15:00Z</published>
    <summary type="html">&lt;p&gt;Comprehensive analysis of sovereign AI inference on unified memory hardware.&lt;/p&gt;</summary>
    <category term="AI" />
    <category term="Hardware" />
  </entry>
</feed>`;

// Sample mock Google Trends RSS XML
const MOCK_GOOGLE_TRENDS_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
  <channel>
    <title>Daily Search Trends (US)</title>
    <link>https://trends.google.com/trending</link>
    <item>
      <title>Kyoto Tea Houses</title>
      <ht:approx_traffic>100K+</ht:approx_traffic>
      <description>Surge in international slow travel and traditional tea ceremony searches.</description>
      <pubDate>Thu, 10 Sep 2026 06:00:00 -0700</pubDate>
      <link>https://trends.google.com/trending/story/kyoto-tea</link>
      <category>Travel</category>
    </item>
    <item>
      <title>Nvidia AI Computing Architecture</title>
      <ht:approx_traffic>500K+</ht:approx_traffic>
      <description>Next-generation inference chips and workstation setups unveiled.</description>
      <pubDate>Thu, 10 Sep 2026 05:00:00 -0700</pubDate>
      <link>https://trends.google.com/trending/story/nvidia-chips</link>
      <category>Technology</category>
    </item>
  </channel>
</rss>`;

// Sample mock Reddit JSON response
const MOCK_REDDIT_JSON = {
  kind: 'Listing',
  data: {
    children: [
      {
        kind: 't3',
        data: {
          id: 'post_101',
          title: 'The Single-Tasking Reset: How I Eliminated Screen Overwhelm and Restored Focus',
          subreddit: 'minimalism',
          ups: 480,
          num_comments: 92,
          permalink: '/r/minimalism/comments/post_101/the_singletasking_reset/',
          created_utc: 1789020000,
          stickied: false,
          over_18: false,
        },
      },
      {
        kind: 't3',
        data: {
          id: 'post_stickied',
          title: 'Weekly Community Discussion Thread (Read Rules First)',
          subreddit: 'minimalism',
          ups: 35,
          num_comments: 120,
          permalink: '/r/minimalism/comments/weekly/',
          created_utc: 1789010000,
          stickied: true, // Should be filtered out
          over_18: false,
        },
      },
      {
        kind: 't3',
        data: {
          id: 'post_nsfw',
          title: 'NSFW discussion thread',
          subreddit: 'minimalism',
          ups: 500,
          num_comments: 50,
          permalink: '/r/minimalism/comments/nsfw/',
          created_utc: 1789015000,
          stickied: false,
          over_18: true, // Should be filtered out
        },
      },
    ],
  },
};

test('XML Feed Parser - Parses RSS 2.0 with CDATA, categories, and unescaping', () => {
  const parsed = parseXmlFeed(MOCK_RSS_2_XML);
  assert.equal(parsed.title, 'Dezeen Design Wire');
  assert.equal(parsed.items.length, 2);

  const item1 = parsed.items[0];
  assert.equal(item1.title, 'Minimalist Japanese Timber Cabin in Nagano Forest & Mountains');
  assert.equal(item1.link, 'https://www.dezeen.com/2026/09/10/minimalist-timber-cabin/');
  assert.ok(item1.description?.includes('sustainable cedar wood'));
  assert.ok(item1.categories.includes('Architecture'));
  assert.ok(item1.categories.includes('Minimalism'));
});

test('XML Feed Parser - Parses Atom 1.0 feeds with entries and links', () => {
  const parsed = parseXmlFeed(MOCK_ATOM_XML);
  assert.equal(parsed.items.length, 1);

  const entry = parsed.items[0];
  assert.equal(entry.title, 'Running Local LLMs on Apple Silicon: Privacy and Latency Benchmarks');
  assert.equal(entry.link, 'https://arstechnica.com/information-technology/2026/09/local-llm-benchmarks/');
  assert.ok(entry.description?.includes('sovereign AI inference'));
  assert.ok(entry.categories.includes('AI'));
});

test('XML Feed Parser - Handles malformed XML and empty inputs without crashing', () => {
  assert.equal(parseXmlFeed('').items.length, 0);
  assert.equal(parseXmlFeed('   ').items.length, 0);
  assert.equal(parseXmlFeed('<html><body>Random broken string</body></html>').items.length, 0);
  assert.equal(unescapeXml('&amp;&lt;&gt;&quot;&#39;'), '&<>"\'');
  assert.equal(stripHtml('<p>Hello <b>World</b> &amp; <i>Life</i></p>'), 'Hello World & Life');
});

test('Live RSS Feeds Adapter - Parses mock HTTP response and extracts signals', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(MOCK_RSS_2_XML, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml' },
    });
  };

  const adapter = new RSSFeedsDiscoveryAdapter(mockFetch);
  const result = await adapter.fetchSignals({
    feeds: [
      {
        id: 'dezeen-test',
        name: 'Dezeen Architecture',
        url: 'https://www.dezeen.com/feed/',
        pillar: 'discover',
        categories: ['design', 'architecture'],
      },
    ],
  });

  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.signals.length, 2);
  assert.equal(result.signals[0].source, 'RSS_FEEDS');
  assert.equal(result.signals[0].category, 'discover');
  assert.equal(result.signals[0].rawQuery, 'Minimalist Japanese Timber Cabin in Nagano Forest & Mountains');
  assert.ok(result.signals[0].sourceUrl?.includes('minimalist-timber-cabin'));
  assert.equal(result.signals[0].metadata?.isLiveIngestion, true);
});

test('Live RSS Feeds Adapter - Isolates feed HTTP errors and reports failure when all fail', async () => {
  const failingFetch: typeof fetch = async () => {
    return new Response('Internal Server Error', { status: 500, statusText: 'Server Error' });
  };

  const adapter = new RSSFeedsDiscoveryAdapter(failingFetch);
  const result = await adapter.fetchSignals({
    feeds: [
      {
        id: 'broken-feed',
        name: 'Broken Feed',
        url: 'https://broken.example.com/rss',
        pillar: 'life',
      },
    ],
  });

  assert.equal(result.status, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.signals.length, 0);
  assert.ok(result.error?.includes('All live RSS feeds failed'));
});

test('Live Reddit Social Adapter - Ingests public JSON and filters stickied/NSFW posts', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify(MOCK_REDDIT_JSON), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const adapter = new RedditSocialDiscoveryAdapter(mockFetch);
  const result = await adapter.fetchSignals({
    communities: [{ subreddit: 'minimalism', pillar: 'life', minScore: 50 }],
  });

  assert.equal(result.status, 'AVAILABLE');
  // Only the 1 valid post should be extracted (stickied and NSFW filtered out)
  assert.equal(result.signals.length, 1);

  const signal = result.signals[0];
  assert.equal(signal.source, 'REDDIT_SOCIAL');
  assert.equal(signal.category, 'life');
  assert.equal(
    signal.rawQuery,
    'The Single-Tasking Reset: How I Eliminated Screen Overwhelm and Restored Focus'
  );
  assert.equal(signal.sourceUrl, 'https://www.reddit.com/r/minimalism/comments/post_101/the_singletasking_reset/');
  assert.equal(signal.metadata?.socialPayload?.upvotesOrEngagement, 480);
  assert.equal(signal.metadata?.socialPayload?.commentCount, 92);
  assert.equal(signal.metadata?.isLiveIngestion, true);
});

test('Live Reddit Social Adapter - Handles 429 rate limit gracefully', async () => {
  const rateLimitedFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ message: 'Too Many Requests' }), {
      status: 429,
      statusText: 'Too Many Requests',
    });
  };

  const adapter = new RedditSocialDiscoveryAdapter(rateLimitedFetch);
  const result = await adapter.fetchSignals({
    communities: [{ subreddit: 'minimalism', pillar: 'life' }],
  });

  assert.equal(result.status, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.signals.length, 0);
  assert.ok(result.error?.includes('429 Rate Limit'));
});

test('Live Google Trends Adapter - Ingests RSS and classifies keyword pillars', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(MOCK_GOOGLE_TRENDS_RSS, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml' },
    });
  };

  const adapter = new GoogleTrendsDiscoveryAdapter(mockFetch);
  const result = await adapter.fetchSignals();

  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.signals.length, 2);

  const item1 = result.signals.find((s) => s.rawQuery.includes('Kyoto'));
  assert.ok(item1);
  assert.equal(item1?.category, 'travel');
  assert.equal(item1?.metrics?.searchVolume, 100000);

  const item2 = result.signals.find((s) => s.rawQuery.includes('Nvidia'));
  assert.ok(item2);
  assert.equal(item2?.category, 'tech-ai');
  assert.equal(item2?.metrics?.searchVolume, 500000);
});

test('Keyword Pillar Classifier - Correctly categorizes trend titles', () => {
  assert.equal(classifyTrendingQueryPillar('Apple M5 Chip Breakthrough in Local LLM Inference'), 'tech-ai');
  assert.equal(classifyTrendingQueryPillar('Secluded Coastal Hotels and Train Journeys in Japan'), 'travel');
  assert.equal(classifyTrendingQueryPillar('Federal Reserve Interest Rates and Treasury Yields'), 'money');
  assert.equal(classifyTrendingQueryPillar('Circadian Rhythm Light Protocols and Deep Sleep Longevity'), 'wellbeing');
  assert.equal(classifyTrendingQueryPillar('Minimalist Timber Pavilion Exhibition in Venice'), 'discover');
  assert.equal(classifyTrendingQueryPillar('Daily Morning Habits and Workspace Decluttering Routine'), 'life');
  assert.equal(classifyTrendingQueryPillar('Cultural Festival and Zeitgeist Dispatch'), 'now');
});

test('Discovery Adapters - Seasonal Calendar generates timely signals for all pillars', async () => {
  const adapter = new SeasonalCalendarDiscoveryAdapter();
  assert.equal(adapter.name, 'Seasonal Calendar Adapter');
  assert.equal(adapter.sourceType, 'SEASONAL_CALENDAR');

  const result = await adapter.fetchSignals();
  assert.equal(result.status, 'AVAILABLE');
  assert.ok(result.signals.length > 0);
  assert.equal(result.signals[0].source, 'SEASONAL_CALENDAR');
});

test('Discovery Adapters - Credential-isolated adapters report NOT_CONFIGURED safely', async () => {
  const pinterest = new PinterestTrendsDiscoveryAdapter();
  const gsc = new GoogleSearchConsoleDiscoveryAdapter();
  const bing = new BingWebmasterDiscoveryAdapter();
  const yt = new YouTubeTrendsDiscoveryAdapter();
  const analytics = new InternalAnalyticsDiscoveryAdapter();

  const [pinRes, gscRes, bingRes, ytRes, analyticsRes] = await Promise.all([
    pinterest.fetchSignals(),
    gsc.fetchSignals(),
    bing.fetchSignals(),
    yt.fetchSignals(),
    analytics.fetchSignals(),
  ]);

  assert.equal(pinRes.status, 'NOT_CONFIGURED');
  assert.equal(gscRes.status, 'NOT_CONFIGURED');
  assert.equal(bingRes.status, 'NOT_CONFIGURED');
  assert.equal(ytRes.status, 'NOT_CONFIGURED');
  assert.equal(analyticsRes.status, 'NOT_CONFIGURED');
});

test('Normalization - Deterministically canonicalizes queries and synonyms', () => {
  const rawPinterest = 'small bedroom storage ideas';
  const rawGoogle = 'small bedroom organization';
  const rawReddit = 'How do I make a tiny bedroom less cluttered?';

  const norm1 = normalizeTopicQuery(rawPinterest);
  const norm2 = normalizeTopicQuery(rawGoogle);
  const norm3 = normalizeTopicQuery(rawReddit);

  assert.equal(norm1.canonicalTopic, 'Small Bedroom Storage Ideas');
  assert.equal(norm2.canonicalTopic, 'Small Bedroom Organization');
  assert.equal(norm3.canonicalTopic, 'Tiny Bedroom Less Cluttered');

  const title = toEditorialTitleCase('the art of slow travel and quiet tea houses in japan');
  assert.equal(title, 'The Art of Slow Travel and Quiet Tea Houses in Japan');
});

test('Cross-Source Corroboration - Boosts opportunity scores when multiple sources confirm', () => {
  const initialSignal: DiscoverySignal = {
    source: 'PINTEREST_TRENDS',
    sourceId: 'pin-01',
    rawQuery: 'Minimalist Workspace Setup',
    timestamp: '2026-09-09T10:00:00.000Z',
    metrics: { growthRate: 70, relativeInterest: 80, visualPotentialScore: 90 },
    category: 'life',
  };

  const initialTopic = transformSignalToCandidate(initialSignal);
  const initialScore = initialTopic.totalScore;

  const corroboratingSignal: DiscoverySignal = {
    source: 'REDDIT_SOCIAL',
    sourceId: 'red-01',
    rawQuery: 'Minimalist Workspace Setup for Deep Focus',
    timestamp: '2026-09-09T11:00:00.000Z',
    metrics: { growthRate: 85, relativeInterest: 90 },
    category: 'life',
  };

  const corroboratedTopic = applyCrossSourceCorroboration(initialTopic, corroboratingSignal);

  assert.ok(corroboratedTopic.sourceSignals.length === 2);
  assert.ok(corroboratedTopic.totalScore >= initialScore);
  assert.ok(corroboratedTopic.scoring.socialPotential > initialTopic.scoring.socialPotential);
});

test('Fault-Tolerance - Discovery pipeline isolates failing adapter without crashing', async () => {
  const tempPath = resolve(process.cwd(), 'data/topics/test-fault-tolerance-temp.json');

  const crashingAdapter = {
    name: 'Crashing Adapter',
    sourceType: 'GOOGLE_TRENDS' as const,
    fetchSignals: async () => {
      throw new Error('Network timeout or upstream 503 error');
    },
  };

  try {
    const report = await runDiscoveryPipeline(
      [
        crashingAdapter,
        new SeasonalCalendarDiscoveryAdapter(),
        new FixtureDiscoveryAdapter(),
      ],
      { storagePath: tempPath, saveToDisk: true }
    );

    assert.ok(report.timestamp);
    assert.equal(report.providerResults.length, 3);

    const failedResult = report.providerResults.find((p) => p.provider === 'Crashing Adapter');
    assert.equal(failedResult?.status, 'FAILED');
    assert.ok(failedResult?.error?.includes('upstream 503'));

    assert.ok(report.totalSignalsReceived > 0);
    assert.ok(report.newCandidatesStored > 0);
  } finally {
    await rm(tempPath, { force: true });
  }
});

test('Discovery Pipeline with Mock Live Adapters - Tracks REAL_EXTERNAL origin metrics', async () => {
  const tempPath = resolve(process.cwd(), 'data/topics/test-mock-live-temp.json');

  const mockRssFetch: typeof fetch = async () => new Response(MOCK_RSS_2_XML, { status: 200 });
  const mockRedditFetch: typeof fetch = async () => new Response(JSON.stringify(MOCK_REDDIT_JSON), { status: 200 });
  const mockGtrendsFetch: typeof fetch = async () => new Response(MOCK_GOOGLE_TRENDS_RSS, { status: 200 });

  const liveAdapters = [
    new RSSFeedsDiscoveryAdapter(mockRssFetch),
    new RedditSocialDiscoveryAdapter(mockRedditFetch),
    new GoogleTrendsDiscoveryAdapter(mockGtrendsFetch),
    new SeasonalCalendarDiscoveryAdapter(),
  ];

  try {
    const report = await runDiscoveryPipeline(liveAdapters, {
      storagePath: tempPath,
      saveToDisk: true,
    });

    assert.ok(report.totalSignalsReceived >= 5);
    assert.ok(report.realExternalSignalsCount >= 4);
    assert.ok(report.staticDeterministicSignalsCount >= 1);
    assert.equal(report.fixtureSignalsCount, 0);

    // Verify candidates were created and categorized
    assert.ok(report.newCandidatesStored > 0);
    assert.ok(report.candidatesSummary.length > 0);
  } finally {
    await rm(tempPath, { force: true });
  }
});
