import type { PillarSlug } from './site.ts';
import { OWNED_PROJECTS, type OwnedProject } from '../lib/projects/index.ts';

export interface EcosystemProject {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  relevantPillars: PillarSlug[];
  categories: string[];
  ctaText: string;
}

/**
 * Ecosystem projects derived from the centralized Owned Projects configuration.
 * Preserves backward compatibility for global showcase components and home page.
 */
export const ECOSYSTEM_PROJECTS: EcosystemProject[] = OWNED_PROJECTS.map((project: OwnedProject) => ({
  id: project.id,
  name: project.name,
  tagline: project.tagline,
  description: project.description,
  url: project.url,
  relevantPillars: project.relevantPillars,
  categories: project.categories,
  ctaText: project.ctaLabel,
}));
