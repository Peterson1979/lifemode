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
}

export interface ApprovalActionResult {
  item: EditorialApprovalQueueItem;
  reasons?: string[];
}

export interface ApprovalActionInput {
  reviewer: string;
  version: number;
  feedback?: string;
}

const DEFAULT_QUEUE_PATH = resolve(process.cwd(), 'data', 'editorial', 'approval-queue.json');

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

function assertReviewer(reviewer: string): string {
  const normalized = reviewer.trim();
  if (!normalized || normalized.length < 2 || normalized.length > 120) {
    throw new Error('A named human reviewer is required.');
  }
  return normalized;
}

function articleContentHash(request: PublishingRequest): string {
  return createHash('sha256').update(JSON.stringify({
    article: request.article,
    context: { ...request.context, humanApproval: undefined },
    review: request.review,
  })).digest('hex');
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
  const reviewer = assertReviewer(input.reviewer);
  const approval: HumanEditorialApproval = {
    recordId: `${item.id}-${Date.now()}`,
    contentId: item.contentId,
    contentVersion: item.version,
    reviewer,
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

  const updated: EditorialApprovalQueueItem = {
    ...item,
    status: 'APPROVED',
    publishingRequest: request,
    approval,
    revisionNotes: undefined,
    lastError: undefined,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  await writeQueue(queuePath, items);
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
  assertReviewer(input.reviewer);
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
  const reviewer = assertReviewer(input.reviewer);
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
    contentInstructions: `${item.generationRequest.contentInstructions || ''}\nHuman editor revision request from ${reviewer}: ${feedback}`.trim(),
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
    revisionNotes: `Revision requested by ${reviewer}: ${feedback}`,
    lastError: undefined,
    approval: undefined,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  await writeQueue(queuePath, items);
  return { item: updated };
}
