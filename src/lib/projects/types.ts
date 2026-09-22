import type { PillarSlug } from '../../config/site.ts';

export type OwnedProjectId = 'ai-zodiac' | 'dreamly-ai' | 'get-ai-set';

export interface OwnedProject {
  id: OwnedProjectId;
  name: string;
  tagline: string;
  description: string;
  url: string;
  relevantPillars: PillarSlug[];
  categories: string[];
  ctaLabel: string;
  ctaHeadline?: string;
  ctaDescription?: string;
  // Semantic matching configuration
  keywords: string[];
  negativeKeywords?: string[];
  matchThreshold: number; // Minimum score required to trigger recommendation (0-100)
}

export interface ArticleMatchContext {
  pillar: PillarSlug | string;
  title: string;
  description?: string;
  tags?: string[];
  topicId?: string;
  audience?: string;
  primaryIntent?: string;
  secondaryIntent?: string;
  targetProject?: OwnedProjectId | 'none' | string;
  content?: string;
}

export interface ProjectMatchResult {
  project: OwnedProject | null;
  score: number; // 0 - 100
  matchedKeywords: string[];
  matchReason?: string;
}
