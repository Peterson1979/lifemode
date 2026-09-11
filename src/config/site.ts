export interface PillarConfig {
  name: string;
  slug: PillarSlug;
  tagline: string;
  description: string;
  color: string;
  bgLight: string;
}

export type PillarSlug = 'life' | 'travel' | 'tech-ai' | 'money' | 'wellbeing' | 'discover' | 'now';

export const PILLARS: Record<PillarSlug, PillarConfig> = {
  life: {
    name: 'Life',
    slug: 'life',
    tagline: 'Living, Habits & Daily Rituals',
    description: 'Intentional living, home aesthetics, productivity systems, and modern daily rituals.',
    color: '#fb7185', // Rose
    bgLight: 'rgba(251, 113, 133, 0.1)',
  },
  travel: {
    name: 'Travel',
    slug: 'travel',
    tagline: 'Destinations & Global Journeys',
    description: 'Curated itineraries, boutique stays, slow travel, and smart destination intelligence.',
    color: '#38bdf8', // Sky
    bgLight: 'rgba(56, 189, 248, 0.1)',
  },
  'tech-ai': {
    name: 'Tech & AI',
    slug: 'tech-ai',
    tagline: 'Intelligent Tools & Innovation',
    description: 'Emerging artificial intelligence, productivity ecosystems, and modern digital lifestyles.',
    color: '#a78bfa', // Violet
    bgLight: 'rgba(167, 139, 250, 0.1)',
  },
  money: {
    name: 'Money',
    slug: 'money',
    tagline: 'Wealth, Strategy & Freedom',
    description: 'Personal finance frameworks, strategic investing, and digital economy navigation.',
    color: '#34d399', // Emerald
    bgLight: 'rgba(52, 211, 153, 0.1)',
  },
  wellbeing: {
    name: 'Wellbeing',
    slug: 'wellbeing',
    tagline: 'Health, Vitality & Mindset',
    description: 'Evidence-based longevity, mental resilience, fitness protocols, and holistic health.',
    color: '#fbbf24', // Amber
    bgLight: 'rgba(251, 191, 36, 0.1)',
  },
  discover: {
    name: 'Discover',
    slug: 'discover',
    tagline: 'Culture, Books & Design',
    description: 'Architectural gems, curated literature, art exhibitions, and timeless curiosities.',
    color: '#fb923c', // Warm Ochre
    bgLight: 'rgba(251, 146, 60, 0.1)',
  },
  now: {
    name: 'Now',
    slug: 'now',
    tagline: 'Trends, Signals & Zeitgeist',
    description: 'Real-time pulses, seasonal guides, cultural signals, and timely editorial dispatches.',
    color: '#f43f5e', // Crimson
    bgLight: 'rgba(244, 63, 94, 0.1)',
  },
};

export const PILLAR_SLUGS = Object.keys(PILLARS) as PillarSlug[];

export const SITE_CONFIG = {
  name: 'LifeMode',
  title: 'LifeMode — Smart Living, Curated Culture & Timely Editorial',
  description: 'A global digital publication exploring modern living, travel, artificial intelligence, wealth, wellbeing, and culture.',
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
    { name: 'Tech & AI', href: '/tech-ai', slug: 'tech-ai' },
    { name: 'Money', href: '/money', slug: 'money' },
    { name: 'Wellbeing', href: '/wellbeing', slug: 'wellbeing' },
    { name: 'Discover', href: '/discover', slug: 'discover' },
    { name: 'Now', href: '/now', slug: 'now' },
  ],
  footerLinks: [
    { name: 'About', href: '/about' },
    { name: 'Contact', href: '/contact' },
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
  ],
};
