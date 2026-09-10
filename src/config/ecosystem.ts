import type { PillarSlug } from './site';

export interface EcosystemProject {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  relevantPillars: PillarSlug[];
  categories: string[];
  ctaText: string;
}

export const ECOSYSTEM_PROJECTS: EcosystemProject[] = [
  {
    id: 'dreamly-ai',
    name: 'Dreamly AI',
    tagline: 'Dream Reflection & Sleep Mindfulness',
    description:
      'AI-guided dream journaling, nocturnal pattern analysis, and mindful morning reflections designed for intentional wellbeing.',
    url: 'https://dreamly.ai',
    relevantPillars: ['wellbeing', 'life'],
    categories: ['Wellbeing', 'Sleep', 'Mindfulness', 'Reflection'],
    ctaText: 'Explore Dreamly AI',
  },
  {
    id: 'ai-zodiac',
    name: 'AI Zodiac',
    tagline: 'Archetypal Patterns & Personality Insights',
    description:
      'Nuanced personality mapping, relational dynamics, and cosmic archetypes explored through intelligent conversational frameworks.',
    url: 'https://aizodiac.com',
    relevantPillars: ['discover', 'wellbeing'],
    categories: ['Culture', 'Relationships', 'Archetypes', 'Self-Discovery'],
    ctaText: 'Discover AI Zodiac',
  },
  {
    id: 'get-ai-set',
    name: 'GetAISet',
    tagline: 'Curated AI Toolkits & Workflow Suites',
    description:
      'A structured intelligence hub offering vetted productivity tools, automation blueprints, and generative AI frameworks.',
    url: 'https://getaiset.com',
    relevantPillars: ['tech-ai', 'money'],
    categories: ['Productivity', 'AI Tools', 'Workflows', 'Modern Tech'],
    ctaText: 'Visit GetAISet',
  },
  {
    id: 'match-signal',
    name: 'MatchSignal',
    tagline: 'Sports Analytics & Strategic Data Insights',
    description:
      'Quantitative match signals, predictive momentum analytics, and data-driven sports intelligence for tactical enthusiasts.',
    url: 'https://matchsignal.com',
    relevantPillars: ['now', 'discover', 'tech-ai'],
    categories: ['Sports Data', 'Analytics', 'Signals', 'Entertainment'],
    ctaText: 'Explore MatchSignal',
  },
];
