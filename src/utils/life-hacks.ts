import lifeHacksData from '../../data/content/life-hacks.json' with { type: 'json' };

export interface CompanionResource {
  slug: string;
  title: string;
}

export interface LifeHackVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration?: string;
  category?: string;
  videoUrl: string;
  creator?: string;
  hidden?: boolean;
  relatedGuide?: CompanionResource;
  relatedTool?: CompanionResource;
}

/**
 * Dedicated curated video library loaded from data/content/life-hacks.json.
 * Preserves all source entries and assets; duplicates are marked `hidden: true`
 * to hide them from public catalog listings while retaining source records.
 */
export const LIFE_HACK_VIDEOS: LifeHackVideo[] = lifeHacksData as LifeHackVideo[];
