import type { EditorialTopic, SourceSignal } from './types.ts';
import type { EvidenceItem } from './research/types.ts';

export type EditorialContentType = 'NEWS' | 'EXPLAINER' | 'EVERGREEN_GUIDE';

export interface ConfirmedFactItem {
  claim: string;
  sourceUrl?: string;
  sourceTitle?: string;
  publisher?: string;
  reliability?: string;
}

export interface FactSheetPerson {
  name: string;
  role?: string;
}

/**
 * Internal structured representation of all factual grounding boundaries for an article.
 */
export interface StructuredFactSheet {
  primaryTopic: string;
  primaryEntity: string;
  event?: string;
  people: FactSheetPerson[];
  organizations: string[];
  locations: string[];
  dates: string[];
  confirmedFacts: ConfirmedFactItem[];
  importantNumbers: string[];
  sourceClaims: string[];
  uncertainOrUnconfirmed: string[];
  articleAngle: string;
  contentType: EditorialContentType;
  sourceUrls: string[];
  isSufficient: boolean;
  insufficiencyReason?: string;
}

export interface FactSheetOptions {
  customAngle?: string;
  requestedContentType?: EditorialContentType;
  minConfirmedFactsForNews?: number;
}

/**
 * Deterministically derives the EditorialContentType for a topic and its evidence.
 */
export function determineContentType(
  topic: EditorialTopic,
  factSheet?: Partial<StructuredFactSheet>
): EditorialContentType {
  if (factSheet?.contentType) {
    return factSheet.contentType;
  }

  const topicText = `${topic.canonicalTopic} ${(topic.queryVariants || []).join(' ')}`.toLowerCase();
  const freshness = topic.scoring?.freshness ?? topic.freshnessScore ?? 50;

  // 1. Explicit format signals
  if (topic.tags?.includes('guide') || topic.tags?.includes('recipe')) {
    return 'EVERGREEN_GUIDE';
  }

  // 2. News / Current Event signals
  const isTimelyKeyword = /\b(breaking|vs\.?|versus|rapid descent|diverted|incident|matchup|live updates?|trade rumor|press release)\b/i.test(topicText);
  if (freshness >= 85 || isTimelyKeyword) {
    return 'NEWS';
  }

  // 3. Explainer signals
  const isExplainerKeyword = /\b(what is|why|how (does|it works?|to understand|to cook|to make)|explained|explainer|architecture of|the science of|the anatomy of|mechanism|deep dive|understanding)\b/i.test(topicText);
  if (isExplainerKeyword) {
    return 'EXPLAINER';
  }

  // 4. Evergreen / Guide default for lifestyle, craft, recipes, durable concepts
  return 'EVERGREEN_GUIDE';
}

/**
 * Extracts entities, people, organizations, locations, dates, numbers, and confirmed facts
 * from topic signals and external evidence to build a strict factual boundary.
 */
export function buildFactSheet(
  topic: EditorialTopic,
  evidence: EvidenceItem[] = [],
  sources: SourceSignal[] = [],
  options: FactSheetOptions = {}
): StructuredFactSheet {
  const combinedSignals: SourceSignal[] = [
    ...(topic.sourceSignals || []),
    ...sources,
  ];

  const primaryTopic = topic.canonicalTopic.trim();

  // 1. Identify Primary Entity & Event
  let primaryEntity = primaryTopic;
  let event: string | undefined;

  if (/\bvs\.?\b/i.test(primaryTopic)) {
    const parts = primaryTopic.split(/\bvs\.?\b/i);
    primaryEntity = parts[0].trim();
    event = `Matchup between ${parts[0].trim()} and ${parts[1]?.trim() || 'Opponent'}`;
  } else if (/\b(incident|descent|diverted|storm|watch|festival|cup|awards|chase)\b/i.test(primaryTopic)) {
    event = primaryTopic;
  }

  // 2. Extract People & Roles
  const peopleMap = new Map<string, string | undefined>();
  const organizationsSet = new Set<string>();
  const locationsSet = new Set<string>();
  const datesSet = new Set<string>();
  const importantNumbersSet = new Set<string>();
  const sourceClaims: string[] = [];
  const confirmedFacts: ConfirmedFactItem[] = [];
  const sourceUrlsSet = new Set<string>();

  // Extract from topic tags and query variants
  for (const tag of topic.tags || []) {
    if (/^[A-Z]{2}$/.test(tag)) {
      locationsSet.add(tag);
    }
  }

  // Process Evidence Items
  for (const item of evidence) {
    if (item.url) sourceUrlsSet.add(item.url);
    if (item.publisher) organizationsSet.add(item.publisher);
    if (item.publishedAt) datesSet.add(item.publishedAt.slice(0, 10));

    if (item.claimSummary && item.claimSummary.trim().length > 0) {
      sourceClaims.push(item.claimSummary.trim());
      confirmedFacts.push({
        claim: item.claimSummary.trim(),
        sourceUrl: item.url,
        sourceTitle: item.title || item.publisher,
        publisher: item.publisher,
        reliability: item.reliability,
      });

      // Extract numbers/stats from claim summary
      const numbers = item.claimSummary.match(/\b\d+(\.\d+)?(%|\s*(mph|knots|feet|ft|meters|million|billion|k|points|runs|goals|degrees))?\b/gi);
      if (numbers) {
        for (const num of numbers) {
          if (num.length > 1 && !/^\d{4}$/.test(num)) {
            importantNumbersSet.add(num.trim());
          }
        }
      }
    }
  }

  // Process Source Signals (e.g. RSS snippets, Google Trends payloads)
  for (const sig of combinedSignals) {
    if (sig.sourceUrl) sourceUrlsSet.add(sig.sourceUrl);
    if (sig.publisherName) organizationsSet.add(sig.publisherName);
    if (sig.publishedAt) datesSet.add(sig.publishedAt.slice(0, 10));
    if (sig.author) peopleMap.set(sig.author, 'Author / Reporter');

    if (sig.contentSnippet && sig.contentSnippet.trim().length > 0) {
      const snippet = sig.contentSnippet.trim();
      sourceClaims.push(snippet);
      if (!confirmedFacts.some((f) => f.claim === snippet)) {
        confirmedFacts.push({
          claim: snippet,
          sourceUrl: sig.sourceUrl,
          sourceTitle: sig.query || sig.publisherName,
          publisher: sig.publisherName || sig.source,
          reliability: 'high',
        });
      }

      const numbers = snippet.match(/\b\d+(\.\d+)?(%|\s*(mph|knots|feet|ft|meters|million|billion|points|runs|goals))?\b/gi);
      if (numbers) {
        for (const num of numbers) {
          if (num.length > 1 && !/^\d{4}$/.test(num)) {
            importantNumbersSet.add(num.trim());
          }
        }
      }
    }
  }

  // 3. Determine Content Type
  const contentType = options.requestedContentType || determineContentType(topic, { contentType: undefined });

  // 4. Derive Article Angle
  let articleAngle = options.customAngle;
  if (!articleAngle) {
    if (contentType === 'NEWS') {
      articleAngle = `Factual, verified reporting on ${primaryTopic}: what happened, confirmed details, and why it matters for our readers.`;
    } else if (contentType === 'EXPLAINER') {
      articleAngle = `Clear, accessible breakdown of the underlying mechanisms, context, and significance behind ${primaryTopic}.`;
    } else {
      articleAngle = `Durable, high-signal editorial perspective offering actionable clarity and practical insight into ${primaryTopic}.`;
    }
  }

  // 5. Check Sufficiency to prevent fabrication
  const minFacts = options.minConfirmedFactsForNews ?? 1;
  let isSufficient = true;
  let insufficiencyReason: string | undefined;

  if (contentType === 'NEWS') {
    // Current event topics MUST have verified source grounding
    const hasFacts = confirmedFacts.length >= minFacts || sourceClaims.length >= minFacts;
    const hasSourceUrls = sourceUrlsSet.size > 0;

    if (!hasFacts && !hasSourceUrls) {
      isSufficient = false;
      insufficiencyReason = `Topic "${primaryTopic}" classified as NEWS/CURRENT EVENT lacks confirmed facts and verified external source references. Grounding is mandatory to prevent fabrication.`;
    }
  }

  return {
    primaryTopic,
    primaryEntity,
    event,
    people: Array.from(peopleMap.entries()).map(([name, role]) => ({ name, role })),
    organizations: Array.from(organizationsSet),
    locations: Array.from(locationsSet),
    dates: Array.from(datesSet),
    confirmedFacts,
    importantNumbers: Array.from(importantNumbersSet),
    sourceClaims,
    uncertainOrUnconfirmed: [],
    articleAngle,
    contentType,
    sourceUrls: Array.from(sourceUrlsSet),
    isSufficient,
    insufficiencyReason,
  };
}
