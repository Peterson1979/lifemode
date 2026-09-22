import type { AffiliateCatalogItem, CatalogValidationReport } from './types.ts';
import { VALID_PILLARS } from '../types.ts';

/**
 * Standard default affiliate disclosure statement.
 */
export const DEFAULT_AFFILIATE_DISCLOSURE =
  'LifeMode may earn a commission from qualifying purchases through curated editorial links at no additional cost to you.';

/**
 * Central Curated Affiliate Catalog V1 for LifeMode.
 * Contains verified, high-signal categories and approved direct platforms.
 * Strictly avoids fake affiliate IDs, fabricated URLs, or speculative claims.
 */
export const DEFAULT_AFFILIATE_CATALOG: AffiliateCatalogItem[] = [
  // Books & Thoughtful Literature
  {
    id: 'aff-books-curated',
    name: 'Curated Non-Fiction & Independent Books',
    category: 'books',
    applicablePillars: ['life', 'culture', 'wellbeing', 'money', 'tech-ai', 'travel'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['standard', 'guide', 'listicle', 'deep-dive', 'curation'],
    keywords: ['book', 'books', 'reading', 'author', 'literature', 'guidebook', 'monograph'],
    enabled: true,
    merchant: 'Bookshop.org / Independent Booksellers',
    approvedDestinationUrl: 'https://bookshop.org',
    placementSuggestion: 'Curated reading recommendation box or in-text book citation',
    disclosureType: 'standard',
    priority: 85,
  },

  // Specialty Coffee & Kitchen Craft
  {
    id: 'aff-coffee-gear',
    name: 'Specialty Coffee & Precision Brewing Tools',
    category: 'gear',
    applicablePillars: ['life', 'travel'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['standard', 'guide', 'curation', 'listicle'],
    keywords: ['coffee', 'espresso', 'grinder', 'pour over', 'kettle', 'dripper', 'roaster', 'brewing'],
    enabled: true,
    merchant: 'Fellow / Specialty Outlets',
    approvedDestinationUrl: 'https://fellowproducts.com',
    placementSuggestion: 'Featured gear showcase or brewing routine callout',
    disclosureType: 'standard',
    priority: 80,
  },

  // Workspace & Lighting
  {
    id: 'aff-workspace-lighting',
    name: 'Circadian & Minimalist Workspace Lighting',
    category: 'workspace',
    applicablePillars: ['life', 'wellbeing', 'tech-ai'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['guide', 'curation', 'listicle', 'standard'],
    keywords: ['lamp', 'lighting', 'desk light', 'circadian light', 'monitor light bar', 'lumens', 'task light'],
    enabled: true,
    merchant: 'Curated Design Brands',
    placementSuggestion: 'Contextual tool recommendation in workspace/environment section',
    disclosureType: 'standard',
    priority: 75,
  },

  // Audio & Studio Hardware
  {
    id: 'aff-audio-hardware',
    name: 'High-Fidelity Audio & Studio Acoustics',
    category: 'audio',
    applicablePillars: ['tech-ai', 'life'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['curation', 'guide', 'listicle', 'standard'],
    keywords: ['headphones', 'microphone', 'audio interface', 'dac', 'speakers', 'sound', 'monitors', 'iem'],
    enabled: true,
    merchant: 'Audio Pro Retailers',
    placementSuggestion: 'Curated audio gear comparison table or recommendation box',
    disclosureType: 'standard',
    priority: 80,
  },

  // Tech Hardware & Compute Workstations
  {
    id: 'aff-tech-hardware',
    name: 'Workstation Compute & Apple Silicon Hardware',
    category: 'hardware',
    applicablePillars: ['tech-ai'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['guide', 'deep-dive', 'curation', 'listicle'],
    keywords: ['hardware', 'workstation', 'macbook', 'apple silicon', 'gpu', 'ram', 'nvme', 'monitor', 'dock'],
    enabled: true,
    merchant: 'Authorized Hardware Retailers',
    placementSuggestion: 'Hardware specification requirements table or hardware callout box',
    disclosureType: 'standard',
    priority: 85,
  },

  // Developer & Creator Productivity Software
  {
    id: 'aff-software-developer',
    name: 'Developer & Technical Workflow Software',
    category: 'software',
    applicablePillars: ['tech-ai', 'money'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['guide', 'curation', 'listicle', 'standard'],
    keywords: ['software', 'ide', 'editor', 'terminal', 'cloud hosting', 'api tools', 'developer tool', 'saas'],
    enabled: true,
    merchant: 'Verified Developer SaaS Platforms',
    placementSuggestion: 'Tooling recommendation list or software comparison callout',
    disclosureType: 'standard',
    priority: 80,
  },

  // Minimalist Luggage & Travel Packs
  {
    id: 'aff-travel-luggage',
    name: 'Modular Travel Luggage & Carry-On Packs',
    category: 'travel',
    applicablePillars: ['travel', 'life'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['guide', 'curation', 'listicle', 'standard'],
    keywords: ['luggage', 'carry-on', 'backpack', 'packing cubes', 'duffel', 'travel bag', 'weekender'],
    enabled: true,
    merchant: 'Curated Travel Gear',
    placementSuggestion: 'Packing gear breakdown or curated item highlight',
    disclosureType: 'standard',
    priority: 80,
  },

  // Travel Electronics & Adaptors
  {
    id: 'aff-travel-electronics',
    name: 'Minimalist Travel Electronics & Power Solutions',
    category: 'gear',
    applicablePillars: ['travel', 'tech-ai', 'life'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['guide', 'curation', 'listicle'],
    keywords: ['travel adapter', 'power bank', 'gan charger', 'cables', 'esim', 'noise cancelling'],
    enabled: true,
    merchant: 'Verified Electronics Brands',
    placementSuggestion: 'Essential travel gear checklist highlight',
    disclosureType: 'standard',
    priority: 75,
  },

  // Sleep & Rest Optimization
  {
    id: 'aff-wellness-sleep',
    name: 'Ergonomic Rest & Sleep Environment Essentials',
    category: 'wellness-tools',
    applicablePillars: ['wellbeing', 'life'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['guide', 'curation', 'listicle'],
    keywords: ['mattress', 'pillow', 'sleep mask', 'blackout', 'air purifier', 'weighted blanket', 'sleep hygiene'],
    enabled: true,
    merchant: 'Sleep & Ergonomics Brands',
    placementSuggestion: 'Lifestyle environment enhancement recommendation',
    disclosureType: 'standard',
    priority: 75,
    riskRestrictions: {
      allowHighRisk: false,
      disallowedKeywords: ['cure', 'medical', 'prescription', 'supplement', 'diagnose', 'therapy'],
    },
  },

  // Movement & Recovery Tools
  {
    id: 'aff-wellness-recovery',
    name: 'Functional Movement & Mobility Recovery Tools',
    category: 'wellness-tools',
    applicablePillars: ['wellbeing', 'life'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['guide', 'listicle', 'curation'],
    keywords: ['foam roller', 'mobility bands', 'kettlebell', 'massage gun', 'recovery tools', 'mat'],
    enabled: true,
    merchant: 'Functional Movement Brands',
    placementSuggestion: 'Equipment integration in daily routine section',
    disclosureType: 'standard',
    priority: 70,
    riskRestrictions: {
      allowHighRisk: false,
      disallowedKeywords: ['peptides', 'steroid', 'medical treatment', 'clinical'],
    },
  },

  // Personal Budgeting & Financial Software
  {
    id: 'aff-finance-software',
    name: 'Personal Budgeting & Expense Tracking Software',
    category: 'finance-tools',
    applicablePillars: ['money'],
    applicableIntents: ['commercial-investigation', 'transactional'],
    applicableFormats: ['guide', 'curation', 'listicle'],
    keywords: ['budgeting tool', 'expense tracker', 'tax software', 'accounting tool', 'portfolio tracker'],
    enabled: true,
    merchant: 'Verified Financial Software Platforms',
    placementSuggestion: 'Recommended software callout in financial workflow section',
    disclosureType: 'standard',
    priority: 75,
    riskRestrictions: {
      allowHighRisk: false,
      disallowedKeywords: ['crypto bot', 'guaranteed returns', 'forex signal', 'penny stocks', 'trading signals'],
    },
  },
];

/**
 * Validates the schema, uniqueness, and configuration integrity of an affiliate catalog.
 */
export function validateAffiliateCatalog(catalog: AffiliateCatalogItem[]): CatalogValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  if (!Array.isArray(catalog) || catalog.length === 0) {
    return {
      isValid: false,
      totalItems: 0,
      enabledItems: 0,
      errors: ['Affiliate catalog must be a non-empty array of catalog items.'],
      warnings: [],
    };
  }

  let enabledCount = 0;

  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];
    const prefix = `Catalog item #${i + 1} (${item?.id || 'missing-id'}):`;

    if (!item.id || typeof item.id !== 'string' || item.id.trim().length === 0) {
      errors.push(`${prefix} missing or invalid 'id'.`);
    } else {
      if (seenIds.has(item.id)) {
        errors.push(`${prefix} duplicate id '${item.id}'.`);
      }
      seenIds.add(item.id);
    }

    if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
      errors.push(`${prefix} missing or invalid 'name'.`);
    }

    if (!item.category || typeof item.category !== 'string' || item.category.trim().length === 0) {
      errors.push(`${prefix} missing or invalid 'category'.`);
    }

    if (!Array.isArray(item.applicablePillars) || item.applicablePillars.length === 0) {
      errors.push(`${prefix} must specify at least one applicable pillar.`);
    } else {
      for (const pillar of item.applicablePillars) {
        if (!VALID_PILLARS.includes(pillar)) {
          errors.push(`${prefix} invalid pillar '${pillar}'.`);
        }
      }
    }

    if (!Array.isArray(item.applicableIntents) || item.applicableIntents.length === 0) {
      errors.push(`${prefix} must specify at least one applicable commercial intent.`);
    }

    if (!Array.isArray(item.keywords) || item.keywords.length === 0) {
      warnings.push(`${prefix} has no keywords configured; matching will rely solely on category name.`);
    }

    if (item.approvedDestinationUrl) {
      try {
        const parsed = new URL(item.approvedDestinationUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.push(`${prefix} approvedDestinationUrl must use http: or https: protocol.`);
        }
      } catch {
        errors.push(`${prefix} approvedDestinationUrl '${item.approvedDestinationUrl}' is not a valid URL.`);
      }
    }

    if (item.enabled) {
      enabledCount++;
    }
  }

  return {
    isValid: errors.length === 0,
    totalItems: catalog.length,
    enabledItems: enabledCount,
    errors,
    warnings,
  };
}
