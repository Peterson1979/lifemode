import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type { GenerationRequest, GeneratedArticle } from '../generation/types.ts';
import { runGenerationPipeline } from '../generation/runner.ts';
import type { IGenerationProvider } from '../generation/providers/types.ts';
import type { ReviewRequest, ReviewResult } from '../review/types.ts';
import { runReviewPipeline } from '../review/runner.ts';
import type { IAIReviewProvider } from '../review/providers/types.ts';
import type { PublishingRequest, PublishingContext, HumanEditorialApproval } from '../publishing/types.ts';
import { evaluatePublishingGate } from '../publishing/gate.ts';
import { publishingContentId } from '../publishing/types.ts';
import { buildPublishPackage } from '../publishing/builder.ts';
import type { PublishPackage } from '../publishing/types.ts';
import { sanitizeArticleContent } from '../sanitization.ts';
import { parseArticle } from '../storage/serializer.ts';
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
  /**
   * Explicit human decision to publish without an AI review PASS. The reason is
   * stored on the approval record and surfaced as a gate warning; every other
   * publishing requirement still applies.
   */
  manualAuthorization?: { reason: string };
}

export interface ApprovalQueueImportResult {
  queuePath: string;
  imported: number;
  skipped: number;
  total: number;
  importedIds: string[];
  skippedIds: string[];
}

const DEFAULT_QUEUE_PATH = resolve(process.cwd(), 'data', 'editorial', 'approval-queue.json');
const DEFAULT_CONTENT_ROOT = resolve(process.cwd(), 'src', 'content');
const approvalLocks = new Map<string, Promise<void>>();

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

async function withApprovalLock<T>(queuePath: string, action: () => Promise<T>): Promise<T> {
  const previous = approvalLocks.get(queuePath) || Promise.resolve();
  let unlock!: () => void;
  const current = new Promise<void>((resolve) => { unlock = resolve; });
  approvalLocks.set(queuePath, current);
  await previous;
  try {
    return await action();
  } finally {
    unlock();
    if (approvalLocks.get(queuePath) === current) approvalLocks.delete(queuePath);
  }
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

function normalizeQueuedRequest(request: PublishingRequest, version: number): PublishingRequest {
  return {
    ...request,
    options: { ...request.options, dryRun: false },
    context: { ...request.context, contentVersion: version, humanApproval: undefined },
  };
}

export function approvalContentFingerprint(request: PublishingRequest): string {
  return articleContentHash(normalizeQueuedRequest(request, request.context.contentVersion ?? 1));
}

function guideCategory(request: PublishingRequest): 'food-kitchen' | 'home-garden' | 'everyday-how-to' {
  const text = `${request.article.title} ${request.article.slug} ${(request.context.tags || []).join(' ')}`.toLowerCase();
  if (/(cast.?iron|skillet|cookware|kitchen|food|pan)/i.test(text)) return 'food-kitchen';
  if (request.context.pillar === 'home') return 'home-garden';
  // The guides collection already provides a general-purpose route for the
  // remaining adopted editorial pillars. Keeping the fallback explicit makes
  // future approved articles publishable without inventing a second system.
  return 'everyday-how-to';
}

function guideFrontmatter(pkg: PublishPackage, category: 'food-kitchen' | 'home-garden' | 'everyday-how-to', publishedDate: string): string {
  const minutes = Math.max(1, Math.ceil(pkg.content.trim().split(/\s+/).filter(Boolean).length / 200));
  const readTime = `${minutes} min read`;
  const quote = (value: string) => JSON.stringify(value);
  const tags = pkg.tags.length > 0 ? pkg.tags : [pkg.pillar];
  const sources = pkg.sources.length > 0
    ? [
        'sources:',
        ...pkg.sources.map((source) => `  - name: ${quote(source.name)}\n    url: ${quote(source.url || '')}`),
      ].join('\n')
    : 'sources: []';

  // The generated header must satisfy articleSchema (src/content.config.ts):
  // required string author, required pubDate, source entries carrying `name`,
  // string reading-time metadata, and the publication flags consumed by
  // isPubliclyVisibleGuide. seo*/category/publishedDate/readTime/reviewedBy are
  // kept because other editorial consumers still read them; they are unknown to
  // articleSchema and are stripped on load rather than rejected.
  return [
    '---',
    `title: ${quote(pkg.title)}`,
    `seoTitle: ${quote(pkg.title)}`,
    `description: ${quote(pkg.description)}`,
    `seoDescription: ${quote(pkg.description)}`,
    `category: ${quote(category)}`,
    `pubDate: ${quote(publishedDate)}`,
    `publishedDate: ${quote(publishedDate)}`,
    `updatedDate: ${quote(publishedDate)}`,
    `author: ${quote(pkg.publicationMetadata.author || 'LifeMode Editorial')}`,
    `tags: ${JSON.stringify(tags)}`,
    'draft: false',
    'lifecycleStatus: "PUBLISHED"',
    `format: ${quote(pkg.format)}`,
    `primaryIntent: ${quote(pkg.primaryIntent)}`,
    'contentType: "reference"',
    `readingTime: ${quote(readTime)}`,
    `readTime: ${quote(readTime)}`,
    `quickSummary: ${quote(pkg.excerpt || pkg.description)}`,
    `reviewedBy: ${quote('LifeMode Human Editorial Review')}`,
    sources,
    '---',
    '',
  ].join('\n');
}

/**
 * Writes the approved package to disk, or verifies an existing guide file.
 *
 * An existing article is preserved byte-for-byte: it is only accepted when its
 * stored title and body match the approved package exactly. Any other content
 * remains a hard publication conflict, and version/content-hash integrity is
 * still enforced by the caller before this runs.
 */
export async function publishApprovedPackage(
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
  // The guides collection is served by src/pages/guides/[slug].astro, so the
  // publication route (and therefore live verification) must match it.
  const route = `/guides/${pkg.slug}/`;

  let existing: string | null = null;
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (existing !== null) {
    let parsedExisting: ReturnType<typeof parseArticle>;
    try {
      parsedExisting = parseArticle(existing, pkg.pillar, pkg.slug, filePath);
    } catch (error: any) {
      throw new Error(
        `Publication conflict: ${filePath} could not be parsed for content verification: ${error?.message || String(error)}`,
      );
    }
    const existingTitle = (parsedExisting.frontmatter.title || '').trim();
    const existingBody = (parsedExisting.content || '').trim();
    if (existingTitle !== pkg.title.trim() || existingBody !== cleanContent.trim()) {
      throw new Error(`Publication conflict: ${filePath} already contains different content.`);
    }
    // Same article, same body: leave the existing file untouched.
    return {
      publicationId,
      collection: 'guides',
      path: filePath,
      route,
      contentHash: item.contentHash,
      publishedAt: new Date().toISOString(),
    };
  }

  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, expected, 'utf8');

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

function parseApprovalQueueArtifact(raw: string): EditorialApprovalQueueItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: any) {
    throw new Error(`Approval queue artifact is not valid JSON: ${error?.message || String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Approval queue artifact must contain a JSON array of approval records.');
  }

  const seenIds = new Set<string>();
  const records: EditorialApprovalQueueItem[] = [];
  parsed.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Approval queue artifact record ${index + 1} must be a JSON object.`);
    }
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`Approval queue artifact record ${index + 1} is missing a valid, non-empty id.`);
    }
    // The first occurrence of an id within the artifact wins. Any later
    // occurrence is ignored just like an id that already exists locally.
    if (seenIds.has(id)) return;
    seenIds.add(id);
    records.push(entry as EditorialApprovalQueueItem);
  });

  return records;
}

/**
 * Append-only import of a manually downloaded GitHub Actions approval-queue
 * artifact. Existing local records are never modified or reordered. If the
 * artifact is invalid, the local queue is not written at all.
 */
export async function importApprovalQueue(
  artifactPath: string,
  customPath?: string,
): Promise<ApprovalQueueImportResult> {
  if (!artifactPath || !artifactPath.trim()) {
    throw new Error('An approval queue artifact path is required.');
  }

  const queuePath = getApprovalQueuePath(customPath);
  let raw: string;
  try {
    raw = await fs.readFile(resolve(artifactPath), 'utf8');
  } catch (error: any) {
    throw new Error(`Approval queue artifact could not be read: ${error?.message || String(error)}`);
  }

  const incoming = parseApprovalQueueArtifact(raw);

  return withApprovalLock(queuePath, async () => {
    const existing = await readQueue(queuePath);
    const knownIds = new Set(existing.map((item) => item.id));
    const added: EditorialApprovalQueueItem[] = [];
    const skippedIds: string[] = [];

    for (const item of incoming) {
      if (knownIds.has(item.id)) {
        skippedIds.push(item.id);
        continue;
      }
      knownIds.add(item.id);
      added.push(item);
    }

    if (added.length === 0) {
      return {
        queuePath,
        imported: 0,
        skipped: skippedIds.length,
        total: existing.length,
        importedIds: [],
        skippedIds,
      };
    }

    const merged = [...existing, ...added];
    const temporaryPath = `${queuePath}.import-${process.pid}-${randomUUID()}.tmp`;
    try {
      // Stage the complete merged queue first, then replace the real file.
      // A validation or staging failure leaves the existing queue untouched.
      await writeQueue(temporaryPath, merged);
      await fs.rename(temporaryPath, queuePath);
    } catch (error: any) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new Error(`Approval queue import could not be saved: ${error?.message || String(error)}`);
    }

    return {
      queuePath,
      imported: added.length,
      skipped: skippedIds.length,
      total: merged.length,
      importedIds: added.map((item) => item.id),
      skippedIds,
    };
  });
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
  const normalizedRequest = normalizeQueuedRequest(request, version);
  const item: EditorialApprovalQueueItem = {
    id: `approval-${contentId.replace(/[^a-z0-9:-]+/gi, '-')}-v${version}`,
    contentId,
    version,
    contentHash: articleContentHash(normalizedRequest),
    status: 'PENDING',
    publishingRequest: normalizedRequest,
    generationRequest,
    createdAt: now,
    updatedAt: now,
  };

  await writeQueue(queuePath, [...items, item]);
  return item;
}

async function approveEditorialQueueItemUnlocked(
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
  const manualReason = (input.manualAuthorization?.reason || '').trim();
  if (input.manualAuthorization !== undefined && !manualReason) {
    throw new Error('Manual publication authorization requires a stated reason.');
  }
  const reviewedAt = new Date().toISOString();
  const approval: HumanEditorialApproval = item.approval || {
    recordId: `${item.id}-${Date.now()}`,
    contentId: item.contentId,
    contentVersion: item.version,
    reviewer: input.reviewer?.trim() || 'human-review',
    reviewerType: 'human',
    decision: 'APPROVED',
    reviewedAt,
    ...(manualReason ? { manualAuthorization: { reason: manualReason, authorizedAt: reviewedAt } } : {}),
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

export async function approveEditorialQueueItem(
  id: string,
  input: ApprovalActionInput,
  customPath?: string,
  options: ApprovalPublicationOptions = {},
): Promise<ApprovalActionResult> {
  const queuePath = getApprovalQueuePath(customPath);
  return withApprovalLock(queuePath, () => approveEditorialQueueItemUnlocked(id, input, customPath, options));
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

export interface ApprovalReviewResult {
  item: EditorialApprovalQueueItem;
  review: ReviewResult;
}

/**
 * Runs the established AI Quality Review pipeline for one PENDING queue item
 * and stores the genuine result under the approval lock.
 *
 * The item stays PENDING: this never records a human approval, never writes an
 * article, and never releases. The content hash is recomputed with the same
 * normalization used at enqueue time, so the version/content-hash integrity
 * checks enforced at approval time keep applying afterwards.
 */
export async function reviewQueuedApprovalItem(
  id: string,
  input: ApprovalActionInput,
  providers: { reviewProvider: IAIReviewProvider },
  customPath?: string,
): Promise<ApprovalReviewResult> {
  const queuePath = getApprovalQueuePath(customPath);
  return withApprovalLock(queuePath, async () => {
    const items = await readQueue(queuePath);
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Approval item was not found.');
    const item = items[index];
    assertVersion(item, input.version);
    if (articleContentHash(item.publishingRequest) !== item.contentHash) {
      throw new Error('This approval item changed after it was queued and must be regenerated and reviewed again.');
    }
    if (item.status !== 'PENDING') {
      throw new Error('Only PENDING approval items can be reviewed.');
    }
    if (item.approval || item.publication) {
      throw new Error('An approval item with a recorded human approval or publication cannot be re-reviewed.');
    }

    const review = await runReviewPipeline({
      request: toReviewRequest(item, item.publishingRequest.article),
      provider: providers.reviewProvider,
    });

    const updatedRequest: PublishingRequest = {
      ...item.publishingRequest,
      review,
      context: {
        ...item.publishingRequest.context,
        humanApproval: undefined,
        contentVersion: item.version,
      },
    };
    const updated: EditorialApprovalQueueItem = {
      ...item,
      status: 'PENDING',
      contentHash: articleContentHash(updatedRequest),
      publishingRequest: updatedRequest,
      lastError: review.decision === 'PASS'
        ? undefined
        : `Queued AI review decision: ${review.decision}; human approval stays blocked until a review passes.`,
      updatedAt: new Date().toISOString(),
    };
    items[index] = updated;
    await writeQueue(queuePath, items);
    return { item: updated, review };
  });
}

export interface RequeueEditorialApprovalInput {
  version: number;
  context: Partial<
    Pick<
      PublishingContext,
      'contentType' | 'guideMode' | 'audience' | 'tags' | 'readerProblem' | 'searchTargets' | 'seoMetadata' | 'sourceUrls'
    >
  >;
}

/**
 * Corrects queued editorial metadata (for example `contentType`) through the
 * queue mechanism: the record is re-normalized and its content hash recomputed
 * exactly as `enqueueEditorialApproval` does, under the same lock.
 *
 * Article content, version, status, approval and publication are never changed
 * by this action, and an approved or published item is refused.
 */
export async function requeueEditorialApprovalItem(
  id: string,
  input: RequeueEditorialApprovalInput,
  customPath?: string,
): Promise<EditorialApprovalQueueItem> {
  const queuePath = getApprovalQueuePath(customPath);
  return withApprovalLock(queuePath, async () => {
    const items = await readQueue(queuePath);
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Approval item was not found.');
    const item = items[index];
    assertVersion(item, input.version);
    if (articleContentHash(item.publishingRequest) !== item.contentHash) {
      throw new Error('This approval item changed after it was queued and must be regenerated and reviewed again.');
    }
    if (item.approval || item.publication) {
      throw new Error('An approval item with a recorded human approval or publication cannot be requeued; request a revision instead.');
    }
    if (!input.context || Object.keys(input.context).length === 0) {
      throw new Error('Requeue requires at least one editorial metadata field to update.');
    }

    const nextRequest = normalizeQueuedRequest(
      {
        ...item.publishingRequest,
        context: {
          ...item.publishingRequest.context,
          ...input.context,
          humanApproval: undefined,
          contentVersion: item.version,
        },
      },
      item.version,
    );

    const updated: EditorialApprovalQueueItem = {
      ...item,
      contentHash: articleContentHash(nextRequest),
      publishingRequest: nextRequest,
      updatedAt: new Date().toISOString(),
    };
    items[index] = updated;
    await writeQueue(queuePath, items);
    return updated;
  });
}
