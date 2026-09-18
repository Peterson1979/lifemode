import { validateRecipeProvenance, getApprovedSource } from '../sources/registry.ts';
import type { RawSourceRecipe, IngestedRecipeResult } from './types.ts';

/**
 * Formats a RawSourceRecipe into standard LifeMode recipe markdown content.
 */
export function formatRecipeToMarkdown(recipe: RawSourceRecipe, pubDate: Date = new Date()): IngestedRecipeResult {
  const sourceConfig = getApprovedSource(recipe.sourceId);

  const provenanceCheck = validateRecipeProvenance({
    title: recipe.title,
    source: recipe.sourceId,
    sourceUrl: recipe.sourceUrl,
    sourceLicense: recipe.sourceLicense || sourceConfig?.license,
    sourceAuthor: recipe.sourceAuthor,
    originalRecipeId: recipe.slug,
    image: recipe.imagePath,
    imageAlt: recipe.imageAlt,
    imageSource: recipe.imageSource,
    imageSourceUrl: recipe.imageSourceUrl,
    imageLicense: recipe.imageLicense,
    ingredients: recipe.ingredients,
    directions: recipe.directions,
  });

  if (!provenanceCheck.valid) {
    return {
      slug: recipe.slug,
      filePath: `src/content/food-drink/${recipe.slug}.md`,
      frontmatter: {},
      body: '',
      valid: false,
      errors: provenanceCheck.errors,
    };
  }

  const frontmatter: Record<string, any> = {
    title: recipe.title,
    description: recipe.description,
    pubDate: pubDate.toISOString(),
    author: recipe.sourceAuthor ? `${recipe.sourceAuthor} / ${sourceConfig?.name || recipe.sourceId}` : (sourceConfig?.name || 'LifeMode Culinary'),
    tags: Array.from(new Set(['food-drink', 'recipes', ...(recipe.tags || [])])),
    featured: false,
    draft: false,
    format: 'recipe',
    topicId: `lm-food-${recipe.slug}`,
    primaryIntent: 'informational',
    affiliateIntent: false,
    riskLevel: 'low',
    sources: [
      {
        name: `${sourceConfig?.name || recipe.sourceId} Repository`,
        url: recipe.sourceUrl,
      },
    ],
    // Image metadata
    image: recipe.imagePath,
    imageAlt: recipe.imageAlt || `${recipe.title} plated dish photograph`,
    imageSource: recipe.imageSource,
    imageSourceUrl: recipe.imageSourceUrl,
    imageLicense: recipe.imageLicense,

    // Recipe specific fields
    source: sourceConfig?.name || recipe.sourceId,
    sourceUrl: recipe.sourceUrl,
    sourceLicense: recipe.sourceLicense || sourceConfig?.license,
    sourceAuthor: recipe.sourceAuthor,
    originalRecipeId: recipe.slug,
    importedAt: pubDate.toISOString(),

    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.totalTime,
    servings: recipe.servings,
    cuisine: recipe.cuisine,
    mealType: recipe.mealType,
    dietaryTags: recipe.dietaryTags || [],
    ingredients: recipe.ingredients,
    directions: recipe.directions,

    version: 1,
    lifecycleStatus: 'PUBLISHED',
  };

  // Build YAML frontmatter string
  const frontmatterLines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        frontmatterLines.push(`${key}: []`);
      } else if (typeof value[0] === 'object') {
        frontmatterLines.push(`${key}:`);
        for (const item of value) {
          frontmatterLines.push(`  - name: "${item.name.replace(/"/g, '\\"')}"`);
          frontmatterLines.push(`    url: "${item.url}"`);
        }
      } else {
        frontmatterLines.push(`${key}:`);
        for (const item of value) {
          frontmatterLines.push(`  - "${String(item).replace(/"/g, '\\"')}"`);
        }
      }
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      frontmatterLines.push(`${key}: ${value}`);
    } else {
      frontmatterLines.push(`${key}: "${String(value).replace(/"/g, '\\"')}"`);
    }
  }
  frontmatterLines.push('---');

  // Build markdown body
  const bodySections: string[] = [];
  bodySections.push(`## About This Dish\n\n${recipe.description}`);

  if (recipe.notes) {
    bodySections.push(`## Culinary Notes & Technique\n\n${recipe.notes}`);
  }

  bodySections.push(
    `## Ingredients\n\n${recipe.ingredients.map((ing) => `- ${ing}`).join('\n')}`
  );

  bodySections.push(
    `## Instructions\n\n${recipe.directions.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}`
  );

  const fullContent = `${frontmatterLines.join('\n')}\n\n${bodySections.join('\n\n')}\n`;

  return {
    slug: recipe.slug,
    filePath: `src/content/food-drink/${recipe.slug}.md`,
    frontmatter,
    body: fullContent,
    valid: true,
  };
}
