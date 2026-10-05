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

export const infographicStepSchema = z.object({
  stepNumber: z.union([z.number(), z.string()]).optional(),
  badge: z.string().optional(),
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  variant: z.enum(['default', 'neutral', 'danger', 'safe', 'warning', 'highlight']).default('default'),
});

export const infographicFormulaSchema = z.object({
  expression: z.string(),
  variables: z.array(z.object({
    symbol: z.string().optional(),
    name: z.string(),
    description: z.string(),
  })).optional(),
  presets: z.array(z.object({
    label: z.string(),
    value: z.string(),
    note: z.string().optional(),
    icon: z.string().optional(),
  })).optional(),
});

export const infographicDecisionSchema = z.object({
  question: z.string(),
  branches: z.array(z.object({
    condition: z.string(),
    icon: z.string().optional(),
    recommendation: z.string(),
    sizeOrSpec: z.string().optional(),
    reason: z.string(),
    tag: z.string().optional(),
    variant: z.enum(['default', 'primary', 'success', 'accent', 'danger']).default('default'),
  })),
});

export const infographicComparisonSchema = z.object({
  headers: z.array(z.string()).optional(),
  columns: z.array(z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    badge: z.string().optional(),
    tag: z.string().optional(),
    icon: z.string().optional(),
    isRecommended: z.boolean().optional(),
    features: z.array(z.object({
      label: z.string(),
      value: z.string(),
      highlight: z.boolean().optional(),
    })).optional(),
    verdict: z.string().optional(),
  })).optional(),
  rows: z.array(z.array(z.string())).optional(),
});

export const infographicTimelineSchema = z.object({
  events: z.array(z.object({
    timeOrEra: z.string(),
    title: z.string(),
    description: z.string(),
    badge: z.string().optional(),
    icon: z.string().optional(),
    highlight: z.boolean().optional(),
  })),
  summary: z.string().optional(),
});

export const infographicSchema = z.object({
  type: z.enum([
    'process-flow',
    'mechanism',
    'safety-pathway',
    'formula',
    'decision-tree',
    'comparison',
    'timeline',
  ]),
  kicker: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  steps: z.array(infographicStepSchema).optional(),
  outcome: z.object({
    icon: z.string().optional(),
    title: z.string(),
    description: z.string(),
    badge: z.string().optional(),
  }).optional(),
  formula: infographicFormulaSchema.optional(),
  decisionTree: infographicDecisionSchema.optional(),
  comparison: infographicComparisonSchema.optional(),
  timeline: infographicTimelineSchema.optional(),
});

export type EditorialInfographicData = z.infer<typeof infographicSchema>;

/**
 * Standard schema for LifeMode editorial articles (e.g. Food & Drink, Health, Wealth, Home, Life, Tech & AI).
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

  // Content Engine metadata
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

  // Image & Visual Pipeline metadata
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  imagePrompt: z.string().optional(),
  imageSource: z.string().optional(),
  imageSourceUrl: z.string().optional(),
  imageLicense: z.string().optional(),
  imageAttribution: z.string().optional(),
  infographic: infographicSchema.optional(),

  // Recipe-specific culinary and provenance fields
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

  targetProject: z
    .enum(['ai-zodiac', 'dreamly-ai', 'get-ai-set', 'none'])
    .optional(),

  readingTime: z.string().optional(),
  dailyIdeasPicks: z.array(z.string()).optional(),
  version: z.number().default(1),
  lifecycleStatus: z
    .enum(['DRAFT', 'REVIEWED', 'APPROVED', 'STORED', 'PUBLISHED', 'ARCHIVED'])
    .default('STORED'),
});

export type ArticleFrontmatter = z.infer<typeof articleSchema>;

const guides = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    category: z.enum(['food-kitchen', 'cleaning-laundry', 'home-maintenance', 'storage-organization', 'everyday-how-to']),
    contentType: z.enum(['reference', 'decision']).default('reference'),
    publishedDate: z.string(),
    updatedDate: z.string(),
    readTime: z.string().default('4 min read'),
    author: z.object({
      name: z.string().default('LifeMode Editorial Team'),
      role: z.string().default('Practical Knowledge Researcher'),
      avatar: z.string().optional(),
    }).default({ name: 'LifeMode Editorial Team', role: 'Practical Knowledge Researcher' }),
    reviewedBy: z.object({
      name: z.string().default('Household Systems Review Board'),
      role: z.string().default('Technical QA & Fact Checking'),
      credentials: z.string().optional(),
    }).default({ name: 'Household Systems Review Board', role: 'Technical QA & Fact Checking' }),
    quickSummary: z.string(),
    difficulty: z.enum(['Easy', 'Moderate', 'Advanced']).optional(),
    timeNeeded: z.string().optional(),
    keyFacts: z.array(z.object({
      label: z.string(),
      value: z.string(),
      icon: z.string().optional(),
    })).optional(),
    materialsNeeded: z.array(z.string()).optional(),
    toolsNeeded: z.array(z.string()).optional(),
    steps: z.array(z.object({
      stepNumber: z.number(),
      title: z.string(),
      description: z.string(),
      tip: z.string().optional(),
      warning: z.string().optional(),
    })).optional(),
    commonMistakes: z.array(z.object({
      mistake: z.string(),
      whyItMatters: z.string(),
      howToFix: z.string(),
    })).optional(),
    proTips: z.array(z.string()).optional(),
    decisionCriteria: z.array(z.object({
      criterion: z.string(),
      importance: z.string(),
      advice: z.string(),
    })).optional(),
    comparisonTable: z.object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })?.optional(),
    faqs: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).optional(),
    sources: z.array(z.object({
      title: z.string(),
      url: z.string().optional(),
      publisher: z.string(),
      note: z.string().optional(),
    })).optional(),
    relatedGuides: z.array(z.string()).optional(),
    relatedTools: z.array(z.string()).optional(),
    relatedChecklists: z.array(z.string()).optional(),
    dailyIdeasPicks: z.array(z.string()).optional(),
    infographic: infographicSchema.optional(),
    video: z.object({
      type: z.enum(['youtube', 'local', 'animated-svg']),
      videoId: z.string().optional(),
      url: z.string().optional(),
      title: z.string(),
      description: z.string(),
      thumbnail: z.string().optional(),
      duration: z.string().optional(),
      transcript: z.string().optional(),
      creator: z.string().optional(),
      attribution: z.string().optional(),
    }).optional(),
  }),
});

const tools = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    category: z.enum(['food-kitchen', 'cleaning-laundry', 'home-maintenance', 'storage-organization', 'everyday-how-to']),
    toolType: z.enum([
      'stain-solver',
      'food-storage',
      'maintenance-planner',
      'cookware-selector',
      'protein-calculator',
      'storage-planner',
      'heart-rate-calculator',
      'fabric-care-advisor',
    ]),
    summary: z.string(),
    badge: z.string().optional(),
    instructions: z.string().optional(),
    relatedGuides: z.array(z.string()).optional(),
    relatedChecklists: z.array(z.string()).optional(),
  }),
});

const checklists = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/checklists' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    category: z.enum(['food-kitchen', 'cleaning-laundry', 'home-maintenance', 'storage-organization', 'everyday-how-to']),
    summary: z.string(),
    estimatedTime: z.string().optional(),
    printSubtitle: z.string().optional(),
    sections: z.array(z.object({
      title: z.string(),
      items: z.array(z.object({
        id: z.string(),
        text: z.string(),
        note: z.string().optional(),
        frequency: z.string().optional(),
      })),
    })),
    relatedGuides: z.array(z.string()).optional(),
    relatedTools: z.array(z.string()).optional(),
  }),
});

export const collections = {
  health: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/health' }),
    schema: articleSchema,
  }),
  wealth: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/wealth' }),
    schema: articleSchema,
  }),
  home: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/home' }),
    schema: articleSchema,
  }),
  life: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/life' }),
    schema: articleSchema,
  }),
  'tech-ai': defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/tech-ai' }),
    schema: articleSchema,
  }),
  'food-drink': defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/food-drink' }),
    schema: articleSchema,
  }),
  guides,
  tools,
  checklists,
};
