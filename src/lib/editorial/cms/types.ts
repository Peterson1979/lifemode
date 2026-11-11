export type GuideCategory =
  | 'food-kitchen'
  | 'home-maintenance'
  | 'cleaning-laundry'
  | 'home-organization'
  | 'smart-home'
  | 'home-garden';

export const VALID_GUIDE_CATEGORIES: GuideCategory[] = [
  'food-kitchen',
  'home-maintenance',
  'cleaning-laundry',
  'home-organization',
  'smart-home',
  'home-garden',
];

export interface GuideData {
  id?: string;
  slug: string;
  title: string;
  category: GuideCategory;
  description: string;
  seoTitle?: string;
  seoDescription?: string;
  primaryKeyword?: string;
  image?: string;
  imageAlt?: string;
  content: string; // Markdown body
  tags?: string[];
  pubDate?: string;
  updatedDate?: string;
  author?: string;
  readingTime?: string;
  quickSummary?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ToolCategory =
  | 'food-kitchen'
  | 'home-maintenance'
  | 'cleaning-laundry'
  | 'home-organization'
  | 'smart-home'
  | 'home-garden'
  | 'storage-organization'
  | 'everyday-how-to';

export const VALID_TOOL_CATEGORIES: ToolCategory[] = [
  'food-kitchen',
  'home-maintenance',
  'cleaning-laundry',
  'home-organization',
  'smart-home',
  'home-garden',
  'storage-organization',
  'everyday-how-to',
];

export type ToolType =
  | 'stain-solver'
  | 'food-storage'
  | 'maintenance-planner'
  | 'cookware-selector'
  | 'protein-calculator'
  | 'storage-planner'
  | 'heart-rate-calculator'
  | 'fabric-care-advisor';

export const VALID_TOOL_TYPES: ToolType[] = [
  'stain-solver',
  'food-storage',
  'maintenance-planner',
  'cookware-selector',
  'protein-calculator',
  'storage-planner',
  'heart-rate-calculator',
  'fabric-care-advisor',
];

export interface ToolData {
  id?: string;
  slug: string;
  title: string;
  seoTitle?: string;
  seoDescription?: string;
  category: ToolCategory;
  toolType: ToolType;
  summary: string;
  badge?: string;
  instructions?: string;
  relatedChecklists?: string[];
  relatedGuides?: string[];
  relatedVideos?: string[];
  content: string; // Markdown body
  createdAt?: string;
  updatedAt?: string;
}

export type ChecklistCategory =
  | 'food-kitchen'
  | 'home-maintenance'
  | 'cleaning-laundry'
  | 'home-organization'
  | 'smart-home'
  | 'home-garden'
  | 'storage-organization'
  | 'everyday-how-to';

export const VALID_CHECKLIST_CATEGORIES: ChecklistCategory[] = [
  'food-kitchen',
  'home-maintenance',
  'cleaning-laundry',
  'home-organization',
  'smart-home',
  'home-garden',
  'storage-organization',
  'everyday-how-to',
];

export interface ChecklistItem {
  id: string;
  text: string;
  note?: string;
  frequency?: string;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistData {
  id?: string;
  slug: string;
  title: string;
  seoTitle?: string;
  seoDescription?: string;
  category: ChecklistCategory;
  summary: string;
  estimatedTime?: string;
  printSubtitle?: string;
  sections: ChecklistSection[];
  relatedTools?: string[];
  relatedGuides?: string[];
  relatedVideos?: string[];
  content: string; // Markdown guidelines / body
  createdAt?: string;
  updatedAt?: string;
}

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
  orderIndex?: number;
}

export type LifeHackData = LifeHackVideo;

export type CmsContentType = 'guide' | 'tool' | 'checklist' | 'life-hack';

export interface CmsDraftItem {
  id: string;
  contentType: CmsContentType;
  slug: string;
  title: string;
  category?: string;
  description?: string;
  summary?: string;
  content?: string;
  // Guide fields
  image?: string;
  imageAlt?: string;
  primaryKeyword?: string;
  tags?: string[];
  readingTime?: string;
  quickSummary?: string;
  // Tool fields
  toolType?: ToolType;
  badge?: string;
  instructions?: string;
  relatedChecklists?: string[];
  relatedGuides?: string[];
  relatedVideos?: string[];
  // Checklist fields
  estimatedTime?: string;
  printSubtitle?: string;
  sections?: ChecklistSection[];
  relatedTools?: string[];
  // Life Hack fields
  videoUrl?: string;
  thumbnail?: string;
  duration?: string;
  creator?: string;
  hidden?: boolean;
  relatedGuide?: CompanionResource;
  relatedTool?: CompanionResource;
  orderIndex?: number;
  // Common metadata
  seoTitle?: string;
  seoDescription?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

export interface MediaAsset {
  id: string;
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}
