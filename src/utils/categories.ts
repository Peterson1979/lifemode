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
  'cleaning-laundry': {
    id: 'cleaning-laundry',
    slug: 'cleaning-laundry',
    title: 'Cleaning & Laundry',
    shortTitle: 'Cleaning & Laundry',
    description: 'Evidence-based stain removal, fabric care, appliance cleaning routines, and non-toxic household cleaning methods.',
    metaDescription: 'Clear, step-by-step guides for stain removal, laundry care, appliance deep-cleaning, and household odor elimination.',
    icon: '✨',
    badgeColor: '#2563eb', // Slate Blue
    lightBg: '#eff6ff',
    borderColor: '#bfdbfe',
    popularTopics: ['Stain Removal Protocols', 'Washing Machine Maintenance', 'Fabric & Garment Care', 'Odor Elimination', 'Surface Care']
  },
  'storage-organization': {
    id: 'storage-organization',
    slug: 'storage-organization',
    title: 'Storage & Organization',
    shortTitle: 'Storage & Organization',
    description: 'Practical spatial organization, decluttering frameworks, and smart storage systems for small and large homes.',
    metaDescription: 'Actionable storage solutions, decluttering strategies, and organization guides for pantries, closets, and living areas.',
    icon: '📦',
    badgeColor: '#7c3aed', // Purple
    lightBg: '#f5f3ff',
    borderColor: '#ddd6fe',
    popularTopics: ['Small Pantry Systems', 'Seasonal Closet Storage', 'Container Selection', 'Garage & Utility Storage', 'Small Space Maxima']
  },
  'everyday-how-to': {
    id: 'everyday-how-to',
    slug: 'everyday-how-to',
    title: 'Everyday How-To',
    shortTitle: 'Everyday How-To',
    description: 'Clear answers to practical everyday dilemmas, household comparisons, daily routines, and common mistake prevention.',
    metaDescription: 'Everyday reference guidance for practical dilemmas, decision comparisons, and common household routines.',
    icon: '💡',
    badgeColor: '#0891b2', // Cyan / Teal
    lightBg: '#ecfeff',
    borderColor: '#a5f3fc',
    popularTopics: ['Everyday Comparisons', 'Household Routines', 'Mistake Prevention', 'Decision Matrices', 'Quick Fixes']
  }
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[];

export function getCategory(slug: string): CategoryMeta | undefined {
  return CATEGORIES[slug];
}
