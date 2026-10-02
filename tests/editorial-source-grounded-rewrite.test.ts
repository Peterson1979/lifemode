import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFactSheet, determineContentType } from '../src/lib/editorial/fact-sheet.ts';
import { synthesizeEditorialBrief, buildContentBrief } from '../src/lib/editorial/brief.ts';
import { briefToGenerationRequest } from '../src/lib/editorial/generation/brief-adapter.ts';
import { buildGenerationPrompt } from '../src/lib/editorial/generation/prompt.ts';
import { validateEditorialArticle } from '../src/lib/editorial/validation/validator.ts';
import type { EditorialTopic, SourceSignal } from '../src/lib/editorial/types.ts';
import type { EvidenceItem } from '../src/lib/editorial/research/types.ts';

test('1. Source article content extraction: distinctive facts reach the Fact Sheet and Generation Request', () => {
  // Synthetic source article with distinctive facts and numbers
  const sourceSignals: SourceSignal[] = [
    {
      source: 'RSS_FEEDS',
      query: 'Velox Aero X1 Zero-Emission Test Flight Completed',
      sourceUrl: 'https://aerospace-daily.example.com/velox-x1-test-flight',
      publisherName: 'Aerospace Daily',
      author: 'Elena Vance',
      publishedAt: '2026-09-28T08:30:00.000Z',
      recordedAt: '2026-09-28T09:00:00.000Z',
      contentSnippet:
        'Velox Aero completed a 450-mile zero-emission test flight across Nevada in 82 minutes at an average altitude of 14,000 feet, recording 94.2% power efficiency with its proprietary hydrogen-electric powertrain.',
    },
  ];

  const topic: EditorialTopic = {
    id: 'lm-tech-ai-velox-x1-01',
    canonicalTopic: 'Velox Aero X1 Zero-Emission Test Flight Completed',
    slug: 'velox-aero-x1-zero-emission-test-flight',
    pillar: 'tech-ai',
    tags: ['tech-ai', 'aviation', 'clean-energy'],
    sourceSignals,
    queryVariants: ['velox aero x1', 'zero emission flight 2026'],
    scoring: {
      searchPotential: 85,
      pinterestPotential: 75,
      socialPotential: 85,
      lifeModeRelevance: 90,
      commercialPotential: 50,
      freshness: 90,
      competitionOpportunity: 70,
      originalityPotential: 90,
    },
    totalScore: 85,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 90,
    createdAt: '2026-09-28T09:00:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z',
  };

  const evidence: EvidenceItem[] = [
    {
      title: 'Federal Aviation Regulatory Flight Record: Velox X1 Prototype',
      url: 'https://faa.gov.example/flight-records/velox-x1-09282026',
      publisher: 'Federal Aviation Administration',
      publishedAt: '2026-09-28T10:00:00.000Z',
      accessedAt: '2026-09-28T10:15:00.000Z',
      claimSummary:
        'FAA telemetry verified the prototype maintained cruising speeds of 330 mph without exceeding the 14,000 feet operational ceiling.',
      sourceType: 'official',
      reliability: 'high',
    },
  ];

  // 1. Build Fact Sheet from source article + evidence
  const factSheet = buildFactSheet(topic, evidence, topic.sourceSignals);

  assert.equal(factSheet.primaryTopic, 'Velox Aero X1 Zero-Emission Test Flight Completed');
  assert.equal(factSheet.contentType, 'NEWS');
  assert.equal(factSheet.isSufficient, true);

  // Verify extraction of distinctive statistics and entities
  assert.ok(factSheet.organizations.includes('Aerospace Daily'));
  assert.ok(factSheet.organizations.includes('Federal Aviation Administration'));
  assert.ok(factSheet.people.some((p) => p.name === 'Elena Vance'));
  assert.ok(factSheet.sourceUrls.includes('https://aerospace-daily.example.com/velox-x1-test-flight'));
  assert.ok(factSheet.sourceUrls.includes('https://faa.gov.example/flight-records/velox-x1-09282026'));

  // Verify confirmed facts contain the source article data
  assert.ok(factSheet.confirmedFacts.some((f) => f.claim.includes('450-mile')));
  assert.ok(factSheet.confirmedFacts.some((f) => f.claim.includes('94.2%')));
  assert.ok(factSheet.confirmedFacts.some((f) => f.claim.includes('330 mph')));

  // 2. Synthesize Brief and convert to Generation Request
  const brief = synthesizeEditorialBrief(topic, evidence);
  const genRequest = briefToGenerationRequest(brief);

  assert.ok(genRequest.factSheet);
  assert.equal(genRequest.factSheet.contentType, 'NEWS');
  assert.equal(genRequest.factSheet.confirmedFacts.length >= 2, true);

  // 3. Verify Prompt Construction includes the Fact Sheet and strict boundaries
  const promptPayload = buildGenerationPrompt(genRequest);

  assert.ok(promptPayload.userPrompt.includes('### Structured Fact Sheet (Mandatory Factual Boundary):'));
  assert.ok(promptPayload.userPrompt.includes('450-mile'));
  assert.ok(promptPayload.userPrompt.includes('94.2%'));
  assert.ok(promptPayload.userPrompt.includes('14,000 feet'));
  assert.ok(promptPayload.userPrompt.includes('330 mph'));
  assert.ok(promptPayload.userPrompt.includes('Aerospace Daily'));
  assert.ok(promptPayload.userPrompt.includes('Federal Aviation Administration'));
  assert.ok(promptPayload.userPrompt.includes('Substantially rewrite the narrative in original language; do NOT copy source sentence wording.'));
  assert.ok(promptPayload.userPrompt.includes('Do NOT invent quotes, statistics, dates, people, or events not supported by this Fact Sheet.'));
});

test('2. Content type differentiation: NEWS, EXPLAINER, and EVERGREEN generate mode-specific structures', () => {
  // A. News Topic
  const newsTopic: EditorialTopic = {
    id: 'lm-news-01',
    canonicalTopic: 'Delta Flight 2311 Rapid Descent: Official NTSB Investigation Report',
    slug: 'delta-flight-2311-ntsb-report',
    pillar: 'travel',
    tags: ['travel', 'aviation', 'news'],
    sourceSignals: [
      {
        source: 'RSS_FEEDS',
        query: 'Delta 2311 NTSB Report',
        sourceUrl: 'https://ntsb.gov/reports/delta-2311',
        publisherName: 'National Transportation Safety Board',
        contentSnippet: 'Investigators confirmed a rapid depressurization occurred at 31,000 feet, prompting a controlled descent to 10,000 feet.',
        recordedAt: '2026-09-29T12:00:00.000Z',
      },
    ],
    queryVariants: ['delta 2311 rapid descent'],
    scoring: { searchPotential: 90, pinterestPotential: 50, socialPotential: 85, lifeModeRelevance: 85, commercialPotential: 40, freshness: 95, competitionOpportunity: 75, originalityPotential: 85 },
    totalScore: 88,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 95,
    createdAt: '2026-09-29T12:00:00.000Z',
    updatedAt: '2026-09-29T12:00:00.000Z',
  };

  // B. Explainer Topic
  const explainerTopic: EditorialTopic = {
    ...newsTopic,
    id: 'lm-explainer-01',
    canonicalTopic: 'The Architecture of Modern Aircraft Pressurization Systems: How Altitude Chambers Work',
    slug: 'aircraft-pressurization-architecture',
    queryVariants: ['aircraft pressurization architecture', 'how altitude chambers work'],
    scoring: { ...newsTopic.scoring, freshness: 40 },
    freshnessScore: 40,
  };

  // C. Evergreen Guide Topic
  const evergreenTopic: EditorialTopic = {
    ...newsTopic,
    id: 'lm-evergreen-01',
    canonicalTopic: 'A Practical Guide to Long-Haul Flight Hydration and Circadian Adjustment',
    slug: 'long-haul-flight-hydration-guide',
    queryVariants: ['long haul flight hydration guide', 'circadian adjustment flight'],
    scoring: { ...newsTopic.scoring, freshness: 15 },
    freshnessScore: 15,
  };

  const newsBrief = buildContentBrief(newsTopic);
  const explainerBrief = buildContentBrief(explainerTopic);
  const evergreenBrief = buildContentBrief(evergreenTopic);

  const newsPrompt = buildGenerationPrompt(briefToGenerationRequest(newsBrief));
  const explainerPrompt = buildGenerationPrompt(briefToGenerationRequest(explainerBrief));
  const evergreenPrompt = buildGenerationPrompt(briefToGenerationRequest(evergreenBrief));

  // Verify NEWS mode prompt directives
  assert.equal(determineContentType(newsTopic), 'NEWS');
  assert.ok(newsPrompt.systemPrompt.includes('### NEWS / CURRENT EVENT EDITORIAL STRUCTURE:'));
  assert.ok(newsPrompt.systemPrompt.includes('1. What happened (clear, direct lead without preamble).'));
  assert.ok(newsPrompt.systemPrompt.includes('2. What is confirmed'));

  // Verify EXPLAINER mode prompt directives
  assert.equal(determineContentType(explainerTopic), 'EXPLAINER');
  assert.ok(explainerPrompt.systemPrompt.includes('### EXPLAINER EDITORIAL STRUCTURE:'));
  assert.ok(explainerPrompt.systemPrompt.includes('explain the underlying subject, mechanism, system, or issue clearly'));

  // Verify EVERGREEN mode prompt directives
  assert.equal(determineContentType(evergreenTopic), 'EVERGREEN_GUIDE');
  assert.ok(evergreenPrompt.systemPrompt.includes('### EVERGREEN / GUIDE EDITORIAL STRUCTURE:'));
  assert.ok(evergreenPrompt.systemPrompt.includes('Produce a durable, deeply useful article grounded in practical insight'));
});

test('3. Anti-fabrication check: News topic without source material is rejected before generation', () => {
  const emptyNewsTopic: EditorialTopic = {
    id: 'lm-news-unsourced-01',
    canonicalTopic: 'Breaking Tech Acquisition Announcement 2026',
    slug: 'breaking-tech-acquisition-2026',
    pillar: 'tech-ai',
    tags: ['tech-ai', 'news'],
    sourceSignals: [],
    queryVariants: ['breaking acquisition'],
    scoring: { searchPotential: 90, pinterestPotential: 50, socialPotential: 85, lifeModeRelevance: 85, commercialPotential: 40, freshness: 95, competitionOpportunity: 75, originalityPotential: 85 },
    totalScore: 85,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 95,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const factSheet = buildFactSheet(emptyNewsTopic, [], []);

  assert.equal(factSheet.contentType, 'NEWS');
  assert.equal(factSheet.isSufficient, false);
  assert.ok(factSheet.insufficiencyReason?.includes('Grounding is mandatory to prevent fabrication'));
});

test('4. Original rewrite validation: Grounded in source facts without verbatim copying or generic filler', () => {
  const sourceSnippet =
    'Velox Aero completed a 450-mile zero-emission test flight across Nevada in 82 minutes at an average altitude of 14,000 feet, recording 94.2% power efficiency with its proprietary hydrogen-electric powertrain.';

  // A genuine original LifeMode article rewriting the source facts in thoughtful editorial style
  const originalRewrittenArticle = {
    title: 'Velox Aero Completes 450-Mile Test Flight in Clean Aviation Milestone',
    slug: 'velox-aero-completes-450-mile-test-flight',
    description: 'How Velox Aero achieved 94.2% powertrain efficiency during an 82-minute zero-emission flight across Nevada.',
    excerpt: 'Telemetry details from Velox Aero’s 450-mile hydrogen-electric test run across Nevada at 14,000 feet.',
    content: `Commercial aviation took an observable step toward decarbonization as Velox Aero concluded a rigorous 450-mile trial flight across Nevada airspace. Piloted at a steady cruising altitude of 14,000 feet, the experimental airframe logged 82 minutes of continuous flight time while sustaining an extraordinary 94.2% power efficiency from its hydrogen-electric powertrain.

## Telemetry and Powertrain Dynamics

Unlike earlier battery-dense prototypes constrained by gross weight penalties, the Velox platform balances cryogenic fuel cells with direct-drive electric turbines. Official performance benchmarks confirmed the system preserved thermal equilibrium across the entire 450-mile flight path without voltage dropouts.

Telemetry validated by the Federal Aviation Administration documented cruising velocities reaching 330 mph. Crucially, the aircraft achieved its mission envelope well beneath standard commercial ceiling pressures, demonstrating that regional zero-emission transit is mechanically feasible with current hydrogen storage densities.

## Implications for Regional Flight Networks

Regional commuter routes between 300 and 500 miles represent nearly 40% of short-haul domestic flights. By proving that a 450-mile route can be traversed in under an hour and a half with zero tailpipe emissions, the demonstration lays a verifiable baseline for scheduled clean aviation.`,
    sources: [
      { name: 'Aerospace Daily', url: 'https://aerospacedaily.net/velox-x1-test-flight' },
      { name: 'Federal Aviation Administration', url: 'https://faa.gov/flight-records/velox-x1-09282026' },
    ],
  };

  // 1. Verify original text does NOT copy the source sentence verbatim
  assert.equal(originalRewrittenArticle.content.includes(sourceSnippet), false);

  // 2. Verify all factual statistics are accurately preserved in the rewrite
  assert.ok(originalRewrittenArticle.content.includes('450-mile'));
  assert.ok(originalRewrittenArticle.content.includes('82 minutes'));
  assert.ok(originalRewrittenArticle.content.includes('14,000 feet'));
  assert.ok(originalRewrittenArticle.content.includes('94.2%'));
  assert.ok(originalRewrittenArticle.content.includes('330 mph'));

  // 3. Verify Editorial QA Gate validation
  const validationResult = validateEditorialArticle(originalRewrittenArticle, {
    topicId: 'lm-tech-ai-velox-x1-01',
    pillar: 'tech-ai',
    format: 'standard',
  });

  assert.equal(validationResult.passed, true);
  assert.equal(validationResult.score, 100);
  assert.equal(validationResult.errors.length, 0);
});
