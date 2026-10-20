import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPublicOffers, listOfferRecords, removeOffer, saveOffer, slugifyOffer, validateOffer } from '../src/lib/commerce/offer-store.ts';
import { CURATED_PRODUCTS } from '../src/lib/commerce/curated-picks.ts';

const baseOffer = {
  id: 'sample-kitchen-offer',
  name: 'Sample Kitchen Organizer',
  description: 'A practical organizer for everyday kitchen storage.',
  editorialNote: 'Useful when a small kitchen needs simple, visible order.',
  affiliateUrl: 'https://www.example.com/recommendation',
  category: 'kitchen' as const,
  merchant: 'Example retailer',
  program: 'Editorial referral',
  topic: 'home',
  subtopic: 'Storage & Organization',
};

test('offer validation accepts generic HTTP(S) destinations and rejects unsafe or malformed URLs', () => {
  for (const affiliateUrl of ['https://short.example/x', 'https://store.example/item?ref=editorial', 'http://example.test/recommendation']) {
    assert.equal(validateOffer({ ...baseOffer, affiliateUrl }).isValid, true);
  }
  for (const affiliateUrl of ['not-a-url', 'javascript:alert(1)', 'ftp://example.com/item']) {
    const result = validateOffer({ ...baseOffer, affiliateUrl });
    assert.equal(result.isValid, false);
    assert.match(result.errors.join(' '), /absolute HTTP or HTTPS/);
  }
});

test('new generic offers generate an internal slug and preserve the exact destination URL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lifemode-offer-id-'));
  const storePath = join(directory, 'offers.json');
  const affiliateUrl = '  https://short.example/x?ref=custom  ';
  try {
    const saved = await saveOffer({ ...baseOffer, id: undefined, affiliateUrl }, storePath);
    assert.equal(saved.id, slugifyOffer(baseOffer.name));
    assert.equal(saved.asin, undefined);
    assert.equal(saved.affiliateUrl, affiliateUrl);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects malformed destinations without writing an offer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lifemode-offer-url-'));
  const storePath = join(directory, 'offers.json');
  const affiliateUrl = 'javascript:alert(1)';
  try {
    await assert.rejects(
      () => saveOffer({ ...baseOffer, id: undefined, affiliateUrl }, storePath),
      /absolute HTTP or HTTPS/
    );
    assert.equal((await listOfferRecords(storePath)).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('only valid active, non-expired offers are public and removable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lifemode-offers-'));
  const storePath = join(directory, 'offers.json');
  try {
    await saveOffer({ ...baseOffer, state: 'DRAFT' }, storePath);
    await saveOffer({ ...baseOffer, id: 'active-offer', state: 'ACTIVE', displayOrder: 1 }, storePath);
    await saveOffer({ ...baseOffer, id: 'expired-offer', state: 'ACTIVE', expiryDate: '2020-01-01' }, storePath);
    await saveOffer({ ...baseOffer, id: 'inactive-offer', state: 'INACTIVE' }, storePath);

    const publicOffers = await listPublicOffers(storePath);
    assert.ok(publicOffers.some((offer) => offer.id === 'active-offer'));
    assert.equal(publicOffers.some((offer) => offer.id === 'expired-offer'), false);
    assert.equal(publicOffers.some((offer) => offer.id === 'inactive-offer'), false);
    assert.equal(publicOffers.some((offer) => offer.id === 'sample-kitchen-offer'), false);
    assert.equal((await listOfferRecords(storePath)).length, 4);
    await removeOffer('active-offer', storePath);
    assert.equal((await listPublicOffers(storePath)).some((offer) => offer.id === 'active-offer'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('managed active offers coexist with the complete curated catalog without duplicate IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lifemode-offer-merge-'));
  const storePath = join(directory, 'offers.json');
  try {
    await saveOffer({ ...baseOffer, state: 'ACTIVE', id: 'managed-kitchen-offer' }, storePath);
    const publicOffers = await listPublicOffers(storePath);
    assert.equal(publicOffers.length, 21);
    assert.ok(publicOffers.some((offer) => offer.id === 'madamelique-turkish-towels'));
    assert.ok(publicOffers.some((offer) => offer.id === 'managed-kitchen-offer'));
    assert.equal(new Set(publicOffers.map((offer) => offer.id)).size, publicOffers.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('newest managed offer is first while curated and older managed order remains stable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lifemode-offer-order-'));
  const storePath = join(directory, 'offers.json');
  try {
    await saveOffer({ ...baseOffer, id: 'older-managed-offer', affiliateUrl: 'https://www.example.com/older', state: 'ACTIVE' }, storePath);
    await saveOffer({
      ...baseOffer,
      id: 'newest-managed-offer',
      name: 'Newest Managed Kitchen Organizer',
      affiliateUrl: 'https://www.example.com/newest',
      state: 'ACTIVE',
    }, storePath);
    const products = await listPublicOffers(storePath);
    assert.equal(products[0].id, 'newest-managed-offer');
    assert.equal(products[1].id, 'older-managed-offer');
    assert.equal(products.length, 22);
    assert.equal(new Set(products.map((product) => product.id)).size, products.length);
    assert.deepEqual(
      products.slice(2).map((product) => product.id),
      Object.values(CURATED_PRODUCTS).map((product) => product.id),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('stable offer identity prevents managed records from duplicating curated products', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lifemode-offer-identity-'));
  const storePath = join(directory, 'offers.json');
  const curated = CURATED_PRODUCTS['madamelique-turkish-towels'];
  try {
    await saveOffer({
      ...baseOffer,
      id: 'managed-towel-alias',
      name: curated.name,
      affiliateUrl: curated.affiliateUrl,
      asin: curated.asin,
      state: 'ACTIVE',
    }, storePath);
    const products = await listPublicOffers(storePath);
    assert.equal(products.filter((offer) => offer.affiliateUrl === curated.affiliateUrl).length, 1);
    assert.equal(products[0].id, 'managed-towel-alias');
    assert.equal(products.length, 20);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('partial state changes preserve stored image and affiliate metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lifemode-offer-state-'));
  const storePath = join(directory, 'offers.json');
  try {
    const saved = await saveOffer({ ...baseOffer, imageUrl: 'https://cdn.example/image.webp', state: 'ACTIVE' }, storePath);
    const changed = await saveOffer({ id: saved.id, state: 'INACTIVE' }, storePath);
    assert.equal(changed.imageUrl, saved.imageUrl);
    assert.equal(changed.affiliateUrl, saved.affiliateUrl);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
