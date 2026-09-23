export interface PillarConfig {
  name: string;
  slug: PillarSlug;
  tagline: string;
  description: string;
  color: string;
  bgLight: string;
}

export type PillarSlug = 'life' | 'travel' | 'food-drink' | 'tech-ai' | 'money' | 'wellbeing' | 'culture';

export const PILLARS: Record<PillarSlug, PillarConfig> = {
  life: {
    name: 'Life',
    slug: 'life',
    tagline: 'Living, Habits & Daily Rituals',
    description: 'Intentional living, home aesthetics, productivity systems, and modern daily rituals.',
    color: '#e11d48', // Vibrant Crimson Rose
    bgLight: 'rgba(225, 29, 72, 0.08)',
  },
  travel: {
    name: 'Travel',
    slug: 'travel',
    tagline: 'Destinations & Global Journeys',
    description: 'Curated itineraries, boutique stays, slow travel, and smart destination intelligence.',
    color: '#0284c7', // Electric Cerulean
    bgLight: 'rgba(2, 132, 199, 0.08)',
  },
  'food-drink': {
    name: 'Food & Drink',
    slug: 'food-drink',
    tagline: 'Culinary Craft, Recipes & Living Well',
    description: 'Thoughtful recipes, seasonal cooking, food culture, drinks, kitchen essentials, and mindful culinary journeys.',
    color: '#ea580c', // Warm Terracotta Paprika
    bgLight: 'rgba(234, 88, 12, 0.08)',
  },
  'tech-ai': {
    name: 'Tech & AI',
    slug: 'tech-ai',
    tagline: 'Intelligent Tools & Innovation',
    description: 'Emerging artificial intelligence, practical software tools, and modern digital lifestyles.',
    color: '#7c3aed', // Digital Violet
    bgLight: 'rgba(124, 58, 237, 0.08)',
  },
  money: {
    name: 'Money',
    slug: 'money',
    tagline: 'Wealth, Strategy & Freedom',
    description: 'Personal finance frameworks, strategic investing, and digital economy navigation.',
    color: '#059669', // Emerald Slate
    bgLight: 'rgba(5, 150, 105, 0.08)',
  },
  wellbeing: {
    name: 'Wellbeing',
    slug: 'wellbeing',
    tagline: 'Health, Vitality & Mindset',
    description: 'Evidence-based longevity, mental resilience, fitness protocols, and holistic health.',
    color: '#d97706', // Vital Amber
    bgLight: 'rgba(217, 119, 6, 0.08)',
  },
  culture: {
    name: 'Culture',
    slug: 'culture',
    tagline: 'Culture, Books & Design',
    description: 'Architectural gems, curated literature, art exhibitions, and timeless curiosities.',
    color: '#c026d3', // Rich Fuchsia
    bgLight: 'rgba(192, 38, 211, 0.08)',
  },
};

export const PILLAR_SLUGS = Object.keys(PILLARS) as PillarSlug[];

export const SITE_CONFIG = {
  name: 'LifeMode',
  slogan: 'Ideas for living well now',
  title: 'LifeMode — Ideas for living well now',
  description: 'Ideas, guides, and discoveries across technology, travel, personal finance, wellbeing, and everyday life.',
  siteUrl:
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_SITE_URL) ||
    ((globalThis as any).process?.env?.PUBLIC_SITE_URL as string) ||
    'https://lifemode.life',
  defaultOgImage: '/og-default.svg',
  locale: 'en_US',
  twitterHandle: '@LifeModeMag',
  author: 'LifeMode Editorial',
  navLinks: [
    { name: 'Life', href: '/life', slug: 'life' },
    { name: 'Travel', href: '/travel', slug: 'travel' },
    { name: 'Food & Drink', href: '/food-drink', slug: 'food-drink' },
    { name: 'Tech & AI', href: '/tech-ai', slug: 'tech-ai' },
    { name: 'Money', href: '/money', slug: 'money' },
    { name: 'Wellbeing', href: '/wellbeing', slug: 'wellbeing' },
    { name: 'Culture', href: '/culture', slug: 'culture' },
  ],
  footerLinks: [
    { name: 'About', href: '/about' },
    { name: 'Editorial Standards', href: '/editorial-standards' },
    { name: 'Contact', href: '/contact' },
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
  ],
};
