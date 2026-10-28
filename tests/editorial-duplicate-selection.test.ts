import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  runEditorialAutomation,
  FilesystemContentRepository,
  type IDiscoveryAdapter,
  type DiscoveryResult,
} from '../src/lib/editorial/index.ts';
import { checkTopicDuplicate } from '../src/lib/editorial/deduplication.ts';

const execFileAsync = promisify(execFile);

const GUIDE_TITLE = 'Organizing everyday tasks with Claude and ChatGPT';
const EQUIVALENT_TITLE = 'How Ordinary Users Can Organize Daily Life and Work with Claude and Chatgpt';
const PENDING_QUEUE_TITLE = 'How to Optimize Nordic Sauna Culture and Architecture for Everyday Clarity';
const NEW_TOPIC_TITLE = 'How to Build a Simple Home Emergency Kit for Power Outages';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeCandidate(id: string, canonicalTopic: string, pillar: 'tech-ai' | 'health' | 'home') {
  const now = new Date().toISOString();
  return {
    id,
    canonicalTopic,
    slug: slugify(canonicalTopic),
    pillar,
    sourceSignals: [],
    queryVariants: [canonicalTopic],
    scoring: {
      searchPotential: 92,
      pinterestPotential: 90,
      socialPotential: 90,
      lifeModeRelevance: 92,
      commercialPotential: 80,
      freshness: 92,
      competitionOpportunity: 85,
      originalityPotential: 90,
    },
    totalScore: 91,
    pinterestScore: 90,
    priorityTier: 'CANDIDATE',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: 90,
    createdAt: now,
    updatedAt: now,
    tags: [pillar, 'editorial'],
  };
}

function guideMarkdown(title: string): string {
  return `---
title: ${JSON.stringify(title)}
description: "A practical guide for everyday readers."
category: "everyday-how-to"
pubDate: "2026-10-20"
author: "LifeMode Editorial Team"
tags: ["tech-ai"]
featured: false
draft: false
format: "standard"
primaryIntent: "informational"
affiliateIntent: false
riskLevel: "low"
version: 1
lifecycleStatus: "PUBLISHED"
---

This is the existing published guide body.
`;
}

function pendingQueueRecord(title: string) {
  return {
    id: 'approval-pending-sauna-v1',
    contentId: 'health:how-to-optimize-nordic-sauna-culture-and-architecture-for-every-clarity',
    version: 1,
    contentHash: 'test-content-hash',
    status: 'PENDING',
    publishingRequest: {
      article: {
        title,
        slug: slugify(title),
      },
      context: {
        topicId: 'lm-health-20261027-nordic-sauna-culture',
        pillar: 'health',
      },
    },
    generationRequest: {
      titleAngle: title,
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };
}

async function createTempWorkspace() {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifemode-dedup-selection-'));
  const contentDir = path.join(repoDir, 'src', 'content');
  const storagePath = path.join(repoDir, 'candidates.json');
  const queuePath = path.join(repoDir, 'approval-queue.json');

  await fs.mkdir(path.join(contentDir, 'tech-ai'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'health'), { recursive: true });
  await fs.mkdir(path.join(contentDir, 'guides'), { recursive: true });

  await execFileAsync('git', ['init', '-b', 'master'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 'LifeMode Dedup Tester'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 'dedup-tester@lifemode.local'], { cwd: repoDir });
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Test Repo\n', 'utf-8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoDir });
  await execFileAsync('git', ['commit', '-m', 'chore: initial commit'], { cwd: repoDir });

  return {
    repoDir,
    contentDir,
    storagePath,
    queuePath,
    cleanup: async () => {
      await fs.rm(repoDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

test('1. Exact processed guide topic is excluded from automation selection', async () => {
  const { repoDir, contentDir, storagePath, queuePath, cleanup } = await createTempWorkspace();

  try {
    await fs.writeFile(
      path.join(contentDir, 'guides', `${slugify(GUIDE_TITLE)}.md`),
      guideMarkdown(GUIDE_TITLE),
      'utf-8'
    );

    const now = new Date().toISOString();
    await fs.writeFile(storagePath, JSON.stringify([makeCandidate('exact-guide', GUIDE_TITLE, 'tech-ai')], null, 2), 'utf-8');
    await fs.writeFile(queuePath, JSON.stringify([], null, 2), 'utf-8');

    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const emptyDiscovery: IDiscoveryAdapter = {
      name: 'Empty Adapter',
      sourceType: 'FIXTURE',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Empty Adapter',
        sourceType: 'FIXTURE',
        status: 'AVAILABLE',
        signals: [],
        fetchedAt: now,
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 5,
      isAiDay: false,
      discoveryAdapters: [emptyDiscovery],
      contentRepository: repository,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
      approvalQueuePath: queuePath,
      allowNoImageFallback: true,
    });

    assert.equal(result.selectedCount, 0);
    assert.equal(result.opportunities.length, 0);
  } finally {
    await cleanup();
  }
});

test('2. Differently worded equivalent topic is excluded from automation selection', async () => {
  const { repoDir, contentDir, storagePath, queuePath, cleanup } = await createTempWorkspace();

  try {
    await fs.writeFile(
      path.join(contentDir, 'guides', `${slugify(GUIDE_TITLE)}.md`),
      guideMarkdown(GUIDE_TITLE),
      'utf-8'
    );

    const now = new Date().toISOString();
    await fs.writeFile(
      storagePath,
      JSON.stringify([makeCandidate('claude-rewrite', EQUIVALENT_TITLE, 'tech-ai')], null, 2),
      'utf-8'
    );
    await fs.writeFile(queuePath, JSON.stringify([], null, 2), 'utf-8');

    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const emptyDiscovery: IDiscoveryAdapter = {
      name: 'Empty Adapter',
      sourceType: 'FIXTURE',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Empty Adapter',
        sourceType: 'FIXTURE',
        status: 'AVAILABLE',
        signals: [],
        fetchedAt: now,
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 5,
      isAiDay: false,
      discoveryAdapters: [emptyDiscovery],
      contentRepository: repository,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
      approvalQueuePath: queuePath,
      allowNoImageFallback: true,
    });

    assert.equal(result.selectedCount, 0);
    assert.equal(result.opportunities.length, 0);
  } finally {
    await cleanup();
  }
});

test('3. PENDING approval queue topic is excluded while a genuinely new topic remains eligible', async () => {
  const { repoDir, contentDir, storagePath, queuePath, cleanup } = await createTempWorkspace();

  try {
    const queueRecord = pendingQueueRecord(PENDING_QUEUE_TITLE);
    const originalQueueJson = JSON.stringify([queueRecord], null, 2);
    await fs.writeFile(queuePath, originalQueueJson, 'utf-8');

    const now = new Date().toISOString();
    const candidates = [
      makeCandidate('pending-sauna', PENDING_QUEUE_TITLE, 'health'),
      makeCandidate('new-emergency-kit', NEW_TOPIC_TITLE, 'home'),
    ];
    await fs.writeFile(storagePath, JSON.stringify(candidates, null, 2), 'utf-8');

    const repository = new FilesystemContentRepository({ contentRoot: contentDir });
    const emptyDiscovery: IDiscoveryAdapter = {
      name: 'Empty Adapter',
      sourceType: 'FIXTURE',
      fetchSignals: async (): Promise<DiscoveryResult> => ({
        provider: 'Empty Adapter',
        sourceType: 'FIXTURE',
        status: 'AVAILABLE',
        signals: [],
        fetchedAt: now,
      }),
    };

    const result = await runEditorialAutomation({
      enabled: true,
      dryRun: true,
      maxOpportunities: 5,
      isAiDay: false,
      discoveryAdapters: [emptyDiscovery],
      contentRepository: repository,
      contentRoot: contentDir,
      gitRepoRoot: repoDir,
      storagePath,
      approvalQueuePath: queuePath,
      allowNoImageFallback: true,
    });

    assert.equal(result.selectedCount, 1);
    assert.equal(result.opportunities.length, 1);
    assert.equal(result.opportunities[0].topicId, 'new-emergency-kit');

    const queueAfter = await fs.readFile(queuePath, 'utf-8');
    assert.equal(queueAfter, originalQueueJson, 'The existing approval queue must not be modified');
  } finally {
    await cleanup();
  }
});

test('4. Normalized identity catches Claude/ChatGPT and circadian rewrites but not unrelated topics', () => {
  const claudeExisting = [{ canonicalTopic: GUIDE_TITLE, slug: slugify(GUIDE_TITLE) }];
  const circadianExisting = [
    {
      canonicalTopic: 'How to use morning sunlight and evening blue-light control for deeper sleep',
      slug: 'circadian-light-morning-sun-blue-light-sleep',
    },
  ];

  const exact = checkTopicDuplicate(GUIDE_TITLE, claudeExisting);
  assert.equal(exact.isDuplicate, true);

  const claudeRewrite = checkTopicDuplicate(EQUIVALENT_TITLE, claudeExisting);
  assert.equal(claudeRewrite.isDuplicate, true);
  assert.equal(claudeRewrite.reason, 'TOPIC_IDENTITY_MATCH');

  const circadianRewrite = checkTopicDuplicate(
    'Topic 4 Circadian Rhythm Lighting: Timing, Dosage, and Daily Optimization Protocol',
    circadianExisting
  );
  assert.equal(circadianRewrite.isDuplicate, true);
  assert.equal(circadianRewrite.reason, 'TOPIC_IDENTITY_MATCH');

  const newTopic = checkTopicDuplicate(NEW_TOPIC_TITLE, [...claudeExisting, ...circadianExisting]);
  assert.equal(newTopic.isDuplicate, false);
});
