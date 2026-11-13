import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PICKS_CATEGORIES,
  getPicksCategory,
  isValidPicksCategory,
  getAllPicksCategories,
  normalizePicksCategories,
} from '../src/utils/picks-categories.ts';
import { FUNCTIONAL_NAV_LINKS } from '../src/config/site.ts';
import {
  formatPicksArticleMarkdown,
  computeReadingTime,
  parseMarkdownFile,
} from '../src/lib/editorial/cms/picks.ts';
import { validatePicksArticleData } from '../src/lib/editorial/cms/publisher.ts';
import {
  renderAffiliateProductBoxHtml,
  resolveContextualAffiliateOffer,
  processAffiliateContent,
} from '../src/lib/commerce/affiliate-renderer.ts';
import { renderMarkdownToHtml } from '../src/utils/markdown-renderer.ts';

describe('Phase 6: LifeMode Picks Editorial Article System', () => {
  describe('1. Centralized Picks Taxonomy', () => {
    test('contains exactly 12 defined lifestyle categories with required metadata', () => {
      const categories = getAllPicksCategories();
      assert.equal(categories.length, 12, 'Must provide exactly 12 categories');

      const expectedSlugs = [
        'home-living',
        'kitchen-cooking',
        'tech-smart-home',
        'beauty-personal-care',
        'fashion-accessories',
        'health-fitness',
        'pets',
        'travel-experiences',
        'digital-tools-software',
        'learning-education',
        'gifts-occasions',
        'outdoor-garden',
      ];

      for (const slug of expectedSlugs) {
        const cat = getPicksCategory(slug);
        assert.ok(cat, `Category ${slug} must be registered`);
        assert.ok(cat?.title, `Category ${slug} must have a title`);
        assert.ok(cat?.icon, `Category ${slug} must have an icon`);
        assert.ok(cat?.description, `Category ${slug} must have a description`);
        assert.ok(isValidPicksCategory(slug), `isValidPicksCategory must return true for ${slug}`);
      }
    });

    test('normalizes multiple category inputs cleanly', () => {
      const raw = ['Kitchen & Cooking', 'home-living', 'invalid-nonexistent-category'];
      const normalized = normalizePicksCategories(raw);
      assert.ok(normalized.includes('kitchen-cooking'), 'Resolves title to slug');
      assert.ok(normalized.includes('home-living'), 'Preserves valid slug');
      assert.ok(!normalized.includes('invalid-nonexistent-category'), 'Filters unknown categories');
    });
  });

  describe('2. Navigation Order Verification', () => {
    test('functional navigation matches the required order', () => {
      const slugs = FUNCTIONAL_NAV_LINKS.map((link) => link.slug);
      assert.deepEqual(slugs, [
        'tools',
        'checklists',
        'life-hacks',
        'guides',
        'picks',
        'daily-ideas',
      ], 'Desktop & header nav order must strictly match requested sequence');

      const names = FUNCTIONAL_NAV_LINKS.map((link) => link.name);
      assert.deepEqual(names, [
        'Tools',
        'Checklists',
        'Life Hacks',
        'Guides',
        'LifeMode Picks',
        'Daily Ideas Store',
      ]);
    });
  });

  describe('3. Picks Article CMS Formatter & Validator', () => {
    test('validates required fields for Picks articles', () => {
      const invalidArticle: any = {
        title: '',
        description: 'Missing title',
        categories: [],
      };
      const validation = validatePicksArticleData(invalidArticle);
      assert.equal(validation.isValid, false);
      assert.ok(validation.errors.length >= 2, 'Must report missing title, slug, and categories');
    });

    test('passes validation for complete Picks article', () => {
      const validArticle: any = {
        title: 'Top 10 Coffee Tools of 2026',
        slug: 'top-10-coffee-tools-2026',
        description: 'Vetted equipment for serious home brewers.',
        categories: ['kitchen-cooking', 'gifts-occasions'],
        content: 'Here are the best coffee picks...',
      };
      const validation = validatePicksArticleData(validArticle);
      assert.equal(validation.isValid, true);
      assert.equal(validation.errors.length, 0, 'Valid article must produce 0 validation errors');
    });

    test('formats and round-trips markdown frontmatter faithfully', () => {
      const articleData: any = {
        title: 'Holiday Gift Ideas for Tech Lovers',
        slug: 'holiday-gift-ideas-tech-lovers',
        description: 'Curated tech and smart home gear for the holiday season.',
        seoTitle: 'Holiday Tech Gift Guide 2026',
        seoDescription: 'The best smart home and tech gifts tested by LifeMode.',
        categories: ['tech-smart-home', 'gifts-occasions'],
        pubDate: '2026-11-13',
        author: 'LifeMode Editorial',
        draft: false,
        featured: true,
        image: 'https://example.com/tech-gear.jpg',
        imageAlt: 'Smart home gadgets on a modern desk',
        readingTime: '5 min read',
        tags: ['Gifts', 'Smart Home'],
        affiliateProducts: [
          { id: 'rechargeable-milk-frother-handheld', note: 'Top frother' },
        ],
        content: '## Gift #1: Smart Gadgets\n\nFull review content here.',
      };

      const markdown = formatPicksArticleMarkdown(articleData);
      assert.ok(markdown.startsWith('---\n'), 'Must start with YAML frontmatter');
      assert.ok(markdown.includes('title: Holiday Gift Ideas for Tech Lovers'));
      assert.ok(markdown.includes('- tech-smart-home'));
      assert.ok(markdown.includes('- gifts-occasions'));
      assert.ok(markdown.includes('Full review content here.'));

      const parsed = parseMarkdownFile(markdown);
      assert.equal(parsed.frontmatter.title, articleData.title);
      assert.equal(parsed.frontmatter.description, articleData.description);
      assert.deepEqual(parsed.frontmatter.categories, articleData.categories);
      assert.ok(parsed.content.includes('Full review content here.'));
    });

    test('computes accurate reading time based on word count', () => {
      const shortText = 'One two three four five six seven eight nine ten.';
      assert.equal(computeReadingTime(shortText), '1 min read');

      const longText = new Array(500).fill('word').join(' ');
      assert.equal(computeReadingTime(longText), '3 min read');
    });
  });

  describe('4. In-Content Directive Processing & Picks Eligibility', () => {
    test('renders product boxes and links for eligible Picks offers', () => {
      const markdown = `
Check out this recommendation:

::product-box{id="rechargeable-milk-frother-handheld" note="Double-whisk power" cta="Buy Now"}

Also read about the [Milk Frother](aff:rechargeable-milk-frother-handheld).
      `;

      const html = renderMarkdownToHtml(markdown, { context: 'picks' });
      assert.ok(html.includes('<aside class="affiliate-product-box'), 'Renders aside element');
      assert.ok(html.includes('data-offer-id="rechargeable-milk-frother-handheld"'), 'Includes offer ID');
      assert.ok(html.includes('Double-whisk power'), 'Renders custom note');
      assert.ok(html.includes('Buy Now'), 'Renders custom CTA');
      assert.ok(html.includes('rel="nofollow noopener sponsored"'), 'Renders sponsored rel');
      assert.ok(html.includes('class="affiliate-contextual-link"'), 'Renders contextual link class');
    });

    test('processAffiliateContent replaces directives with HTML in picks context', () => {
      const raw = '::product-box{id="rechargeable-milk-frother-handheld"} and [Frother](aff:rechargeable-milk-frother-handheld)';
      const processed = processAffiliateContent(raw, { context: 'picks' });
      assert.ok(processed.includes('<aside class="affiliate-product-box'), 'Contains product box');
      assert.ok(processed.includes('<a href="'), 'Contains anchor link');
      assert.ok(!processed.includes('::product-box'), 'Directive is fully resolved');
    });
  });
});
