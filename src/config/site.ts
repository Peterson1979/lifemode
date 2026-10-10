export interface SubtopicConfig {
  name: string;
  slug?: string;
  icon: string;
  description: string;
  href?: string;
}

export interface PillarConfig {
  name: string;
  slug: PillarSlug;
  tagline: string;
  description: string;
  color: string;
  bgLight: string;
  icon?: string;
  subtopics?: SubtopicConfig[];
}

export const ACTIVE_EDITORIAL_PILLARS = [
  'health',
  'wealth',
  'home',
  'life',
  'tech-ai',
  'tools',
] as const;

export type ActivePillarSlug = (typeof ACTIVE_EDITORIAL_PILLARS)[number];

export const PILLAR_SLUGS = [
  'health',
  'wealth',
  'home',
  'life',
  'tech-ai',
  'tools',
  // Backward compatibility entries for existing routes, collections and legacy topic data
  'food-drink',
  'life-hacks',
  'style',
  'travel',
  'money',
  'wellbeing',
  'entertainment',
] as const;

export type PillarSlug = (typeof PILLAR_SLUGS)[number];

export const GUIDE_CATEGORY_SLUGS = [
  'food-kitchen',
  'cleaning-laundry',
  'home-maintenance',
  'storage-organization',
  'everyday-how-to',
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORY_SLUGS)[number];

export const PILLARS: Record<string, PillarConfig> = {
  // --- SIX TOP-LEVEL EDITORIAL PILLARS ---
  health: {
    name: 'Health',
    slug: 'health',
    icon: '🧬',
    tagline: 'Longevity, Metabolic Health & Vital Living',
    description: 'Trend-driven longevity science, metabolic health, sleep & recovery, wellness technology, and healthy aging protocols.',
    color: '#059669', // Vital Emerald
    bgLight: 'rgba(5, 150, 105, 0.08)',
    subtopics: [
      { name: 'Longevity & Aging', icon: '🧬', description: 'Biomarkers, cellular longevity, NAD+ protocols & healthy lifespan science', slug: 'longevity-aging' },
      { name: 'Metabolic Health', icon: '⚡', description: 'Glucose balance, insulin sensitivity & metabolic energy optimization', slug: 'metabolic-health' },
      { name: 'Weight & Fitness', icon: '🏃', description: 'Zone 2 cardiovascular conditioning, hypertrophy & metabolic strength', slug: 'weight-fitness' },
      { name: 'Sleep & Recovery', icon: '🌙', description: 'Circadian rhythm synchronization, sleep tracking & restoration protocols', slug: 'sleep-recovery' },
      { name: 'Wellness Tech', icon: '🔬', description: 'Continuous glucose monitors, sleep wearables & biohacking devices', slug: 'wellness-tech' },
    ],
  },
  wealth: {
    name: 'Wealth',
    slug: 'wealth',
    icon: '💼',
    tagline: 'Online Income, Side Hustles & Digital Work',
    description: 'Practical guides to online side hustles, digital products, freelancing, creator economy models, and remote business.',
    color: '#0284c7', // Sky / Cerulean
    bgLight: 'rgba(2, 132, 199, 0.08)',
    subtopics: [
      { name: 'Online Side Hustles', icon: '💼', description: 'High-margin online ventures, micro-agencies & digital cashflow models', slug: 'online-side-hustles' },
      { name: 'Digital Products', icon: '📦', description: 'Notion systems, spreadsheet workflows, instructional guides & zero-inventory assets', slug: 'digital-products' },
      { name: 'Freelancing & Remote', icon: '🌐', description: 'Productized consulting, niche remote skills, client discovery & retainers', slug: 'freelancing-remote' },
      { name: 'Creator Economy', icon: '🎙️', description: 'Newsletter operations, audience ownership & micro-sponsorship economics', slug: 'creator-economy' },
      { name: 'E-commerce & Online Selling', icon: '🛒', description: 'Niche physical merchandise, print-on-demand & multi-channel store ops', slug: 'ecommerce-selling' },
    ],
  },
  home: {
    name: 'Home',
    slug: 'home',
    icon: '🏡',
    tagline: 'Food, Kitchen Care & Household Systems',
    description: 'Practical living essentials: Food & Kitchen, Cleaning & Laundry, Home Maintenance, Storage, and Curated Products.',
    color: '#ea580c', // Terracotta Paprika
    bgLight: 'rgba(234, 88, 12, 0.08)',
    subtopics: [
      { name: 'Food & Kitchen', icon: '🍳', description: 'Cookware care, food storage science, pantry preservation & culinary craft', slug: 'food-kitchen', href: '/food-kitchen' },
      { name: 'Cleaning & Laundry', icon: '✨', description: 'Stain solver chemistry, fabric care protocols & appliance sanitization', slug: 'cleaning-laundry', href: '/cleaning-laundry' },
      { name: 'Home Maintenance', icon: '🏡', description: 'Seasonal upkeep checklists, HVAC schedules & preventive homeowner protection', slug: 'home-maintenance', href: '/home-maintenance' },
      { name: 'Storage & Organization', icon: '📦', description: 'Small-space systems, modular closet frameworks & spatial decluttering', slug: 'storage-organization', href: '/storage-organization' },
    ],
  },
  life: {
    name: 'Life',
    slug: 'life',
    icon: '✨',
    tagline: 'Style, Daily Routines & Living Well',
    description: 'Curated style & grooming, video-first life hacks, everyday productivity, and inspiring travel experiences.',
    color: '#e11d48', // Vibrant Crimson Rose
    bgLight: 'rgba(225, 29, 72, 0.08)',
    subtopics: [
      { name: 'Style & Beauty', icon: '👔', description: 'Capsule wardrobes, tailoring preservation, grooming tools & minimal silhouettes', slug: 'style-beauty' },
      { name: 'Productivity & Daily Life', icon: '⏱️', description: 'Habit stacking, morning focus architecture & low-distraction environments', slug: 'productivity-daily' },
      { name: 'Travel & Experiences', icon: '✈️', description: 'Local market cultures, regional culinary heritage & mindful field journeys', slug: 'travel-experiences' },
    ],
  },
  'tech-ai': {
    name: 'Tech & AI',
    slug: 'tech-ai',
    icon: '🤖',
    tagline: 'AI Tools, Workflows & Modern Innovation',
    description: 'Curated AI software, practical workflows, prompt systems, learning suites, and AI side hustle frameworks.',
    color: '#7c3aed', // Digital Violet
    bgLight: 'rgba(124, 58, 237, 0.08)',
    subtopics: [
      { name: 'AI Tools & Models', icon: '🤖', description: 'Curated AI applications, model comparisons, prompt systems & browser assistants', slug: 'ai-tools' },
      { name: 'Practical AI & Automation', icon: '⚡', description: 'Connecting LLMs, webhooks, local models & practical intelligence workflows', slug: 'ai-workflows' },
      { name: 'Everyday Software & Apps', icon: '💻', description: 'Practical productivity software, browser extensions & desktop utilities', slug: 'everyday-software' },
      { name: 'Modern Tech & Hardware', icon: '📱', description: 'Smart devices, workspace tech, peripherals & everyday electronics', slug: 'modern-tech-hardware' },
      { name: 'Digital Privacy & Security', icon: '🔒', description: 'Data ownership, password management, backup protocols & browser privacy', slug: 'privacy-security' },
    ],
  },
  tools: {
    name: 'Tools',
    slug: 'tools',
    icon: '🛠️',
    tagline: 'Interactive Calculators, Finders & Guides',
    description: 'Interactive decision tools, stain solvers, storage calculators, maintenance planners, and printable cheat sheets.',
    color: '#2563eb', // Modern Electric Blue
    bgLight: 'rgba(37, 99, 235, 0.08)',
    subtopics: [
      { name: 'Laundry Stain Solver', icon: '🧼', description: 'Targeted chemistry-backed stain diagnosis protocol and washing treatments', slug: 'laundry-stain-solver', href: '/tools/laundry-stain-solver/' },
      { name: 'Food Storage Calculator', icon: '🥗', description: 'Optimal refrigeration, freezing times and pantry shelf-life lookup', slug: 'food-storage-calculator', href: '/tools/food-storage-calculator/' },
      { name: 'Seasonal Home Planner', icon: '📋', description: 'Custom preventive upkeep schedules and seasonal homeowner inspection checklists', slug: 'seasonal-maintenance-planner', href: '/tools/seasonal-maintenance-planner/' },
      { name: 'Cookware Material Finder', icon: '🍳', description: 'Personalized cookware selector matching cooking styles with ideal pan alloys', slug: 'cookware-material-finder', href: '/tools/cookware-material-finder/' },
      { name: 'Protein Intake Calculator', icon: '🥩', description: 'Personalized daily protein distribution and real-food portion calculator', slug: 'protein-intake-calculator', href: '/tools/protein-intake-calculator/' },
      { name: 'Storage & Closet Planner', icon: '📦', description: 'Hanging capacity, modular tote calculator and small-space storage blueprint', slug: 'small-space-storage-planner', href: '/tools/small-space-storage-planner/' },
      { name: 'Zone 2 Heart Rate Finder', icon: '💓', description: 'Personalized aerobic heart rate training bands using Karvonen and Tanaka formulas', slug: 'zone-2-heart-rate-calculator', href: '/tools/zone-2-heart-rate-calculator/' },
      { name: 'Fabric Care & Washing Advisor', icon: '👕', description: 'Material-specific water temperatures, detergent chemistry, and washing protocols', slug: 'fabric-care-washing-advisor', href: '/tools/fabric-care-washing-advisor/' },
    ],
  },

  // --- PRESERVED & BACKWARD-COMPATIBLE PILLAR ALIASES ---
  'food-drink': {
    name: 'Food & Drink',
    slug: 'food-drink',
    tagline: 'Culinary Craft, Recipes & Living Well',
    description: 'Thoughtful recipes, seasonal cooking, food culture, drinks, kitchen essentials, and mindful culinary journeys.',
    color: '#ea580c', // Warm Terracotta Paprika
    bgLight: 'rgba(234, 88, 12, 0.08)',
  },
  'food-kitchen': {
    name: 'Kitchen & Food Care',
    slug: 'food-kitchen' as any,
    tagline: 'Safe Storage, Pantry & Cookware Care',
    description: 'Practical guidance for food safety, storage, pantry longevity, cookware care, and everyday kitchen problem-solving.',
    color: '#059669', // Emerald
    bgLight: 'rgba(5, 150, 105, 0.08)',
  },
  'life-hacks': {
    name: 'Life Hacks',
    slug: 'life-hacks',
    tagline: 'Quick Video Solutions & Smart Fixes',
    description: 'Practical video-first hacks, clever household shortcuts, and smart visual solutions for everyday life.',
    color: '#06b6d4', // Vibrant Cyan / Electric Teal
    bgLight: 'rgba(6, 182, 212, 0.08)',
  },
  'cleaning-laundry': {
    name: 'Cleaning & Laundry',
    slug: 'cleaning-laundry' as any,
    tagline: 'Stain Solver & Fabric Science',
    description: 'Evidence-based stain removal, fabric care, appliance cleaning routines, and non-toxic household cleaning methods.',
    color: '#2563eb', // Slate Blue
    bgLight: 'rgba(37, 99, 235, 0.08)',
  },
  'home-maintenance': {
    name: 'Home Maintenance',
    slug: 'home-maintenance' as any,
    tagline: 'Preventive Upkeep & Seasonal Protocols',
    description: 'Preventive upkeep schedules, seasonal checklists, and safe homeowner routines to protect your living space.',
    color: '#d97706', // Warm Amber
    bgLight: 'rgba(217, 119, 6, 0.08)',
  },
  'storage-organization': {
    name: 'Storage & Org',
    slug: 'storage-organization' as any,
    tagline: 'Small Space & Spatial Systems',
    description: 'Practical spatial organization, decluttering frameworks, and smart storage systems for small and large homes.',
    color: '#7c3aed', // Purple
    bgLight: 'rgba(124, 58, 237, 0.08)',
  },
  'everyday-how-to': {
    name: 'Everyday How-To',
    slug: 'everyday-how-to' as any,
    tagline: 'Practical Solutions & Decision Support',
    description: 'Clear answers to practical everyday dilemmas, household comparisons, daily routines, and common mistake prevention.',
    color: '#0891b2', // Cyan / Teal
    bgLight: 'rgba(8, 145, 178, 0.08)',
  },
  style: {
    name: 'Style & Beauty',
    slug: 'style',
    tagline: 'Personal Style, Beauty & Grooming',
    description: 'Personal style, skincare routines, beauty tools, fabric care, and aesthetics.',
    color: '#e11d48',
    bgLight: 'rgba(225, 29, 72, 0.08)',
  },
  travel: {
    name: 'Travel & Experiences',
    slug: 'travel',
    tagline: 'Destinations & Experiential Living',
    description: 'Travel weather, destination intelligence, itineraries, and journeys.',
    color: '#0284c7',
    bgLight: 'rgba(2, 132, 199, 0.08)',
  },
  money: {
    name: 'Wealth & Income',
    slug: 'money',
    tagline: 'Online Income & Practical Business',
    description: 'Side hustles, freelancing models, digital products, and personal finance.',
    color: '#0284c7',
    bgLight: 'rgba(2, 132, 199, 0.08)',
  },
  wellbeing: {
    name: 'Health & Vitality',
    slug: 'wellbeing',
    tagline: 'Longevity & Metabolic Health',
    description: 'Evidence-based health, longevity science, sleep, and wellness.',
    color: '#059669',
    bgLight: 'rgba(5, 150, 105, 0.08)',
  },
  entertainment: {
    name: 'Culture & Leisure',
    slug: 'entertainment',
    tagline: 'Culture, Arts & Media',
    description: 'Culture, media, archetypes, and thoughtful leisure.',
    color: '#c026d3',
    bgLight: 'rgba(192, 38, 211, 0.08)',
  },
};

export const SITE_CONFIG = {
  name: 'LifeMode',
  slogan: 'Practical guides, tools, and ideas for modern life',
  title: 'LifeMode — Practical Guides, Tools & Ideas for Everyday Life',
  description: 'A modern lifestyle publication delivering practical guides, decision tools, household routines, and tested advice across Health, Wealth, Home, Life, Tech & AI.',
  siteUrl:
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_SITE_URL) ||
    ((globalThis as any).process?.env?.PUBLIC_SITE_URL as string) ||
    'https://lifemode.life',
  gaMeasurementId:
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_GA_MEASUREMENT_ID) ||
    ((globalThis as any).process?.env?.PUBLIC_GA_MEASUREMENT_ID as string) ||
    'G-V06H9EB5QK',
  defaultOgImage: '/og-default.svg',
  locale: 'en_US',
  twitterHandle: '@LifeModeMag',
  author: 'LifeMode Editorial',
  navLinks: [
    { name: 'Health', href: '/health', slug: 'health' },
    { name: 'Wealth', href: '/wealth', slug: 'wealth' },
    { name: 'Home', href: '/home', slug: 'home' },
    { name: 'Life', href: '/life', slug: 'life' },
    { name: 'Tech & AI', href: '/tech-ai', slug: 'tech-ai' },
    { name: 'Tools', href: '/tools', slug: 'tools' },
    { name: 'Life Hacks', href: '/life-hacks', slug: 'life-hacks' },
    { name: 'Daily Ideas Store', href: '/daily-ideas', slug: 'daily-ideas' },
  ],
  footerLinks: [
    { name: 'About', href: '/about' },
    { name: 'Editorial Standards', href: '/editorial-standards' },
    { name: 'Interactive Tools', href: '/tools' },
    { name: 'Printable Checklists', href: '/checklists' },
    { name: 'Reference Guides', href: '/guides' },
    { name: 'Video Life Hacks', href: '/life-hacks' },
    { name: 'Daily Ideas Store', href: '/daily-ideas' },
    { name: 'Contact', href: '/contact' },
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Cookie Policy', href: '/cookies' },
    { name: 'Terms of Service', href: '/terms' },
  ],
};
