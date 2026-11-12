import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  quickAddAffiliateOffer,
  listCmsAffiliateOffers,
  saveCmsAffiliateOffer,
  getCmsAffiliateOffer,
  deleteCmsAffiliateOffer,
} from '../src/lib/editorial/cms/affiliates.ts';
import { getOfferStorePath } from '../src/lib/commerce/offer-store.ts';

test('quickAddAffiliateOffer creates draft record from URL alone and preserves exact parameters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lifemode-phase3-'));
  const testStorePath = join(dir, 'products.json');
  process.env.LIFEMODE_OFFERS_PATH = testStorePath;

  try {
    const rawUrl = 'https://partner.course-platform.org/learn/ml-specialization?aff_id=LIFE99&tag=editorial_v1#curriculum';
    const result = await quickAddAffiliateOffer(rawUrl, { offerType: 'course' });

    assert.equal(result.isExisting, false);
    assert.equal(result.offer.affiliateUrl, rawUrl, 'Exact affiliate URL must be preserved byte-for-byte');
    assert.equal(result.offer.status, 'DRAFT', 'Must be saved as DRAFT by default');
    assert.equal(result.offer.offerType, 'course');
    assert.equal(result.offer.eligibleForStore, false, 'Non-physical course must not be in store by default');
    assert.equal(result.offer.eligibleForGuides, true);
    assert.ok(result.offer.id.length > 0);
    assert.equal(result.offer.merchant, 'partner.course-platform.org');

    // Re-adding the exact same URL returns the existing record without duplicating
    const secondAdd = await quickAddAffiliateOffer(rawUrl);
    assert.equal(secondAdd.isExisting, true);
    assert.equal(secondAdd.offer.id, result.offer.id);
  } finally {
    delete process.env.LIFEMODE_OFFERS_PATH;
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveCmsAffiliateOffer supports editing, independent eligibility, and multi-image model', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lifemode-phase3-edit-'));
  const testStorePath = join(dir, 'products.json');
  process.env.LIFEMODE_OFFERS_PATH = testStorePath;

  try {
    const created = await saveCmsAffiliateOffer({
      id: 'nordvpn-security-suite',
      title: 'NordVPN 2-Year Cybersecurity Plan',
      name: 'NordVPN 2-Year Cybersecurity Plan',
      brand: 'Nord Security',
      merchant: 'NordVPN',
      offerType: 'software',
      status: 'ACTIVE',
      state: 'ACTIVE',
      affiliateUrl: 'https://go.nordvpn.net/aff_c?offer_id=15&aff_id=8842',
      eligibleForStore: false,
      eligibleForPicks: true,
      eligibleForGuides: true,
      priceRange: '$3.49 / mo',
      badge: 'Best Privacy Suite',
      defaultCtaText: 'Get 70% Off NordVPN',
      images: [
        { url: 'https://example.com/vpn-dashboard.jpg', alt: 'VPN Dashboard', displayOrder: 2 },
        { url: 'https://example.com/vpn-hero.jpg', alt: 'NordVPN Box', isPrimary: true, displayOrder: 1 },
      ],
    });

    assert.equal(created.id, 'nordvpn-security-suite');
    assert.equal(created.imageUrl, 'https://example.com/vpn-hero.jpg', 'Primary image should sync to imageUrl');
    assert.equal(created.eligibleForStore, false);
    assert.equal(created.eligibleForPicks, true);
    assert.equal(created.eligibleForGuides, true);

    // Filter by destination
    const guideOffers = await listCmsAffiliateOffers({ destination: 'guides' });
    assert.ok(guideOffers.some((o) => o.id === 'nordvpn-security-suite'));

    const storeOffers = await listCmsAffiliateOffers({ destination: 'store' });
    assert.equal(storeOffers.some((o) => o.id === 'nordvpn-security-suite'), false);

    // Filter by type
    const softwareOffers = await listCmsAffiliateOffers({ offerType: 'software' });
    assert.ok(softwareOffers.some((o) => o.id === 'nordvpn-security-suite'));

    // Filter by query
    const searchResult = await listCmsAffiliateOffers({ query: 'Cybersecurity' });
    assert.ok(searchResult.some((o) => o.id === 'nordvpn-security-suite'));

    // Cleanup
    await deleteCmsAffiliateOffer('nordvpn-security-suite');
    const remaining = await listCmsAffiliateOffers();
    assert.equal(remaining.some((o) => o.id === 'nordvpn-security-suite'), false);
  } finally {
    delete process.env.LIFEMODE_OFFERS_PATH;
    await rm(dir, { recursive: true, force: true });
  }
});

