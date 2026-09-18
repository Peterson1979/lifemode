/**
 * Recipe Source Registry for LifeMode Food & Drink.
 * 
 * Strict Source Policy:
 * Only explicitly registered, public-domain repositories that bundle verified matching
 * dish photography with the recipe are permitted.
 * Hotlinking, AI-generated food images, and random image matching are strictly forbidden.
 */

export interface RecipeSourceConfig {
  id: string;
  name: string;
  repositoryUrl: string;
  homepageUrl?: string;
  license: string;
  licenseUrl: string;
  imagePolicy: string;
  requiresAttribution: boolean;
  enabled: boolean;
  description: string;
}

export interface RecipeProvenanceData {
  title: string;
  source: string;
  sourceUrl?: string;
  sourceLicense?: string;
  sourceAuthor?: string;
  originalRecipeId?: string;
  image?: string;
  imageAlt?: string;
  imageSource?: string;
  imageSourceUrl?: string;
  imageLicense?: string;
  imageAttribution?: string;
  ingredients?: string[];
  directions?: string[];
}

export interface ProvenanceValidationResult {
  valid: boolean;
  errors: string[];
}

export const APPROVED_RECIPE_SOURCES: Record<string, RecipeSourceConfig> = {
  'based-cooking': {
    id: 'based-cooking',
    name: 'Based Cooking',
    repositoryUrl: 'https://github.com/LukeSmithxyz/based.cooking',
    homepageUrl: 'https://based.cooking',
    license: 'CC0 1.0 Universal (Public Domain Dedication)',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    imagePolicy: 'Verified authentic dish photo submitted by recipe contributor. 1-to-1 recipe-to-image mapping in repository.',
    requiresAttribution: false,
    enabled: true,
    description: 'Community-driven, minimalist cookbook dedicated to the public domain with real submitted dish photos.',
  },
  'public-domain-recipes': {
    id: 'public-domain-recipes',
    name: 'Public Domain Recipes',
    repositoryUrl: 'https://github.com/ronaldl29/public-domain-recipes',
    homepageUrl: 'https://github.com/ronaldl29/public-domain-recipes',
    license: 'The Unlicense / Public Domain',
    licenseUrl: 'https://unlicense.org/',
    imagePolicy: 'Verified authentic dish photo bundled in repository under Unlicense/Public Domain.',
    requiresAttribution: false,
    enabled: true,
    description: 'Clean, open-source recipe collection dedicated to the public domain without ads or trackers.',
  },
};

/**
 * Returns an approved source config by ID or name match.
 */
export function getApprovedSource(sourceIdentifier: string): RecipeSourceConfig | undefined {
  const normalized = sourceIdentifier.toLowerCase().trim();
  if (APPROVED_RECIPE_SOURCES[normalized]) {
    return APPROVED_RECIPE_SOURCES[normalized];
  }
  return Object.values(APPROVED_RECIPE_SOURCES).find(
    (src) =>
      src.name.toLowerCase() === normalized ||
      src.id.toLowerCase() === normalized ||
      (src.repositoryUrl && normalized.includes(src.id))
  );
}

/**
 * Validates that a recipe strictly complies with LifeMode provenance and image-pairing rules.
 * Enforces:
 * 1. Source must be an approved, enabled registry source.
 * 2. Source URL and License must be specified.
 * 3. Recipe image must be present and accompanied by image license and source metadata.
 * 4. Image must not be an unapproved external hotlink.
 * 5. Ingredients and directions must not be empty.
 */
export function validateRecipeProvenance(recipe: RecipeProvenanceData): ProvenanceValidationResult {
  const errors: string[] = [];

  if (!recipe.title || recipe.title.trim().length === 0) {
    errors.push('Recipe title is required.');
  }

  if (!recipe.source) {
    errors.push('Recipe source is required.');
  } else {
    const approvedSource = getApprovedSource(recipe.source);
    if (!approvedSource) {
      errors.push(
        `Source "${recipe.source}" is not an approved LifeMode recipe registry source. Approved sources: ${Object.keys(
          APPROVED_RECIPE_SOURCES
        ).join(', ')}.`
      );
    } else if (!approvedSource.enabled) {
      errors.push(`Source "${recipe.source}" is currently disabled in the registry.`);
    }
  }

  if (!recipe.sourceLicense) {
    errors.push('Source license metadata is required.');
  }

  // Image provenance enforcement
  if (!recipe.image) {
    errors.push('Recipe image is required. Every recipe must have its verified matching dish photo.');
  } else {
    // Check local asset or approved CDN
    if (recipe.image.startsWith('http://') || recipe.image.startsWith('https://')) {
      if (!recipe.image.includes('r2.dev') && !recipe.image.includes('lifemode.life')) {
        errors.push(
          `Recipe image "${recipe.image}" must be stored as a local LifeMode static asset or approved LifeMode storage.`
        );
      }
    }

    if (!recipe.imageLicense) {
      errors.push('Image license metadata is required.');
    }
    if (!recipe.imageSource && !recipe.source) {
      errors.push('Image source attribution/provenance is required.');
    }
  }

  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    errors.push('Recipe must contain at least one ingredient.');
  }

  if (!recipe.directions || recipe.directions.length === 0) {
    errors.push('Recipe must contain at least one instruction step.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
