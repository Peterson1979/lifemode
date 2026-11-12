import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
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
  if (!offer.affiliateUrl && offer.id) {
    const existing = (await listOfferRecords()).find((r) => r.id === offer.id);
    if (existing?.affiliateUrl) {
      offer.affiliateUrl = existing.affiliateUrl;
    }
  }
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

export interface DiscoveredGuideOffer {
  sourceGuide: string;
  guideSlug: string;
  sourceGuideTitle?: string;
  title: string;
  affiliateUrl: string;
  asin?: string;
  description?: string;
  badge?: string;
  imageUrl?: string;
  imageAlt?: string;
  defaultCtaText?: string;
  alreadyInCatalog: boolean;
  catalogId?: string;
}

export interface ImportGuideOfferInput {
  title: string;
  affiliateUrl: string;
  asin?: string;
  description?: string;
  badge?: string;
  imageUrl?: string;
  imageAlt?: string;
  defaultCtaText?: string;
  brand?: string;
  merchant?: string;
  offerType?: OfferType;
  status?: OfferStatus;
  eligibleForGuides?: boolean;
  eligibleForStore?: boolean;
  eligibleForPicks?: boolean;
}

const GUIDES_DIR = resolve(process.cwd(), 'src', 'content', 'guides');

/**
 * Scans all published guide markdown files for embedded affiliate recommendations.
 * Cross-references with data/commerce/products.json to identify which are already cataloged
 * and which are uncataloged.
 */
export async function scanGuideAffiliateProducts(): Promise<{
  discovered: DiscoveredGuideOffer[];
  uncatalogedCount: number;
}> {
  let fileNames: string[] = [];
  try {
    fileNames = (await fs.readdir(GUIDES_DIR)).filter((f) => f.endsWith('.md'));
  } catch {
    return { discovered: [], uncatalogedCount: 0 };
  }

  const catalogRecords = await listOfferRecords();
  const discovered: DiscoveredGuideOffer[] = [];

  for (const fileName of fileNames) {
    const filePath = join(GUIDES_DIR, fileName);
    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const guideSlug = fileName.replace(/\.md$/, '');
    const titleMatch = content.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
    const guideTitle = titleMatch ? titleMatch[1].trim() : guideSlug;

    // 1. Scan for <div class="product-callout"> blocks
    const calloutRegex = /<div class="product-callout">([\s\S]*?)(?:<p class="product-disclosure"|<\/div>\s*\n\s*(?:##|$))/gi;
    let match: RegExpExecArray | null;
    while ((match = calloutRegex.exec(content)) !== null) {
      const block = match[1];

      const pTitleMatch = block.match(/<h4 class="product-title">([\s\S]*?)<\/h4>/i);
      const title = pTitleMatch ? pTitleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      const asinMatch = block.match(/ASIN:\s*([A-Z0-9]{10})/i);
      const asin = asinMatch ? asinMatch[1].trim() : undefined;

      const descMatch = block.match(/<p class="product-description">([\s\S]*?)<\/p>/i);
      const description = descMatch
        ? descMatch[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&deg;/g, '°')
            .replace(/&times;/g, '×')
            .replace(/&amp;/g, '&')
            .trim()
        : '';

      const badgeMatch = block.match(/<span class="product-badge">([\s\S]*?)<\/span>/i);
      const badge = badgeMatch ? badgeMatch[1].replace(/<[^>]+>/g, '').trim() : 'Editorial Recommendation';

      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
      const altMatch = block.match(/<img[^>]+alt="([^"]+)"/i);
      const imageUrl = imgMatch ? imgMatch[1].trim() : undefined;
      const imageAlt = altMatch ? altMatch[1].trim() : title;

      const urlMatch =
        block.match(/<a[^>]+class="product-affiliate-link"[^>]*href="([^"]+)"/i) ||
        block.match(/<a[^>]+href="([^"]+)"[^>]*class="product-affiliate-link"/i) ||
        block.match(/<a[^>]+href="(https?:\/\/[^"]+)"/i);
      const affiliateUrl = urlMatch ? urlMatch[1].trim() : '';

      const ctaMatch = block.match(/<a[^>]+class="product-affiliate-link"[^>]*>([\s\S]*?)<\/a>/i);
      let defaultCtaText = 'View recommendation';
      if (ctaMatch) {
        const rawCta = ctaMatch[1].replace(/<[^>]+>/g, '').replace(/&rarr;/g, '').replace(/→/g, '').trim();
        if (rawCta) defaultCtaText = rawCta;
      }

      if (affiliateUrl) {
        // Cross-reference with central catalog
        const matchRecord = catalogRecords.find((r) => {
          const uMatch = r.affiliateUrl && r.affiliateUrl.trim().toLowerCase() === affiliateUrl.toLowerCase();
          const aMatch = asin && r.asin && r.asin.trim().toUpperCase() === asin.toUpperCase();
          return Boolean(uMatch || aMatch);
        });

        discovered.push({
          sourceGuide: guideSlug,
          guideSlug,
          sourceGuideTitle: guideTitle,
          title: title || 'Affiliate Recommendation',
          affiliateUrl,
          asin,
          description,
          badge,
          imageUrl,
          imageAlt,
          defaultCtaText,
          alreadyInCatalog: Boolean(matchRecord),
          catalogId: matchRecord?.id,
        });
      }
    }
  }

  const uncatalogedCount = discovered.filter((d) => !d.alreadyInCatalog).length;
  const catalogedCount = discovered.length - uncatalogedCount;
  return {
    discovered,
    uncatalogedCount,
    catalogedCount,
    totalFound: discovered.length,
  };
}

/**
 * Safely imports a discovered guide recommendation into the central catalog.
 * Strict rules:
 * - Does not require Amazon ASIN.
 * - Preserves exact affiliate URL byte-for-byte.
 * - Respects operator choices for eligibility: default eligibleForGuides=true, eligibleForStore=false, eligibleForPicks=false.
 * - Never automatically enables all three flags.
 * - Does not automatically add to Daily Ideas Store.
 */
export async function importGuideAffiliateOffer(
  input: ImportGuideOfferInput
): Promise<OfferRecord> {
  if (!input.affiliateUrl) {
    throw new Error('Destination affiliate URL is required for catalog import.');
  }

  const trimmedUrl = input.affiliateUrl.trim();
  const catalogRecords = await listOfferRecords();

  // Avoid duplicate catalog records by checking exact URL or ASIN
  const existing = catalogRecords.find((r) => {
    const uMatch = r.affiliateUrl && r.affiliateUrl.trim().toLowerCase() === trimmedUrl.toLowerCase();
    const aMatch = input.asin && r.asin && r.asin.trim().toUpperCase() === input.asin.trim().toUpperCase();
    return Boolean(uMatch || aMatch);
  });

  if (existing) {
    return saveOffer({
      id: existing.id,
      eligibleForGuides: typeof input.eligibleForGuides === 'boolean' ? input.eligibleForGuides : existing.eligibleForGuides,
      eligibleForStore: typeof input.eligibleForStore === 'boolean' ? input.eligibleForStore : existing.eligibleForStore,
      eligibleForPicks: typeof input.eligibleForPicks === 'boolean' ? input.eligibleForPicks : existing.eligibleForPicks,
    });
  }

  const merchant = input.merchant || deriveMerchantFromUrl(trimmedUrl);
  const baseTitle = input.title?.trim() || `${merchant} Recommendation`;
  const derivedSlug = deriveSlugFromUrl(trimmedUrl) || baseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const eligibleForGuides = typeof input.eligibleForGuides === 'boolean' ? input.eligibleForGuides : true;
  const eligibleForStore = typeof input.eligibleForStore === 'boolean' ? input.eligibleForStore : false;
  const eligibleForPicks = typeof input.eligibleForPicks === 'boolean' ? input.eligibleForPicks : false;

  const validImages: ProductImage[] = [];
  if (input.imageUrl && input.imageUrl.trim()) {
    validImages.push({
      url: input.imageUrl.trim(),
      alt: input.imageAlt?.trim() || baseTitle,
      isPrimary: true,
      displayOrder: 0,
    });
  }

  return saveOffer({
    id: derivedSlug,
    affiliateUrl: trimmedUrl, // Exactly preserved byte-for-byte
    title: baseTitle,
    name: baseTitle,
    brand: input.brand || merchant,
    merchant,
    asin: input.asin ? input.asin.trim() : undefined,
    description: input.description || '',
    badge: input.badge || 'Editorial Recommendation',
    defaultCtaText: input.defaultCtaText || 'View recommendation',
    offerType: input.offerType || 'physical',
    status: input.status || 'ACTIVE',
    state: (input.status || 'ACTIVE') === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
    eligibleForGuides,
    eligibleForStore,
    eligibleForPicks,
    imageUrl: validImages[0]?.url,
    imageAlt: validImages[0]?.alt,
    images: validImages.length ? validImages : undefined,
  });
}

