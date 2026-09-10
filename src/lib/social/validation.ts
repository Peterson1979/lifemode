import type { GeneratedSocialContent, SocialVisualAsset } from './types.ts';
import { hasLeakedInternalMetadata } from '../editorial/sanitization.ts';

export interface SocialValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const FORBIDDEN_BRAND_VARIANTS = [
  /\bLife\s+Mode\b/i,
  /\bLifemode\b/,
  /\bLifeMode\s+Media\b/i,
  /\bLifeMode\s+Tested\b/i,
];

const HUNGARIAN_MARKER_WORDS = [
  /\b(és|hogy|szerint|egy|vagy|ez|nem|van|mint|csak|már|kell|nagyon|lehet|minden|mindig|mikor|akkor)\b/i,
  /\b(magyar|budapest|életmód|cikk|útmutató|tippek)\b/i,
];

const FORBIDDEN_METADATA_PATTERNS = [
  /\bInternal\s+Links\b/i,
  /\bAffiliate\s+Intents?\b/i,
  /\bSocial\s+Hooks?\b/i,
  /\bSEO\s+Targets?\b/i,
  /\bTopic\s*ID\b/i,
  /\bPriority\s*Tier\b/i,
  /\bOpportunity\s*Type\b/i,
  /\bScore\s*:\s*\d+/i,
  /\bTelemetry\b/i,
];

/**
 * Validates generated social copy against brand, linguistic, metadata, and structural standards.
 */
export function validateSocialContent(content: GeneratedSocialContent): SocialValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Required fields
  if (!content.topicId || !content.topicId.trim()) errors.push('Missing required field: topicId');
  if (!content.pillar || !content.pillar.trim()) errors.push('Missing required field: pillar');
  if (!content.title || !content.title.trim()) errors.push('Missing required field: title');
  if (!content.shortCaption || !content.shortCaption.trim()) errors.push('Missing required field: shortCaption');
  if (!content.visualConcept || !content.visualConcept.trim()) errors.push('Missing required field: visualConcept');

  const allText = [
    content.title,
    content.shortCaption,
    content.extendedCaption || '',
    content.callToAction || '',
    content.imageText?.headline || '',
    content.imageText?.subheadline || '',
  ].join(' ');

  // 2. Brand spelling validation
  // Check if any forbidden variant is used
  for (const pattern of FORBIDDEN_BRAND_VARIANTS) {
    if (pattern.test(allText)) {
      // Re-check if it's exact valid "LifeMode"
      const matches = allText.match(pattern);
      if (matches && matches[0] !== 'LifeMode') {
        errors.push(`Forbidden brand spelling found: "${matches[0]}". Must be exactly "LifeMode".`);
      }
    }
  }

  // 3. Language validation (English only)
  for (const pattern of HUNGARIAN_MARKER_WORDS) {
    const match = allText.match(pattern);
    if (match) {
      errors.push(`Non-English/Hungarian term detected: "${match[0]}". Social content must be strictly global English.`);
      break;
    }
  }

  // 4. Internal metadata leak check
  if (hasLeakedInternalMetadata(allText)) {
    errors.push('Internal editorial planning metadata leaked into social content body.');
  }

  for (const pattern of FORBIDDEN_METADATA_PATTERNS) {
    const match = allText.match(pattern);
    if (match) {
      errors.push(`Forbidden internal metadata pattern detected: "${match[0]}".`);
      break;
    }
  }

  // 5. Length constraints
  if (content.shortCaption && content.shortCaption.length < 30) {
    errors.push(`Short caption is too brief (${content.shortCaption.length} chars). Minimum is 30.`);
  }
  if (content.shortCaption && content.shortCaption.length > 600) {
    errors.push(`Short caption exceeds recommended maximum (${content.shortCaption.length} chars). Limit is 600.`);
  }
  if (content.extendedCaption && content.extendedCaption.length > 2200) {
    errors.push(`Extended caption exceeds Instagram limit (${content.extendedCaption.length} chars). Limit is 2200.`);
  }

  // 6. Hashtags validation
  if (!Array.isArray(content.hashtags) || content.hashtags.length < 2) {
    errors.push('Social content must include at least 2 relevant hashtags.');
  } else {
    const hasLifeModeTag = content.hashtags.some((h) => h.toLowerCase() === '#lifemode' || h.toLowerCase() === 'lifemode');
    if (!hasLifeModeTag) {
      warnings.push('Hashtags list does not include #LifeMode.');
    }
  }

  // 7. Destination URL
  if (content.destinationUrl && !content.destinationUrl.startsWith('http')) {
    errors.push(`Malformed destination URL: "${content.destinationUrl}". Must start with http:// or https://.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates generated visual media assets.
 */
export function validateSocialVisualAsset(asset: SocialVisualAsset): SocialValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!asset.assetId) errors.push('Missing required visual assetId');
  if (!asset.assetHash) errors.push('Missing required assetHash');

  // Dimension validation
  if (asset.format === '1080x1350') {
    if (asset.width !== 1080 || asset.height !== 1350) {
      errors.push(`Invalid dimensions for 1080x1350 format: received ${asset.width}x${asset.height}`);
    }
  } else if (asset.format === '1080x1080') {
    if (asset.width !== 1080 || asset.height !== 1080) {
      errors.push(`Invalid dimensions for 1080x1080 format: received ${asset.width}x${asset.height}`);
    }
  } else {
    errors.push(`Unsupported visual asset format: ${(asset as any).format}`);
  }

  // Headline overlay length
  if (asset.headlineOverlay) {
    const wordCount = asset.headlineOverlay.trim().split(/\s+/).length;
    if (wordCount > 14) {
      errors.push(`Visual text overlay contains too many words (${wordCount}). Maximum is 12-14 words.`);
    }

    for (const pattern of FORBIDDEN_METADATA_PATTERNS) {
      if (pattern.test(asset.headlineOverlay)) {
        errors.push(`Forbidden internal metadata in visual text overlay: "${asset.headlineOverlay}"`);
        break;
      }
    }
  }

  // Media payload presence
  if (!asset.buffer && !asset.url) {
    errors.push('Visual asset has neither a data buffer nor a valid image URL.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
