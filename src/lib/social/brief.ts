import type { SocialOpportunity, SocialBrief } from './types.ts';

/**
 * Builds a structured social content brief from a selected social opportunity.
 */
export function buildSocialBrief(opportunity: SocialOpportunity): SocialBrief {
  const briefId = `sbrief-${Date.now()}-${opportunity.slug.slice(0, 20)}`;

  const audienceMap: Record<string, string> = {
    life: 'Intentional professionals, design enthusiasts, and mindful urbanites seeking calm living rituals.',
    travel: 'Slow travelers, architecture lovers, and curious explorers valuing seclusion and cultural authenticity.',
    'tech-ai': 'Forward-looking builders, knowledge workers, and privacy-conscious users adopting calm technology.',
    money: 'Financially intentional individuals seeking anti-fragile asset allocations and treasury strategies.',
    wellbeing: 'Health-conscious readers interested in longevity science, circadian protocols, and restorative rituals.',
    discover: 'Aesthetics-driven curators and collectors interested in monograph design, architecture, and craftsmanship.',
    now: 'High-signal thinkers navigating cultural shifts, modern work dynamics, and zeitgeist trends.',
  };

  const aestheticStyleMap: Record<string, string> = {
    life: 'Minimalist interior, natural oak, warm ambient lighting, tactile everyday objects, uncluttered workspace.',
    travel: 'Architectural landscape, serene misty coastlines, quiet sukiya tea houses, solitary natural vistas.',
    'tech-ai': 'Sleek hardware workstations, ambient computing, dark mode interfaces, subtle LED warmth, calm setups.',
    money: 'Understated elegance, structured monochrome layouts, architectural financial charts, clean typography.',
    wellbeing: 'Morning sunlight streaming through linen, cedar contrast sauna, botanical serenity, vital natural tones.',
    discover: 'Museum-grade monograph layouts, artisanal ceramic textures, brutalist timber structures, fine craftsmanship.',
    now: 'Editorial documentary photography, tactile analog notebooks, serene urban pause, contemporary cultural moments.',
  };

  const targetAudience = audienceMap[opportunity.pillar] || 'Curious global readers seeking smart, contemporary lifestyle perspectives.';
  const aestheticStyle = aestheticStyleMap[opportunity.pillar] || 'Clean contemporary editorial aesthetics, serene lighting, and high visual hierarchy.';

  // Build hashtags hint based on pillar and tags
  const baseTags = opportunity.tags.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const curatedHashtags = Array.from(
    new Set([
      'LifeMode',
      opportunity.pillar.replace('-', ''),
      ...baseTags.filter((t) => t.length > 2 && t.length < 20).slice(0, 4),
      'intentliving',
      'moderndesign',
    ])
  ).map((t) => `#${t}`);

  return {
    briefId,
    topicId: opportunity.topicId,
    pillar: opportunity.pillar,
    canonicalTopic: opportunity.canonicalTopic,
    destinationUrl: opportunity.destinationUrl,
    coreConcept: `Editorial exploration of ${opportunity.canonicalTopic}, emphasizing practical insight, intentionality, and contemporary lifestyle relevance.`,
    editorialHook: `Why ${opportunity.canonicalTopic} is reshaping how high-signal readers approach ${opportunity.pillar}.`,
    targetAudience,
    targetPlatforms: opportunity.targetPlatforms,
    evidence: opportunity.evidence,
    hashtagsHint: curatedHashtags,
    visualGuidelines: {
      recommendedFormat: '1080x1350',
      aestheticStyle,
      textOverlayRule: 'Maximum 6-10 words. Punchy, elegant headline. Zero paragraphs, zero internal metadata, zero provider diagnostics.',
    },
  };
}
