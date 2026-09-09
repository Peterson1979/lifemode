import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * Standard schema for LifeMode editorial articles across all pillars.
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
