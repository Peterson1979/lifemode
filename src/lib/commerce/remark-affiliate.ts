import { renderAffiliateProductBoxHtml, resolveContextualAffiliateOffer } from './affiliate-renderer.ts';

/**
 * Remark plugin to transform affiliate directives in Astro Markdown articles:
 * 1. Resolves contextual affiliate links: `[Label](aff:offer-id)` -> `rel="nofollow noopener sponsored"`
 * 2. Resolves product boxes: `[product-box:offer-id]` or `::product-box{id="offer-id"}` -> `<aside class="affiliate-product-box">`
 *
 * If an offer is inactive or ineligible, it fails gracefully without breaking the article.
 */
export function remarkAffiliate() {
  return function transformer(tree: any) {
    visit(tree);
  };

  function visit(node: any, parent?: any, index?: number) {
    if (!node) return;

    // 1. Contextual Link Resolution: [Label](aff:id) or [Label](product:id)
    if (node.type === 'link' && typeof node.url === 'string') {
      if (node.url.startsWith('aff:') || node.url.startsWith('product:')) {
        const resolved = resolveContextualAffiliateOffer(node.url);
        if (resolved) {
          node.url = resolved.url; // exact byte-for-byte tracking URL
          node.data = node.data || {};
          node.data.hProperties = {
            ...(node.data.hProperties || {}),
            rel: 'nofollow noopener sponsored',
            target: '_blank',
            class: 'affiliate-contextual-link',
          };
        } else {
          // Graceful fallback: replace link with its children text so the article never breaks
          if (parent && typeof index === 'number' && Array.isArray(parent.children)) {
            parent.children.splice(index, 1, ...(node.children || []));
            return;
          }
        }
      }
    }

    // 2. Product Box Resolution: [product-box:id] or ::product-box{id="id"}
    if (node.type === 'paragraph' && Array.isArray(node.children) && node.children.length === 1) {
      const child = node.children[0];
      if (child.type === 'text' && typeof child.value === 'string') {
        const text = child.value.trim();

        // Check for ::product-box{id="slug"}
        const directiveMatch = text.match(/^::product-box\{id=["']?([a-z0-9-]+)["']?(?:\s+note=["']([^"']*)["'])?(?:\s+cta=["']([^"']*)["'])?\}$/i);
        if (directiveMatch) {
          const offerId = directiveMatch[1];
          const note = directiveMatch[2];
          const cta = directiveMatch[3];
          const boxHtml = renderAffiliateProductBoxHtml(offerId, { contextNote: note, ctaText: cta });
          if (parent && typeof index === 'number') {
            parent.children[index] = { type: 'html', value: boxHtml || '' };
            return;
          }
        }

        // Check for [product-box:slug]
        const shortcodeMatch = text.match(/^\[product-box:([a-z0-9-]+)\]$/i);
        if (shortcodeMatch) {
          const offerId = shortcodeMatch[1];
          const boxHtml = renderAffiliateProductBoxHtml(offerId);
          if (parent && typeof index === 'number') {
            parent.children[index] = { type: 'html', value: boxHtml || '' };
            return;
          }
        }
      }
    }

    // Recurse into children
    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        visit(node.children[i], node, i);
      }
    }
  }
}

