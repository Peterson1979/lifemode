import { resolve, relative } from 'node:path';
import { z } from 'zod';
import { GitCli } from '../git-publisher/git-cli.ts';
import { writeGuideFile, computeReadingTime } from './guides.ts';
import { writeToolFile } from './tools.ts';
import { writeChecklistFile } from './checklists.ts';
import { saveLifeHack, extractYouTubeVideoId, getYouTubeThumbnailUrl } from './life-hacks.ts';
import {
  VALID_GUIDE_CATEGORIES,
  VALID_TOOL_CATEGORIES,
  VALID_TOOL_TYPES,
  VALID_CHECKLIST_CATEGORIES,
  type GuideData,
  type ToolData,
  type ChecklistData,
  type LifeHackVideo,
} from './types.ts';

// -------------------------------------------------------------
// 1. Guides Schema & Validation
// -------------------------------------------------------------

export const guideValidationSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters.'),
  description: z.string().min(15, 'Description must be at least 15 characters.'),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  author: z.string().default('LifeMode Editorial'),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),
  category: z.enum([
    'food-kitchen',
    'home-maintenance',
    'cleaning-laundry',
    'home-organization',
    'smart-home',
    'home-garden',
  ]),
  format: z.string().default('practical-guide'),
  primaryIntent: z.string().default('informational'),
  contentType: z.string().default('protocol'),
  lifecycleStatus: z.enum(['DRAFT', 'REVIEWED', 'APPROVED', 'STORED', 'PUBLISHED', 'ARCHIVED']).default('PUBLISHED'),
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  primaryKeyword: z.string().optional(),
  readingTime: z.string().optional(),
  quickSummary: z.string().optional(),
});

export function validateGuideData(guide: GuideData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!guide.title || guide.title.trim().length < 5) {
    errors.push('Title must be at least 5 characters.');
  }

  if (!guide.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(guide.slug.trim())) {
    errors.push('Slug must be a valid kebab-case string (e.g. "how-to-clean-pan").');
  }

  if (!VALID_GUIDE_CATEGORIES.includes(guide.category)) {
    errors.push(`Category must be one of: ${VALID_GUIDE_CATEGORIES.join(', ')}.`);
  }

  if (!guide.description || guide.description.trim().length < 15) {
    errors.push('Description / excerpt must be at least 15 characters.');
  }

  if (!guide.content || guide.content.trim().length < 50) {
    errors.push('Article body must be at least 50 characters.');
  }

  const parsed = guideValidationSchema.safeParse({
    title: (guide.title || '').trim(),
    description: (guide.description || '').trim(),
    pubDate: new Date(),
    category: guide.category,
    draft: false,
    lifecycleStatus: 'PUBLISHED',
    format: 'practical-guide',
    author: guide.author || 'LifeMode Editorial',
    primaryIntent: 'informational',
    readingTime: computeReadingTime(guide.content || ''),
    quickSummary: (guide.description || '').trim(),
    ...(guide.image ? { image: guide.image, imageAlt: guide.imageAlt || guide.title } : {}),
    ...(guide.seoTitle ? { seoTitle: guide.seoTitle } : {}),
    ...(guide.seoDescription ? { seoDescription: guide.seoDescription } : {}),
    ...(guide.primaryKeyword ? { primaryKeyword: guide.primaryKeyword } : {}),
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`Astro schema validation (${issue.path.join('.')}): ${issue.message}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

// -------------------------------------------------------------
// 2. Tools Schema & Validation
// -------------------------------------------------------------

export const toolValidationSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters.'),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  category: z.enum([
    'food-kitchen',
    'home-maintenance',
    'cleaning-laundry',
    'home-organization',
    'smart-home',
    'home-garden',
    'storage-organization',
    'everyday-how-to',
  ]),
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
  summary: z.string().min(10, 'Summary must be at least 10 characters.'),
  badge: z.string().optional(),
  instructions: z.string().optional(),
  relatedChecklists: z.array(z.string()).default([]),
  relatedGuides: z.array(z.string()).default([]),
  relatedVideos: z.array(z.string()).default([]),
});

export function validateToolData(tool: ToolData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!tool.title || tool.title.trim().length < 3) {
    errors.push('Title must be at least 3 characters.');
  }

  if (!tool.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tool.slug.trim())) {
    errors.push('Slug must be a valid kebab-case string (e.g. "cookware-material-finder").');
  }

  if (!VALID_TOOL_CATEGORIES.includes(tool.category)) {
    errors.push(`Category must be one of: ${VALID_TOOL_CATEGORIES.join(', ')}.`);
  }

  if (!VALID_TOOL_TYPES.includes(tool.toolType)) {
    errors.push(`Tool type must be one of: ${VALID_TOOL_TYPES.join(', ')}.`);
  }

  if (!tool.summary || tool.summary.trim().length < 10) {
    errors.push('Summary must be at least 10 characters.');
  }

  if (!tool.content || tool.content.trim().length < 20) {
    errors.push('Tool markdown guide body must be at least 20 characters.');
  }

  const parsed = toolValidationSchema.safeParse({
    title: (tool.title || '').trim(),
    seoTitle: (tool.seoTitle || '').trim() || undefined,
    seoDescription: (tool.seoDescription || '').trim() || undefined,
    category: tool.category,
    toolType: tool.toolType,
    summary: (tool.summary || '').trim(),
    badge: (tool.badge || '').trim() || undefined,
    instructions: (tool.instructions || '').trim() || undefined,
    relatedChecklists: Array.isArray(tool.relatedChecklists) ? tool.relatedChecklists : [],
    relatedGuides: Array.isArray(tool.relatedGuides) ? tool.relatedGuides : [],
    relatedVideos: Array.isArray(tool.relatedVideos) ? tool.relatedVideos : [],
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`Astro tools schema validation (${issue.path.join('.')}): ${issue.message}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

// -------------------------------------------------------------
// 3. Checklists Schema & Validation
// -------------------------------------------------------------

export const checklistValidationSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters.'),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  category: z.enum([
    'food-kitchen',
    'home-maintenance',
    'cleaning-laundry',
    'home-organization',
    'smart-home',
    'home-garden',
    'storage-organization',
    'everyday-how-to',
  ]),
  summary: z.string().min(10, 'Summary must be at least 10 characters.'),
  estimatedTime: z.string().optional(),
  printSubtitle: z.string().optional(),
  sections: z
    .array(
      z.object({
        title: z.string().min(1, 'Section title cannot be empty.'),
        items: z
          .array(
            z.object({
              id: z.string().min(1, 'Item ID cannot be empty.'),
              text: z.string().min(1, 'Item text cannot be empty.'),
              note: z.string().optional(),
              frequency: z.string().optional(),
            })
          )
          .min(1, 'Each section must contain at least 1 item.'),
      })
    )
    .min(1, 'Checklist must contain at least 1 section.'),
  relatedTools: z.array(z.string()).default([]),
  relatedGuides: z.array(z.string()).default([]),
  relatedVideos: z.array(z.string()).default([]),
});

export function validateChecklistData(checklist: ChecklistData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!checklist.title || checklist.title.trim().length < 3) {
    errors.push('Title must be at least 3 characters.');
  }

  if (!checklist.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(checklist.slug.trim())) {
    errors.push('Slug must be a valid kebab-case string (e.g. "kitchen-deep-clean-checklist").');
  }

  if (!VALID_CHECKLIST_CATEGORIES.includes(checklist.category)) {
    errors.push(`Category must be one of: ${VALID_CHECKLIST_CATEGORIES.join(', ')}.`);
  }

  if (!checklist.summary || checklist.summary.trim().length < 10) {
    errors.push('Summary must be at least 10 characters.');
  }

  if (!Array.isArray(checklist.sections) || checklist.sections.length === 0) {
    errors.push('Checklist must have at least one section.');
  } else {
    for (let i = 0; i < checklist.sections.length; i++) {
      const sec = checklist.sections[i];
      if (!sec.title || !sec.title.trim()) {
        errors.push(`Section ${i + 1} must have a title.`);
      }
      if (!Array.isArray(sec.items) || sec.items.length === 0) {
        errors.push(`Section "${sec.title || i + 1}" must contain at least one item.`);
      } else {
        for (let j = 0; j < sec.items.length; j++) {
          const item = sec.items[j];
          if (!item.id || !item.id.trim()) {
            errors.push(`Section "${sec.title}" Item ${j + 1} must have an ID.`);
          }
          if (!item.text || !item.text.trim()) {
            errors.push(`Section "${sec.title}" Item ${j + 1} must have text.`);
          }
        }
      }
    }
  }

  if (!checklist.content || checklist.content.trim().length < 20) {
    errors.push('Checklist guidelines body must be at least 20 characters.');
  }

  const parsed = checklistValidationSchema.safeParse({
    title: (checklist.title || '').trim(),
    seoTitle: (checklist.seoTitle || '').trim() || undefined,
    seoDescription: (checklist.seoDescription || '').trim() || undefined,
    category: checklist.category,
    summary: (checklist.summary || '').trim(),
    estimatedTime: (checklist.estimatedTime || '').trim() || undefined,
    printSubtitle: (checklist.printSubtitle || '').trim() || undefined,
    sections: checklist.sections || [],
    relatedTools: Array.isArray(checklist.relatedTools) ? checklist.relatedTools : [],
    relatedGuides: Array.isArray(checklist.relatedGuides) ? checklist.relatedGuides : [],
    relatedVideos: Array.isArray(checklist.relatedVideos) ? checklist.relatedVideos : [],
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`Astro checklist schema validation (${issue.path.join('.')}): ${issue.message}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

// -------------------------------------------------------------
// 4. Publishing Options & Interfaces
// -------------------------------------------------------------

export interface PublishOptions {
  repoRoot?: string;
  gitCli?: GitCli;
  remote?: string;
  branch?: string;
  dryRun?: boolean;
}

export interface PublishResult {
  status: 'success' | 'validation-failed';
  filePath: string;
  route: string;
  commitHash?: string;
  message: string;
  errors?: string[];
}

export type PublishGuideOptions = PublishOptions;
export type PublishGuideResult = PublishResult;

// -------------------------------------------------------------
// 5. Publisher Functions
// -------------------------------------------------------------

export async function publishGuide(
  guide: GuideData,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const validation = validateGuideData(guide);
  if (!validation.isValid) {
    return {
      status: 'validation-failed',
      filePath: '',
      route: '',
      errors: validation.errors,
      message: `Validation failed: ${validation.errors.join(' | ')}`,
    };
  }

  const slug = guide.slug.trim();
  const route = `/guides/${slug}/`;
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const git = options.gitCli || new GitCli();
  const remote = options.remote || 'origin';
  const branch = options.branch || 'master';

  const absoluteFilePath = await writeGuideFile(slug, guide, 'PUBLISHED');
  const relativeTarget = git.normalizeGitPath(relative(repoRoot, absoluteFilePath));

  if (options.dryRun) {
    return {
      status: 'success',
      filePath: absoluteFilePath,
      route,
      message: `[DRY RUN] Guide "${guide.title}" successfully formatted and written to ${relativeTarget}. No Git changes pushed.`,
    };
  }

  await safeStageAndCommit(
    git,
    repoRoot,
    relativeTarget,
    `feat: publish guide "${guide.title.replace(/[\r\n"]+/g, ' ').slice(0, 100)}"`,
    remote,
    branch
  );

  return {
    status: 'success',
    filePath: absoluteFilePath,
    route,
    message: `Published guide to ${remote}/${branch}. Deployment initiated for https://lifemode.site${route}`,
  };
}

export async function publishTool(
  tool: ToolData,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const validation = validateToolData(tool);
  if (!validation.isValid) {
    return {
      status: 'validation-failed',
      filePath: '',
      route: '',
      errors: validation.errors,
      message: `Validation failed: ${validation.errors.join(' | ')}`,
    };
  }

  const slug = tool.slug.trim();
  const route = `/tools/${slug}/`;
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const git = options.gitCli || new GitCli();
  const remote = options.remote || 'origin';
  const branch = options.branch || 'master';

  const absoluteFilePath = await writeToolFile(slug, tool);
  const relativeTarget = git.normalizeGitPath(relative(repoRoot, absoluteFilePath));

  if (options.dryRun) {
    return {
      status: 'success',
      filePath: absoluteFilePath,
      route,
      message: `[DRY RUN] Tool "${tool.title}" successfully formatted and written to ${relativeTarget}. No Git changes pushed.`,
    };
  }

  await safeStageAndCommit(
    git,
    repoRoot,
    relativeTarget,
    `feat: publish tool "${tool.title.replace(/[\r\n"]+/g, ' ').slice(0, 100)}"`,
    remote,
    branch
  );

  return {
    status: 'success',
    filePath: absoluteFilePath,
    route,
    message: `Published tool to ${remote}/${branch}. Deployment initiated for https://lifemode.site${route}`,
  };
}

export async function publishChecklist(
  checklist: ChecklistData,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const validation = validateChecklistData(checklist);
  if (!validation.isValid) {
    return {
      status: 'validation-failed',
      filePath: '',
      route: '',
      errors: validation.errors,
      message: `Validation failed: ${validation.errors.join(' | ')}`,
    };
  }

  const slug = checklist.slug.trim();
  const route = `/checklists/${slug}/`;
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const git = options.gitCli || new GitCli();
  const remote = options.remote || 'origin';
  const branch = options.branch || 'master';

  const absoluteFilePath = await writeChecklistFile(slug, checklist);
  const relativeTarget = git.normalizeGitPath(relative(repoRoot, absoluteFilePath));

  if (options.dryRun) {
    return {
      status: 'success',
      filePath: absoluteFilePath,
      route,
      message: `[DRY RUN] Checklist "${checklist.title}" successfully formatted and written to ${relativeTarget}. No Git changes pushed.`,
    };
  }

  await safeStageAndCommit(
    git,
    repoRoot,
    relativeTarget,
    `feat: publish checklist "${checklist.title.replace(/[\r\n"]+/g, ' ').slice(0, 100)}"`,
    remote,
    branch
  );

  return {
    status: 'success',
    filePath: absoluteFilePath,
    route,
    message: `Published checklist to ${remote}/${branch}. Deployment initiated for https://lifemode.site${route}`,
  };
}

// -------------------------------------------------------------
// 4. Life Hacks Schema & Validation
// -------------------------------------------------------------

export const lifeHackValidationSchema = z.object({
  id: z.string().min(2, 'ID / Slug must be at least 2 characters.').regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ID must be a valid kebab-case slug.'),
  title: z.string().min(3, 'Title must be at least 3 characters.'),
  description: z.string().min(10, 'Description must be at least 10 characters.'),
  thumbnail: z.string().min(5, 'Thumbnail URL must be valid.'),
  videoUrl: z.string().min(5, 'Video URL must be valid.'),
  duration: z.string().optional(),
  category: z.string().optional(),
  creator: z.string().optional(),
  hidden: z.boolean().default(false),
  relatedGuide: z.object({ slug: z.string(), title: z.string() }).optional(),
  relatedTool: z.object({ slug: z.string(), title: z.string() }).optional(),
  orderIndex: z.number().optional(),
});

export function validateLifeHackData(video: LifeHackVideo): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!video.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(video.id.trim())) {
    errors.push('Video ID must be a valid kebab-case slug (e.g. "pan-heating-technique").');
  }
  if (!video.title || video.title.trim().length < 3) {
    errors.push('Title must be at least 3 characters.');
  }
  if (!video.description || video.description.trim().length < 10) {
    errors.push('Description must be at least 10 characters.');
  }

  const rawUrl = (video.videoUrl || '').trim();
  const ytId = extractYouTubeVideoId(rawUrl);
  if (!rawUrl || !ytId) {
    errors.push('A valid YouTube video URL must be provided (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...).');
  }

  // Auto-generate thumbnail if not manually overridden
  let thumbnail = (video.thumbnail || '').trim();
  if (!thumbnail && ytId) {
    thumbnail = getYouTubeThumbnailUrl(ytId) || '';
    video.thumbnail = thumbnail;
  }

  if (!thumbnail || thumbnail.length < 5) {
    errors.push('Thumbnail URL must be provided or automatically generatable from a valid YouTube URL.');
  }

  const parsed = lifeHackValidationSchema.safeParse({
    id: (video.id || '').trim(),
    title: (video.title || '').trim(),
    description: (video.description || '').trim(),
    thumbnail,
    videoUrl: rawUrl,
    duration: video.duration?.trim() || undefined,
    category: video.category?.trim() || undefined,
    creator: video.creator?.trim() || undefined,
    hidden: Boolean(video.hidden),
    relatedGuide: video.relatedGuide?.slug ? { slug: video.relatedGuide.slug.trim(), title: video.relatedGuide.title.trim() } : undefined,
    relatedTool: video.relatedTool?.slug ? { slug: video.relatedTool.slug.trim(), title: video.relatedTool.title.trim() } : undefined,
    orderIndex: video.orderIndex,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`Life hack validation (${issue.path.join('.')}): ${issue.message}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

export async function publishLifeHack(
  video: LifeHackVideo,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const validation = validateLifeHackData(video);
  if (!validation.isValid) {
    return {
      status: 'validation-failed',
      filePath: '',
      route: '',
      errors: validation.errors,
      message: `Validation failed: ${validation.errors.join(' | ')}`,
    };
  }

  const route = `/life-hacks/#video-${video.id.trim()}`;
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const relativeTarget = 'data/content/life-hacks.json';
  const absoluteFilePath = resolve(repoRoot, relativeTarget);

  if (options.dryRun) {
    return {
      status: 'success',
      filePath: absoluteFilePath,
      route,
      message: `[DRY RUN] Life hack "${video.title}" successfully validated for ${relativeTarget}. No Git changes pushed.`,
    };
  }

  const git = options.gitCli || new GitCli();
  const remote = options.remote || 'origin';
  const branch = options.branch || 'master';

  await saveLifeHack(video, { orderIndex: video.orderIndex });

  await safeStageAndCommit(
    git,
    repoRoot,
    relativeTarget,
    `feat: publish life hack "${video.title.replace(/[\r\n"]+/g, ' ').slice(0, 100)}"`,
    remote,
    branch
  );

  return {
    status: 'success',
    filePath: absoluteFilePath,
    route,
    message: `Published life hack to ${remote}/${branch}. Deployment initiated for https://lifemode.site${route}`,
  };
}

async function safeStageAndCommit(
  git: GitCli,
  repoRoot: string,
  relativeTarget: string,
  commitMessage: string,
  remote: string,
  branch: string
): Promise<string> {
  // 1. Safety check: inspect pre-existing staged files
  const { stdout: initialStagedStdout } = await git.runGit(['diff', '--name-only', '--cached'], repoRoot);
  const initialStaged = initialStagedStdout
    .split('\n')
    .map((f) => git.normalizeGitPath(f.trim()))
    .filter((f) => f && f !== '.');

  const unrelatedStaged = initialStaged.filter((f) => f !== relativeTarget);
  if (unrelatedStaged.length > 0) {
    throw new Error(
      `Publish aborted: Git index already contains unrelated staged files: ${unrelatedStaged.join(', ')}. Unstage them before publishing.`
    );
  }

  // 2. Stage exclusively the published target file
  await git.stageSingleFile(repoRoot, relativeTarget);

  // 3. Verify exclusively the target file is staged
  const { stdout: postStagedStdout } = await git.runGit(['diff', '--name-only', '--cached'], repoRoot);
  const stagedFiles = postStagedStdout
    .split('\n')
    .map((f) => git.normalizeGitPath(f.trim()))
    .filter((f) => f && f !== '.');

  if (stagedFiles.length !== 1 || stagedFiles[0] !== relativeTarget) {
    try {
      await git.runGit(['reset', 'HEAD', '--', relativeTarget], repoRoot);
    } catch {}
    throw new Error(`Safety check failed: Expected strictly "${relativeTarget}" to be staged, but found: ${stagedFiles.join(', ')}`);
  }

  // 4. Create commit
  const commitHash = await git.createCommit(repoRoot, commitMessage);

  // 5. Push without force
  await git.push(repoRoot, remote, branch);

  return commitHash;
}
