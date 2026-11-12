import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { CURATED_PRODUCTS } from './curated-picks.ts';
import { ID_SLUG_REGEX, isValidDestinationUrl } from './validation.ts';
import {
  type CuratedProduct,
  type CanonicalAffiliateOffer,
  type OfferType,
  type OfferStatus,
  type ProductImage,
  getPrimaryProductImage,
} from './types.ts';

export type OfferState = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface OfferRecord extends CanonicalAffiliateOffer {
  merchant: string;
  program: string;
  topic: string;
  subtopic: string;
  currency?: string;
  expiryDate?: string;
  displayOrder?: number;
  state: OfferState;
  createdAt: string;
  updatedAt: string;
}

export interface OfferValidationResult {
  isValid: boolean;
  errors: string[];
}

export function slugifyOffer(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return slug || 'daily-ideas-offer';
}

export function deriveSlugFromUrl(urlStr?: string): string {
  if (!urlStr) return 'affiliate-offer';
  try {
    const parsed = new URL(urlStr.trim());
    const hostPart = parsed.hostname.replace(/^www\./, '').split('.')[0];
    const pathPart = parsed.pathname.split('/').filter(Boolean).pop() || '';
    const slug = slugifyOffer(`${hostPart}-${pathPart}`);
    return slug.length >= 3 ? slug : 'affiliate-offer';
  } catch {
    return 'affiliate-offer';
  }
}

export function deriveMerchantFromUrl(urlStr?: string): string {
  if (!urlStr) return 'Direct recommendation';
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Direct recommendation';
  }
}

export function getOfferStorePath(customPath?: string): string {
  if (customPath) return resolve(customPath);
  if (process.env.LIFEMODE_OFFERS_PATH) return resolve(process.env.LIFEMODE_OFFERS_PATH);
  return resolve('data/commerce/products.json');
}

async function readRecords(storePath: string): Promise<OfferRecord[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(storePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`Offer store could not be read: ${error?.message || String(error)}`);
  }
}

async function writeRecords(storePath: string, records: OfferRecord[]): Promise<void> {
  await fs.mkdir(dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(records, null, 2) + '\n', 'utf8');
}

export function validateOffer(offer: Partial<OfferRecord>): OfferValidationResult {
  const errors: string[] = [];
  if (!offer.id || !ID_SLUG_REGEX.test(offer.id.trim())) errors.push('Offer ID must be a kebab-case slug.');
  if (offer.name !== undefined && offer.name !== null && offer.name.trim().length > 0 && offer.name.trim().length < 3) {
    errors.push('Product title must be at least 3 characters.');
  }
  if (!isValidDestinationUrl(offer.affiliateUrl)) errors.push('Destination URL must be an absolute HTTP or HTTPS URL.');
  if (offer.state && !['DRAFT', 'ACTIVE', 'INACTIVE'].includes(offer.state) && !['DRAFT', 'ACTIVE', 'ARCHIVED'].includes((offer as any).status || offer.state)) {
    errors.push('Offer state is invalid.');
  }
  if (offer.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(offer.expiryDate)) errors.push('Expiry date must use YYYY-MM-DD.');
  if (offer.displayOrder !== undefined && (!Number.isInteger(offer.displayOrder) || offer.displayOrder < 0)) errors.push('Display order must be a non-negative integer.');
  return { isValid: errors.length === 0, errors };
}

function isPubliclyEligible(offer: OfferRecord, now = new Date()): boolean {
  const isActive = offer.state === 'ACTIVE' || (offer as any).status === 'ACTIVE';
  if (!isActive) return false;
  if ((offer as any).eligibleForStore === false) return false;
  if (!validateOffer(offer).isValid) return false;
  if (offer.expiryDate && `${offer.expiryDate}T23:59:59.999Z` < now.toISOString()) return false;
  return true;
}

function toProduct(offer: OfferRecord): CuratedProduct {
  const primary = getPrimaryProductImage(offer);
  return {
    id: offer.id,
    name: offer.name || (offer as any).title || 'Affiliate Recommendation',
    brand: offer.brand,
    category: (offer.category as any) || 'home',
    description: offer.description || '',
    editorialNote: offer.editorialNote || '',
    affiliateUrl: offer.affiliateUrl,
    asin: offer.asin,
    priceRange: offer.priceRange,
    badge: offer.badge,
    imageUrl: primary?.url || offer.imageUrl,
    imageAlt: primary?.alt || offer.imageAlt,
    images: offer.images,
  };
}

function identityKeys(offer: CuratedProduct): string[] {
  const keys = [`id:${offer.id}`];
  if (offer.asin) keys.push(`asin:${offer.asin.trim().toUpperCase()}`);
  if (offer.affiliateUrl) {
    keys.push(`url:${offer.affiliateUrl.trim().toLowerCase()}`);
  }
  return keys;
}

export async function listOfferRecords(customPath?: string): Promise<OfferRecord[]> {
  return readRecords(getOfferStorePath(customPath));
}

export async function listPublicOffers(customPath?: string): Promise<CuratedProduct[]> {
  const records = await listOfferRecords(customPath);
  const managed = records
    .filter((offer) => isPubliclyEligible(offer))
    // `createdAt` is persisted when an offer is first created and is not changed by edits.
    // Keep input order when timestamps cannot be compared; never infer recency from names or URLs.
    .sort((a, b) => {
      const aCreated = Date.parse(a.createdAt);
      const bCreated = Date.parse(b.createdAt);
      return Number.isFinite(aCreated) && Number.isFinite(bCreated) ? bCreated - aCreated : 0;
    })
    .map(toProduct);

  const seenKeys = new Set<string>();
  const uniqueManaged = managed.filter((offer) => {
    const keys = identityKeys(offer);
    if (keys.some((key) => seenKeys.has(key))) return false;
    keys.forEach((key) => seenKeys.add(key));
    return true;
  });
  const curated = Object.values(CURATED_PRODUCTS).filter((offer) => {
    const keys = identityKeys(offer);
    if (keys.some((key) => seenKeys.has(key))) return false;
    keys.forEach((key) => seenKeys.add(key));
    return true;
  });
  return [...uniqueManaged, ...curated];
}

/**
 * Lists public offers eligible for LifeMode Picks (/picks).
 * Independent of Daily Ideas Store (/daily-ideas).
 * Strictly filters by active status, eligibleForPicks === true, and valid non-expired offer state.
 */
export async function listPublicPicksOffers(customPath?: string): Promise<OfferRecord[]> {
  const records = await listOfferRecords(customPath);
  const now = new Date();

  const eligible = records.filter((offer) => {
    const isActive = offer.state === 'ACTIVE' || (offer as any).status === 'ACTIVE';
    if (!isActive) return false;
    if (offer.eligibleForPicks !== true) return false;
    if (!validateOffer(offer).isValid) return false;
    if (offer.expiryDate && `${offer.expiryDate}T23:59:59.999Z` < now.toISOString()) return false;
    return true;
  });

  // Sort by displayOrder if defined, then newest createdAt desc
  eligible.sort((a, b) => {
    if (typeof a.displayOrder === 'number' && typeof b.displayOrder === 'number') {
      return a.displayOrder - b.displayOrder;
    }
    const aCreated = Date.parse(a.createdAt);
    const bCreated = Date.parse(b.createdAt);
    return Number.isFinite(aCreated) && Number.isFinite(bCreated) ? bCreated - aCreated : 0;
  });

  // Deduplicate by identity keys (id, asin, url)
  const seenKeys = new Set<string>();
  const uniquePicks = eligible.filter((offer) => {
    const keys = [`id:${offer.id}`];
    if (offer.asin) keys.push(`asin:${offer.asin.trim().toUpperCase()}`);
    if (offer.affiliateUrl) keys.push(`url:${offer.affiliateUrl.trim().toLowerCase()}`);
    if (keys.some((key) => seenKeys.has(key))) return false;
    keys.forEach((key) => seenKeys.add(key));
    return true;
  });

  return uniquePicks;
}

export async function saveOffer(input: Partial<OfferRecord>, customPath?: string): Promise<OfferRecord> {
  const now = new Date().toISOString();
  const storePath = getOfferStorePath(customPath);
  const records = await readRecords(storePath);
  const requestedId = input.id?.trim();
  const baseId = requestedId || slugifyOffer(input.name || (input as any).title || deriveSlugFromUrl(input.affiliateUrl));
  let generatedId = baseId;
  let suffix = 2;
  while (records.some((record) => record.id === generatedId && record.id !== requestedId)) generatedId = `${baseId}-${suffix++}`;
  const existing = records.find((record) => record.id === requestedId);
  const affiliateUrl = input.affiliateUrl ?? existing?.affiliateUrl;

  const rawState = input.state || (input as any).status || existing?.state || (existing as any)?.status || 'DRAFT';
  const state: OfferState = rawState === 'ACTIVE' ? 'ACTIVE' : (rawState === 'INACTIVE' || rawState === 'ARCHIVED' ? 'INACTIVE' : 'DRAFT');
  const status: OfferStatus = state === 'ACTIVE' ? 'ACTIVE' : (state === 'INACTIVE' ? 'ARCHIVED' : 'DRAFT');
  const offerType: OfferType = (input as any).offerType || (existing as any)?.offerType || 'physical';

  const defaultEligibleForStore = offerType === 'physical' && state === 'ACTIVE';
  const eligibleForStore = typeof (input as any).eligibleForStore === 'boolean'
    ? (input as any).eligibleForStore
    : (typeof (existing as any)?.eligibleForStore === 'boolean' ? (existing as any).eligibleForStore : defaultEligibleForStore);

  const eligibleForPicks = typeof (input as any).eligibleForPicks === 'boolean'
    ? (input as any).eligibleForPicks
    : (typeof (existing as any)?.eligibleForPicks === 'boolean' ? (existing as any).eligibleForPicks : (state === 'ACTIVE'));

  const eligibleForGuides = typeof (input as any).eligibleForGuides === 'boolean'
    ? (input as any).eligibleForGuides
    : (typeof (existing as any)?.eligibleForGuides === 'boolean' ? (existing as any).eligibleForGuides : true);

  const fallbackTitle = (affiliateUrl && deriveMerchantFromUrl(affiliateUrl) + ' Recommendation') || 'Affiliate Recommendation';
  const name = input.name || (input as any).title || existing?.name || (existing as any)?.title || fallbackTitle;
  const title = (input as any).title || input.name || (existing as any)?.title || existing?.name || name;

  // Multi-image synchronization
  let images: ProductImage[] | undefined = Array.isArray(input.images)
    ? input.images
    : (existing as any)?.images;

  let imageUrl = input.imageUrl !== undefined ? input.imageUrl : existing?.imageUrl;
  let imageAlt = input.imageAlt !== undefined ? input.imageAlt : existing?.imageAlt;

  if (images && images.length > 0) {
    const primary = getPrimaryProductImage({ images, imageUrl, imageAlt, name });
    if (primary) {
      imageUrl = primary.url;
      imageAlt = primary.alt;
    }
  } else if (imageUrl) {
    images = [{ url: imageUrl, alt: imageAlt || name, isPrimary: true, displayOrder: 0 }];
  } else if (Array.isArray(input.images) && input.images.length === 0) {
    images = [];
    imageUrl = undefined;
    imageAlt = undefined;
  }

  const record: OfferRecord = {
    ...(existing || {} as OfferRecord),
    ...input,
    id: existing?.id || generatedId,
    title,
    name,
    category: input.category || existing?.category || 'home',
    merchant: input.merchant || existing?.merchant || deriveMerchantFromUrl(affiliateUrl),
    program: input.program || existing?.program || 'Editorial recommendation',
    topic: input.topic || existing?.topic || 'home',
    subtopic: input.subtopic || existing?.subtopic || 'Storage & Organization',
    currency: input.currency || existing?.currency || 'USD',
    description: input.description ?? existing?.description ?? '',
    editorialNote: input.editorialNote ?? existing?.editorialNote ?? '',
    offerType,
    status,
    state,
    eligibleForStore,
    eligibleForPicks,
    eligibleForGuides,
    imageUrl,
    imageAlt,
    images,
    defaultCtaText: (input as any).defaultCtaText || (existing as any)?.defaultCtaText || 'View recommendation',
    ...(affiliateUrl !== undefined ? { affiliateUrl } : {}),
    asin: input.asin ?? (existing?.affiliateUrl === affiliateUrl ? existing?.asin : undefined),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  } as OfferRecord;

  const validation = validateOffer(record);
  if (!validation.isValid) throw new Error(validation.errors.join(' '));
  const next = existing ? records.map((entry) => entry.id === record.id ? record : entry) : [...records, record];
  await writeRecords(storePath, next);
  return record;
}

export async function removeOffer(id: string, customPath?: string): Promise<void> {
  const storePath = getOfferStorePath(customPath);
  const records = await readRecords(storePath);
  await writeRecords(storePath, records.filter((record) => record.id !== id));
}

export function hashOfferAsset(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
