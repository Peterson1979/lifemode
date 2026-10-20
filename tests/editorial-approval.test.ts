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
  rejectEditorialQueueItem,
  requestEditorialRevision,
  approvalContentFingerprint,
} from '../src/lib/editorial/approval/service.ts';
import type { PublishingRequest } from '../src/lib/editorial/publishing/types.ts';
import type { GenerationRequest } from '../src/lib/editorial/generation/types.ts';
import type { IGenerationProvider } from '../src/lib/editorial/generation/providers/types.ts';
import { FixtureReviewProvider } from '../src/lib/editorial/review/providers/fixture.ts';
import { releaseApprovedArticle } from '../src/lib/editorial/approval/release.ts';

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

async function tempQueue(): Promise<{ path: string; contentRoot: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-approval-'));
  return { path: path.join(dir, 'queue.json'), contentRoot: path.join(dir, 'content'), cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
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
    let releaseCalled = false;
    const approval = await approveEditorialQueueItem(queued.id, { version: 1 }, queue.path, {
      contentRoot: queue.contentRoot,
      release: async (request) => {
        releaseCalled = true;
        assert.equal(request.route, '/food-kitchen/how-to-clean-cast-iron-pan-safely/');
        return { commitHash: 'test-commit', url: `https://lifemode.life${request.route}` };
      },
    });
    assert.equal(approval.item.status, 'APPROVED', JSON.stringify(approval.reasons));
    assert.equal(approval.item.approval?.reviewerType, 'human');
    assert.equal(approval.item.approval?.contentVersion, 1);
    assert.equal(approval.item.publication?.collection, 'guides');
    assert.equal(releaseCalled, true);
    assert.equal(approval.item.publication?.route, '/food-kitchen/how-to-clean-cast-iron-pan-safely/');
    assert.match(await fs.readFile(path.join(queue.contentRoot, 'guides', 'how-to-clean-cast-iron-pan-safely.md'), 'utf8'), /How to Clean a Cast Iron Pan Safely/);
    assert.equal((await listApprovalQueue(queue.path))[0].status, 'APPROVED');
  } finally {
    await queue.cleanup();
  }
});

test('Queued fingerprints use the persisted normalized request', async () => {
  const queue = await tempQueue();
  try {
    const request = makeRequest();
    request.options = { ...request.options, dryRun: true };
    delete request.context.contentVersion;
    const queued = await enqueueEditorialApproval(request, generationRequest, queue.path);
    assert.equal(queued.contentHash, approvalContentFingerprint(queued.publishingRequest));
    const approved = await approveEditorialQueueItem(queued.id, { version: 1 }, queue.path, { contentRoot: queue.contentRoot, autoRelease: false });
    assert.equal(approved.item.status, 'APPROVED');
  } finally {
    await queue.cleanup();
  }
});

test('Approval version mismatch blocks approval and human revision returns to generation/review', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    const mismatch = await approveEditorialQueueItem(queued.id, { version: 2 }, queue.path, { contentRoot: queue.contentRoot, autoRelease: false }).catch((error) => error);
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
      { version: 1, feedback: 'Add a sourced warning and clarify the practical steps.' },
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

test('Approval fingerprint is stable after queue normalization and still detects edits', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    const approved = await approveEditorialQueueItem(queued.id, { version: 1 }, queue.path, { contentRoot: queue.contentRoot, autoRelease: false });
    assert.equal(approved.item.status, 'APPROVED');

    const records = JSON.parse(await fs.readFile(queue.path, 'utf8'));
    records[0].publishingRequest.article.content += '\n\nTampered after review.';
    await fs.writeFile(queue.path, JSON.stringify(records, null, 2));
    const mismatch = await rejectEditorialQueueItem(queued.id, { version: 1 }, queue.path).catch((error) => error);
    assert.match(String(mismatch?.message), /changed after it was queued/i);
  } finally {
    await queue.cleanup();
  }
});

test('Reject action does not require a reviewer name', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    const rejected = await rejectEditorialQueueItem(queued.id, { version: 1, feedback: 'Needs a clearer safety note.' }, queue.path);
    assert.equal(rejected.item.status, 'REJECTED');
    assert.equal(rejected.item.revisionNotes, 'Needs a clearer safety note.');
  } finally {
    await queue.cleanup();
  }
});

test('Approval publication failure leaves the item pending and retry is idempotent', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    const target = path.join(queue.contentRoot, 'guides', 'how-to-clean-cast-iron-pan-safely.md');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'unrelated content', 'utf8');
    const failed = await approveEditorialQueueItem(queued.id, { version: 1 }, queue.path, { contentRoot: queue.contentRoot, autoRelease: false }).catch((error) => error);
    assert.match(String(failed?.message), /Publication failed/i);
    assert.equal((await listApprovalQueue(queue.path))[0].status, 'PENDING');

    await fs.rm(target);
    const published = await approveEditorialQueueItem(queued.id, { version: 1 }, queue.path, { contentRoot: queue.contentRoot, autoRelease: false });
    const firstPublishedBody = await fs.readFile(target, 'utf8');
    const retried = await approveEditorialQueueItem(published.item.id, { version: 1 }, queue.path, { contentRoot: queue.contentRoot, autoRelease: false });
    assert.equal(retried.item.status, 'APPROVED');
    assert.equal(retried.item.publication?.path, published.item.publication?.path);
    assert.equal(await fs.readFile(target, 'utf8'), firstPublishedBody);
  } finally {
    await queue.cleanup();
  }
});

test('Pending queue articles remain unpublished', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    assert.equal(queued.status, 'PENDING');
    assert.deepEqual(await fs.readdir(queue.contentRoot).catch(() => []), []);
  } finally {
    await queue.cleanup();
  }
});

test('Release failure is surfaced after local approval and never reported as success', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    const failure = await approveEditorialQueueItem(queued.id, { version: 1 }, queue.path, {
      contentRoot: queue.contentRoot,
      release: async () => { throw new Error('push rejected'); },
    }).catch((error) => error);
    assert.match(String(failure?.message), /Release failed.*push rejected/i);
    assert.equal((await listApprovalQueue(queue.path))[0].status, 'APPROVED');
  } finally {
    await queue.cleanup();
  }
});

test('Concurrent approvals serialize against one queue snapshot', async () => {
  const queue = await tempQueue();
  try {
    const queued = await enqueueEditorialApproval(makeRequest(), generationRequest, queue.path);
    let activeReleases = 0;
    let maximumConcurrentReleases = 0;
    const release = async () => {
      activeReleases += 1;
      maximumConcurrentReleases = Math.max(maximumConcurrentReleases, activeReleases);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeReleases -= 1;
      return { commitHash: 'serialized-commit', url: 'https://lifemode.life/everyday-how-to/how-to-clean-cast-iron-pan-safely/' };
    };
    const results = await Promise.all([
      approveEditorialQueueItem(queued.id, { version: 1 }, queue.path, { contentRoot: queue.contentRoot, release }),
      approveEditorialQueueItem(queued.id, { version: 1 }, queue.path, { contentRoot: queue.contentRoot, release }),
    ]);
    assert.equal(maximumConcurrentReleases, 1);
    assert.equal(results[0].item.status, 'APPROVED');
    assert.equal(results[1].item.status, 'APPROVED');
  } finally {
    await queue.cleanup();
  }
});

test('Release stages only the approved article and queue, pushes, and verifies the live URL', async () => {
  const calls: string[][] = [];
  const fakeGit = {
    async getRepoStatus() { return { stagedFiles: [] }; },
    async runGit(args: string[]) {
      calls.push(args);
      return { stdout: args[0] === 'diff' ? 'data/editorial/approval-queue.json\nsrc/content/guides/article.md' : '', stderr: '' };
    },
    async createCommit() { return 'commit-123'; },
    async push(_repo: string, remote: string, branch: string) { calls.push(['push', remote, branch]); return undefined; },
  };
  let verified = false;
  const result = await releaseApprovedArticle({
    articlePath: path.resolve('src/content/guides/article.md'),
    queuePath: path.resolve('data/editorial/approval-queue.json'),
    route: '/food-kitchen/article/',
    title: 'Article',
  }, {
    gitCli: fakeGit as any,
    repoRoot: process.cwd(),
    verify: async (url, title) => { verified = url.endsWith('/food-kitchen/article/'); assert.equal(title, 'Article'); },
  });
  assert.equal(result.commitHash, 'commit-123');
  assert.equal(verified, true);
  assert.deepEqual(calls.find((args) => args[0] === 'add')?.slice(0, 2), ['add', '--']);
  assert.deepEqual(calls.find((args) => args[0] === 'push')?.slice(0, 3), ['push', 'origin', 'master']);
});
