import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPrimaryProductImage, type CanonicalAffiliateOffer } from './types.ts';

function getCatalogCache(): CanonicalAffiliateOffer[] {
  try {
    const storePath = resolve(process.env.LIFEMODE_OFFERS_PATH || 'data/commerce/products.json');
    const content = readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface ProductBoxRenderOptions {
  contextNote?: string;
  ctaText?: string;
  className?: string;
}

/**
 * Renders a full HTML string for an affiliate product box from central catalog data.
 * Returns empty string if offer is not found, inactive, or not eligible for guides.
 */
export function renderAffiliateProductBoxHtml(
  offerId: string,
  options: ProductBoxRenderOptions = {}
): string {
  const targetId = (offerId || '').trim();
  if (!targetId) return '';

  const catalog = getCatalogCache();
  const offer = catalog.find((o) => o.id === targetId);

  const isActive = offer && (offer.status === 'ACTIVE' || offer.state === 'ACTIVE');
  const isEligible = offer && offer.eligibleForGuides === true;

  if (!offer || !isActive || !isEligible) {
    return '';
  }

  const primary = getPrimaryProductImage(offer);
  const displayTitle = offer.title || offer.name || 'Recommended Product';
  const brandOrMerchant = offer.brand || offer.merchant || '';
  const note = options.contextNote || offer.editorialNote || '';
  const buttonText = options.ctaText || offer.defaultCtaText || 'View recommendation';

  const imageHtml = primary
    ? `<div class="box-image-wrapper"><img src="${escapeHtml(primary.url)}" alt="${escapeHtml(primary.alt || displayTitle)}" class="box-image" loading="lazy" decoding="async" /></div>`
    : `<div class="box-image-wrapper box-image-fallback" aria-hidden="true"><span class="box-fallback-icon">🛍️</span></div>`;

  const kickerHtml = `<span class="box-kicker"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> Editor's Pick</span>`;
  const badgeHtml = offer.badge ? `<span class="box-badge">${escapeHtml(offer.badge)}</span>` : '';
  const brandHtml = brandOrMerchant ? `<span class="box-brand">${escapeHtml(brandOrMerchant)}</span>` : '';
  const descHtml = offer.description ? `<p class="box-description">${escapeHtml(offer.description)}</p>` : '';
  const noteHtml = note ? `<div class="box-editorial-note"><span class="note-label">Why Editors Recommend It:</span><p class="note-text">${escapeHtml(note)}</p></div>` : '';
  const priceHtml = offer.priceRange ? `<span class="box-price">${escapeHtml(offer.priceRange)}</span>` : '';

  return `
<aside class="affiliate-product-box ${options.className || ''}" data-offer-id="${escapeHtml(offer.id)}">
  <div class="box-badge-row">
    ${kickerHtml}
    ${badgeHtml}
    ${brandHtml}
  </div>
  <div class="box-body">
    ${imageHtml}
    <div class="box-info">
      <h4 class="box-title">${escapeHtml(displayTitle)}</h4>
      ${descHtml}
      ${noteHtml}
      <div class="box-action-row">
        ${priceHtml}
        <a href="${escapeHtml(offer.affiliateUrl)}" target="_blank" rel="nofollow noopener sponsored" class="btn-box-cta" aria-label="${escapeHtml(buttonText)}: ${escapeHtml(displayTitle)} (opens in new tab)">
          <span>${escapeHtml(buttonText)}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>
      <span class="box-disclosure-tag">Sponsored recommendation • Editors maintain full independent discretion</span>
    </div>
  </div>
</aside>`.trim();
}

/**
 * Resolves a contextual affiliate link target (e.g. "aff:milk-frother" or "product:milk-frother").
 * Returns exact destination affiliateUrl with rel="nofollow noopener sponsored", or null if inactive/ineligible.
 */
export function resolveContextualAffiliateOffer(
  rawTarget: string
): { url: string; title: string; rel: string } | null {
  if (!rawTarget) return null;
  const match = rawTarget.match(/^(?:aff|product):([a-z0-9-]+)$/i);
  if (!match) return null;

  const offerId = match[1];
  const catalog = getCatalogCache();
  const offer = catalog.find((o) => o.id === offerId);

  const isActive = offer && (offer.status === 'ACTIVE' || offer.state === 'ACTIVE');
  const isEligible = offer && offer.eligibleForGuides === true;

  if (!offer || !isActive || !isEligible) {
    return null;
  }

  return {
    url: offer.affiliateUrl, // byte-for-byte exact affiliate destination URL
    title: offer.title || offer.name || 'Recommended Offer',
    rel: 'nofollow noopener sponsored',
  };
}

/**
 * Replaces both product box shortcodes and contextual affiliate links in Markdown/HTML.
 *
 * Supported formats:
 * - Directives: `::product-box{id="offer-id"}` or `[product-box:offer-id]`
 * - Contextual links: `[Anchor Text](aff:offer-id)` or `[Anchor Text](product:offer-id)`
 */
export function processAffiliateContent(content: string): string {
  if (!content) return '';

  let result = content;

  // 1. Resolve product box shortcodes:
  // Match `::product-box{id="slug"}` or `::product-box{id="slug" note="..."}`
  result = result.replace(/::product-box\{id=["']?([a-z0-9-]+)["']?(?:\s+note=["']([^"']*)["'])?(?:\s+cta=["']([^"']*)["'])?\}/gi, (match, id, note, cta) => {
    const boxHtml = renderAffiliateProductBoxHtml(id, { contextNote: note, ctaText: cta });
    return boxHtml || '';
  });

  // Match `[product-box:slug]`
  result = result.replace(/\[product-box:([a-z0-9-]+)\]/gi, (match, id) => {
    const boxHtml = renderAffiliateProductBoxHtml(id);
    return boxHtml || '';
  });

  // 2. Resolve contextual affiliate links:
  // Match `[Label](aff:slug)` or `[Label](product:slug)`
  result = result.replace(/\[([^\]]+)\]\((?:aff|product):([a-z0-9-]+)\)/gi, (match, label, id) => {
    const resolved = resolveContextualAffiliateOffer(`aff:${id}`);
    if (resolved) {
      return `<a href="${escapeHtml(resolved.url)}" target="_blank" rel="${resolved.rel}" class="affiliate-contextual-link">${label}</a>`;
    }
    // Graceful fallback: render label text without broken link
    return label;
  });

  return result;
}

