export interface PicksCategoryMeta {
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

export const PICKS_CATEGORIES: Record<string, PicksCategoryMeta> = {
  'home-living': {
    id: 'home-living',
    slug: 'home-living',
    title: 'Home & Living',
    shortTitle: 'Home & Living',
    description: 'Thoughtful home decor, ergonomic living essentials, bedding, lighting, and comfortable living spaces.',
    metaDescription: 'Curated home and living recommendations: furniture, ambient lighting, quality bedding, and elevated space essentials.',
    icon: '🛋️',
    badgeColor: '#4f46e5', // Indigo
    lightBg: '#eef2ff',
    borderColor: '#c7d2fe',
    popularTopics: ['Ergonomic Living', 'Lighting & Atmosphere', 'Bedding & Sleep', 'Storage & Furniture', 'Cozy Living'],
  },
  'kitchen-cooking': {
    id: 'kitchen-cooking',
    slug: 'kitchen-cooking',
    title: 'Kitchen & Cooking',
    shortTitle: 'Kitchen & Cooking',
    description: 'Chef-tested cookware, precision appliances, specialty coffee gear, and functional kitchen tools.',
    metaDescription: 'Expert-tested kitchen gear, specialty coffee setups, premium cookware, and culinary workhorses that last.',
    icon: '🍳',
    badgeColor: '#ea580c', // Warm Paprika / Orange
    lightBg: '#fff7ed',
    borderColor: '#fed7aa',
    popularTopics: ['Specialty Coffee', 'Cast Iron & Stainless Steel', 'Countertop Appliances', 'Chef Knives', 'Baking Essentials'],
  },
  'tech-smart-home': {
    id: 'tech-smart-home',
    slug: 'tech-smart-home',
    title: 'Tech & Smart Home',
    shortTitle: 'Tech & Smart Home',
    description: 'Practical consumer tech, smart home devices, home office upgrades, and reliable connectivity accessories.',
    metaDescription: 'Tested smart home hardware, audio gear, productive desk accessories, and modern technology essentials.',
    icon: '⚡',
    badgeColor: '#0284c7', // Sky Blue
    lightBg: '#f0f9ff',
    borderColor: '#bae6fd',
    popularTopics: ['Smart Automation', 'Desk Setups', 'Audio & Headphones', 'Power & Chargers', 'Home Networking'],
  },
  'beauty-personal-care': {
    id: 'beauty-personal-care',
    slug: 'beauty-personal-care',
    title: 'Beauty & Personal Care',
    shortTitle: 'Beauty & Personal Care',
    description: 'Evidence-backed skincare, grooming tools, wellness self-care rituals, and daily hygiene essentials.',
    metaDescription: 'Dermatologist-recommended skincare essentials, personal grooming tools, and proven daily self-care staples.',
    icon: '✨',
    badgeColor: '#db2777', // Pink
    lightBg: '#fdf2f8',
    borderColor: '#fbcfe8',
    popularTopics: ['Skincare Regimens', 'Electric Grooming', 'Oral Care', 'Bath & Body', 'Hair Care'],
  },
  'fashion-accessories': {
    id: 'fashion-accessories',
    slug: 'fashion-accessories',
    title: 'Fashion & Accessories',
    shortTitle: 'Fashion & Accessories',
    description: 'Timeless wardrobe staples, durable leather goods, weather-resistant outerwear, and travel bags.',
    metaDescription: 'Durable wardrobe essentials, premium everyday carry, leather accessories, and practical footwear.',
    icon: '👜',
    badgeColor: '#9333ea', // Purple
    lightBg: '#faf5ff',
    borderColor: '#e9d5ff',
    popularTopics: ['Everyday Carry', 'Minimalist Wallets', 'All-Weather Outerwear', 'Footwear', 'Bags & Packs'],
  },
  'health-fitness': {
    id: 'health-fitness',
    slug: 'health-fitness',
    title: 'Health & Fitness',
    shortTitle: 'Health & Fitness',
    description: 'Recovery gear, home gym equipment, biomechanics accessories, sleep optimization, and hydration tools.',
    metaDescription: 'Tested workout gear, muscle recovery equipment, sleep tracking, and functional health essentials.',
    icon: '🏃',
    badgeColor: '#16a34a', // Emerald/Green
    lightBg: '#f0fdf4',
    borderColor: '#bbf7d0',
    popularTopics: ['Home Workout Gear', 'Muscle Recovery', 'Hydration & Bottles', 'Sleep Optimization', 'Fitness Tracking'],
  },
  'pets': {
    id: 'pets',
    slug: 'pets',
    title: 'Pets',
    shortTitle: 'Pets',
    description: 'Ergonomic pet accessories, grooming tools, durable toys, feeding systems, and pet travel essentials.',
    metaDescription: 'Vetted pet gear: durable dog toys, automated feeding systems, grooming tools, and comfortable pet travel.',
    icon: '🐾',
    badgeColor: '#d97706', // Amber
    lightBg: '#fffbeb',
    borderColor: '#fde68a',
    popularTopics: ['Automated Feeders', 'Durable Toys', 'Pet Beds & Crates', 'Grooming Supplies', 'Travel & Harnesses'],
  },
  'travel-experiences': {
    id: 'travel-experiences',
    slug: 'travel-experiences',
    title: 'Travel & Experiences',
    shortTitle: 'Travel & Experiences',
    description: 'Ultralight luggage, packing cubes, universal adapters, noise-canceling gear, and journey essentials.',
    metaDescription: 'Tested travel gear: carry-on luggage, compression packing cubes, power adapters, and travel accessories.',
    icon: '✈️',
    badgeColor: '#0891b2', // Cyan
    lightBg: '#ecfeff',
    borderColor: '#a5f3fc',
    popularTopics: ['Carry-On Luggage', 'Packing Systems', 'Travel Tech', 'Toiletry Kits', 'Comfort on the Go'],
  },
  'digital-tools-software': {
    id: 'digital-tools-software',
    slug: 'digital-tools-software',
    title: 'Digital Tools & Software',
    shortTitle: 'Digital Tools',
    description: 'Productivity software, backup solutions, creative suites, AI utilities, and digital workspace workflows.',
    metaDescription: 'Curated software recommendations, productivity tools, cloud backup solutions, and digital utilities.',
    icon: '💻',
    badgeColor: '#2563eb', // Blue
    lightBg: '#eff6ff',
    borderColor: '#bfdbfe',
    popularTopics: ['Productivity Apps', 'Cloud Backup', 'Note Taking Systems', 'Security & Password Managers', 'AI Tools'],
  },
  'learning-education': {
    id: 'learning-education',
    slug: 'learning-education',
    title: 'Learning & Education',
    shortTitle: 'Learning & Education',
    description: 'Books, structured courses, reading devices, stationery, notebooks, and lifelong learning tools.',
    metaDescription: 'Essential books, digital readers, quality notebooks, and instruments designed to foster continuous learning.',
    icon: '📚',
    badgeColor: '#b45309', // Warm Yellow-Brown
    lightBg: '#fefce8',
    borderColor: '#fef08a',
    popularTopics: ['E-Readers', 'Foundational Books', 'Desk Planners', 'Stationery & Pens', 'Skill-Building Courses'],
  },
  'gifts-occasions': {
    id: 'gifts-occasions',
    slug: 'gifts-occasions',
    title: 'Gifts & Special Occasions',
    shortTitle: 'Gifts & Occasions',
    description: 'Holiday gift guides, housewarming presents, milestone celebration picks, and curated gift boxes.',
    metaDescription: 'Thoughtful gift recommendations for holidays, housewarmings, birthdays, and meaningful celebrations.',
    icon: '🎁',
    badgeColor: '#e11d48', // Rose
    lightBg: '#fff1f2',
    borderColor: '#fecdd3',
    popularTopics: ['Holiday Gift Guides', 'Housewarming Ideas', 'Host & Hostess Gifts', 'Tech Gifts', 'Luxury Under $50'],
  },
  'outdoor-garden': {
    id: 'outdoor-garden',
    slug: 'outdoor-garden',
    title: 'Outdoor & Garden',
    shortTitle: 'Outdoor & Garden',
    description: 'Garden hand tools, patio heating and lighting, weather monitoring, camping gear, and balcony gardening.',
    metaDescription: 'Durable gardening tools, outdoor living lighting, patio heaters, and weather-ready gear.',
    icon: '🌿',
    badgeColor: '#059669', // Emerald Green
    lightBg: '#ecfdf5',
    borderColor: '#a7f3d0',
    popularTopics: ['Garden Hand Tools', 'Patio Comfort & Lighting', 'Weather Stations', 'Balcony Gardening', 'Outdoor Cooking'],
  },
};

export const PICKS_CATEGORY_KEYS = Object.keys(PICKS_CATEGORIES) as (keyof typeof PICKS_CATEGORIES)[];

export function getPicksCategory(slugOrId: string): PicksCategoryMeta | undefined {
  if (!slugOrId) return undefined;
  const normalized = slugOrId.trim().toLowerCase();
  if (PICKS_CATEGORIES[normalized]) {
    return PICKS_CATEGORIES[normalized];
  }
  // Search by title or shortTitle match
  for (const meta of Object.values(PICKS_CATEGORIES)) {
    if (meta.slug === normalized || meta.id === normalized) return meta;
    if (meta.title.toLowerCase() === normalized || meta.shortTitle.toLowerCase() === normalized) return meta;
  }
  return undefined;
}

export function isValidPicksCategory(slugOrId: string): boolean {
  return !!getPicksCategory(slugOrId);
}

export function getAllPicksCategories(): PicksCategoryMeta[] {
  return Object.values(PICKS_CATEGORIES);
}

export function normalizePicksCategories(categories: string[] | undefined | null): string[] {
  if (!Array.isArray(categories)) return [];
  const validSlugs: string[] = [];
  for (const cat of categories) {
    const meta = getPicksCategory(cat);
    if (meta && !validSlugs.includes(meta.slug)) {
      validSlugs.push(meta.slug);
    }
  }
  return validSlugs;
}

