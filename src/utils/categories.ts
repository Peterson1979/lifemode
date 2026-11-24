export interface CategoryMeta {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  metaDescription: string;
  icon: string;
  badgeColor: string;
  lightBg: string;
  borderColor: string;
  popularTopics: string[];
}

export const CATEGORIES: Record<string, CategoryMeta> = {
  'food-kitchen': {
    id: 'food-kitchen',
    slug: 'food-kitchen',
    title: 'Food & Kitchen',
    shortTitle: 'Food & Kitchen',
    description: 'Practical culinary guidance, cookware care, kitchen cutlery maintenance, food preservation, and pantry safety.',
    metaDescription: 'Step-by-step guides and interactive decision tools for cookware maintenance, knife care, food preservation, and kitchen essentials.',
    icon: '🍳',
    badgeColor: '#ea580c', // Warm Paprika
    lightBg: '#fff7ed',
    borderColor: '#fed7aa',
    popularTopics: ['Cookware Care & Seasoning', 'Knife Maintenance', 'Food Storage & Safety', 'Culinary Techniques', 'Pantry Essentials'],
  },
  'home-garden': {
    id: 'home-garden',
    slug: 'home-garden',
    title: 'Home & Garden',
    shortTitle: 'Home & Garden',
    description: 'Practical guides for maintaining, organizing, cleaning, and improving your home, alongside indoor plant care, gardening, outdoor spaces, and seasonal upkeep.',
    metaDescription: 'Practical guides for home maintenance, cleaning and laundry, organization, smart home setups, indoor plant care, gardening, and seasonal outdoor upkeep.',
    icon: '🌿',
    badgeColor: '#16a34a', // Green
    lightBg: '#f0fdf4',
    borderColor: '#bbf7d0',
    popularTopics: ['Home Maintenance', 'Cleaning & Laundry', 'Home Organization', 'Indoor Houseplant Care', 'Seasonal Upkeep'],
  },
  'health-wellness': {
    id: 'health-wellness',
    slug: 'health-wellness',
    title: 'Health & Wellness',
    shortTitle: 'Health & Wellness',
    description: 'Practical, evidence-informed guidance for everyday movement, sleep, balanced eating, stress management, and sustainable self-care routines.',
    metaDescription: 'Practical wellness guides for everyday movement, sleep, balanced meals, hydration, stress management, and building healthier daily routines.',
    icon: '💚',
    badgeColor: '#0d9488', // Teal
    lightBg: '#f0fdfa',
    borderColor: '#99f6e4',
    popularTopics: ['Everyday Movement', 'Sleep & Recovery', 'Balanced Eating', 'Stress Management', 'Habit Building'],
  },
  'fitness-active-living': {
    id: 'fitness-active-living',
    slug: 'fitness-active-living',
    title: 'Fitness & Active Living',
    shortTitle: 'Fitness & Active Living',
    description: 'Practical, beginner-friendly fitness guidance for home workouts, strength training, mobility, and building an active routine that fits real life.',
    metaDescription: 'Beginner-friendly fitness guides for home workouts, bodyweight strength exercises, resistance bands, adjustable dumbbells, and sustainable weekly routines.',
    icon: '🏋️',
    badgeColor: '#dc2626', // Active Red
    lightBg: '#fef2f2',
    borderColor: '#fecaca',
    popularTopics: ['Home Workouts', 'Beginner Strength', 'Bodyweight Exercise', 'Mobility & Recovery', 'Active Routines'],
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[];

export function getCategory(slug: string): CategoryMeta | undefined {
  // Legacy category aliases now resolve to the consolidated Home & Garden category.
  if (slug === 'storage-organization') return CATEGORIES['home-garden'];
  if (slug === 'everyday-how-to') return CATEGORIES['home-garden'];
  return CATEGORIES[slug];
}
