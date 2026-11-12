import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPrimaryProductImage, type ProductImage } from '../src/lib/commerce/types.ts';
import { saveOffer, listPublicOffers, listOfferRecords } from '../src/lib/commerce/offer-store.ts';

test('getPrimaryProductImage correctly handles multi-image, ordering, and fallbacks', () => {
  // 1. Explicit isPrimary
  const multiImages: ProductImage[] = [
    { url: 'https://example.com/gallery-2.jpg', displayOrder: 1 },
    { url: 'https://example.com/gallery-hero.jpg', isPrimary: true, displayOrder: 2 },
    { url: 'https://example.com/gallery-1.jpg', displayOrder: 0 },
  ];
  const primaryA = getPrimaryProductImage({ images: multiImages, name: 'Sample Item' });
  assert.equal(primaryA?.url, 'https://example.com/gallery-hero.jpg');

  // 2. Ordered by displayOrder when no isPrimary
  const orderedImages: ProductImage[] = [
    { url: 'https://example.com/step-3.jpg', displayOrder: 3 },
    { url: 'https://example.com/step-1.jpg', displayOrder: 1 },
    { url: 'https://example.com/step-2.jpg', displayOrder: 2 },
  ];
  const primaryB = getPrimaryProductImage({ images: orderedImages, name: 'Ordered Item' });
  assert.equal(primaryB?.url, 'https://example.com/step-1.jpg');

  // 3. Fallback to legacy single imageUrl
  const legacyProduct = {
    imageUrl: 'https://example.com/legacy-thumb.jpg',
    imageAlt: 'Legacy Alt Description',
    name: 'Legacy Product',
  };
  const primaryC = getPrimaryProductImage(legacyProduct);
  assert.equal(primaryC?.url, 'https://example.com/legacy-thumb.jpg');
  assert.equal(primaryC?.alt, 'Legacy Alt Description');

  // 4. Undefined when no image exists
  assert.equal(getPrimaryProductImage({ name: 'No Image Product' }), undefined);
  assert.equal(getPrimaryProductImage(undefined), undefined);
});

test('saveOffer seamlessly synchronizes multi-image and legacy single imageUrl fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lifemode-phase2-'));
  const testStorePath = join(dir, 'products.json');

  try {
    // A. Saving with images array auto-populates primary imageUrl
    const multiOffer = await saveOffer(
      {
        id: 'multi-image-test-item',
        name: 'Multi Image Product',
        affiliateUrl: 'https://example.com/offer',
        images: [
          { url: 'https://example.com/detail.jpg', displayOrder: 2 },
          { url: 'https://example.com/hero.jpg', isPrimary: true, displayOrder: 1 },
        ],
      },
      testStorePath
    );

    assert.equal(multiOffer.imageUrl, 'https://example.com/hero.jpg');
    assert.equal(multiOffer.images?.length, 2);

    // B. Saving with single imageUrl auto-populates images array
    const singleOffer = await saveOffer(
      {
        id: 'single-image-test-item',
        name: 'Single Image Product',
        affiliateUrl: 'https://example.com/offer-2',
        imageUrl: 'https://example.com/single.jpg',
        imageAlt: 'Single Alt',
      },
      testStorePath
    );

    assert.equal(singleOffer.imageUrl, 'https://example.com/single.jpg');
    assert.equal(singleOffer.images?.length, 1);
    assert.equal(singleOffer.images?.[0].isPrimary, true);

    // C. Verify reading via listOfferRecords preserves both representations
    const records = await listOfferRecords(testStorePath);
    assert.equal(records.length, 2);
    const readMulti = records.find((r) => r.id === 'multi-image-test-item');
    assert.equal(readMulti?.imageUrl, 'https://example.com/hero.jpg');
    assert.equal(readMulti?.images?.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Daily Ideas Store and central catalog preserve existing single-image records', async () => {
  const publicOffers = await listPublicOffers();
  assert.ok(publicOffers.length > 0);

  // Check an offer that had an R2 image
  const r2Offer = publicOffers.find((p) => p.id === 'jelly-gel-mask-with-salmon-dna-pdrn-pink-collagen');
  assert.ok(r2Offer);
  assert.match(r2Offer.imageUrl || '', /r2\.dev/);

  const resolved = getPrimaryProductImage(r2Offer);
  assert.equal(resolved?.url, r2Offer.imageUrl);
});

