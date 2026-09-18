import fs from 'node:fs';
import path from 'node:path';
import { CURATED_SEED_RECIPES } from '../src/lib/food/importer/curated-seed.ts';
import { formatRecipeToMarkdown } from '../src/lib/food/importer/pipeline.ts';

/**
 * Static Ingestion Script for Approved LifeMode Public Domain Recipes.
 * Ingests curated recipes with complete provenance and dish photography.
 */
export function runRecipeIngestion(outputDir = path.resolve(process.cwd(), 'src/content/food-drink')) {
  console.log(`[Recipe Ingestion] Starting ingestion into ${outputDir}...`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let successCount = 0;
  let errorCount = 0;

  for (const rawRecipe of CURATED_SEED_RECIPES) {
    const result = formatRecipeToMarkdown(rawRecipe);

    if (!result.valid) {
      console.error(`[Recipe Ingestion] FAILED for "${rawRecipe.slug}":`, result.errors);
      errorCount++;
      continue;
    }

    const targetFilePath = path.join(outputDir, `${result.slug}.md`);
    fs.writeFileSync(targetFilePath, result.body, 'utf-8');
    console.log(`[Recipe Ingestion] Wrote ${targetFilePath}`);
    successCount++;
  }

  console.log(`[Recipe Ingestion] Ingested ${successCount} recipes successfully (${errorCount} errors).`);
  return { successCount, errorCount };
}

// Execute directly if run via node/tsx
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('ingest-recipes')) {
  runRecipeIngestion();
}
