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
 * Extensible and backward-compatible with automated Content Engine metadata.
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
  image: z.string().optional(),
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
  life: createPillarCollection('life'),
  travel: createPillarCollection('travel'),
  'tech-ai': createPillarCollection('tech-ai'),
  money: createPillarCollection('money'),
  wellbeing: createPillarCollection('wellbeing'),
  discover: createPillarCollection('discover'),
  now: createPillarCollection('now'),
};
