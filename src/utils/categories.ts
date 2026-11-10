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
  'home-maintenance': {
    id: 'home-maintenance',
    slug: 'home-maintenance',
    title: 'Home Maintenance',
    shortTitle: 'Home Maintenance',
    description: 'Preventative seasonal upkeep, plumbing troubleshooting, appliance care, and essential DIY repair fundamentals.',
    metaDescription: 'Practical seasonal home maintenance schedules, plumbing diagnostic guides, and preventative upkeep checklists.',
    icon: '🔧',
    badgeColor: '#d97706', // Amber
    lightBg: '#fffbeb',
    borderColor: '#fde68a',
    popularTopics: ['Seasonal Inspection', 'Drainage & Plumbing', 'Appliance Care', 'Weatherproofing', 'Preventative Upkeep'],
  },
  'cleaning-laundry': {
    id: 'cleaning-laundry',
    slug: 'cleaning-laundry',
    title: 'Cleaning & Laundry',
    shortTitle: 'Cleaning & Laundry',
    description: 'Evidence-based stain removal, fabric care, appliance cleaning routines, and non-toxic household sanitation methods.',
    metaDescription: 'Clear, step-by-step guides for stain removal chemistry, laundry care labels, appliance deep-cleaning, and sanitation.',
    icon: '✨',
    badgeColor: '#2563eb', // Slate Blue
    lightBg: '#eff6ff',
    borderColor: '#bfdbfe',
    popularTopics: ['Stain Removal Protocols', 'Washing Machine Maintenance', 'Fabric & Garment Care', 'Shower & Tile Descaling', 'Care Label Standards'],
  },
  'home-organization': {
    id: 'home-organization',
    slug: 'home-organization',
    title: 'Home Organization',
    shortTitle: 'Home Organization',
    description: 'Practical spatial organization frameworks, small kitchen storage systems, closet capacity planning, and decluttering methods.',
    metaDescription: 'Actionable spatial storage solutions, small space planning, closet capacity blueprints, and pantry organization.',
    icon: '📦',
    badgeColor: '#7c3aed', // Purple
    lightBg: '#f5f3ff',
    borderColor: '#ddd6fe',
    popularTopics: ['Small Kitchen Organization', 'Pantry Zonation & FIFO', 'Closet Storage Capacity', 'Decluttering Frameworks', 'Vertical Storage'],
  },
  'smart-home': {
    id: 'smart-home',
    slug: 'smart-home',
    title: 'Smart Home',
    shortTitle: 'Smart Home',
    description: 'Practical home automation, energy-efficiency monitoring, connected device standards, and privacy-first tech integrations.',
    metaDescription: 'Plain-language smart home guides, home automation protocols, energy monitoring, and privacy-conscious setup advice.',
    icon: '🏠',
    badgeColor: '#059669', // Emerald
    lightBg: '#ecfdf5',
    borderColor: '#a7f3d0',
    popularTopics: ['Matter & Thread Standards', 'Smart Thermostats & Energy', 'Home Automation Routines', 'Connected Appliance Setup', 'Privacy & Security'],
  },
  'home-garden': {
    id: 'home-garden',
    slug: 'home-garden',
    title: 'Home & Garden',
    shortTitle: 'Home & Garden',
    description: 'Indoor plant care, seasonal outdoor maintenance, container gardening, patio upkeep, and garden living solutions.',
    metaDescription: 'Practical gardening guides, indoor plant care protocols, patio maintenance, and seasonal outdoor upkeep advice.',
    icon: '🌿',
    badgeColor: '#16a34a', // Green
    lightBg: '#f0fdf4',
    borderColor: '#bbf7d0',
    popularTopics: ['Indoor Houseplant Care', 'Container Gardening', 'Patio & Deck Maintenance', 'Seasonal Lawn Care', 'Outdoor Living'],
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[];

export function getCategory(slug: string): CategoryMeta | undefined {
  if (slug === 'storage-organization') return CATEGORIES['home-organization'];
  if (slug === 'everyday-how-to') return CATEGORIES['home-maintenance'];
  return CATEGORIES[slug];
}
