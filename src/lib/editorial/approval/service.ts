import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type { GenerationRequest, GeneratedArticle } from '../generation/types.ts';
import { runGenerationPipeline } from '../generation/runner.ts';
import type { IGenerationProvider } from '../generation/providers/types.ts';
import type { ReviewRequest } from '../review/types.ts';
import { runReviewPipeline } from '../review/runner.ts';
import type { IAIReviewProvider } from '../review/providers/types.ts';
import type { PublishingRequest, HumanEditorialApproval } from '../publishing/types.ts';
import { evaluatePublishingGate } from '../publishing/gate.ts';
import { publishingContentId } from '../publishing/types.ts';
import { buildPublishPackage } from '../publishing/builder.ts';
import type { PublishPackage } from '../publishing/types.ts';
import { sanitizeArticleContent } from '../sanitization.ts';
import { releaseApprovedArticle, type ApprovalReleaseResult } from './release.ts';

export type ApprovalQueueStatus = 'PENDING' | 'APPROVED' | 'REVISION_REQUESTED' | 'REJECTED';

export interface EditorialApprovalQueueItem {
  id: string;
  contentId: string;
  version: number;
  contentHash: string;
  status: ApprovalQueueStatus;
  publishingRequest: PublishingRequest;
  generationRequest: GenerationRequest;
  createdAt: string;
  updatedAt: string;
  revisionNotes?: string;
  lastError?: string;
  approval?: HumanEditorialApproval;
  publication?: {
    publicationId: string;
    collection: 'guides';
    path: string;
    route: string;
    contentHash: string;
    publishedAt: string;
  };
}

export interface ApprovalActionResult {
  item: EditorialApprovalQueueItem;
  reasons?: string[];
}

export interface ApprovalPublicationOptions {
  contentRoot?: string;
  autoRelease?: boolean;
  release?: (request: { articlePath: string; queuePath: string; route: string; title: string }) => Promise<ApprovalReleaseResult>;
}

export interface ApprovalActionInput {
  reviewer?: string;
  version: number;
  feedback?: string;
}

const DEFAULT_QUEUE_PATH = resolve(process.cwd(), 'data', 'editorial', 'approval-queue.json');
const DEFAULT_CONTENT_ROOT = resolve(process.cwd(), 'src', 'content');

export function getApprovalQueuePath(customPath?: string): string {
  return resolve(customPath || process.env.LIFEMODE_APPROVAL_QUEUE_PATH || DEFAULT_QUEUE_PATH);
}

async function readQueue(queuePath: string): Promise<EditorialApprovalQueueItem[]> {
  try {
    const raw = await fs.readFile(queuePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`Approval queue could not be read: ${error?.message || String(error)}`);
  }
}

async function writeQueue(queuePath: string, items: EditorialApprovalQueueItem[]): Promise<void> {
  await fs.mkdir(dirname(queuePath), { recursive: true });
  // The dashboard is a single-user loopback service. Direct replacement is
  // intentionally used here because Windows sandboxed folders can reject
  // rename-over-temp-file operations even when the target does not exist.
  await fs.writeFile(queuePath, JSON.stringify(items, null, 2) + '\n', 'utf8');
}

function assertVersion(item: EditorialApprovalQueueItem, version: number): void {
  if (!Number.isInteger(version) || version !== item.version) {
    throw new Error(`Approval version mismatch. The dashboard shows version ${item.version}; received ${version}.`);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = canonicalize(entry);
      return result;
    }, {});
  }
  return value;
}

function articleContentHash(request: PublishingRequest): string {
  return createHash('sha256').update(JSON.stringify(canonicalize({
    article: request.article,
    context: { ...request.context, humanApproval: undefined },
    options: { ...request.options, dryRun: false },
    review: request.review,
  }))).digest('hex');
}

function guideCategory(request: PublishingRequest): 'food-kitchen' | 'home-maintenance' {
  const text = `${request.article.title} ${request.article.slug} ${(request.context.tags || []).join(' ')}`.toLowerCase();
  if (/(cast.?iron|skillet|cookware|kitchen|food|pan)/i.test(text)) return 'food-kitchen';
  if (request.context.pillar === 'home') return 'home-maintenance';
  throw new Error(`No public guide category is configured for pillar "${request.context.pillar}".`);
}

function guideFrontmatter(pkg: PublishPackage, category: 'food-kitchen' | 'home-maintenance', publishedDate: string): string {
  const readTime = `${Math.max(1, Math.ceil(pkg.content.trim().split(/\s+/).filter(Boolean).length / 200))} min read`;
  const quote = (value: string) => JSON.stringify(value);
  const sources = pkg.sources.length > 0
    ? `sources:\n${pkg.sources.map((source) => `  - title: ${quote(source.name)}\n    publisher: ${quote(source.name)}${source.url ? `\n    url: ${quote(source.url)}` : ''}`).join('\n')}`
    : 'sources: []';
  return [
    '---',
    `title: ${quote(pkg.title)}`,
    `seoTitle: ${quote(pkg.title)}`,
    `seoDescription: ${quote(pkg.description)}`,
    `category: ${quote(category)}`,
    'contentType: "reference"',
    `publishedDate: ${quote(publishedDate)}`,
    `updatedDate: ${quote(publishedDate)}`,
    `readTime: ${quote(readTime)}`,
    'author:',
    '  name: "LifeMode Editorial Team"',
    '  role: "Practical Knowledge Researcher"',
    'reviewedBy:',
    '  name: "LifeMode Human Editorial Review"',
    '  role: "Human approval gate"',
    `quickSummary: ${quote(pkg.excerpt || pkg.description)}`,
    sources,
    '---',
    '',
  ].join('\n');
}

async function publishApprovedPackage(
  item: EditorialApprovalQueueItem,
  request: PublishingRequest,
  options: { contentRoot?: string } = {},
): Promise<NonNullable<EditorialApprovalQueueItem['publication']>> {
  const category = guideCategory(request);
  const pkg = buildPublishPackage(request, {
    author: request.options?.author || 'LifeMode',
    targetDate: item.createdAt.slice(0, 10),
    dryRun: false,
  });
  const { cleanContent } = sanitizeArticleContent(pkg.content);
  const publishedDate = item.createdAt.slice(0, 10);
  const filePath = resolve(options.contentRoot || DEFAULT_CONTENT_ROOT, 'guides', `${pkg.slug}.md`);
  const expected = `${guideFrontmatter({ ...pkg, content: cleanContent }, category, publishedDate)}${cleanContent.trim()}\n`;
  const publicationId = pkg.id;
  const route = `/${category}/${pkg.slug}/`;

  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing !== expected) {
      throw new Error(`Publication conflict: ${filePath} already contains different content.`);
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, expected, 'utf8');
  }

  return {
    publicationId,
    collection: 'guides',
    path: filePath,
    route,
    contentHash: item.contentHash,
    publishedAt: new Date().toISOString(),
  };
}

export async function listApprovalQueue(customPath?: string): Promise<EditorialApprovalQueueItem[]> {
  return readQueue(getApprovalQueuePath(customPath));
}

export async function getApprovalQueueItem(id: string, customPath?: string): Promise<EditorialApprovalQueueItem | null> {
  const item = (await readQueue(getApprovalQueuePath(customPath))).find((entry) => entry.id === id);
  return item || null;
}

export async function enqueueEditorialApproval(
  request: PublishingRequest,
  generationRequest: GenerationRequest,
  customPath?: string
): Promise<EditorialApprovalQueueItem> {
  if (!request.article || !request.context?.topicId) {
    throw new Error('Cannot queue approval without an article and topic ID.');
  }

  const queuePath = getApprovalQueuePath(customPath);
  const items = await readQueue(queuePath);
  const version = request.context.contentVersion ?? 1;
  const contentId = publishingContentId(request.context.topicId, request.article.slug);
  const existing = items.find((item) => item.contentId === contentId && item.version === version);
  if (existing) return existing;

  const now = new Date().toISOString();
  const item: EditorialApprovalQueueItem = {
    id: `approval-${contentId.replace(/[^a-z0-9:-]+/gi, '-')}-v${version}`,
    contentId,
    version,
    contentHash: articleContentHash(request),
    status: 'PENDING',
    publishingRequest: {
      ...request,
      options: { ...request.options, dryRun: false },
      context: { ...request.context, contentVersion: version, humanApproval: undefined },
    },
    generationRequest,
    createdAt: now,
    updatedAt: now,
  };

  await writeQueue(queuePath, [...items, item]);
  return item;
}

export async function approveEditorialQueueItem(
  id: string,
  input: ApprovalActionInput,
  customPath?: string,
  options: ApprovalPublicationOptions = {},
): Promise<ApprovalActionResult> {
  const queuePath = getApprovalQueuePath(customPath);
  const items = await readQueue(queuePath);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Approval item was not found.');
  const item = items[index];
  assertVersion(item, input.version);
  if (articleContentHash(item.publishingRequest) !== item.contentHash) {
    throw new Error('This approval item changed after it was queued and must be regenerated and reviewed again.');
  }
  const approval: HumanEditorialApproval = item.approval || {
    recordId: `${item.id}-${Date.now()}`,
    contentId: item.contentId,
    contentVersion: item.version,
    reviewer: 'human-review',
    reviewerType: 'human',
    decision: 'APPROVED',
    reviewedAt: new Date().toISOString(),
  };
  const request: PublishingRequest = {
    ...item.publishingRequest,
    options: { ...item.publishingRequest.options, dryRun: false },
    context: { ...item.publishingRequest.context, humanApproval: approval, contentVersion: item.version },
  };
  const gate = evaluatePublishingGate(request);
  if (!gate.eligible) {
    return { item, reasons: gate.reasons };
  }

  let publication: NonNullable<EditorialApprovalQueueItem['publication']>;
  try {
    publication = await publishApprovedPackage(item, request, options);
  } catch (error: any) {
    throw new Error(`Publication failed; approval was not recorded: ${error?.message || String(error)}`);
  }

  const updated: EditorialApprovalQueueItem = {
    ...item,
    status: 'APPROVED',
    publishingRequest: request,
    approval,
    publication,
    revisionNotes: undefined,
    lastError: undefined,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  await writeQueue(queuePath, items);

  if (options.autoRelease !== false) {
    try {
      const release = options.release || releaseApprovedArticle;
      await release({
        articlePath: publication.path,
        queuePath,
        route: publication.route,
        title: request.article.title,
      });
    } catch (error: any) {
      throw new Error(`Release failed after local approval was recorded: ${error?.message || String(error)}`);
    }
  }

  return { item: updated };
}

export async function rejectEditorialQueueItem(
  id: string,
  input: ApprovalActionInput,
  customPath?: string
): Promise<ApprovalActionResult> {
  const queuePath = getApprovalQueuePath(customPath);
  const items = await readQueue(queuePath);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Approval item was not found.');
  const item = items[index];
  assertVersion(item, input.version);
  if (articleContentHash(item.publishingRequest) !== item.contentHash) {
    throw new Error('This approval item changed after it was queued and must be regenerated and reviewed again.');
  }
  const updated = { ...item, status: 'REJECTED' as const, revisionNotes: input.feedback?.trim() || undefined, updatedAt: new Date().toISOString() };
  items[index] = updated;
  await writeQueue(queuePath, items);
  return { item: updated };
}

function toReviewRequest(item: EditorialApprovalQueueItem, article: GeneratedArticle): ReviewRequest {
  const context = item.publishingRequest.context;
  return {
    topicId: context.topicId,
    title: article.title,
    description: article.description,
    excerpt: article.excerpt,
    content: article.content,
    pillar: context.pillar,
    format: context.format,
    audience: context.audience,
    primaryIntent: context.primaryIntent,
    secondaryIntent: context.secondaryIntent,
    riskLevel: context.riskLevel,
    affiliateIntent: Boolean(context.affiliateIntent),
    sources: article.sources,
    evidence: context.evidence,
    doNotClaim: context.doNotClaim,
    evidenceLimitations: context.evidenceLimitations,
    sourceUrls: context.sourceUrls,
    readerProblem: context.readerProblem,
    internalLinks: article.internalLinks,
    estimatedWordCount: context.estimatedWordCount,
    tags: context.tags,
    deterministicValidation: undefined,
    editorialValidation: undefined,
  };
}

export async function requestEditorialRevision(
  id: string,
  input: ApprovalActionInput,
  providers: { generationProvider: IGenerationProvider; reviewProvider: IAIReviewProvider },
  customPath?: string
): Promise<ApprovalActionResult> {
  const queuePath = getApprovalQueuePath(customPath);
  const items = await readQueue(queuePath);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Approval item was not found.');
  const item = items[index];
  assertVersion(item, input.version);
  if (articleContentHash(item.publishingRequest) !== item.contentHash) {
    throw new Error('This approval item changed after it was queued and must be regenerated and reviewed again.');
  }
  const feedback = input.feedback?.trim();
  if (!feedback) throw new Error('Revision feedback is required.');

  const revisionRequest: GenerationRequest = {
    ...item.generationRequest,
    revisionContext: {
      originalArticle: item.publishingRequest.article,
      reviewResult: {
        decision: 'REVISE',
        overallScore: item.publishingRequest.review.overallScore,
        dimensions: item.publishingRequest.review.dimensions,
        criticalIssues: [feedback],
        warnings: [],
        gatePassed: false,
      },
      revisionAttempt: item.version,
    },
    contentInstructions: `${item.generationRequest.contentInstructions || ''}\nHuman editor revision request: ${feedback}`.trim(),
  };

  const generated = await runGenerationPipeline({ request: revisionRequest, provider: providers.generationProvider });
  if (!generated.success) {
    const updated = { ...item, status: 'REVISION_REQUESTED' as const, revisionNotes: feedback, lastError: generated.errorMessage, updatedAt: new Date().toISOString() };
    items[index] = updated;
    await writeQueue(queuePath, items);
    return { item: updated, reasons: [generated.errorMessage] };
  }

  const review = await runReviewPipeline({ request: toReviewRequest(item, generated.article), provider: providers.reviewProvider });
  if (review.decision !== 'PASS') {
    const updated = { ...item, status: 'REVISION_REQUESTED' as const, revisionNotes: feedback, lastError: `Revised article did not pass review: ${review.decision}`, updatedAt: new Date().toISOString() };
    items[index] = updated;
    await writeQueue(queuePath, items);
    return { item: updated, reasons: updated.lastError ? [updated.lastError] : undefined };
  }

  const nextVersion = item.version + 1;
  const updatedRequest: PublishingRequest = {
    ...item.publishingRequest,
    article: generated.article,
    review,
    context: { ...item.publishingRequest.context, contentVersion: nextVersion, humanApproval: undefined },
  };
  const updated: EditorialApprovalQueueItem = {
    ...item,
    version: nextVersion,
    contentHash: articleContentHash(updatedRequest),
    contentId: publishingContentId(updatedRequest.context.topicId, generated.article.slug),
    status: 'PENDING',
    publishingRequest: updatedRequest,
    generationRequest: item.generationRequest,
    revisionNotes: `Revision requested: ${feedback}`,
    lastError: undefined,
    approval: undefined,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  await writeQueue(queuePath, items);
  return { item: updated };
}
