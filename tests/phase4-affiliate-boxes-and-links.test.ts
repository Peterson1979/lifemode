import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  renderAffiliateProductBoxHtml,
  resolveContextualAffiliateOffer,
  processAffiliateContent,
} from '../src/lib/commerce/affiliate-renderer.ts';
import { remarkAffiliate } from '../src/lib/commerce/remark-affiliate.ts';
import { renderMarkdownToHtml } from '../src/utils/markdown-renderer.ts';
import type { CanonicalAffiliateOffer } from '../src/lib/commerce/types.ts';

const TEST_CATALOG_PATH = resolve('.tmp-test-catalog-phase4.json');

const sampleOffers: CanonicalAffiliateOffer[] = [
  {
    id: 'test-active-guide-product',
    name: 'Smart Kitchen Scale',
    title: 'Smart Precision Kitchen Scale with Bluetooth',
    merchant: 'Amazon',
    brand: 'PrecisionCraft',
    affiliateUrl: 'https://www.amazon.com/dp/B00TEST123?tag=lifemode-test-20&linkCode=ogi',
    status: 'ACTIVE',
    eligibleForGuides: true,
    eligibleForStore: true,
    eligibleForPicks: true,
    description: 'Ultra-accurate scale for tracking macronutrients and baking precision.',
    editorialNote: 'Essential for home meal-prep workflows.',
    defaultCtaText: 'Check Price on Amazon',
    badge: 'Top Pick',
    priceRange: '$29.99',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: [
      {
        url: 'https://images.example.com/scale-main.jpg',
        alt: 'Smart Kitchen Scale Front',
        isPrimary: true,
        displayOrder: 0,
      },
      {
        url: 'https://images.example.com/scale-side.jpg',
        alt: 'Scale Side Angle',
        displayOrder: 1,
      },
    ],
  },
  {
    id: 'test-no-image-product',
    name: 'Cast Iron Care Scrub',
    title: 'Natural Coconut Oil Seasoning & Cast Iron Scrub',
    merchant: 'Direct Store',
    affiliateUrl: 'https://example.com/scrub?ref=lifemode-guide-direct',
    status: 'ACTIVE',
    eligibleForGuides: true,
    eligibleForStore: false,
    eligibleForPicks: true,
    description: 'Keep your skillet seasoned without scratching.',
    defaultCtaText: 'View Care Kit',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // No images, no imageUrl
  },
  {
    id: 'test-draft-product',
    name: 'Draft Blender 5000',
    title: 'High-Speed Commercial Blender',
    merchant: 'Amazon',
    affiliateUrl: 'https://www.amazon.com/dp/B00DRAFT99?tag=lifemode-20',
    status: 'DRAFT',
    eligibleForGuides: true,
    eligibleForStore: false,
    eligibleForPicks: false,
    description: 'A draft offer not yet published.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'test-store-only-product',
    name: 'Store Only Ergonomic Chair',
    title: 'Ergonomic Mesh Task Chair',
    merchant: 'OfficePro',
    affiliateUrl: 'https://example.com/chair?aff=lifemode',
    status: 'ACTIVE',
    eligibleForGuides: false, // Ineligible for guides
    eligibleForStore: true,
    eligibleForPicks: true,
    description: 'Only for daily ideas store, not guide articles.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('Phase 4: Guide Affiliate Product Boxes & Contextual Links', () => {
  beforeEach(() => {
    writeFileSync(TEST_CATALOG_PATH, JSON.stringify(sampleOffers, null, 2), 'utf8');
    process.env.LIFEMODE_OFFERS_PATH = TEST_CATALOG_PATH;
  });

  afterEach(() => {
    delete process.env.LIFEMODE_OFFERS_PATH;
    if (existsSync(TEST_CATALOG_PATH)) {
      unlinkSync(TEST_CATALOG_PATH);
    }
  });

  describe('1. Reusable Affiliate Product Box Renderer', () => {
    test('renders complete product box for active guide-eligible offer with images', () => {
      const html = renderAffiliateProductBoxHtml('test-active-guide-product');
      assert.ok(html.includes('<aside class="affiliate-product-box'), 'Should contain aside element');
      assert.ok(html.includes('data-offer-id="test-active-guide-product"'), 'Should contain data-offer-id');
      assert.ok(html.includes('Smart Precision Kitchen Scale with Bluetooth'), 'Should display full title');
      assert.ok(html.includes('PrecisionCraft'), 'Should display brand/merchant');
      assert.ok(html.includes('Top Pick'), 'Should display badge');
      assert.ok(html.includes('Essential for home meal-prep workflows.'), 'Should display editorial note');
      assert.ok(html.includes('Check Price on Amazon'), 'Should display custom CTA');
      assert.ok(html.includes('rel="nofollow noopener sponsored"'), 'Must have sponsored rel');
      assert.ok(html.includes('target="_blank"'), 'Must open in new tab');
      assert.ok(
        html.includes('https://www.amazon.com/dp/B00TEST123?tag=lifemode-test-20&amp;linkCode=ogi'),
        'Must preserve exact URL with valid HTML entity encoding'
      );
      assert.ok(html.includes('src="https://images.example.com/scale-main.jpg"'), 'Must render primary image URL');
      assert.ok(html.includes('alt="Smart Kitchen Scale Front"'), 'Must render image alt text');
      assert.ok(html.includes('Sponsored recommendation • Editors maintain full independent discretion'), 'Must include sponsored disclosure');
    });

    test('supports custom context note and CTA override options', () => {
      const html = renderAffiliateProductBoxHtml('test-active-guide-product', {
        contextNote: 'Special note for this specific recipe article',
        ctaText: 'Get the Scale Now',
      });
      assert.ok(html.includes('Special note for this specific recipe article'), 'Overrides context note');
      assert.ok(html.includes('Get the Scale Now'), 'Overrides CTA text');
    });

    test('renders clean fallback when product has no images', () => {
      const html = renderAffiliateProductBoxHtml('test-no-image-product');
      assert.ok(html.includes('box-image-fallback'), 'Should render fallback image container');
      assert.ok(html.includes('Natural Coconut Oil Seasoning &amp; Cast Iron Scrub'), 'Displays title with HTML encoding');
      assert.ok(html.includes('https://example.com/scrub?ref=lifemode-guide-direct'), 'Preserves exact URL');
      assert.ok(!html.includes('src="undefined"'), 'Must never have broken undefined image src');
    });

    test('fails gracefully (returns empty string) for DRAFT offers', () => {
      const html = renderAffiliateProductBoxHtml('test-draft-product');
      assert.equal(html, '', 'Draft offers must never render publicly in guides');
    });

    test('fails gracefully (returns empty string) for offers with eligibleForGuides === false', () => {
      const html = renderAffiliateProductBoxHtml('test-store-only-product');
      assert.equal(html, '', 'Guide-ineligible offers must never render in guides');
    });

    test('fails gracefully (returns empty string) for non-existent IDs or empty input', () => {
      assert.equal(renderAffiliateProductBoxHtml('non-existent-id'), '');
      assert.equal(renderAffiliateProductBoxHtml(''), '');
    });
  });

  describe('2. Contextual Affiliate Link Resolution', () => {
    test('resolves active guide-eligible offer by aff:offer-id', () => {
      const resolved = resolveContextualAffiliateOffer('aff:test-active-guide-product');
      assert.ok(resolved, 'Should resolve offer');
      assert.equal(
        resolved?.url,
        'https://www.amazon.com/dp/B00TEST123?tag=lifemode-test-20&linkCode=ogi',
        'Must preserve exact tracking URL'
      );
      assert.equal(resolved?.rel, 'nofollow noopener sponsored');
    });

    test('resolves active guide-eligible offer by product:offer-id', () => {
      const resolved = resolveContextualAffiliateOffer('product:test-no-image-product');
      assert.ok(resolved, 'Should resolve offer');
      assert.equal(
        resolved?.url,
        'https://example.com/scrub?ref=lifemode-guide-direct'
      );
      assert.equal(resolved?.rel, 'nofollow noopener sponsored');
    });

    test('returns null for DRAFT offers', () => {
      const resolved = resolveContextualAffiliateOffer('aff:test-draft-product');
      assert.equal(resolved, null, 'Draft offers cannot have public affiliate links');
    });

    test('returns null for guide-ineligible offers', () => {
      const resolved = resolveContextualAffiliateOffer('aff:test-store-only-product');
      assert.equal(resolved, null, 'Ineligible offers cannot have guide affiliate links');
    });

    test('returns null for unknown IDs or invalid prefixes', () => {
      assert.equal(resolveContextualAffiliateOffer('aff:unknown-id'), null);
      assert.equal(resolveContextualAffiliateOffer('http://example.com'), null);
      assert.equal(resolveContextualAffiliateOffer(''), null);
    });
  });

  describe('3. Content Processor (processAffiliateContent)', () => {
    test('replaces ::product-box directive with full HTML', () => {
      const input = 'Before text\n\n::product-box{id="test-active-guide-product"}\n\nAfter text';
      const output = processAffiliateContent(input);
      assert.ok(output.includes('<aside class="affiliate-product-box'));
      assert.ok(output.includes('Smart Precision Kitchen Scale'));
      assert.ok(output.includes('Before text'));
      assert.ok(output.includes('After text'));
    });

    test('replaces [product-box:id] shortcode with full HTML', () => {
      const input = 'Check out this gear:\n[product-box:test-active-guide-product]';
      const output = processAffiliateContent(input);
      assert.ok(output.includes('<aside class="affiliate-product-box'));
      assert.ok(output.includes('data-offer-id="test-active-guide-product"'));
    });

    test('replaces contextual [Anchor](aff:id) with sponsored anchor tag', () => {
      const input = 'We highly recommend using a [precision digital scale](aff:test-active-guide-product) for accuracy.';
      const output = processAffiliateContent(input);
      assert.ok(output.includes('href="https://www.amazon.com/dp/B00TEST123?tag=lifemode-test-20&amp;linkCode=ogi"'));
      assert.ok(output.includes('rel="nofollow noopener sponsored"'));
      assert.ok(output.includes('class="affiliate-contextual-link"'));
      assert.ok(output.includes('precision digital scale</a>'));
    });

    test('gracefully degrades contextual link to plain anchor text if offer is inactive or unknown', () => {
      const input = 'Use a [draft kitchen tool](aff:test-draft-product) or an [unknown tool](aff:missing-product).';
      const output = processAffiliateContent(input);
      assert.ok(!output.includes('href='), 'Must not create a link for inactive or missing offer');
      assert.ok(output.includes('draft kitchen tool'));
      assert.ok(output.includes('unknown tool'));
    });

    test('supports multiple different offers in single article text', () => {
      const input = `
# Best Kitchen Tools

We love the [Smart Scale](aff:test-active-guide-product) for daily prep.
::product-box{id="test-active-guide-product"}

For maintenance, use the [Care Scrub](aff:test-no-image-product).
::product-box{id="test-no-image-product"}
      `.trim();

      const output = processAffiliateContent(input);
      assert.ok(output.includes('data-offer-id="test-active-guide-product"'));
      assert.ok(output.includes('data-offer-id="test-no-image-product"'));
      assert.ok(output.includes('href="https://www.amazon.com/dp/B00TEST123?tag=lifemode-test-20&amp;linkCode=ogi"'));
      assert.ok(output.includes('href="https://example.com/scrub?ref=lifemode-guide-direct"'));
    });
  });

  describe('4. Markdown Renderer (Editor Dashboard Preview Parity)', () => {
    test('renders standalone directive as HTML block without wrapping in p tag', () => {
      const md = '# Title\n\n::product-box{id="test-active-guide-product"}\n\nParagraph text.';
      const html = renderMarkdownToHtml(md);
      assert.ok(html.includes('<aside class="affiliate-product-box'), 'Renders aside element');
      assert.ok(!html.includes('<p><aside'), 'Must not wrap aside inside p tag');
      assert.ok(html.includes('<p>Paragraph text.</p>'), 'Regular paragraph is rendered properly');
    });

    test('renders inline contextual links inside markdown paragraphs', () => {
      const md = 'Check out this [digital scale](aff:test-active-guide-product) today!';
      const html = renderMarkdownToHtml(md);
      assert.ok(html.includes('<a href="https://www.amazon.com/dp/B00TEST123?tag=lifemode-test-20&amp;linkCode=ogi"'));
      assert.ok(html.includes('rel="nofollow noopener sponsored"'));
      assert.ok(html.includes('digital scale</a>'));
    });
  });

  describe('5. Remark AST Plugin (remarkAffiliate for Astro Static Build)', () => {
    test('transforms contextual links in AST with sponsored metadata', () => {
      const transformer = remarkAffiliate();

      const tree = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                value: 'Try this ',
              },
              {
                type: 'link',
                url: 'aff:test-active-guide-product',
                children: [{ type: 'text', value: 'kitchen scale' }],
              },
            ],
          },
        ],
      };

      transformer(tree);

      const linkNode = (tree.children[0] as any).children[1];
      assert.equal(linkNode.type, 'link');
      assert.equal(linkNode.url, 'https://www.amazon.com/dp/B00TEST123?tag=lifemode-test-20&linkCode=ogi');
      assert.equal(linkNode.data.hProperties.rel, 'nofollow noopener sponsored');
      assert.equal(linkNode.data.hProperties.target, '_blank');
      assert.equal(linkNode.data.hProperties.class, 'affiliate-contextual-link');
    });

    test('replaces invalid contextual link in AST with child text nodes (graceful fallback)', () => {
      const transformer = remarkAffiliate();

      const tree = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: 'aff:test-draft-product', // draft offer
                children: [{ type: 'text', value: 'draft item' }],
              },
            ],
          },
        ],
      };

      transformer(tree);

      const paragraph = tree.children[0] as any;
      assert.equal(paragraph.children.length, 1);
      assert.equal(paragraph.children[0].type, 'text');
      assert.equal(paragraph.children[0].value, 'draft item');
    });

    test('transforms standalone product-box paragraph into html node in AST', () => {
      const transformer = remarkAffiliate();

      const tree = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                value: '::product-box{id="test-active-guide-product"}',
              },
            ],
          },
        ],
      };

      transformer(tree);

      const htmlNode = tree.children[0] as any;
      assert.equal(htmlNode.type, 'html');
      assert.ok(htmlNode.value.includes('<aside class="affiliate-product-box'));
      assert.ok(htmlNode.value.includes('Smart Precision Kitchen Scale'));
    });
  });
});
