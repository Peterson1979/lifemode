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
  'beauty-personal-care': {
    id: 'beauty-personal-care',
    slug: 'beauty-personal-care',
    title: 'Beauty & Personal Care',
    shortTitle: 'Beauty & Personal Care',
    description: 'Practical guides for skincare routines, beauty tools, personal care devices, and grooming essentials.',
    metaDescription: 'Practical guides for skincare routines, beauty tools, personal care devices, and grooming essentials.',
    icon: '🧴',
    badgeColor: '#d946ef', // Beauty Pink
    lightBg: '#f5f3ff',
    borderColor: '#e9d8f5',
    popularTopics: ['Skincare Routines', 'Beauty Tools', 'Grooming', 'Personal Care'],
  },
  'everyday-essentials': {
    id: 'everyday-essentials',
    slug: 'everyday-essentials',
    title: 'Everyday Essentials',
    shortTitle: 'Everyday Essentials',
    description: 'Practical household essentials, Amazon product guides, and everyday tools for a well-organized home.',
    metaDescription: 'Practical guides covering everyday household essentials and Amazon product recommendations for a well-organized home.',
    icon: '🏠',
    badgeColor: '#6b46c1', // Deep Purple
    lightBg: '#f5f3ff',
    borderColor: '#e9d8f5',
    popularTopics: ['Household Organization', 'Amazon Product Guides', 'Everyday Tools', 'Home Organization Essentials', 'Affiliate Selections'],
  },
  'travel': {
    id: 'travel',
    slug: 'travel',
    title: 'Travel',
    shortTitle: 'Travel',
    description: 'Guides for trip planning, hotel selection, vacation rentals and local experiences.',
    metaDescription: 'Practical travel guides covering how to plan better trips, choose hotels, and compare vacation rentals.',
    icon: '✈️',
    badgeColor: '#0284c7',
    lightBg: '#eff6ff',
    borderColor: '#bfdbfe',
    popularTopics: ['Trip Planning', 'Hotel Guides', 'Vacation Rentals', 'Local Experiences', 'Travel Tips'],
  },
};


export function getCategory(slug: string): CategoryMeta | undefined {
  // Legacy category aliases now resolve to the consolidated Home & Garden category.
  if (slug === 'storage-organization') return CATEGORIES['home-garden'];
  if (slug === 'everyday-how-to') return CATEGORIES['home-garden'];
  return CATEGORIES[slug];
}


export const CATEGORY_KEYS = Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[];

export const EVERYDAY_ESSENTIALS_KEY = 'everyday-essentials';
