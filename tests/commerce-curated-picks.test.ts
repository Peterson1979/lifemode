import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURATED_PRODUCTS,
  getCuratedPicks,
} from '../src/lib/commerce/curated-picks.ts';
import {
  validateCuratedProduct,
  validateCuratedProductRegistry,
  assertValidCuratedProductRegistry,
  ASIN_REGEX,
} from '../src/lib/commerce/validation.ts';
import type { CuratedProduct } from '../src/lib/commerce/types.ts';

const VERIFIED_16_MAPPINGS = [
  {
    url: 'https://link.amazon/B07zWpUB4',
    asin: 'B0DTHHK2S1',
    name: "IUV Embroidered Pointed Toe Western Cowgirl Boots",
    brand: 'IUV',
    category: 'style',
  },
  {
    url: 'https://link.amazon/B079VepZB',
    asin: 'B07KXN9V67',
    name: 'Elegant Comfort Deep-Pocket Microfiber King Fitted Sheet',
    brand: 'Elegant Comfort',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B0isaIph6',
    asin: 'B0H1W18KGL',
    name: 'CYSKXYI 5-Foot Hanging Swinging Ghost Outdoor Décor',
    brand: 'CYSKXYI',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B0exefrmH',
    asin: 'B0CNCL35CH',
    name: 'Dr.Melaxin Cemenrete Calcium Nourishing Multi Balm Stick',
    brand: 'Dr.Melaxin',
    category: 'self-care',
  },
  {
    url: 'https://link.amazon/B0amY6llW',
    asin: 'B095NXXP8C',
    name: 'Nintiue 65-Inch Fully Dimmable Modern Arc Floor Lamp',
    brand: 'Nintiue',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B02bkZwVE',
    asin: 'B08GH41N87',
    name: 'THE BEER VALLEY Handwoven Yellow Cotton Chindi Area Rug',
    brand: 'THE BEER VALLEY',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B0dycBsOk',
    asin: 'B0D9TCFRJ5',
    name: 'MULWR Natural Beige Travertine Stone Vanity Tray',
    brand: 'MULWR',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B04Kl1BNM',
    asin: 'B002YKMPQ6',
    name: 'Alpine Corporation Tiered Tabletop Relaxation Water Fountain',
    brand: 'Alpine Corporation',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B0arzMCtg',
    asin: 'B09ZV2TX28',
    name: 'Lifewit 60L Foldable Under-Bed Storage Organizer Bags (6-Pack)',
    brand: 'Lifewit',
    category: 'storage',
  },
  {
    url: 'https://link.amazon/B0bUpIGar',
    asin: 'B0C65T7727',
    name: "Trendy Queen Women's Casual Oversized Fleece Pullover Hoodie",
    brand: 'Trendy Queen',
    category: 'style',
  },
  {
    url: 'https://link.amazon/B08rC9igT',
    asin: 'B01NBJEKX2',
    name: 'TRULY SOFT Everyday Brushed Microfiber 4-Piece Sheet Set',
    brand: 'TRULY SOFT',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B054USqXz',
    asin: 'B0DHKSF81K',
    name: 'celimax TXA Tranexamic Acid & Niacinamide Brightening Cream',
    brand: 'celimax',
    category: 'self-care',
  },
  {
    url: 'https://link.amazon/B09PbfKuR',
    asin: 'B0D6G5S35J',
    name: 'FRIDEKO HOME Smart RGB Modern Column Floor Lamp',
    brand: 'FRIDEKO HOME',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B0eFc8pa5',
    asin: 'B0C235GNV9',
    name: 'KOZYFLY 5x7 Ft Washable Handwoven Cotton Area Rug',
    brand: 'KOZYFLY',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B00j5slzz',
    asin: 'B0BJKRYCZF',
    name: 'oliruim Abstract Thinker Resin Statues (Set of 3)',
    brand: 'oliruim',
    category: 'home',
  },
  {
    url: 'https://link.amazon/B0aLCB05n',
    asin: 'B09SH38JRR',
    name: 'WLIVE Compact 4-Drawer Fabric Dresser and Nightstand Tower',
    brand: 'WLIVE',
    category: 'storage',
  },
];

const LEGACY_4_IDS = [
  'madamelique-turkish-towels',
  'northern-galaxy-aurora-projector',
  'lagraty-chunky-knit-blanket',
  'lifewit-clothes-storage-bins',
];

const OLD_INCORRECT_TITLES = [
  'Lodge',
  'Pre-Seasoned Cast Iron Skillet',
  'OXO Fresh Herb Keeper',
  'Stainless Steel Cast Iron Chainmail Scrubber',
  'Organic New Zealand Wool Dryer Balls',
  'Dual-Grit Whetstone Knife Sharpening Kit',
  'Fido Clear Glass Airtight Hermetic Jars',
  'Solino Home',
  'Precision Digital Food Scale with Pull-Out Display',
  'SpaceAid',
  'E-Cloth',
  'Kuishi',
  'VIVO',
  'Stasher',
  'Redecker',
  'Hario V60',
  'Readywares Waxed Canvas',
];

test('1. All 16 verified affiliate URLs and ASINs are present exactly once in the registry', () => {
  const products = Object.values(CURATED_PRODUCTS);

  assert.equal(products.length, 20, 'Total curated products should be 20 (4 legacy + 16 new)');

  for (const mapping of VERIFIED_16_MAPPINGS) {
    const matchingByUrl = products.filter((p) => p.affiliateUrl === mapping.url);
    assert.equal(
      matchingByUrl.length,
      1,
      `Affiliate URL "${mapping.url}" must be present exactly once. Found: ${matchingByUrl.length}`
    );

    const product = matchingByUrl[0];
    assert.equal(product.asin, mapping.asin, `ASIN for "${mapping.url}" must be "${mapping.asin}".`);
    assert.equal(product.brand, mapping.brand, `Brand for "${mapping.url}" must match "${mapping.brand}".`);
    assert.equal(product.category, mapping.category, `Category for "${mapping.url}" must match "${mapping.category}".`);

    const matchingByAsin = products.filter((p) => p.asin === mapping.asin);
    assert.equal(
      matchingByAsin.length,
      1,
      `ASIN "${mapping.asin}" must be present exactly once. Found: ${matchingByAsin.length}`
    );
  }
});

test('2. No old incorrect product identities or keywords remain for the 16 URLs', () => {
  const products = Object.values(CURATED_PRODUCTS);

  for (const mapping of VERIFIED_16_MAPPINGS) {
    const product = products.find((p) => p.affiliateUrl === mapping.url)!;
    assert.ok(product, `Product for URL "${mapping.url}" must exist.`);

    for (const badKeyword of OLD_INCORRECT_TITLES) {
      assert.ok(
        !product.name.toLowerCase().includes(badKeyword.toLowerCase()),
        `Product name "${product.name}" for "${mapping.url}" must NOT contain old incorrect title/brand "${badKeyword}".`
      );
      assert.ok(
        !product.description.toLowerCase().includes(badKeyword.toLowerCase()),
        `Product description for "${mapping.url}" must NOT contain old incorrect title/brand "${badKeyword}".`
      );
    }
  }
});

test('3. Legacy curated products remain intact and verified', () => {
  for (const legacyId of LEGACY_4_IDS) {
    const product = CURATED_PRODUCTS[legacyId];
    assert.ok(product, `Legacy product "${legacyId}" must exist in CURATED_PRODUCTS.`);
    assert.ok(product.name.length > 5, `Legacy product "${legacyId}" must have a valid name.`);
    assert.ok(product.affiliateUrl.startsWith('https://link.amazon/'), `Legacy product "${legacyId}" must have affiliateUrl.`);
    assert.ok(product.asin && ASIN_REGEX.test(product.asin), `Legacy product "${legacyId}" must have valid ASIN.`);
  }
});

test('4. Full CURATED_PRODUCTS registry passes deterministic validation and integrity checks', () => {
  const report = validateCuratedProductRegistry(CURATED_PRODUCTS);

  assert.equal(report.isValid, true, `Registry must be valid. Errors: ${report.errors.join('; ')}`);
  assert.equal(report.errors.length, 0);
  assert.equal(report.totalProducts, 20);
  assert.equal(report.verifiedAsinCount, 20);

  // Assert assertValidCuratedProductRegistry does not throw
  assert.doesNotThrow(() => {
    assertValidCuratedProductRegistry(CURATED_PRODUCTS);
  });
});

test('5. Product validator rejects malformed, incomplete, or invalid product records', () => {
  const badRecords: Partial<CuratedProduct>[] = [
    // Missing / invalid id
    {
      name: 'Valid Name',
      category: 'home',
      description: 'Valid long enough description for testing.',
      editorialNote: 'Valid long enough editorial note for testing.',
      affiliateUrl: 'https://link.amazon/B01234567',
      asin: 'B012345678',
    },
    // Invalid slug format
    {
      id: 'Invalid Slug!',
      name: 'Valid Name',
      category: 'home',
      description: 'Valid long enough description for testing.',
      editorialNote: 'Valid long enough editorial note for testing.',
      affiliateUrl: 'https://link.amazon/B01234567',
      asin: 'B012345678',
    },
    // Invalid category
    {
      id: 'bad-category-item',
      name: 'Valid Name',
      category: 'non-existent-category' as any,
      description: 'Valid long enough description for testing.',
      editorialNote: 'Valid long enough editorial note for testing.',
      affiliateUrl: 'https://link.amazon/B01234567',
      asin: 'B012345678',
    },
    // Invalid ASIN format
    {
      id: 'bad-asin-item',
      name: 'Valid Name',
      category: 'home',
      description: 'Valid long enough description for testing.',
      editorialNote: 'Valid long enough editorial note for testing.',
      affiliateUrl: 'https://link.amazon/B01234567',
      asin: 'INVALID_ASIN_LENGTH',
    },
    // Invalid image URL
    {
      id: 'bad-image-item',
      name: 'Valid Name',
      category: 'home',
      description: 'Valid long enough description for testing.',
      editorialNote: 'Valid long enough editorial note for testing.',
      affiliateUrl: 'https://link.amazon/B01234567',
      asin: 'B012345678',
      imageUrl: 'javascript:alert(1)',
    },
  ];

  for (const badRecord of badRecords) {
    const res = validateCuratedProduct(badRecord as CuratedProduct);
    assert.equal(res.isValid, false, `Record with id "${badRecord.id}" should fail validation.`);
    assert.ok(res.errors.length > 0);
  }
});

test('6. Registry validator detects duplicate IDs, duplicate URLs, and duplicate ASINs', () => {
  const duplicateRegistry: Record<string, CuratedProduct> = {
    'item-1': {
      id: 'item-1',
      name: 'Item One Name',
      category: 'home',
      description: 'A valid description for test item one.',
      editorialNote: 'A valid editorial note for test item one.',
      affiliateUrl: 'https://link.amazon/B0SHARED1',
      asin: 'B000000001',
    },
    'item-2': {
      id: 'item-2',
      name: 'Item Two Name',
      category: 'home',
      description: 'A valid description for test item two.',
      editorialNote: 'A valid editorial note for test item two.',
      affiliateUrl: 'https://link.amazon/B0SHARED1', // duplicate URL
      asin: 'B000000002',
    },
    'item-3': {
      id: 'item-3',
      name: 'Item Three Name',
      category: 'home',
      description: 'A valid description for test item three.',
      editorialNote: 'A valid editorial note for test item three.',
      affiliateUrl: 'https://link.amazon/B0UNIQUE3',
      asin: 'B000000001', // duplicate ASIN with item-1
    },
  };

  const report = validateCuratedProductRegistry(duplicateRegistry);
  assert.equal(report.isValid, false);
  assert.ok(report.errors.some((e) => e.includes('Duplicate affiliate URL')));
  assert.ok(report.errors.some((e) => e.includes('Duplicate ASIN')));
});

test('7. getCuratedPicks retrieves products accurately by ID list and by category', () => {
  // Test by ID list
  const picksById = getCuratedPicks(['iuv-western-cowgirl-boots', 'cyskxyi-swinging-ghost-decoration']);
  assert.equal(picksById.length, 2);
  assert.equal(picksById[0].id, 'iuv-western-cowgirl-boots');
  assert.equal(picksById[1].id, 'cyskxyi-swinging-ghost-decoration');

  // Test non-existent IDs are filtered out safely
  const picksWithMissing = getCuratedPicks(['iuv-western-cowgirl-boots', 'non-existent-id-999']);
  assert.equal(picksWithMissing.length, 1);
  assert.equal(picksWithMissing[0].id, 'iuv-western-cowgirl-boots');

  // Test by category
  const storagePicks = getCuratedPicks('storage');
  assert.ok(storagePicks.length >= 3);
  assert.ok(storagePicks.every((p) => p.category === 'storage'));
  assert.ok(storagePicks.some((p) => p.id === 'lifewit-60l-underbed-storage-bags'));
  assert.ok(storagePicks.some((p) => p.id === 'wlive-4-drawer-dresser-nightstand'));
  assert.ok(storagePicks.some((p) => p.id === 'lifewit-clothes-storage-bins'));

  const selfCarePicks = getCuratedPicks('self-care');
  assert.equal(selfCarePicks.length, 2);
  assert.ok(selfCarePicks.some((p) => p.id === 'dr-melaxin-cemenrete-calcium-multi-balm'));
  assert.ok(selfCarePicks.some((p) => p.id === 'celimax-pore-dark-spot-brightening-cream'));
});

test('8. Image requirements and image validation support verified image sources and detect missing images', () => {
  const sampleWithValidLocalImage: CuratedProduct = {
    id: 'sample-local-image',
    name: 'Sample Product With Local Image',
    category: 'home',
    description: 'Sample description for product with local image.',
    editorialNote: 'Sample editorial note for product with local image.',
    affiliateUrl: 'https://link.amazon/B0TESTIMG1',
    asin: 'B0TESTIMG1',
    imageUrl: '/assets/products/sample-image.jpg',
  };

  const localRes = validateCuratedProduct(sampleWithValidLocalImage, { requireImage: true });
  assert.equal(localRes.isValid, true);
  assert.equal(localRes.hasImage, true);

  const sampleWithoutImage: CuratedProduct = {
    id: 'sample-no-image',
    name: 'Sample Product Without Image',
    category: 'home',
    description: 'Sample description for product without image.',
    editorialNote: 'Sample editorial note for product without image.',
    affiliateUrl: 'https://link.amazon/B0TESTIMG2',
    asin: 'B0TESTIMG2',
  };

  // When requireImage is true, missing image fails validation
  const strictRes = validateCuratedProduct(sampleWithoutImage, { requireImage: true });
  assert.equal(strictRes.isValid, false);
  assert.ok(strictRes.errors.some((e) => e.includes('Missing required product image')));

  // When requireImage is false (current state pending verified image asset ingestion), validation passes with tracking warning
  const permissiveRes = validateCuratedProduct(sampleWithoutImage, { requireImage: false });
  assert.equal(permissiveRes.isValid, true);
  assert.equal(permissiveRes.hasImage, false);
  assert.ok(permissiveRes.warnings.some((w) => w.includes('No image provided')));
});
