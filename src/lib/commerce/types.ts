export type OfferType =
  | 'physical'
  | 'digital'
  | 'course'
  | 'travel'
  | 'software'
  | 'service'
  | 'other';

export type OfferStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ProductImage {
  url: string;
  alt?: string;
  isPrimary?: boolean;
  displayOrder?: number;
}

export interface CanonicalAffiliateOffer {
  // --- Mandatory Identity & Tracking ---
  id: string;
  affiliateUrl: string;

  // --- Core Metadata (All Optional for URL-only creation) ---
  title?: string;
  name?: string;
  brand?: string;
  merchant?: string;
  program?: string;
  asin?: string;
  offerType?: OfferType;
  category?: string;
  topic?: string;
  subtopic?: string;
  description?: string;
  editorialNote?: string;
  priceRange?: string;
  badge?: string;
  defaultCtaText?: string;
  imageUrl?: string;
  imageAlt?: string;
  images?: ProductImage[];
  tags?: string[];
  currency?: string;

  // --- Independent Channel Eligibility Flags ---
  eligibleForStore: boolean;
  eligibleForPicks: boolean;
  eligibleForGuides: boolean;

  // --- Storefront & Ordering ---
  displayOrder?: number;
  expiryDate?: string;

  // --- Status & Lifecycle ---
  status: OfferStatus;
  state?: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface CuratedProduct {
  id: string;
  name: string;
  brand?: string;
  category: 'kitchen' | 'home' | 'cleaning' | 'storage' | 'style' | 'self-care' | 'tech';
  description: string;
  editorialNote: string;
  affiliateUrl: string;
  asin?: string;
  priceRange?: string;
  badge?: string;
  imageUrl?: string;
  imageAlt?: string;
  images?: ProductImage[];
}

export interface DailyIdeasPicksData {
  heading?: string;
  kicker?: string;
  subheading?: string;
  items: CuratedProduct[];
}

/**
 * Consistently resolves the primary image and descriptive alt text for a product or offer.
 * Prioritizes images marked with isPrimary, followed by displayOrder, then falls back to imageUrl.
 */
export function getPrimaryProductImage(offer?: {
  imageUrl?: string;
  imageAlt?: string;
  images?: ProductImage[];
  name?: string;
  title?: string;
}): { url: string; alt: string } | undefined {
  if (!offer) return undefined;

  if (Array.isArray(offer.images) && offer.images.length > 0) {
    const validImages = offer.images.filter((img) => img && typeof img.url === 'string' && img.url.trim().length > 0);
    if (validImages.length > 0) {
      const sorted = [...validImages].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        const orderA = a.displayOrder ?? 0;
        const orderB = b.displayOrder ?? 0;
        return orderA - orderB;
      });
      const first = sorted[0];
      if (first && first.url) {
        return {
          url: first.url.trim(),
          alt: first.alt?.trim() || offer.imageAlt?.trim() || offer.name?.trim() || offer.title?.trim() || 'Product recommendation image',
        };
      }
    }
  }

  if (typeof offer.imageUrl === 'string' && offer.imageUrl.trim().length > 0) {
    return {
      url: offer.imageUrl.trim(),
      alt: offer.imageAlt?.trim() || offer.name?.trim() || offer.title?.trim() || 'Product recommendation image',
    };
  }

  return undefined;
}

export function getOfferCtaLabel(offer: Partial<CanonicalAffiliateOffer>): string {
  if (offer.defaultCtaText && offer.defaultCtaText.trim()) {
    return offer.defaultCtaText.trim();
  }
  switch (offer.offerType) {
    case 'course':
      return 'Explore course';
    case 'software':
      return 'Try software';
    case 'digital':
      return 'View resource';
    case 'travel':
      return 'View travel deal';
    case 'service':
      return 'Explore service';
    case 'physical':
    default:
      return 'View recommendation';
  }
}

