import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

export const ArticleFormatEnum = z.enum([
  'standard',
  'guide',
  'listicle',
  'deep-dive',
  'dispatch',
  'curation',
  'recipe',
]);

export const SearchIntentEnum = z.enum([
  'informational',
  'commercial',
  'navigational',
  'transactional',
  'inspirational',
]);

export const RiskLevelEnum = z.enum(['low', 'medium', 'high']);

/**
 * Standard schema for LifeMode editorial articles across all pillars.
 * Extensible and backward-compatible with automated Content Engine metadata
 * and culinary recipe provenance models.
 */
export const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  author: z.string().default('LifeMode Editorial'),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),

  // Content Engine metadata (Optional / Defaulted)
  format: ArticleFormatEnum.default('standard'),
  topicId: z.string().optional(),
  audience: z.string().optional(),
  primaryIntent: SearchIntentEnum.default('informational'),
  secondaryIntent: z.string().optional(),
  affiliateIntent: z.boolean().default(false),
  riskLevel: RiskLevelEnum.default('low'),
  sources: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
      })
    )
    .default([]),

  // Image & Visual Pipeline metadata (Optional)
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  imagePrompt: z.string().optional(),
  imageSource: z.string().optional(),
  imageSourceUrl: z.string().optional(),
  imageLicense: z.string().optional(),
  imageAttribution: z.string().optional(),

  // Recipe-specific culinary and provenance fields (Optional)
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceLicense: z.string().optional(),
  sourceAuthor: z.string().optional(),
  originalRecipeId: z.string().optional(),
  importedAt: z.coerce.date().optional(),

  prepTime: z.string().optional(),
  cookTime: z.string().optional(),
  totalTime: z.string().optional(),
  servings: z.union([z.string(), z.number()]).optional(),
  cuisine: z.string().optional(),
  mealType: z.string().optional(),
  dietaryTags: z.array(z.string()).optional(),
  ingredients: z.array(z.string()).optional(),
  directions: z.array(z.string()).optional(),

  // Owned Project routing (Optional explicit target or 'none')
  targetProject: z
    .enum(['ai-zodiac', 'dreamly-ai', 'get-ai-set', 'none'])
    .optional(),

  readingTime: z.string().optional(),
  version: z.number().default(1),
  lifecycleStatus: z
    .enum(['DRAFT', 'REVIEWED', 'APPROVED', 'STORED', 'PUBLISHED', 'ARCHIVED'])
    .default('STORED'),
});

export type ArticleFrontmatter = z.infer<typeof articleSchema>;

const createPillarCollection = (pillarName: string) =>
  defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: `./src/content/${pillarName}` }),
    schema: articleSchema,
  });

export const collections = {
  style: createPillarCollection('style'),
  life: createPillarCollection('life'),
  travel: createPillarCollection('travel'),
  'food-drink': createPillarCollection('food-drink'),
  'tech-ai': createPillarCollection('tech-ai'),
  money: createPillarCollection('money'),
  wellbeing: createPillarCollection('wellbeing'),
  culture: createPillarCollection('culture'),
};
