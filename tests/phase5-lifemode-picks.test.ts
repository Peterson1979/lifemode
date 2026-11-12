import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  listPublicOffers,
  listPublicPicksOffers,
} from '../src/lib/commerce/offer-store.ts';
import {
  getOfferCtaLabel,
  getPrimaryProductImage,
  type CanonicalAffiliateOffer,
} from '../src/lib/commerce/types.ts';
import { FUNCTIONAL_NAV_LINKS, SITE_CONFIG } from '../src/config/site.ts';

const TEST_CATALOG_PATH = resolve('.tmp-test-catalog-phase5.json');

const sampleTestOffers: CanonicalAffiliateOffer[] = [
  // 1. Active physical product eligible for BOTH Store and Picks
  {
    id: 'french-press-coffee-maker',
    name: 'Classic Glass French Press',
    title: 'Double-Wall Insulated French Press Coffee Maker',
    merchant: 'Amazon',
    brand: 'CaféPress',
    affiliateUrl: 'https://www.amazon.com/dp/B00FRENCH1?tag=lifemode-20&camp=1789',
    status: 'ACTIVE',
    offerType: 'physical',
    eligibleForStore: true,
    eligibleForPicks: true,
    eligibleForGuides: true,
    description: 'Heat-resistant borosilicate glass with stainless steel plunger.',
    editorialNote: 'Our top daily driver for morning coffee.',
    defaultCtaText: 'View on Amazon',
    priceRange: '$34.00',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    images: [
      {
        url: 'https://images.example.com/french-press.jpg',
        alt: 'French Press Coffee Maker',
        isPrimary: true,
        displayOrder: 0,
      },
    ],
  },
  // 2. Course: eligible for Picks ONLY, NOT Store
  {
    id: 'sourdough-mastery-course',
    name: 'Sourdough Baking Fundamentals',
    title: 'Sourdough Mastery: From Starter to Artisan Loaf',
    merchant: 'CulinaryClass',
    affiliateUrl: 'https://example.com/course/sourdough?ref=lifemode-picks-2026',
    status: 'ACTIVE',
    offerType: 'course',
    eligibleForStore: false, // Ineligible for physical Store
    eligibleForPicks: true,  // Eligible for LifeMode Picks
    eligibleForGuides: true,
    description: 'Comprehensive 4-week online video course by master bakers.',
    editorialNote: 'Clear pacing with failproof hydration charts.',
    // defaultCtaText omitted to test dynamic course CTA
    priceRange: '$79.00',
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
  },
  // 3. Software: eligible for Picks ONLY, NOT Store
  {
    id: 'notion-habits-tracker-pro',
    name: 'HabitOS Productivity Suite',
    title: 'HabitOS: The Complete Daily Routine & Life Dashboard',
    merchant: 'AppDirect',
    affiliateUrl: 'https://habitos.example.com/signup?via=lifemode',
    status: 'ACTIVE',
    offerType: 'software',
    eligibleForStore: false, // Ineligible for physical Store
    eligibleForPicks: true,  // Eligible for LifeMode Picks
    eligibleForGuides: false,
    description: 'Fast, minimal dashboard for daily habits and weekly reviews.',
    // defaultCtaText omitted to test dynamic software CTA
    priceRange: '$49/year',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  },
  // 4. Store-only item: eligible for Store ONLY, NOT Picks
  {
    id: 'bamboo-drawer-dividers-4pack',
    name: 'Bamboo Drawer Dividers 4-Pack',
    title: 'Spring-Loaded Expandable Bamboo Drawer Dividers',
    merchant: 'HomeOrg',
    affiliateUrl: 'https://example.com/dividers?tag=lifemode-store',
    status: 'ACTIVE',
    offerType: 'physical',
    eligibleForStore: true,  // Eligible for Store
    eligibleForPicks: false, // Ineligible for LifeMode Picks
    eligibleForGuides: true,
    description: 'Adjustable tension fit for kitchen and wardrobe drawers.',
    priceRange: '$22.99',
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
  },
  // 5. Draft offer: eligibleForPicks is true, but status is DRAFT (must be excluded)
  {
    id: 'draft-travel-insurance',
    name: 'Nomad Global Health Plan',
    title: 'Nomad Health & Travel Coverage',
    merchant: 'TravelCare',
    affiliateUrl: 'https://travelcare.example.com?partner=lifemode',
    status: 'DRAFT',
    offerType: 'travel',
    eligibleForStore: false,
    eligibleForPicks: true,
    eligibleForGuides: false,
    description: 'Draft plan not yet published.',
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
  },
];

describe('Phase 5: LifeMode Picks Public Destination', () => {
  beforeEach(() => {
    writeFileSync(TEST_CATALOG_PATH, JSON.stringify(sampleTestOffers, null, 2), 'utf8');
    process.env.LIFEMODE_OFFERS_PATH = TEST_CATALOG_PATH;
  });

  afterEach(() => {
    delete process.env.LIFEMODE_OFFERS_PATH;
    if (existsSync(TEST_CATALOG_PATH)) {
      unlinkSync(TEST_CATALOG_PATH);
    }
  });

  describe('1. listPublicPicksOffers Catalog Filtering & Data Integrity', () => {
    test('returns only ACTIVE offers with eligibleForPicks === true', async () => {
      const picks = await listPublicPicksOffers(TEST_CATALOG_PATH);
      const ids = picks.map((p) => p.id);

      assert.ok(ids.includes('french-press-coffee-maker'), 'Should include store & picks offer');
      assert.ok(ids.includes('sourdough-mastery-course'), 'Should include course offer');
      assert.ok(ids.includes('notion-habits-tracker-pro'), 'Should include software offer');

      assert.ok(!ids.includes('bamboo-drawer-dividers-4pack'), 'Must exclude store-only offer');
      assert.ok(!ids.includes('draft-travel-insurance'), 'Must exclude draft offer');
      assert.equal(picks.length, 3, 'Must return exactly the 3 active picks-eligible offers');
    });

    test('preserves exact affiliate tracking URLs byte-for-byte without rewriting', async () => {
      const picks = await listPublicPicksOffers(TEST_CATALOG_PATH);
      const frenchPress = picks.find((p) => p.id === 'french-press-coffee-maker');
      const course = picks.find((p) => p.id === 'sourdough-mastery-course');
      const software = picks.find((p) => p.id === 'notion-habits-tracker-pro');

      assert.equal(
        frenchPress?.affiliateUrl,
        'https://www.amazon.com/dp/B00FRENCH1?tag=lifemode-20&camp=1789'
      );
      assert.equal(
        course?.affiliateUrl,
        'https://example.com/course/sourdough?ref=lifemode-picks-2026'
      );
      assert.equal(
        software?.affiliateUrl,
        'https://habitos.example.com/signup?via=lifemode'
      );
    });
  });

  describe('2. Independent Destination Behavior (Store vs. Picks)', () => {
    test('Store (/daily-ideas) and Picks (/picks) maintain independent eligibility', async () => {
      const storeProducts = await listPublicOffers(TEST_CATALOG_PATH);
      const picksOffers = await listPublicPicksOffers(TEST_CATALOG_PATH);

      const storeIds = storeProducts.map((p) => p.id);
      const picksIds = picksOffers.map((p) => p.id);

      // Sourdough course & HabitOS software are in Picks, but NOT in Store
      assert.ok(picksIds.includes('sourdough-mastery-course'));
      assert.ok(picksIds.includes('notion-habits-tracker-pro'));
      assert.ok(!storeIds.includes('sourdough-mastery-course'), 'Course must not be in Store');
      assert.ok(!storeIds.includes('notion-habits-tracker-pro'), 'Software must not be in Store');

      // Bamboo drawer divider is in Store, but NOT in Picks
      assert.ok(storeIds.includes('bamboo-drawer-dividers-4pack'));
      assert.ok(!picksIds.includes('bamboo-drawer-dividers-4pack'), 'Store-only item must not be in Picks');

      // French press is in both independently
      assert.ok(storeIds.includes('french-press-coffee-maker'));
      assert.ok(picksIds.includes('french-press-coffee-maker'));
    });
  });

  describe('3. Multi-Offer-Type Support & CTA Label Helper', () => {
    test('derives contextual CTA labels based on offer type when defaultCtaText is omitted', () => {
      assert.equal(getOfferCtaLabel({ offerType: 'course' }), 'Explore course');
      assert.equal(getOfferCtaLabel({ offerType: 'software' }), 'Try software');
      assert.equal(getOfferCtaLabel({ offerType: 'digital' }), 'View resource');
      assert.equal(getOfferCtaLabel({ offerType: 'travel' }), 'View travel deal');
      assert.equal(getOfferCtaLabel({ offerType: 'service' }), 'Explore service');
      assert.equal(getOfferCtaLabel({ offerType: 'physical' }), 'View recommendation');
      assert.equal(getOfferCtaLabel({ offerType: 'other' }), 'View recommendation');
    });

    test('respects custom defaultCtaText override when explicitly defined', () => {
      assert.equal(
        getOfferCtaLabel({ offerType: 'physical', defaultCtaText: 'View on Amazon' }),
        'View on Amazon'
      );
      assert.equal(
        getOfferCtaLabel({ offerType: 'course', defaultCtaText: 'Enroll with 20% Off' }),
        'Enroll with 20% Off'
      );
    });
  });

  describe('4. Multi-Image Model & Image Fallbacks', () => {
    test('resolves primary image when available', () => {
      const frenchPress = sampleTestOffers[0];
      const primary = getPrimaryProductImage(frenchPress);
      assert.ok(primary);
      assert.equal(primary?.url, 'https://images.example.com/french-press.jpg');
      assert.equal(primary?.alt, 'French Press Coffee Maker');
    });

    test('returns undefined cleanly for offers without images', () => {
      const course = sampleTestOffers[1];
      const primary = getPrimaryProductImage(course);
      assert.equal(primary, undefined);
    });
  });

  describe('5. Site Navigation & Public Page Route Integration', () => {
    test('LifeMode Picks is included in functional navigation links', () => {
      const picksNavLink = FUNCTIONAL_NAV_LINKS.find((link) => link.slug === 'picks');
      assert.ok(picksNavLink, 'Must include picks link in FUNCTIONAL_NAV_LINKS');
      assert.equal(picksNavLink?.href, '/picks/');
      assert.equal(picksNavLink?.name, 'LifeMode Picks');
    });

    test('LifeMode Picks is included in footer links', () => {
      const footerPicks = SITE_CONFIG.footerLinks.find((link) => link.href === '/picks');
      assert.ok(footerPicks, 'Must include picks link in footerLinks');
      assert.equal(footerPicks?.name, 'LifeMode Picks');
    });

    test('public /picks page component exists and imports listPublicPicksOffers', () => {
      const picksPagePath = resolve('src/pages/picks/index.astro');
      assert.ok(existsSync(picksPagePath), 'src/pages/picks/index.astro must exist');
      const content = readFileSync(picksPagePath, 'utf8');
      assert.ok(content.includes('listPublicPicksOffers'), 'Must import and call listPublicPicksOffers');
      assert.ok(content.includes('LifeMode Picks'), 'Must include LifeMode Picks title');
      assert.ok(content.includes('rel="noopener noreferrer sponsored"'), 'Must include sponsored rel');
    });

    test('central products.json catalog loads and supplies live active picks', async () => {
      delete process.env.LIFEMODE_OFFERS_PATH;
      const livePicks = await listPublicPicksOffers();
      assert.ok(livePicks.length > 0, 'Central catalog should supply active picks');
      assert.ok(livePicks.every((p) => p.eligibleForPicks === true), 'All returned offers must have eligibleForPicks === true');
      assert.ok(livePicks.every((p) => p.status === 'ACTIVE' || p.state === 'ACTIVE'), 'All returned offers must be ACTIVE');
    });
  });
});

