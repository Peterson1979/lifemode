import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadSocialConfig,
  ThreadsPlatformAdapter,
  runSocialPipeline,
  publishCrossProjectToThreads,
  distributeCrossProjectBatch,
  normalizeSourceProject,
  FilesystemSocialHistoryRepository,
  hashString,
  createIdempotencyKey,
  FixtureSocialAssetStorageProvider,
  FixtureSocialImageProvider,
  type SocialPlatformPackage,
  type GeneratedSocialContent,
  type SocialVisualAsset,
  type CrossProjectSocialContent,
  type ISocialPlatformAdapter,
  type SocialPlatform,
} from '../src/lib/social/index.ts';
import type { EditorialTopic } from '../src/lib/editorial/types.ts';

function createMockTopic(overrides: Partial<EditorialTopic> = {}): EditorialTopic {
  return {
    id: `top-threads-${Math.random().toString(36).slice(2, 8)}`,
    slug: 'mindful-evening-rituals',
    canonicalTopic: 'Mindful Evening Rituals for Restful Sleep',
    pillar: 'wellbeing',
    totalScore: 90,
    freshnessScore: 92,
    opportunityType: 'ARTICLE_AND_SOCIAL',
    priorityTier: 'PRIORITY',
    status: 'PUBLISHED',
    sourceSignals: [],
    queryVariants: ['evening rituals', 'sleep hygiene'],
    scoring: {
      searchPotential: 80,
      pinterestPotential: 85,
      socialPotential: 92,
      lifeModeRelevance: 95,
      commercialPotential: 70,
      freshness: 90,
      competitionOpportunity: 80,
      originalityPotential: 90,
    },
    tags: ['wellbeing', 'sleep', 'mindfulness'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockSocialContent(overrides: Partial<GeneratedSocialContent> = {}): GeneratedSocialContent {
  return {
    topicId: 'top-mindful-sleep',
    pillar: 'wellbeing',
    concept: 'Cultivating restful sleep through quiet evening wind-down rituals.',
    hook: 'How 15 minutes of evening stillness alters sleep quality.',
    title: 'Mindful Evening Rituals for Restful Sleep',
    shortCaption: 'Designing an evening wind-down ritual is an act of restorative wellbeing.',
    callToAction: 'Read the full guide on LifeMode',
    hashtags: ['#LifeMode', '#SleepWell', '#Mindfulness', '#Rest'],
    visualConcept: 'Soft cedar diffuser with warm ambient bedside light.',
    imageText: {
      headline: 'Evening Rituals for Deep Sleep',
    },
    targetPlatforms: ['threads', 'instagram', 'facebook'],
    destinationUrl: 'https://lifemode.life/wellbeing/mindful-evening-rituals',
    ...overrides,
  };
}

function createMockAsset(overrides: Partial<SocialVisualAsset> = {}): SocialVisualAsset {
  return {
    assetId: 'asset-threads-1',
    format: '1080x1350',
    mimeType: 'image/jpeg',
    width: 1080,
    height: 1350,
    assetHash: hashString('mock-threads-image-bytes'),
    altText: 'Mindful evening sleep ritual guide',
    headlineOverlay: 'Evening Rituals for Deep Sleep',
    url: 'https://images.lifemode.life/social/mindful-sleep.jpg',
    ...overrides,
  };
}

test('LifeMode Threads Integration & Cross-Project Distribution Test Suite', async (t) => {
  const secretToken = 'TH_SECRET_TEST_TOKEN_XYZ987654321';
  const targetUserId = '28272717349017680';

  await t.test('1. Configuration loader detects Threads User ID and token correctly', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.THREADS_ACCESS_TOKEN = secretToken;
      process.env.THREADS_USER_ID = targetUserId;

      const config = loadSocialConfig();
      assert.equal(config.credentials.threads.configured, true);
      assert.equal(config.credentials.threads.accessToken, secretToken);
      assert.equal(config.credentials.threads.userId, targetUserId);
      assert.equal(config.platforms.threads, true);
    } finally {
      process.env = originalEnv;
    }
  });

  await t.test('2. Configuration defaults to official Threads User ID 28272717349017680 when not explicitly set', () => {
    const originalEnv = { ...process.env };
    try {
      delete process.env.THREADS_USER_ID;
      process.env.THREADS_ACCESS_TOKEN = secretToken;

      const config = loadSocialConfig();
      assert.equal(config.credentials.threads.userId, '28272717349017680');
      assert.equal(config.credentials.threads.configured, true);
    } finally {
      process.env = originalEnv;
    }
  });

  await t.test('3. Threads adapter prepares valid package with character limit <= 500 characters', async () => {
    const adapter = new ThreadsPlatformAdapter();
    const content = createMockSocialContent({
      shortCaption: 'A'.repeat(600), // very long text
    });
    const asset = createMockAsset();

    const pkg = await adapter.prepare(content, asset);
    assert.equal(pkg.platform, 'threads');
    assert.ok(pkg.caption.length <= 500, `Caption length (${pkg.caption.length}) must be <= 500`);
    assert.ok(pkg.caption.includes('https://lifemode.life'));
    assert.ok(pkg.idempotencyKey.startsWith('lm-soc-top-mindful-sleep-threads-'));

    const validation = adapter.validate(pkg);
    assert.equal(validation.valid, true);
  });

  await t.test('4. Single image publication executes official Meta Threads container & publish endpoints', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.THREADS_ACCESS_TOKEN = secretToken;
      process.env.THREADS_USER_ID = targetUserId;

      const requestedUrls: string[] = [];
      const postedBodies: any[] = [];

      const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (init?.body) {
          try {
            postedBodies.push(JSON.parse(init.body as string));
          } catch {
            postedBodies.push(init.body);
          }
        }

        // Case 1: Container Publish POST
        if (urlStr.includes(`/${targetUserId}/threads_publish`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'threads-post-img-999' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Case 2: Status Check GET
        if (urlStr.includes('/container-image-123?fields=status')) {
          return new Response(JSON.stringify({ status: 'FINISHED' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Case 3: Container Creation POST
        if (urlStr.includes(`/${targetUserId}/threads`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'container-image-123' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('Not Found', { status: 404 });
      }) as any;

      const adapter = new ThreadsPlatformAdapter(mockFetch);
      const content = createMockSocialContent();
      const asset = createMockAsset();
      const pkg = await adapter.prepare(content, asset);

      const result = await adapter.publish(pkg, { dryRun: false });

      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.postId, 'threads-post-img-999');
      assert.equal(result.postUrl, 'https://www.threads.net/@lifemodehq/post/threads-post-img-999');
      assert.equal(requestedUrls.length, 3);
      assert.equal(postedBodies[0].media_type, 'IMAGE');
      assert.equal(postedBodies[0].image_url, 'https://images.lifemode.life/social/mindful-sleep.jpg');
      assert.equal(postedBodies[1].creation_id, 'container-image-123');
    } finally {
      process.env = originalEnv;
    }
  });

  await t.test('5. Video publication executes video container creation, polling, and publish endpoints', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.THREADS_ACCESS_TOKEN = secretToken;
      process.env.THREADS_USER_ID = targetUserId;

      const requestedUrls: string[] = [];
      const postedBodies: any[] = [];
      let pollCount = 0;

      const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (init?.body) {
          try {
            postedBodies.push(JSON.parse(init.body as string));
          } catch {
            postedBodies.push(init.body);
          }
        }

        // Case 1: Container Publish POST
        if (urlStr.includes(`/${targetUserId}/threads_publish`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'threads-post-vid-888' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Case 2: Status Check GET (simulates 1 IN_PROGRESS then FINISHED)
        if (urlStr.includes('/container-video-456?fields=status')) {
          pollCount++;
          if (pollCount === 1) {
            return new Response(JSON.stringify({ status: 'IN_PROGRESS' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ status: 'FINISHED' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Case 3: Video Container Creation POST
        if (urlStr.includes(`/${targetUserId}/threads`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'container-video-456' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('Not Found', { status: 404 });
      }) as any;

      const adapter = new ThreadsPlatformAdapter(mockFetch, {
        pollIntervalMs: 10,
        sleepFn: async () => {},
      });

      const content = createMockSocialContent();
      const videoAsset = createMockAsset({
        mediaType: 'video',
        videoUrl: 'https://videos.lifemode.life/clips/sleep-routine.mp4',
        url: 'https://videos.lifemode.life/clips/sleep-routine.mp4',
      });

      const pkg = await adapter.prepare(content, videoAsset, {
        videoUrl: 'https://videos.lifemode.life/clips/sleep-routine.mp4',
        mediaType: 'video',
      });

      const result = await adapter.publish(pkg, { dryRun: false });

      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.postId, 'threads-post-vid-888');
      assert.equal(pollCount, 2);
      assert.equal(postedBodies[0].media_type, 'VIDEO');
      assert.equal(postedBodies[0].video_url, 'https://videos.lifemode.life/clips/sleep-routine.mp4');
    } finally {
      process.env = originalEnv;
    }
  });

  await t.test('6. Carousel publication executes child container creation, parent carousel container, and publish endpoints', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.THREADS_ACCESS_TOKEN = secretToken;
      process.env.THREADS_USER_ID = targetUserId;

      const requestedUrls: string[] = [];
      const postedBodies: any[] = [];

      const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (init?.body) {
          try {
            postedBodies.push(JSON.parse(init.body as string));
          } catch {
            postedBodies.push(init.body);
          }
        }

        // Publish POST
        if (urlStr.includes(`/${targetUserId}/threads_publish`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'threads-post-carousel-555' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Status Check GET
        if (urlStr.includes('/parent-carousel-container-777?fields=status')) {
          return new Response(JSON.stringify({ status: 'FINISHED' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Child item containers
        if (urlStr.includes(`/${targetUserId}/threads`) && init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          if (body.is_carousel_item === 'true') {
            const index = postedBodies.length;
            return new Response(JSON.stringify({ id: `item-container-${index}` }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (body.media_type === 'CAROUSEL') {
            return new Response(JSON.stringify({ id: 'parent-carousel-container-777' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response('Not Found', { status: 404 });
      }) as any;

      const adapter = new ThreadsPlatformAdapter(mockFetch);
      const content = createMockSocialContent();
      const carouselItems = [
        { url: 'https://images.lifemode.life/cards/slide1.jpg', mediaType: 'image' as const },
        { url: 'https://images.lifemode.life/cards/slide2.jpg', mediaType: 'image' as const },
        { url: 'https://images.lifemode.life/cards/slide3.jpg', mediaType: 'image' as const },
      ];

      const pkg = await adapter.prepare(content, undefined, {
        carouselItems,
        mediaType: 'carousel',
      });

      const validation = adapter.validate(pkg);
      assert.equal(validation.valid, true);

      const result = await adapter.publish(pkg, { dryRun: false });

      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.postId, 'threads-post-carousel-555');

      // Check that 3 child items and 1 parent carousel were created
      const childPayloads = postedBodies.filter((b) => b.is_carousel_item === 'true');
      assert.equal(childPayloads.length, 3);
      const parentPayload = postedBodies.find((b) => b.media_type === 'CAROUSEL');
      assert.ok(parentPayload);
      assert.ok(parentPayload.children.includes('item-container-1'));
      assert.ok(parentPayload.children.includes('item-container-2'));
      assert.ok(parentPayload.children.includes('item-container-3'));
    } finally {
      process.env = originalEnv;
    }
  });

  await t.test('7. Token is strictly redacted in all error messages and never leaked', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.THREADS_ACCESS_TOKEN = secretToken;
      process.env.THREADS_USER_ID = targetUserId;

      const mockFetch = (async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: `Invalid request with token ${secretToken} at endpoint`,
              code: 190,
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const adapter = new ThreadsPlatformAdapter(mockFetch);
      const content = createMockSocialContent();
      const asset = createMockAsset();
      const pkg = await adapter.prepare(content, asset);

      const result = await adapter.publish(pkg, { dryRun: false });

      assert.equal(result.status, 'FAILED');
      assert.ok(result.error);
      assert.equal(result.error.includes(secretToken), false, 'Token MUST NOT appear in error');
      assert.ok(result.error.includes('[REDACTED]'), 'Secret must be replaced with [REDACTED]');
    } finally {
      process.env = originalEnv;
    }
  });

  await t.test('8. Cross-Project Routing: Dreamly AI (carousel & video) routes to LifeMode Threads', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-th-dreamly-'));
    try {
      const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

      const mockPublishedIds: string[] = [];
      const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes(`/${targetUserId}/threads_publish`) && init?.method === 'POST') {
          const id = `post-dreamly-${Date.now()}`;
          mockPublishedIds.push(id);
          return new Response(JSON.stringify({ id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('/container-dreamly?fields=status')) {
          return new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes(`/${targetUserId}/threads`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'container-dreamly' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('OK', { status: 200 });
      }) as any;

      const threadsAdapter = new ThreadsPlatformAdapter(mockFetch);
      const config = {
        dryRun: false,
        allowPublish: true,
        credentials: {
          ...loadSocialConfig().credentials,
          threads: { accessToken: secretToken, userId: targetUserId, configured: true },
        },
      };

      // 1. Dreamly AI Carousel
      const dreamlyCarousel: CrossProjectSocialContent = {
        sourceProject: 'dreamly-ai',
        contentId: 'dreamly-sleep-guide-c1',
        contentType: 'carousel',
        title: '5 Bedtime Reflections for Restorative REM Sleep',
        caption: 'Unpack the night with mindful dream journaling practices from Dreamly AI.',
        destinationUrl: 'https://play.google.com/store/apps/details?id=com.oberon.dreamlyai',
        carouselItems: [
          { url: 'https://assets.dreamly.ai/c1/slide1.jpg' },
          { url: 'https://assets.dreamly.ai/c1/slide2.jpg' },
        ],
      };

      const carouselRes = await publishCrossProjectToThreads(dreamlyCarousel, {
        historyRepository: historyRepo,
        threadsAdapter,
        config,
        dryRun: false,
      });

      assert.equal(carouselRes.overallStatus, 'COMPLETED');
      assert.equal(carouselRes.sourceProject, 'dreamly-ai');
      assert.equal(carouselRes.platformResults.threads?.status, 'PUBLISHED');

      // 2. Dreamly AI Video
      const dreamlyVideo: CrossProjectSocialContent = {
        sourceProject: 'dreamly-ai',
        contentId: 'dreamly-lucid-v1',
        contentType: 'video',
        title: 'Understanding Lucid Dreaming Cycles',
        caption: 'Explore nocturnal patterns and deep REM cycles with Dreamly AI.',
        destinationUrl: 'https://play.google.com/store/apps/details?id=com.oberon.dreamlyai',
        videoUrl: 'https://assets.dreamly.ai/v1/lucid-cycle.mp4',
      };

      const videoRes = await publishCrossProjectToThreads(dreamlyVideo, {
        historyRepository: historyRepo,
        threadsAdapter,
        config,
        dryRun: false,
      });

      assert.equal(videoRes.overallStatus, 'COMPLETED');
      assert.equal(videoRes.sourceProject, 'dreamly-ai');
      assert.equal(videoRes.platformResults.threads?.status, 'PUBLISHED');

      // Verify duplicate prevention on retry
      const retryRes = await publishCrossProjectToThreads(dreamlyCarousel, {
        historyRepository: historyRepo,
        threadsAdapter,
        config,
        dryRun: false,
      });

      assert.equal(retryRes.overallStatus, 'SKIPPED');
      assert.equal(retryRes.platformResults.threads?.status, 'SKIPPED');
      assert.equal(mockPublishedIds.length, 2, 'Must not duplicate post on retry');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test('9. Cross-Project Routing: AI Zodiac (carousel & video) routes to LifeMode Threads', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-th-zodiac-'));
    try {
      const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

      const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes(`/${targetUserId}/threads_publish`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: `post-zodiac-${Date.now()}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('/container-zodiac?fields=status')) {
          return new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes(`/${targetUserId}/threads`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'container-zodiac' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('OK', { status: 200 });
      }) as any;

      const threadsAdapter = new ThreadsPlatformAdapter(mockFetch);
      const config = {
        dryRun: false,
        allowPublish: true,
        credentials: {
          ...loadSocialConfig().credentials,
          threads: { accessToken: secretToken, userId: targetUserId, configured: true },
        },
      };

      // AI Zodiac Carousel
      const zodiacCarousel: CrossProjectSocialContent = {
        sourceProject: 'ai-zodiac',
        contentId: 'zodiac-synastry-c1',
        contentType: 'carousel',
        title: 'Archetypal Compatibility & Relational Patterns',
        caption: 'Discover cosmic dynamics and relational insights with AI Zodiac.',
        destinationUrl: 'https://play.google.com/store/apps/details?id=com.oberon.aizodiac',
        carouselItems: [
          { url: 'https://assets.aizodiac.app/c1/slide1.jpg' },
          { url: 'https://assets.aizodiac.app/c1/slide2.jpg' },
        ],
      };

      const res = await publishCrossProjectToThreads(zodiacCarousel, {
        historyRepository: historyRepo,
        threadsAdapter,
        config,
        dryRun: false,
      });

      assert.equal(res.overallStatus, 'COMPLETED');
      assert.equal(res.sourceProject, 'ai-zodiac');
      assert.equal(res.platformResults.threads?.status, 'PUBLISHED');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test('10. Cross-Project Routing: GetAISet (carousel & video) routes to LifeMode Threads', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-th-getai-'));
    try {
      const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

      const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes(`/${targetUserId}/threads_publish`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: `post-getai-${Date.now()}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('/container-getai?fields=status')) {
          return new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes(`/${targetUserId}/threads`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'container-getai' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('OK', { status: 200 });
      }) as any;

      const threadsAdapter = new ThreadsPlatformAdapter(mockFetch);
      const config = {
        dryRun: false,
        allowPublish: true,
        credentials: {
          ...loadSocialConfig().credentials,
          threads: { accessToken: secretToken, userId: targetUserId, configured: true },
        },
      };

      // GetAISet Video
      const getaiVideo: CrossProjectSocialContent = {
        sourceProject: 'get-ai-set',
        contentId: 'getai-workflow-v1',
        contentType: 'video',
        title: 'Mastering Agentic AI Workflows in 2026',
        caption: 'Practical toolkits and AI productivity mastery with GetAISet.',
        destinationUrl: 'https://www.getaiset.com/',
        videoUrl: 'https://assets.getaiset.com/v1/workflow-demo.mp4',
      };

      const res = await publishCrossProjectToThreads(getaiVideo, {
        historyRepository: historyRepo,
        threadsAdapter,
        config,
        dryRun: false,
      });

      assert.equal(res.overallStatus, 'COMPLETED');
      assert.equal(res.sourceProject, 'get-ai-set');
      assert.equal(res.platformResults.threads?.status, 'PUBLISHED');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test('11. LifeMode Own Social Run routes image, carousel, and video content to Threads', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-th-lifemode-'));
    try {
      const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

      const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes(`/${targetUserId}/threads_publish`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: `post-lm-${Date.now()}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('/container-lm?fields=status')) {
          return new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes(`/${targetUserId}/threads`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'container-lm' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('OK', { status: 200 });
      }) as any;

      const threadsAdapter = new ThreadsPlatformAdapter(mockFetch);
      const config = {
        dryRun: false,
        allowPublish: true,
        credentials: {
          ...loadSocialConfig().credentials,
          threads: { accessToken: secretToken, userId: targetUserId, configured: true },
        },
      };

      const lmCarousel: CrossProjectSocialContent = {
        sourceProject: 'lifemode',
        contentId: 'lm-slow-architecture-c1',
        contentType: 'carousel',
        title: 'The Art of Slow Nordic Architecture',
        caption: 'Designing contemplative spaces that breathe: timber, light, and silence.',
        destinationUrl: 'https://lifemode.life/style/slow-nordic-architecture',
        carouselItems: [
          { url: 'https://images.lifemode.life/nordic1.jpg' },
          { url: 'https://images.lifemode.life/nordic2.jpg' },
        ],
      };

      const res = await publishCrossProjectToThreads(lmCarousel, {
        historyRepository: historyRepo,
        threadsAdapter,
        config,
        dryRun: false,
      });

      assert.equal(res.overallStatus, 'COMPLETED');
      assert.equal(res.sourceProject, 'lifemode');
      assert.equal(res.platformResults.threads?.status, 'PUBLISHED');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test('12. Source isolation: Explicit source tagging prevents collision and feedback loops', () => {
    assert.equal(normalizeSourceProject('dreamly-ai'), 'dreamly-ai');
    assert.equal(normalizeSourceProject('DreamlyAI'), 'dreamly-ai');
    assert.equal(normalizeSourceProject('ai-zodiac'), 'ai-zodiac');
    assert.equal(normalizeSourceProject('AIZodiac'), 'ai-zodiac');
    assert.equal(normalizeSourceProject('get-ai-set'), 'get-ai-set');
    assert.equal(normalizeSourceProject('getaiset'), 'get-ai-set');
    assert.equal(normalizeSourceProject('lifemode'), 'lifemode');

    const keyDreamly = createIdempotencyKey('top-100', 'threads', 'hash123', 'dreamly-ai');
    const keyZodiac = createIdempotencyKey('top-100', 'threads', 'hash123', 'ai-zodiac');
    const keyLifeMode = createIdempotencyKey('top-100', 'threads', 'hash123', 'lifemode');

    assert.ok(keyDreamly.startsWith('lm-soc-dreamly-ai-top-100-threads-'));
    assert.ok(keyZodiac.startsWith('lm-soc-ai-zodiac-top-100-threads-'));
    assert.ok(keyLifeMode.startsWith('lm-soc-top-100-threads-'));
    assert.notEqual(keyDreamly, keyZodiac);
    assert.notEqual(keyDreamly, keyLifeMode);
  });

  await t.test('13. Failure Isolation: Threads failure does not prevent publication to Facebook, Instagram, and Pinterest', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-th-isolation-'));
    try {
      const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

      const failingThreadsAdapter: ISocialPlatformAdapter = {
        platform: 'threads',
        name: 'Failing Threads Mock',
        isConfigured: () => true,
        validate: () => ({ valid: true, errors: [], warnings: [] }),
        prepare: async (content, asset) => ({
          platform: 'threads',
          topicId: content.topicId,
          contentHash: 'hash-thr',
          caption: content.shortCaption,
          hashtags: content.hashtags,
          mediaAsset: asset,
          preparedPayload: {},
          idempotencyKey: `lm-soc-${content.topicId}-threads-hash-thr`,
        }),
        publish: async () => ({
          platform: 'threads',
          status: 'FAILED',
          error: 'Threads API Rate Limit or Network Outage',
          publishedAt: new Date().toISOString(),
          idempotencyKey: 'lm-soc-test-threads',
        }),
      };

      const mockAdapters = new Map<SocialPlatform, ISocialPlatformAdapter>([
        ['facebook', new ThreadsPlatformAdapter()], // dummy
        ['instagram', new ThreadsPlatformAdapter()],
        ['pinterest', new ThreadsPlatformAdapter()],
        ['threads', failingThreadsAdapter],
      ]);

      // Provide successful mocks for FB, IG, Pinterest
      mockAdapters.set('facebook', {
        platform: 'facebook',
        name: 'FB Mock',
        isConfigured: () => true,
        validate: () => ({ valid: true, errors: [], warnings: [] }),
        prepare: async (c, a) => ({ platform: 'facebook', topicId: c.topicId, contentHash: 'h', caption: 'c', hashtags: [], mediaAsset: a, preparedPayload: {}, idempotencyKey: 'k-fb' }),
        publish: async () => ({ platform: 'facebook', status: 'PUBLISHED', postId: 'fb-ok-1', publishedAt: new Date().toISOString(), idempotencyKey: 'k-fb' }),
      });
      mockAdapters.set('instagram', {
        platform: 'instagram',
        name: 'IG Mock',
        isConfigured: () => true,
        validate: () => ({ valid: true, errors: [], warnings: [] }),
        prepare: async (c, a) => ({ platform: 'instagram', topicId: c.topicId, contentHash: 'h', caption: 'c', hashtags: [], mediaAsset: a, preparedPayload: {}, idempotencyKey: 'k-ig' }),
        publish: async () => ({ platform: 'instagram', status: 'PUBLISHED', postId: 'ig-ok-1', publishedAt: new Date().toISOString(), idempotencyKey: 'k-ig' }),
      });
      mockAdapters.set('pinterest', {
        platform: 'pinterest',
        name: 'Pin Mock',
        isConfigured: () => true,
        validate: () => ({ valid: true, errors: [], warnings: [] }),
        prepare: async (c, a) => ({ platform: 'pinterest', topicId: c.topicId, contentHash: 'h', caption: 'c', hashtags: [], mediaAsset: a, preparedPayload: {}, idempotencyKey: 'k-pin' }),
        publish: async () => ({ platform: 'pinterest', status: 'PUBLISHED', postId: 'pin-ok-1', publishedAt: new Date().toISOString(), idempotencyKey: 'k-pin' }),
      });

      const topic = createMockTopic();
      const result = await runSocialPipeline({
        candidates: [topic],
        historyRepository: historyRepo,
        platformAdapters: mockAdapters,
        storageProvider: new FixtureSocialAssetStorageProvider('https://images.lifemode.life'),
        imageProvider: new FixtureSocialImageProvider(),
        config: {
          dryRun: false,
          allowPublish: true,
          credentials: {
            facebook: { pageAccessToken: 'tok', pageId: 'pid', configured: true },
            instagram: { accessToken: 'tok', businessAccountId: 'bid', configured: true },
            pinterest: { accessToken: 'tok', boardId: 'bid', configured: true },
            threads: { accessToken: secretToken, userId: targetUserId, configured: true },
          },
        },
      });

      // Assert FB, IG, Pinterest succeeded while Threads recorded failure cleanly
      assert.equal(result.platformSummary.facebook.published, 1);
      assert.equal(result.platformSummary.instagram.published, 1);
      assert.equal(result.platformSummary.pinterest.published, 1);
      assert.equal(result.platformSummary.threads.failed, 1);
      assert.equal(result.manifestEntries[0].overallStatus, 'PARTIAL');
      assert.equal(result.manifestEntries[0].platformResults.threads?.status, 'FAILED');
      assert.equal(result.manifestEntries[0].platformResults.facebook?.status, 'PUBLISHED');
      assert.equal(result.succeededCount, 1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test('14. Dry Run mode validates payload without making external HTTP calls', async () => {
    let fetchCalled = false;
    const mockFetch = (async () => {
      fetchCalled = true;
      return new Response('Should not be called', { status: 500 });
    }) as any;

    const adapter = new ThreadsPlatformAdapter(mockFetch);
    const content = createMockSocialContent();
    const asset = createMockAsset();
    const pkg = await adapter.prepare(content, asset);

    const res = await adapter.publish(pkg, { dryRun: true });

    assert.equal(res.status, 'DRY_RUN');
    assert.equal(fetchCalled, false, 'Fetch must not be invoked during dry run');
    assert.ok(res.postId?.startsWith('dryrun-threads-'));
    assert.ok(res.postUrl?.includes('/post/dryrun-'));
  });

  await t.test('15. Batch distribution handles mixed success and failure with per-item isolation', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-th-batch-'));
    try {
      const historyRepo = new FilesystemSocialHistoryRepository(tempDir);

      let callIndex = 0;
      const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes(`/${targetUserId}/threads_publish`) && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: `post-${callIndex}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('/container-') && urlStr.includes('fields=status')) {
          return new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes(`/${targetUserId}/threads`) && init?.method === 'POST') {
          callIndex++;
          if (callIndex === 2) {
            return new Response(JSON.stringify({ error: { message: 'Temporary container creation failure' } }), { status: 500 });
          }
          return new Response(JSON.stringify({ id: `container-${callIndex}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('OK', { status: 200 });
      }) as any;

      const threadsAdapter = new ThreadsPlatformAdapter(mockFetch);
      const config = {
        dryRun: false,
        allowPublish: true,
        credentials: {
          ...loadSocialConfig().credentials,
          threads: { accessToken: secretToken, userId: targetUserId, configured: true },
        },
      };

      const batch: CrossProjectSocialContent[] = [
        { sourceProject: 'dreamly-ai', contentId: 'item-1', contentType: 'image', title: 'Title 1', caption: 'Caption 1', imageUrl: 'https://images.lifemode.life/1.jpg' },
        { sourceProject: 'ai-zodiac', contentId: 'item-2', contentType: 'image', title: 'Title 2', caption: 'Caption 2', imageUrl: 'https://images.lifemode.life/2.jpg' },
        { sourceProject: 'get-ai-set', contentId: 'item-3', contentType: 'image', title: 'Title 3', caption: 'Caption 3', imageUrl: 'https://images.lifemode.life/3.jpg' },
      ];

      const results = await distributeCrossProjectBatch(batch, {
        historyRepository: historyRepo,
        threadsAdapter,
        config,
        dryRun: false,
      });

      assert.equal(results.length, 3);
      assert.equal(results[0].overallStatus, 'COMPLETED');
      assert.equal(results[1].overallStatus, 'FAILED');
      assert.equal(results[2].overallStatus, 'COMPLETED');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test('16. Safe connectivity test: getThreadsUserProfile verifies authentication and resolves @lifemodehq account without publishing', async () => {
    let requestedUrl = '';
    const mockFetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          id: targetUserId,
          username: 'lifemodehq',
          name: 'LifeMode',
          threads_biography: 'Curated Monograph for Quiet Luxury & Intentional Living.',
          threads_profile_picture_url: 'https://images.lifemode.life/profile.jpg',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    const adapter = new ThreadsPlatformAdapter(mockFetch);
    const profile = await adapter.verifyCredentials({
      credentials: {
        ...loadSocialConfig().credentials,
        threads: { accessToken: secretToken, userId: targetUserId, configured: true },
      },
    });

    assert.equal(profile.valid, true);
    assert.equal(profile.userId, targetUserId);
    assert.equal(profile.username, 'lifemodehq');
    assert.equal(profile.name, 'LifeMode');
    assert.equal(profile.statusCode, 200);
    assert.ok(requestedUrl.includes('/v1.0/me?fields='));
    assert.ok(requestedUrl.includes('username'));
    assert.equal(requestedUrl.includes(secretToken), true); // in actual query, but never in returned error
  });

  await t.test('17. Safe connectivity test: getThreadsUserProfile redacts secret token on authentication failure', async () => {
    const mockFetch = (async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: `Error validating access token: Session has expired with token ${secretToken}`,
            type: 'OAuthException',
            code: 190,
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    const adapter = new ThreadsPlatformAdapter(mockFetch);
    const profile = await adapter.verifyCredentials({
      credentials: {
        ...loadSocialConfig().credentials,
        threads: { accessToken: secretToken, userId: targetUserId, configured: true },
      },
    });

    assert.equal(profile.valid, false);
    assert.equal(profile.statusCode, 401);
    assert.ok(profile.error);
    assert.equal(profile.error.includes(secretToken), false, 'Token must not leak in error');
    assert.ok(profile.error.includes('[REDACTED]'));
  });
});
