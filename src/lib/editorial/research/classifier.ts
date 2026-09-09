import type { EditorialTopic, ContentBrief } from '../types.ts';

export interface ResearchRequirement {
  required: boolean;
  reason: string;
  suggestedQueries: string[];
}

/**
 * Determines whether external evidence research is required for an editorial topic and brief.
 *
 * Rules:
 * - REQUIRED:
 *   1. Content Brief explicitly specifies required sources.
 *   2. High or medium risk sensitivity (health, finance, compliance).
 *   3. NOW pillar topics (current trends, forward-looking 2026 zeitgeist claims, market shifts).
 *   4. TRAVEL pillar topics (specific venues, tea houses, locations, architecture, transport).
 *   5. TECH-AI pillar topics (product specs, model capabilities, local LLM architectures, benchmarks).
 *   6. MONEY pillar topics (treasury rates, cash management rules, quantitative financial advice).
 *   7. WELLBEING pillar topics (circadian protocols, sleep science, clinical/health claims).
 *
 * - OPTIONAL:
 *   General LIFE tips, general DISCOVER aesthetic curation, and reflective opinion/lifestyle framing.
 */
export function evaluateResearchRequirement(
  topic: EditorialTopic,
  brief: ContentBrief
): ResearchRequirement {
  const pillar = topic.pillar;
  const canonical = topic.canonicalTopic.toLowerCase();
  const title = (brief.titleAngle || topic.canonicalTopic).toLowerCase();
  const hasExplicitSources = Boolean(
    brief.requiredSources &&
    brief.requiredSources.some((s) => s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')))
  );
  const isHighRisk = brief.riskLevel === 'high' || (topic.scoring.lifeModeRelevance > 90 && (pillar === 'money' || pillar === 'wellbeing'));
  const isMediumRisk = brief.riskLevel === 'medium';

  const queries: string[] = [
    brief.searchTargets.primaryKeyword,
    ...(brief.searchTargets.secondaryKeywords || []).slice(0, 2),
  ].filter(Boolean);

  // 1. Explicit brief requirement
  if (hasExplicitSources) {
    return {
      required: true,
      reason: 'Content brief explicitly specifies required authoritative sources.',
      suggestedQueries: queries,
    };
  }

  // 2. High or medium risk sensitivity
  if (isHighRisk || isMediumRisk) {
    return {
      required: true,
      reason: `Topic is classified as ${brief.riskLevel || 'medium'}-risk requiring empirical or regulatory grounding.`,
      suggestedQueries: queries,
    };
  }

  // 3. NOW pillar: current trends, current events, zeitgeist, 2026 claims
  if (pillar === 'now' || canonical.includes('2026') || title.includes('2026') || canonical.includes('trend')) {
    return {
      required: true,
      reason: 'Current zeitgeist and forward-looking trend topics require verified external evidence.',
      suggestedQueries: queries,
    };
  }

  // 4. TRAVEL pillar: specific venues, tea houses, locations, architecture, transport
  if (pillar === 'travel') {
    return {
      required: true,
      reason: 'Travel and destination guides require verified venue, location, and architectural specifics.',
      suggestedQueries: queries,
    };
  }

  // 5. TECH-AI pillar: product capabilities, pricing, availability, model versions
  if (pillar === 'tech-ai') {
    return {
      required: true,
      reason: 'Technology and AI architecture topics require verified specs, documentation, or model benchmarks.',
      suggestedQueries: queries,
    };
  }

  // 6. MONEY pillar: rates, treasury, prices, financial rules, quantitative claims
  if (pillar === 'money') {
    return {
      required: true,
      reason: 'Financial and treasury topics require verified market, rate, or institutional guidelines.',
      suggestedQueries: queries,
    };
  }

  // 7. WELLBEING pillar: health/scientific/circadian/nutrition claims
  if (pillar === 'wellbeing') {
    return {
      required: true,
      reason: 'Wellbeing and lifestyle protocol topics require scientific consensus or clinical grounding.',
      suggestedQueries: queries,
    };
  }

  // 8. General LIFE and DISCOVER topics without empirical claim dependencies
  return {
    required: false,
    reason: 'General lifestyle and aesthetic curation topics can be safely written without current external evidence.',
    suggestedQueries: queries,
  };
}
