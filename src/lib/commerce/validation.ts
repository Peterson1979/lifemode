import type { CuratedProduct } from './types';

export const VALID_COMMERCE_CATEGORIES = [
  'kitchen',
  'home',
  'cleaning',
  'storage',
  'style',
  'self-care',
  'tech',
] as const;

export type CommerceCategory = typeof VALID_COMMERCE_CATEGORIES[number];

export const ASIN_REGEX = /^[A-Z0-9]{10}$/;
export const ID_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const AFFILIATE_URL_REGEX = /^https:\/\/(?:link\.amazon\/[A-Za-z0-9_-]+|(?:www\.)?amazon\.[a-z.]+\/[^\s]+)$/;

export interface ProductValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  hasImage: boolean;
}

export interface RegistryValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  totalProducts: number;
  verifiedAsinCount: number;
  withImageCount: number;
  pendingImageCount: number;
  productsMissingImages: string[];
}

/**
 * Validates an individual CuratedProduct record for identity, format, and content requirements.
 */
export function validateCuratedProduct(
  product: CuratedProduct,
  options: { requireImage?: boolean; requireAsin?: boolean } = {}
): ProductValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!product || typeof product !== 'object') {
    return {
      isValid: false,
      errors: ['Product record must be a non-null object.'],
      warnings: [],
      hasImage: false,
    };
  }

  // 1. Stable Identity & Slug Check
  if (!product.id || typeof product.id !== 'string' || !ID_SLUG_REGEX.test(product.id.trim())) {
    errors.push(`Invalid or missing product id: "${product.id}". Must be a kebab-case slug (e.g., "iuv-western-cowgirl-boots").`);
  }

  // 2. Product Name / Title
  if (!product.name || typeof product.name !== 'string' || product.name.trim().length < 5) {
    errors.push(`Product "${product.id || 'unknown'}": Name must be at least 5 characters long.`);
  }

  // 3. Category Validation
  if (!product.category || !VALID_COMMERCE_CATEGORIES.includes(product.category as CommerceCategory)) {
    errors.push(
      `Product "${product.id || 'unknown'}": Invalid category "${product.category}". Must be one of: ${VALID_COMMERCE_CATEGORIES.join(', ')}.`
    );
  }

  // 4. Concise Factual Description
  if (!product.description || typeof product.description !== 'string' || product.description.trim().length < 15) {
    errors.push(`Product "${product.id || 'unknown'}": Description must be at least 15 characters long.`);
  }

  // 5. Objective Editorial Note ("Why it's worth it")
  if (!product.editorialNote || typeof product.editorialNote !== 'string' || product.editorialNote.trim().length < 15) {
    errors.push(`Product "${product.id || 'unknown'}": Editorial note must be at least 15 characters long.`);
  }

  // 6. Affiliate URL Format
  if (!product.affiliateUrl || typeof product.affiliateUrl !== 'string' || !AFFILIATE_URL_REGEX.test(product.affiliateUrl.trim())) {
    errors.push(`Product "${product.id || 'unknown'}": Invalid affiliate URL "${product.affiliateUrl}". Must be a valid Amazon or link.amazon URL.`);
  }

  // 7. ASIN Validation (Required for Amazon affiliate links or when requireAsin is set)
  const isAmazonUrl = typeof product.affiliateUrl === 'string' && (product.affiliateUrl.includes('amazon') || product.affiliateUrl.includes('link.amazon'));
  if (options.requireAsin || isAmazonUrl) {
    if (!product.asin || typeof product.asin !== 'string' || !ASIN_REGEX.test(product.asin.trim())) {
      errors.push(`Product "${product.id || 'unknown'}": Missing or invalid ASIN "${product.asin}". Must be a 10-character alphanumeric Amazon ASIN.`);
    }
  }

  // 8. Optional Brand & Badge Strings
  if (product.brand !== undefined && (typeof product.brand !== 'string' || product.brand.trim().length === 0)) {
    errors.push(`Product "${product.id || 'unknown'}": Brand if specified must be a non-empty string.`);
  }

  if (product.badge !== undefined && (typeof product.badge !== 'string' || product.badge.trim().length === 0)) {
    errors.push(`Product "${product.id || 'unknown'}": Badge if specified must be a non-empty string.`);
  }

  // 9. Image URL Validation
  const hasImage = Boolean(product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim().length > 0);
  if (hasImage) {
    const img = product.imageUrl!.trim();
    const isValidPath = img.startsWith('/') || img.startsWith('http://') || img.startsWith('https://');
    if (!isValidPath) {
      errors.push(`Product "${product.id || 'unknown'}": Invalid imageUrl "${img}". Must be an absolute path or http(s) URL.`);
    }
  } else {
    if (options.requireImage) {
      errors.push(`Product "${product.id || 'unknown'}": Missing required product image.`);
    } else {
      warnings.push(`Product "${product.id || 'unknown'}": No image provided; rendering will safely omit image until verified asset is linked.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    hasImage,
  };
}

/**
 * Validates the full CURATED_PRODUCTS registry against identity collisions,
 * duplicate URLs, duplicate ASINs, and malformed entries.
 */
export function validateCuratedProductRegistry(
  registry: Record<string, CuratedProduct>,
  options: { requireImage?: boolean; requireAsin?: boolean } = {}
): RegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Map<string, string>(); // url -> id
  const seenAsins = new Map<string, string>(); // asin -> id
  const productsMissingImages: string[] = [];

  let withImageCount = 0;
  let verifiedAsinCount = 0;

  const entries = Object.entries(registry || {});
  const totalProducts = entries.length;

  for (const [key, product] of entries) {
    // Check dictionary key matches product.id
    if (key !== product?.id) {
      errors.push(`Registry key mismatch: key "${key}" does not match product.id "${product?.id}".`);
    }

    // Validate single product
    const prodResult = validateCuratedProduct(product, options);
    if (!prodResult.isValid) {
      errors.push(...prodResult.errors);
    }
    warnings.push(...prodResult.warnings);

    if (prodResult.hasImage) {
      withImageCount++;
    } else {
      productsMissingImages.push(product?.id || key);
    }

    if (product?.asin && ASIN_REGEX.test(product.asin.trim())) {
      verifiedAsinCount++;
    }

    // Check duplicate ID
    if (product?.id) {
      if (seenIds.has(product.id)) {
        errors.push(`Duplicate product ID detected: "${product.id}".`);
      }
      seenIds.add(product.id);
    }

    // Check duplicate affiliate URL
    if (product?.affiliateUrl) {
      const normalizedUrl = product.affiliateUrl.trim().toLowerCase();
      if (seenUrls.has(normalizedUrl)) {
        errors.push(
          `Duplicate affiliate URL detected: "${product.affiliateUrl}" is used by both "${seenUrls.get(normalizedUrl)}" and "${product.id}".`
        );
      } else {
        seenUrls.set(normalizedUrl, product.id);
      }
    }

    // Check duplicate ASIN
    if (product?.asin) {
      const normalizedAsin = product.asin.trim().toUpperCase();
      if (seenAsins.has(normalizedAsin)) {
        errors.push(
          `Duplicate ASIN detected: "${product.asin}" is assigned to both "${seenAsins.get(normalizedAsin)}" and "${product.id}".`
        );
      } else {
        seenAsins.set(normalizedAsin, product.id);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalProducts,
    verifiedAsinCount,
    withImageCount,
    pendingImageCount: productsMissingImages.length,
    productsMissingImages,
  };
}

/**
 * Asserts that the registry is valid; throws Error if invalid.
 */
export function assertValidCuratedProductRegistry(
  registry: Record<string, CuratedProduct>,
  options: { requireImage?: boolean; requireAsin?: boolean } = {}
): void {
  const result = validateCuratedProductRegistry(registry, options);
  if (!result.isValid) {
    throw new Error(`CuratedProduct registry validation failed:\n- ${result.errors.join('\n- ')}`);
  }
}
