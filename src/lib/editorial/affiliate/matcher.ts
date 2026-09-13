import type { ContentBrief, CommercialIntentType } from '../types.ts';
import type {
  AffiliateCatalogItem,
  MatchedAffiliateOpportunity,
  AffiliateMatchResult,
  AffiliateMatchOptions,
} from './types.ts';
import { DEFAULT_AFFILIATE_CATALOG, DEFAULT_AFFILIATE_DISCLOSURE } from './catalog.ts';

/**
 * Calculates a deterministic match score (0-100) between an editorial brief and a catalog item.
 * Strictly uses content attributes, intent, category alignment, format, and risk.
 * Never invents popularity, conversion metrics, or product superiority claims.
 */
export function calculateAffiliateMatchScore(
  brief: ContentBrief,
  item: AffiliateCatalogItem
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const intentType: CommercialIntentType = brief.affiliateOpportunities?.intentType || 'none';
  const productCategories = (brief.affiliateOpportunities?.productCategories || []).map((c) => c.toLowerCase());
  const briefText = [
    brief.titleAngle,
    brief.searchTargets?.primaryKeyword || '',
    ...(brief.searchTargets?.secondaryKeywords || []),
    brief.readerProblem || '',
    brief.recommendedAngle || '',
  ]
    .join(' ')
    .toLowerCase();

  // 1. Commercial Intent Strength (0 - 30 points)
  if (intentType === 'transactional') {
    score += 30;
    reasons.push('High transactional search intent');
  } else if (intentType === 'commercial-investigation') {
    score += 20;
    reasons.push('Commercial investigation intent');
  } else if (brief.affiliateOpportunities?.hasAffiliateIntent) {
    score += 15;
    reasons.push('General commercial interest');
  }

  // 2. Category Match (0 - 25 points)
  const itemCategory = item.category.toLowerCase();
  if (productCategories.includes(itemCategory)) {
    score += 25;
    reasons.push(`Exact product category match (${item.category})`);
  } else if (productCategories.some((c) => itemCategory.includes(c) || c.includes(itemCategory))) {
    score += 15;
    reasons.push(`Partial category affinity (${item.category})`);
  }

  // 3. Keyword Relevance in Title & Reader Need (0 - 20 points)
  const matchedKeywords: string[] = [];
  for (const kw of item.keywords) {
    const cleanKw = kw.toLowerCase().trim();
    if (cleanKw.length > 0 && briefText.includes(cleanKw)) {
      matchedKeywords.push(cleanKw);
    }
  }

  if (matchedKeywords.length >= 3) {
    score += 20;
    reasons.push(`Strong keyword match: ${matchedKeywords.slice(0, 3).join(', ')}`);
  } else if (matchedKeywords.length > 0) {
    score += 10 + matchedKeywords.length * 3;
    reasons.push(`Keyword match: ${matchedKeywords.join(', ')}`);
  }

  // 4. Pillar Alignment (0 - 10 points)
  if (item.applicablePillars.includes(brief.pillar)) {
    score += 10;
    reasons.push(`Pillar alignment (${brief.pillar})`);
  }

  // 5. Format Fit (0 - 10 points)
  if (item.applicableFormats && item.applicableFormats.includes(brief.format)) {
    score += 10;
    reasons.push(`Format fit (${brief.format})`);
  } else if (['curation', 'listicle', 'guide'].includes(brief.format)) {
    score += 8;
    reasons.push(`Compatible format (${brief.format})`);
  } else if (brief.format === 'standard') {
    score += 5;
  }

  // 6. Evidence Grounding Bonus (0 - 5 points)
  if (brief.evidence && brief.evidence.length > 0) {
    score += 5;
  }

  // 7. Base Catalog Priority (0 - 10 points)
  const priorityBoost = Math.min(10, Math.round((item.priority || 70) * 0.1));
  score += priorityBoost;

  // 8. Risk Level Adjustments (-30 to 0 points)
  if (brief.riskLevel === 'high') {
    score -= 30;
  } else if (brief.riskLevel === 'medium') {
    score -= 10;
  }

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: finalScore,
    reasons,
  };
}

/**
 * Checks safety restrictions and disallowance rules for a catalog item against a brief.
 */
export function isAffiliateItemAllowed(
  brief: ContentBrief,
  item: AffiliateCatalogItem
): { allowed: boolean; reason?: string } {
  if (!item.enabled) {
    return { allowed: false, reason: 'Catalog item is disabled.' };
  }

  // Pillar applicability check
  if (!item.applicablePillars.includes(brief.pillar)) {
    return { allowed: false, reason: `Item not applicable to pillar '${brief.pillar}'.` };
  }

  const intentType = brief.affiliateOpportunities?.intentType || 'none';
  // Commercial intent check
  if (!item.applicableIntents.includes(intentType) && !brief.affiliateOpportunities?.hasAffiliateIntent) {
    return { allowed: false, reason: `Item requires commercial intent, but brief is '${intentType}'.` };
  }

  // High-Risk Topic Restrictions
  if (brief.riskLevel === 'high' && !item.riskRestrictions?.allowHighRisk) {
    return {
      allowed: false,
      reason: 'High-risk editorial domain: affiliate recommendation restricted for safety.',
    };
  }

  // Disallowed keywords check (e.g. medical cures, guaranteed financial returns)
  if (item.riskRestrictions?.disallowedKeywords && item.riskRestrictions.disallowedKeywords.length > 0) {
    const briefText = `${brief.titleAngle} ${brief.readerProblem || ''} ${(brief.searchTargets?.secondaryKeywords || []).join(' ')}`.toLowerCase();
    for (const disallowed of item.riskRestrictions.disallowedKeywords) {
      if (briefText.includes(disallowed.toLowerCase())) {
        return {
          allowed: false,
          reason: `Topic text matches restricted safety term '${disallowed}'.`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Matches an Editorial Brief V2 against the central affiliate catalog.
 * Produces structured, scored affiliate guidance without forcing unaligned opportunities.
 */
export function matchAffiliateOpportunities(
  brief: ContentBrief,
  catalog: AffiliateCatalogItem[] = DEFAULT_AFFILIATE_CATALOG,
  options: AffiliateMatchOptions = {}
): AffiliateMatchResult {
  const minScore = options.minScoreThreshold ?? 40;
  const maxOpps = options.maxOpportunities ?? 3;
  const intentType: CommercialIntentType = brief.affiliateOpportunities?.intentType || 'none';

  // If the brief has zero commercial intent and is purely informational/navigational, do not force matches
  const hasCommercialIntent =
    intentType === 'transactional' ||
    intentType === 'commercial-investigation' ||
    brief.affiliateOpportunities?.hasAffiliateIntent === true;

  if (!hasCommercialIntent) {
    return {
      hasMatches: false,
      intentType,
      matchedOpportunities: [],
      disclosureRequired: false,
      editorialGuidance: [
        'Purely informational topic: no commercial or affiliate recommendations should be included.',
      ],
      safetyConstraints: [
        'Do not insert affiliate links, product placement boxes, or commercial callouts.',
      ],
    };
  }

  const activeCatalog = options.customCatalog || catalog;
  const matchedOpportunities: MatchedAffiliateOpportunity[] = [];

  for (const item of activeCatalog) {
    const safetyCheck = isAffiliateItemAllowed(brief, item);
    if (!safetyCheck.allowed) {
      continue;
    }

    const { score, reasons } = calculateAffiliateMatchScore(brief, item);

    if (score >= minScore) {
      const isLinkable = Boolean(item.approvedDestinationUrl && item.approvedDestinationUrl.trim().length > 0);

      matchedOpportunities.push({
        programId: item.id,
        name: item.name,
        category: item.category,
        merchant: item.merchant,
        score,
        matchReasons: reasons,
        placementSuggestion:
          item.placementSuggestion || 'Subtle, context-aware mention in relevant section',
        approvedDestinationUrl: isLinkable ? item.approvedDestinationUrl : undefined,
        isLinkable,
        disclosureRequired: isLinkable || intentType === 'transactional',
      });
    }
  }

  // Sort matched opportunities by descending match score
  matchedOpportunities.sort((a, b) => b.score - a.score);

  const topOpportunities = matchedOpportunities.slice(0, maxOpps);
  const hasMatches = topOpportunities.length > 0;
  const topOpportunity = topOpportunities[0];

  const disclosureRequired = hasMatches && topOpportunities.some((o) => o.disclosureRequired);
  const disclosureText = disclosureRequired
    ? options.customDisclosureText || DEFAULT_AFFILIATE_DISCLOSURE
    : undefined;

  // Build editorial guidance statements
  const editorialGuidance: string[] = [];
  if (hasMatches) {
    editorialGuidance.push(
      `Commercial intent (${intentType}) identified: integrate subtle, high-signal product/tool context.`
    );
    for (const opp of topOpportunities) {
      const linkStatus = opp.isLinkable ? `[Approved URL: ${opp.approvedDestinationUrl}]` : '[Editorial mention only, no live URL]';
      editorialGuidance.push(
        `- ${opp.name} (${opp.category}): ${opp.placementSuggestion} ${linkStatus}`
      );
    }
  }

  // Build safety constraints
  const safetyConstraints: string[] = [
    'NEVER invent affiliate URLs, tracking IDs, discount codes, or merchant links not explicitly provided in the approved destination list.',
    'Unresolved product/service opportunities must remain conceptual or brand mentions and must NEVER be fabricated into URLs.',
    'Product and tool recommendations must be organic, secondary to editorial quality, and strictly useful to the reader.',
    ...(brief.doNotClaim || []),
  ];

  return {
    hasMatches,
    intentType,
    primaryCategory: topOpportunity?.category,
    matchedOpportunities: topOpportunities,
    topOpportunity,
    disclosureRequired,
    disclosureText,
    editorialGuidance,
    safetyConstraints,
  };
}
