import type { CuratedProduct } from './types';

/**
 * Editorial Registry for Daily Ideas Store.
 * Curated finds for kitchen, home, style and self-care.
 */
export const STOREFRONT_URL = 'https://link.amazon/B09VM5pTA';

export const CURATED_PRODUCTS: Record<string, CuratedProduct> = {
  'madamelique-turkish-towels': {
    id: 'madamelique-turkish-towels',
    name: 'Exclusive Turkish Hand Towels (Set of 2, 18" x 40")',
    brand: 'Madamelique',
    category: 'home',
    description: 'Decorative 100% pure cotton peshtemal hand towels with woven fringe detailing for bathroom, kitchen, and daily living.',
    editorialNote: 'Lightweight, ultra-absorbent, and fast-drying compared to standard bulky terrycloth towels.',
    affiliateUrl: 'https://link.amazon/B05sw4NKM',
    asin: 'B091ZHTF2F',
    priceRange: '$18–$24',
    badge: 'Pure Cotton Craft Pick',
  },
  'northern-galaxy-aurora-projector': {
    id: 'northern-galaxy-aurora-projector',
    name: 'Northern Galaxy Light Aurora Projector',
    brand: 'HODANS',
    category: 'home',
    description: 'Multifunctional LED nebula star and aurora projector with 33 lighting effects, 8 soothing white noise audio profiles, remote control, and built-in Bluetooth speaker.',
    editorialNote: 'Transforms bedrooms and workspaces into calming, ambient environments for sleep and deep relaxation.',
    affiliateUrl: 'https://link.amazon/B054ctYhZ',
    asin: 'B0B4518KC2',
    priceRange: '$29–$39',
    badge: 'Ambient Lighting Pick',
  },
  'lagraty-chunky-knit-blanket': {
    id: 'lagraty-chunky-knit-blanket',
    name: 'Handmade Chunky Knit Throw Blanket (50" x 60")',
    brand: "L'AGRATY",
    category: 'home',
    description: 'Soft, breathable chenille cable-knit throw blanket crafted for living room sofas, lounge chairs, and bedroom layering.',
    editorialNote: 'Heavyweight cozy texture that provides breathable warmth without shedding or irritating sensitive skin.',
    affiliateUrl: 'https://link.amazon/B09R3RCQW',
    asin: 'B0BR728TB6',
    priceRange: '$35–$49',
    badge: 'Comfort & Texture Pick',
  },
  'lifewit-clothes-storage-bins': {
    id: 'lifewit-clothes-storage-bins',
    name: '100L Large Clothes & Blanket Storage Bins (6 Pack)',
    brand: 'Lifewit',
    category: 'storage',
    description: 'Large-capacity 100-liter foldable fabric organizer bags with clear view front windows, reinforced webbing handles, and durable two-way zippers.',
    editorialNote: 'Essential for seasonal wardrobe transitions, under-bed comforter storage, and spatial decluttering.',
    affiliateUrl: 'https://link.amazon/B00Wor86A',
    asin: 'B0F8NGSQ2J',
    priceRange: '$25–$35',
    badge: 'Spatial Organization Pick',
  },
};

/**
 * Helper to fetch contextual picks by product IDs or category
 */
export function getCuratedPicks(idsOrCategory: string[] | string): CuratedProduct[] {
  if (Array.isArray(idsOrCategory)) {
    return idsOrCategory
      .map((id) => CURATED_PRODUCTS[id])
      .filter((p): p is CuratedProduct => Boolean(p));
  }

  return Object.values(CURATED_PRODUCTS).filter((p) => p.category === idsOrCategory);
}
