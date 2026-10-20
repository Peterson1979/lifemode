import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isApprovalAuthorizationValid } from '../src/lib/editorial/approval/auth.ts';
import {
  enqueueEditorialApproval,
  listApprovalQueue,
  approveEditorialQueueItem,
  requestEditorialRevision,
} from '../src/lib/editorial/approval/service.ts';
import type { PublishingRequest } from '../src/lib/editorial/publishing/types.ts';
import type { GenerationRequest } from '../src/lib/editorial/generation/types.ts';
import type { IGenerationProvider } from '../src/lib/editorial/generation/providers/types.ts';
import { FixtureReviewProvider } from '../src/lib/editorial/review/providers/fixture.ts';

const articleContent = `To clean a cast iron pan, remove loose residue, wash it with suitable soap and water, dry it promptly, and restore a thin protective layer. ${Array.from({ length: 100 }, (_, index) => `Practical cast-iron care sentence ${index + 1}.`).join(' ')}`;

function makeRequest(): PublishingRequest {
  return {
    article: {
      title: 'How to Clean a Cast Iron Pan Safely',
      slug: 'how-to-clean-cast-iron-pan-safely',
      description: 'A practical guide for testing the LifeMode approval workflow safely.',
      excerpt: 'A practical approval workflow test article.',
      content: `## Direct answer\n\n${articleContent}\n\n## Step-by-step cleaning\n\n1. Remove loose residue and rinse the pan.\n2. Dry the pan and apply a thin protective layer.\n\n## Common mistakes\n\nAvoid leaving the pan wet to prevent rust.`,
      faq: [],
      sources: [{ name: 'Official test source', url: 'https://www.usda.gov/' }],
      internalLinks: [],
      affiliateIntents: [],
      socialHooks: [],
    },
    review: {
      decision: 'PASS',
      overallScore: 92,
      dimensions: Object.fromEntries(['factuality', 'usefulness', 'originality', 'readability', 'structure', 'searchIntent', 'seo', 'editorialFit', 'safety', 'monetizationFit'].map((key) => [key, { score: 92, rationale: 'Pass', issues: [] }])) as any,
      criticalIssues: [],
      warnings: [],
      reviewer: 'AI test reviewer',
      metadata: { provider: 'test', model: 'test', reviewedAt: new Date().toISOString(), durationMs: 1 },
      gatePassed: true,
    },
    context: {
      topicId: 'how-to-clean-cast-iron-pan',
      pillar: 'life',
      format: 'guide',
      audience: 'LifeMode test readers',
      primaryIntent: 'informational',
      riskLevel: 'low',
      sourceUrls: ['https://www.usda.gov/'],
      contentVersion: 1,
    },
    options: { dryRun: false, allowNoImageFallback: true },
  };
}

const generationRequest = {
  topicId: 'how-to-clean-cast-iron-pan',
  titleAngle: 'How to Clean a Cast Iron Pan Safely',
  pillar: 'life',
  format: 'guide',
  audience: 'LifeMode test readers',
  primaryIntent: 'informational',
  affiliateIntent: false,
  riskLevel: 'low',
  searchTargets: { primaryKeyword: 'editorial approval test' },
} as GenerationRequest;

async function tempQueue(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-approval-'));
  return { path: path.join(dir, 'queue.json'), cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

test('Approval dashboard authorization rejects missing, wrong, and malformed tokens', () => {
  assert.equal(isApprovalAuthorizationValid(undefined, 'secret-token'), false);
  assert.equal(isApprovalAuthorizationValid('Bearer wrong-token', 'secret-token'), false);
  assert.equal(isApprovalAuthorizationValid('Basic secret-token', 'secret-token'), false);
  assert.equal(isApprovalAuthorizationValid('Bearer secret-token', 'secret-token'), true);
});

test('Approval workflow queues an exact version and records validated human approval', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    assert.equal(queued.status, 'PENDING');
    const approval = await approveEditorialQueueItem(queued.id, { reviewer: 'Editorial Lead', version: 1 }, queue.path);
    assert.equal(approval.item.status, 'APPROVED', JSON.stringify(approval.reasons));
    assert.equal(approval.item.approval?.reviewerType, 'human');
    assert.equal(approval.item.approval?.contentVersion, 1);
    assert.equal((await listApprovalQueue(queue.path))[0].status, 'APPROVED');
  } finally {
    await queue.cleanup();
  }
});

test('Approval version mismatch blocks approval and human revision returns to generation/review', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    const mismatch = await approveEditorialQueueItem(queued.id, { reviewer: 'Editorial Lead', version: 2 }, queue.path).catch((error) => error);
    assert.match(String(mismatch?.message), /version mismatch/i);

    const failingGeneration: IGenerationProvider = {
      name: 'Test unavailable generation provider',
      model: 'test',
      async generate() {
        throw new Error('generation unavailable');
      },
    };
    const revised = await requestEditorialRevision(
      queued.id,
      { reviewer: 'Editorial Lead', version: 1, feedback: 'Add a sourced warning and clarify the practical steps.' },
      { generationProvider: failingGeneration, reviewProvider: new FixtureReviewProvider({ outcome: 'PASS' }) },
      queue.path
    );
    assert.equal(revised.item.status, 'REVISION_REQUESTED');
    assert.equal(revised.item.approval, undefined);
    assert.match(revised.item.lastError || '', /generation unavailable/i);
  } finally {
    await queue.cleanup();
  }
});
