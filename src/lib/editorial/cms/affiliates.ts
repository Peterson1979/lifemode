import {
  listOfferRecords,
  saveOffer,
  removeOffer,
  deriveSlugFromUrl,
  deriveMerchantFromUrl,
  type OfferRecord,
} from '../../commerce/offer-store.ts';
import {
  type CanonicalAffiliateOffer,
  type OfferType,
  type OfferStatus,
  type ProductImage,
  getPrimaryProductImage,
} from '../../commerce/types.ts';

export interface AffiliateOfferFilterOptions {
  query?: string;
  offerType?: string;
  status?: string;
  destination?: 'store' | 'picks' | 'guides' | 'all';
}

export interface QuickAddResult {
  offer: OfferRecord;
  isExisting: boolean;
}

/**
 * Lists affiliate offers from the central catalog (data/commerce/products.json)
 * with optional text search and facet filters.
 */
export async function listCmsAffiliateOffers(
  options: AffiliateOfferFilterOptions = {}
): Promise<OfferRecord[]> {
  let records = await listOfferRecords();

  const { query, offerType, status, destination } = options;

  if (offerType && offerType !== 'all') {
    records = records.filter((r) => (r.offerType || 'physical') === offerType);
  }

  if (status && status !== 'all') {
    records = records.filter((r) => {
      const currentStatus = r.status || (r.state === 'ACTIVE' ? 'ACTIVE' : (r.state === 'INACTIVE' ? 'ARCHIVED' : 'DRAFT'));
      return currentStatus === status;
    });
  }

  if (destination && destination !== 'all') {
    if (destination === 'store') {
      records = records.filter((r) => r.eligibleForStore === true);
    } else if (destination === 'picks') {
      records = records.filter((r) => r.eligibleForPicks === true);
    } else if (destination === 'guides') {
      records = records.filter((r) => r.eligibleForGuides === true);
    }
  }

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    records = records.filter((r) => {
      return (
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.brand && r.brand.toLowerCase().includes(q)) ||
        (r.merchant && r.merchant.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.asin && r.asin.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q))
      );
    });
  }

  return records;
}

/**
 * Retrieves a single affiliate offer by its canonical ID.
 */
export async function getCmsAffiliateOffer(id: string): Promise<OfferRecord | undefined> {
  const records = await listOfferRecords();
  return records.find((r) => r.id === id);
}

/**
 * Creates or retrieves an affiliate offer from only its destination URL.
 * Preserves the exact URL byte-for-byte, derives merchant and stable ID,
 * and sets status to DRAFT by default.
 */
export async function quickAddAffiliateOffer(
  rawUrl: string,
  extra: { offerType?: OfferType; title?: string } = {}
): Promise<QuickAddResult> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Affiliate destination URL is required.');
  }

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    throw new Error('Destination URL must start with http:// or https://');
  }

  // Check if this exact affiliate URL already exists in catalog
  const existingRecords = await listOfferRecords();
  const existing = existingRecords.find(
    (r) => r.affiliateUrl && r.affiliateUrl.trim().toLowerCase() === trimmedUrl.toLowerCase()
  );

  if (existing) {
    return { offer: existing, isExisting: true };
  }

  const merchant = deriveMerchantFromUrl(trimmedUrl);
  const derivedSlug = deriveSlugFromUrl(trimmedUrl);
  const offerType = extra.offerType || 'physical';
  const title = extra.title || `${merchant} Recommendation`;

  const newOffer = await saveOffer({
    id: derivedSlug,
    affiliateUrl: trimmedUrl, // Exactly preserved byte-for-byte
    title,
    name: title,
    merchant,
    brand: merchant,
    offerType,
    status: 'DRAFT',
    state: 'DRAFT',
    eligibleForStore: false,
    eligibleForPicks: true,
    eligibleForGuides: true,
    defaultCtaText: 'View recommendation',
  });

  return { offer: newOffer, isExisting: false };
}

/**
 * Saves or updates a full affiliate offer in the central catalog.
 */
export async function saveCmsAffiliateOffer(
  offer: Partial<OfferRecord>
): Promise<OfferRecord> {
  if (!offer.affiliateUrl) {
    throw new Error('Destination affiliate URL is required.');
  }
  return saveOffer(offer);
}

/**
 * Deletes an affiliate offer from the central catalog.
 */
export async function deleteCmsAffiliateOffer(id: string): Promise<void> {
  return removeOffer(id);
}

