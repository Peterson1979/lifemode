import { createHash } from 'node:crypto';
import type { PublishPackage } from '../publishing/types.ts';
import type {
  IEditorialImageProvider,
  EditorialImageGenerationInput,
  EditorialImageResult,
} from './contracts.ts';
import { loadEditorialImageConfig, type EditorialImageConfig } from './config.ts';
import { CloudflareWorkersAIImageProvider } from './providers/cloudflare.ts';
import { BFLImageProvider } from './providers/bfl.ts';
import { CloudflareR2SocialAssetStorageProvider } from '../../social/images/storage/r2.ts';
import type { ISocialAssetStorageProvider } from '../../social/images/storage/contracts.ts';
import { EditorialImageCostGuard } from './cost-guard.ts';

export interface EditorialImageOrchestratorOptions {
  dryRun?: boolean;
  maintenanceMode?: boolean;
  config?: EditorialImageConfig;
  primaryProvider?: IEditorialImageProvider;
  fallbackProvider?: IEditorialImageProvider;
  storageProvider?: ISocialAssetStorageProvider;
  costGuard?: EditorialImageCostGuard;
  logger?: (message: string) => void;
}

export interface OrchestrationResult {
  success: boolean;
  skipped: boolean;
  publicUrl?: string;
  provider?: string;
  reason?: string;
  error?: string;
}

/**
 * Computes a deterministic asset key for an editorial master image.
 *
 * Example: editorial/lm-tech-ai-01/a1b2c3d4e5f67890.jpg
 */
export function getDeterministicAssetKey(
  topicId: string,
  slug: string,
  promptText: string,
  ext = 'jpg'
): { assetHash: string; objectKey: string } {
  const cleanTopic = (topicId || 'general').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const cleanSlug = (slug || 'article').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const hashInput = `${cleanTopic}:${cleanSlug}:${promptText.trim()}`;
  const assetHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  const objectKey = `editorial/${cleanTopic}/${assetHash}.${ext}`;

  return { assetHash, objectKey };
}

/**
 * Orchestrates editorial master image generation and R2 storage.
 *
 * Resilience & Priority:
 * 1. Cloudflare Workers AI (Primary)
 * 2. Black Forest Labs FLUX.2 [pro] (Fallback on primary error)
 * 3. Fallback to publishing without image if all generation/storage fails
 *
 * Idempotency & Cost Protection:
 * - Skips generation if article already contains a valid image
 * - Skips generation during dry-run
 * - Skips generation if LIFEMODE_IMAGE_ENABLED is false
 * - Retries strictly bounded (default 1 retry)
 */
export async function orchestrateEditorialImage(
  publishPackage: PublishPackage,
  options: EditorialImageOrchestratorOptions = {}
): Promise<OrchestrationResult> {
  const log = options.logger || console.log;
  const config = options.config || loadEditorialImageConfig();
  const articleId = publishPackage.id || publishPackage.slug;

  // 1. Idempotency Check: Existing/manual image
  if (publishPackage.imageMetadata?.url) {
    log(`[IMAGE] article=${articleId} status=skipped reason=already-has-image`);
    return {
      success: true,
      skipped: true,
      publicUrl: publishPackage.imageMetadata.url,
      provider: publishPackage.imageMetadata.source || 'existing',
      reason: 'already-has-image',
    };
  }

  // 2. Disabled or Dry-Run Check
  if (!config.enabled) {
    log(`[IMAGE] article=${articleId} status=skipped reason=disabled`);
    return {
      success: false,
      skipped: true,
      reason: 'disabled',
    };
  }

  if (options.dryRun) {
    log(`[IMAGE] article=${articleId} status=skipped reason=dry-run`);
    return {
      success: false,
      skipped: true,
      reason: 'dry-run',
    };
  }

  // 3. Prepare Image Generation Input
  const prompt =
    publishPackage.imageMetadata?.prompt ||
    `Editorial documentary photography for ${publishPackage.title}.`;

  const input: EditorialImageGenerationInput = {
    topicId: publishPackage.topicId,
    slug: publishPackage.slug,
    title: publishPackage.title,
    description: publishPackage.description,
    pillar: publishPackage.pillar,
    tags: publishPackage.tags,
    prompt,
    width: config.targetWidth,
    height: config.targetHeight,
    aspectRatio: config.aspectRatio,
  };

  const primaryProvider =
    options.primaryProvider || new CloudflareWorkersAIImageProvider();
  const fallbackProvider =
    options.fallbackProvider || new BFLImageProvider();
  const storageProvider =
    options.storageProvider || new CloudflareR2SocialAssetStorageProvider();
  const costGuard =
    options.costGuard ||
    new EditorialImageCostGuard({
      enabled: config.costGuard.enabled,
      dailyLimit: config.costGuard.dailyLimit,
      monthlyLimit: config.costGuard.monthlyLimit,
    });

  // 3.5. Cost Guard Quota Evaluation
  const guardDecision = options.maintenanceMode
    ? await costGuard.canGenerateMaintenanceImage()
    : await costGuard.canGenerateImage();
  if (!guardDecision.allowed) {
    log(
      JSON.stringify(
        {
          event: 'editorial_image_generation_blocked',
          reason: guardDecision.reason,
          dailyUsage: guardDecision.dailyUsage,
          monthlyUsage: guardDecision.monthlyUsage,
        },
        null,
        2
      )
    );
    log(`[IMAGE] article=${articleId} status=skipped reason=cost-guard-blocked`);
    return {
      success: false,
      skipped: true,
      reason: 'cost-guard-blocked',
      error: `Image generation quota exceeded: ${guardDecision.reason}`,
    };
  }

  log(
    JSON.stringify(
      {
        event: 'editorial_image_generation_allowed',
        dailyUsage: guardDecision.dailyUsage,
        monthlyUsage: guardDecision.monthlyUsage,
      },
      null,
      2
    )
  );

  let generatedResult: EditorialImageResult | null = null;
  const maxAttempts = 1 + (typeof config.maxRetries === 'number' ? config.maxRetries : 1);

  // 4. Primary Provider: Cloudflare Workers AI
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await primaryProvider.generate(input);
      if (res.success && res.imageBuffer) {
        generatedResult = res;
        log(`[IMAGE] article=${articleId} provider=cloudflare status=success`);
        break;
      }
    } catch {
      // Ignored, will retry or fallback
    }
  }

  // 5. Fallback Provider: Black Forest Labs FLUX.2 [pro]
  if (!generatedResult) {
    log(`[IMAGE] article=${articleId} provider=cloudflare status=failed fallback=bfl`);

    if (fallbackProvider.isConfigured()) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await fallbackProvider.generate(input);
          if (res.success && res.imageBuffer) {
            generatedResult = res;
            log(`[IMAGE] article=${articleId} provider=bfl status=success`);
            break;
          }
        } catch {
          // Ignored, will exit loop
        }
      }
    }
  }

  // If both providers failed
  if (!generatedResult || !generatedResult.imageBuffer) {
    log(`[IMAGE] article=${articleId} status=failed publication=continued`);
    return {
      success: false,
      skipped: false,
      reason: 'generation-failed',
      error: 'All configured editorial image providers failed to produce image bytes.',
    };
  }

  // Record successful generation in Cost Guard
  try {
    await costGuard.recordGeneration();
  } catch {
    // Non-blocking counter recording
  }

  // 6. R2 Storage Upload
  const ext = generatedResult.mimeType?.includes('png') ? 'png' : 'jpg';
  const { assetHash, objectKey } = getDeterministicAssetKey(
    publishPackage.topicId,
    publishPackage.slug,
    prompt,
    ext
  );

  try {
    const uploadResult = await storageProvider.uploadAsset({
      topicId: publishPackage.topicId,
      pillar: publishPackage.pillar,
      assetHash,
      buffer: generatedResult.imageBuffer,
      mimeType: generatedResult.mimeType || 'image/jpeg',
      format: '1080x1350' as any,
      customKey: objectKey,
    });

    if (!uploadResult.success || !uploadResult.publicUrl) {
      log(`[IMAGE] article=${articleId} status=failed reason=r2-upload-failed publication=continued`);
      return {
        success: false,
        skipped: false,
        reason: 'r2-upload-failed',
        error: uploadResult.error || 'R2 storage upload failed.',
      };
    }

    // Persist verified public URL and provider metadata
    if (!publishPackage.imageMetadata) {
      publishPackage.imageMetadata = {};
    }
    publishPackage.imageMetadata.url = uploadResult.publicUrl;
    publishPackage.imageMetadata.source = generatedResult.provider;

    return {
      success: true,
      skipped: false,
      publicUrl: uploadResult.publicUrl,
      provider: generatedResult.provider,
    };
  } catch (err: any) {
    log(`[IMAGE] article=${articleId} status=failed reason=r2-upload-failed publication=continued`);
    return {
      success: false,
      skipped: false,
      reason: 'r2-upload-failed',
      error: err?.message || String(err),
    };
  }
}
