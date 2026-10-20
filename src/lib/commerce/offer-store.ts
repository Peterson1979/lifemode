import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { CURATED_PRODUCTS } from './curated-picks.ts';
import { ID_SLUG_REGEX, isValidDestinationUrl, VALID_COMMERCE_CATEGORIES } from './validation.ts';
import type { CuratedProduct } from './types.ts';

export type OfferState = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface OfferRecord extends CuratedProduct {
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

export function getOfferStorePath(customPath?: string): string {
  return resolve(customPath || process.env.LIFEMODE_OFFERS_PATH || 'data/commerce/offers.json');
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
  if (!offer.name || offer.name.trim().length < 5) errors.push('Product title must be at least 5 characters.');
  if (!offer.description || offer.description.trim().length < 15) errors.push('Description must be at least 15 characters.');
  if (!offer.editorialNote || offer.editorialNote.trim().length < 15) errors.push('Editorial note must be at least 15 characters.');
  if (!isValidDestinationUrl(offer.affiliateUrl)) errors.push('Destination URL must be an absolute HTTP or HTTPS URL.');
  if (!offer.topic?.trim() || !offer.subtopic?.trim()) errors.push('An existing topic and subtopic are required.');
  if (!offer.category || !VALID_COMMERCE_CATEGORIES.includes(offer.category)) errors.push('A valid existing commerce category is required.');
  if (offer.state && !['DRAFT', 'ACTIVE', 'INACTIVE'].includes(offer.state)) errors.push('Offer state is invalid.');
  if (offer.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(offer.expiryDate)) errors.push('Expiry date must use YYYY-MM-DD.');
  if (offer.displayOrder !== undefined && (!Number.isInteger(offer.displayOrder) || offer.displayOrder < 0)) errors.push('Display order must be a non-negative integer.');
  return { isValid: errors.length === 0, errors };
}

function isPubliclyEligible(offer: OfferRecord, now = new Date()): boolean {
  if (offer.state !== 'ACTIVE' || !validateOffer(offer).isValid) return false;
  if (offer.expiryDate && `${offer.expiryDate}T23:59:59.999Z` < now.toISOString()) return false;
  return true;
}

function toProduct(offer: OfferRecord): CuratedProduct {
  return {
    id: offer.id,
    name: offer.name,
    brand: offer.brand,
    category: offer.category,
    description: offer.description,
    editorialNote: offer.editorialNote,
    affiliateUrl: offer.affiliateUrl,
    asin: offer.asin,
    priceRange: offer.priceRange,
    badge: offer.badge,
    imageUrl: offer.imageUrl,
  };
}

export async function listOfferRecords(customPath?: string): Promise<OfferRecord[]> {
  return readRecords(getOfferStorePath(customPath));
}

export async function listPublicOffers(customPath?: string): Promise<CuratedProduct[]> {
  const records = await listOfferRecords(customPath);
  if (records.length === 0) return Object.values(CURATED_PRODUCTS);
  return records
    .filter((offer) => isPubliclyEligible(offer))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map(toProduct);
}

export async function saveOffer(input: Partial<OfferRecord>, customPath?: string): Promise<OfferRecord> {
  const now = new Date().toISOString();
  const storePath = getOfferStorePath(customPath);
  const records = await readRecords(storePath);
  const requestedId = input.id?.trim();
  const baseId = requestedId || slugifyOffer(input.name || 'daily ideas offer');
  let generatedId = baseId;
  let suffix = 2;
  while (records.some((record) => record.id === generatedId && record.id !== requestedId)) generatedId = `${baseId}-${suffix++}`;
  const existing = records.find((record) => record.id === requestedId);
  const affiliateUrl = input.affiliateUrl ?? existing?.affiliateUrl;
  const record: OfferRecord = {
    ...(existing || {} as OfferRecord),
    ...input,
    id: existing?.id || generatedId,
    category: input.category || existing?.category || 'home',
    merchant: input.merchant || existing?.merchant || 'Direct recommendation',
    program: input.program || existing?.program || 'Editorial recommendation',
    topic: input.topic || existing?.topic || 'home',
    subtopic: input.subtopic || existing?.subtopic || 'Storage & Organization',
    currency: input.currency || existing?.currency || 'USD',
    ...(affiliateUrl !== undefined ? { affiliateUrl } : {}),
    asin: input.asin ?? (existing?.affiliateUrl === affiliateUrl ? existing?.asin : undefined),
    state: input.state || existing?.state || 'DRAFT',
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
