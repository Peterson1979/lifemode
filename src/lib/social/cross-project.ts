import type {
  CrossProjectSocialContent,
  CrossProjectPublishResult,
  GeneratedSocialContent,
  SocialPlatformPackage,
  SocialManifestEntry,
  SocialVisualAsset,
} from './types.ts';
import { loadSocialConfig, type SocialAutomationConfig } from './config.ts';
import { ThreadsPlatformAdapter } from './platforms/threads.ts';
import {
  FilesystemSocialHistoryRepository,
  type ISocialHistoryRepository,
  hashString,
  createIdempotencyKey,
} from './storage/repository.ts';

export interface CrossProjectPublishOptions {
  config?: Partial<SocialAutomationConfig>;
  historyRepository?: ISocialHistoryRepository;
  threadsAdapter?: ThreadsPlatformAdapter;
  dryRun?: boolean;
}

/**
 * Normalizes project identifiers into canonical ecosystem strings.
 */
export function normalizeSourceProject(source: string): string {
  const norm = source.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (norm === 'dreamlyai' || norm === 'dreamly-ai' || norm === 'dreamly') {
    return 'dreamly-ai';
  }
  if (norm === 'aizodiac' || norm === 'ai-zodiac' || norm === 'zodiac') {
    return 'ai-zodiac';
  }
  if (norm === 'getaiset' || norm === 'get-ai-set' || norm === 'getai') {
    return 'get-ai-set';
  }
  if (norm === 'lifemode' || norm === 'life-mode') {
    return 'lifemode';
  }
  return norm;
}

/**
 * Resolves production-ready cross-project social items for external projects (Dreamly AI, AI Zodiac, GetAISet).
 */
export function resolveCrossProjectItem(
  source: string,
  contentId?: string
): CrossProjectSocialContent {
  const norm = normalizeSourceProject(source);

  if (norm === 'dreamly-ai') {
    return {
      sourceProject: 'dreamly-ai',
      contentId: contentId || 'social-2026-10-02',
      contentType: 'carousel',
      title: 'Neurobiology of Dreaming',
      caption: 'Ever wonder why your mind paints such vivid pictures at night? Dive into the brain’s nightly rhythm and see how REM turns thoughts into dreams. 🌙✨\n\nExplore Dreamly AI → https://play.google.com/store/apps/details?id=com.oberon.dreamlyai',
      destinationUrl: 'https://play.google.com/store/apps/details?id=com.oberon.dreamlyai',
      hashtags: ['#DreamlyAI', '#SleepScience', '#Neurobiology', '#LucidDreams'],
      carouselItems: [
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-01.jpg', mediaType: 'image' },
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-02.jpg', mediaType: 'image' },
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-03.jpg', mediaType: 'image' },
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-04.jpg', mediaType: 'image' },
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-05.jpg', mediaType: 'image' },
      ],
    };
  }

  if (norm === 'ai-zodiac') {
    return {
      sourceProject: 'ai-zodiac',
      contentId: contentId || 'zodiac-2026-10-02',
      contentType: 'carousel',
      title: 'Celestial Insights & Zodiac Wisdom',
      caption: 'Discover how today’s planetary movements influence your rhythm and clarity. Align your path with AI Zodiac. 🔮✨\n\nExplore AI Zodiac → https://play.google.com/store/apps/details?id=com.oberon.aizodiac',
      destinationUrl: 'https://play.google.com/store/apps/details?id=com.oberon.aizodiac',
      hashtags: ['#AIZodiac', '#Astrology', '#Horoscope', '#CosmicEnergy'],
      carouselItems: [
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-01.jpg', mediaType: 'image' },
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-02.jpg', mediaType: 'image' },
      ],
    };
  }

  if (norm === 'get-ai-set') {
    return {
      sourceProject: 'get-ai-set',
      contentId: contentId || 'getaiset-2026-10-02',
      contentType: 'carousel',
      title: 'Curated AI Workflows for Modern Creators',
      caption: 'Streamline your daily focus with practical, high-impact AI tools curated for peak productivity. 🚀⚡\n\nExplore GetAISet → https://getaiset.com',
      destinationUrl: 'https://getaiset.com',
      hashtags: ['#GetAISet', '#AIProductivity', '#TechTools', '#Automation'],
      carouselItems: [
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-01.jpg', mediaType: 'image' },
        { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-02.jpg', mediaType: 'image' },
      ],
    };
  }

  throw new Error(`Unsupported cross-project source: "${source}". Expected "dreamly-ai", "ai-zodiac", or "get-ai-set".`);
}

/**
 * Publishes or routes cross-project content (from Dreamly AI, AI Zodiac, GetAISet, or LifeMode)
 * directly to the LifeMode Threads account (@lifemodehq) with full duplicate prevention and error isolation.
 */
export async function publishCrossProjectToThreads(
  content: CrossProjectSocialContent,
  options: CrossProjectPublishOptions = {}
): Promise<CrossProjectPublishResult> {
  const now = new Date().toISOString();
  const config = loadSocialConfig(options.config);
  const isDryRun = options.dryRun ?? (config.dryRun || !config.allowPublish);
  const historyRepo =
    options.historyRepository || new FilesystemSocialHistoryRepository(config.storageDir);
  const threadsAdapter = options.threadsAdapter || new ThreadsPlatformAdapter();

  const sourceProject = normalizeSourceProject(content.sourceProject);
  const compositeTopicId = content.contentId;

  // 1. Idempotency Check: Prevent duplicate publication across retries
  const alreadyPublished = await historyRepo.isPlatformPublished(
    compositeTopicId,
    'threads',
    sourceProject
  );

  if (alreadyPublished) {
    const contentHash = hashString(content.caption || content.title);
    const idempotencyKey = createIdempotencyKey(
      compositeTopicId,
      'threads',
      contentHash,
      sourceProject
    );
    return {
      sourceProject,
      contentId: content.contentId,
      contentType: content.contentType,
      platformResults: {
        threads: {
          platform: 'threads',
          status: 'SKIPPED',
          error: 'Content already published to LifeMode Threads account.',
          publishedAt: now,
          idempotencyKey,
        },
      },
      overallStatus: 'SKIPPED',
      idempotencyKey,
    };
  }

  // 2. Synthesize intermediate GeneratedSocialContent representation
  const genContent: GeneratedSocialContent = {
    topicId: compositeTopicId,
    pillar: content.pillar || 'style',
    concept: content.caption,
    hook: content.title,
    title: content.title,
    shortCaption: content.caption,
    callToAction: 'Read more',
    hashtags: content.hashtags && content.hashtags.length > 0 ? content.hashtags : ['#LifeMode'],
    visualConcept: content.title,
    imageText: {
      headline: content.title,
    },
    targetPlatforms: ['threads'],
    destinationUrl: content.destinationUrl,
    sourceProject,
  };

  // 3. Prepare visual media assets depending on content type
  let mediaAsset: SocialVisualAsset | undefined;
  if (content.imageUrl) {
    mediaAsset = {
      assetId: `asset-${compositeTopicId}`,
      format: '1080x1350',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      assetHash: hashString(content.imageUrl),
      altText: content.title,
      url: content.imageUrl,
    };
  } else if (content.videoUrl) {
    mediaAsset = {
      assetId: `video-${compositeTopicId}`,
      format: '1080x1350',
      mimeType: 'video/mp4',
      width: 1080,
      height: 1350,
      assetHash: hashString(content.videoUrl),
      altText: content.title,
      url: content.videoUrl,
      mediaType: 'video',
      videoUrl: content.videoUrl,
      durationSeconds: content.videoDurationSeconds,
    };
  }

  // 4. Prepare Threads Platform Package
  const pkg: SocialPlatformPackage = await threadsAdapter.prepare(genContent, mediaAsset, {
    destinationUrl: content.destinationUrl,
    carouselItems: content.carouselItems,
    videoUrl: content.videoUrl,
    mediaType: content.contentType,
    sourceProject,
  });

  // 5. Validate Platform Package
  const validation = threadsAdapter.validate(pkg);
  if (!validation.valid) {
    const errorMsg = `Package validation failed: ${validation.errors.join(', ')}`;
    return {
      sourceProject,
      contentId: content.contentId,
      contentType: content.contentType,
      platformResults: {
        threads: {
          platform: 'threads',
          status: 'FAILED',
          error: errorMsg,
          publishedAt: now,
          idempotencyKey: pkg.idempotencyKey,
        },
      },
      overallStatus: 'FAILED',
      idempotencyKey: pkg.idempotencyKey,
      error: errorMsg,
    };
  }

  // 6. Publish to Threads
  const pubResult = await threadsAdapter.publish(pkg, { dryRun: isDryRun, config });

  // 7. Record publication history
  const assetHash = hashString(
    content.videoUrl ||
      content.imageUrl ||
      (content.carouselItems ? JSON.stringify(content.carouselItems) : compositeTopicId)
  );

  const runId = `crun-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const entry: SocialManifestEntry = {
    runId,
    topicId: compositeTopicId,
    pillar: content.pillar || 'style',
    canonicalTopic: content.title,
    contentHash: pkg.contentHash,
    assetHash,
    idempotencyKey: pkg.idempotencyKey,
    sourceProject,
    contentType: content.contentType,
    targetPlatforms: ['threads'],
    platformResults: {
      threads: pubResult,
    },
    reviewScore: 90,
    overallStatus:
      pubResult.status === 'PUBLISHED'
        ? 'COMPLETED'
        : pubResult.status === 'DRY_RUN'
          ? 'DRY_RUN'
          : 'FAILED',
    createdAt: now,
    updatedAt: now,
  };

  await historyRepo.recordEntry(entry);

  return {
    sourceProject,
    contentId: content.contentId,
    contentType: content.contentType,
    platformResults: {
      threads: pubResult,
    },
    overallStatus:
      pubResult.status === 'PUBLISHED'
        ? 'COMPLETED'
        : pubResult.status === 'DRY_RUN'
          ? 'DRY_RUN'
          : pubResult.status === 'SKIPPED'
            ? 'SKIPPED'
            : 'FAILED',
    idempotencyKey: pkg.idempotencyKey,
    error: pubResult.error,
  };
}

/**
 * Dispatches a batch of cross-project social items with per-item failure isolation.
 */
export async function distributeCrossProjectBatch(
  items: CrossProjectSocialContent[],
  options: CrossProjectPublishOptions = {}
): Promise<CrossProjectPublishResult[]> {
  const results: CrossProjectPublishResult[] = [];
  for (const item of items) {
    try {
      const res = await publishCrossProjectToThreads(item, options);
      results.push(res);
    } catch (err: any) {
      const sourceProject = normalizeSourceProject(item.sourceProject);
      const compositeTopicId = `${sourceProject}-${item.contentId}`;
      const idempotencyKey = `lm-soc-${sourceProject}-${item.contentId}-threads-err`;
      results.push({
        sourceProject,
        contentId: item.contentId,
        contentType: item.contentType,
        platformResults: {
          threads: {
            platform: 'threads',
            status: 'FAILED',
            error: err?.message || String(err),
            publishedAt: new Date().toISOString(),
            idempotencyKey,
          },
        },
        overallStatus: 'FAILED',
        idempotencyKey,
        error: err?.message || String(err),
      });
    }
  }
  return results;
}
