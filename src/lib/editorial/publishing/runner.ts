import type {
  PublishingRequest,
  PublishingResult,
  PublishPackage,
  PublishingGateResult,
} from './types.ts';
import type { IPublishingProvider } from './providers/types.ts';
import { FixturePublishingProvider } from './providers/fixture.ts';
import { evaluatePublishingGate } from './gate.ts';
import { buildPublishPackage } from './builder.ts';
import { loadPublishingConfig, type PublishingConfig } from './config.ts';
import { orchestrateEditorialImage, type OrchestrationResult } from '../images/orchestrator.ts';
import type { IEditorialImageProvider } from '../images/contracts.ts';
import type { EditorialImageConfig } from '../images/config.ts';
import type { EditorialImageCostGuard } from '../images/cost-guard.ts';
import type { ISocialAssetStorageProvider } from '../../social/images/storage/contracts.ts';

export interface RunPublishingOptions {
  request: PublishingRequest;
  provider?: IPublishingProvider;
  config?: PublishingConfig;
  imageConfig?: EditorialImageConfig;
  imagePrimaryProvider?: IEditorialImageProvider;
  imageFallbackProvider?: IEditorialImageProvider;
  imageStorageProvider?: ISocialAssetStorageProvider;
  costGuard?: EditorialImageCostGuard;
}

/**
 * Executes the LifeMode Publishing V1 Pipeline.
 *
 * Flow:
 * 1. Evaluate deterministic Publishing Gate
 * 2. If blocked, return BLOCKED immediately (zero provider interaction)
 * 3. Build canonical normalized PublishPackage
 * 4. Verify idempotency / check duplicate publication
 * 5. Execute publication or dry-run via injected provider
 * 6. Return structured PublishingResult
 */
export async function runPublishingPipeline(
  options: RunPublishingOptions
): Promise<PublishingResult> {
  const { request } = options;
  const config = options.config || loadPublishingConfig();
  const provider = options.provider || new FixturePublishingProvider();

  const isDryRun = request.options?.dryRun ?? config.dryRun;

  // 1. Evaluate Deterministic Publishing Gate
  const thresholds = {
    ...config.thresholds,
    ...(request.options?.customThresholds || {}),
  };

  const gateResult: PublishingGateResult = evaluatePublishingGate(request, thresholds);

  // If gate fails, block immediately
  if (!gateResult.eligible) {
    return {
      status: 'BLOCKED',
      dryRun: isDryRun,
      provider: provider.name,
      gateResult,
      error: {
        code: 'GATE_BLOCKED',
        message: `Publishing gate blocked: ${gateResult.reasons.join('; ')}`,
      },
    };
  }

  // 2. Build canonical normalized PublishPackage (pure function)
  const publishPackage: PublishPackage = buildPublishPackage(request, {
    author: request.options?.author || config.defaultAuthor,
    targetDate: request.options?.targetDate,
    dryRun: isDryRun,
  });

  // 3. Check duplicate publication / idempotency
  if (!isDryRun) {
    const alreadyPublished = await provider.isPublished(publishPackage.id);
    if (alreadyPublished) {
      return {
        status: 'SKIPPED',
        publicationId: publishPackage.id,
        slug: publishPackage.slug,
        dryRun: false,
        provider: provider.name,
        publishPackage,
        gateResult,
        error: {
          code: 'DUPLICATE_PUBLICATION',
          message: `Publication ID "${publishPackage.id}" has already been published.`,
        },
      };
    }
  }

  // 4. Generate Editorial Master Image (if enabled & not dry-run)
  let imageResult: OrchestrationResult | undefined;
  try {
    imageResult = await orchestrateEditorialImage(publishPackage, {
      dryRun: isDryRun,
      config: options.imageConfig,
      primaryProvider: options.imagePrimaryProvider,
      fallbackProvider: options.imageFallbackProvider,
      storageProvider: options.imageStorageProvider,
      costGuard: options.costGuard,
    });
  } catch (err: any) {
    // Non-blocking resilience: image failure never blocks publication
    imageResult = {
      success: false,
      skipped: false,
      reason: 'unexpected-exception',
      error: err?.message || String(err),
    };
  }

  // 5. Invoke Provider
  let providerResult;
  try {
    providerResult = await provider.publish(publishPackage, { dryRun: isDryRun });
  } catch (err: any) {
    return {
      status: 'FAILED',
      publicationId: publishPackage.id,
      slug: publishPackage.slug,
      dryRun: isDryRun,
      provider: provider.name,
      publishPackage,
      gateResult,
      imageResult,
      error: {
        code: 'UNEXPECTED_FAILURE',
        message: err?.message || 'Unexpected failure during publishing provider execution.',
      },
    };
  }

  if (!providerResult.success) {
    return {
      status: 'FAILED',
      publicationId: publishPackage.id,
      slug: publishPackage.slug,
      dryRun: isDryRun,
      provider: provider.name,
      publishPackage,
      gateResult,
      imageResult,
      error: {
        code: (providerResult.error?.code as any) || 'PROVIDER_REJECTED',
        message: providerResult.error?.message || 'Publishing provider rejected the article package.',
      },
      metadata: providerResult.metadata,
    };
  }

  // 5. Successful Execution
  const finalStatus = isDryRun ? 'READY' : 'PUBLISHED';

  return {
    status: finalStatus,
    publicationId: providerResult.publicationId || publishPackage.id,
    slug: publishPackage.slug,
    dryRun: isDryRun,
    provider: provider.name,
    publishedAt: providerResult.publishedAt,
    publishPackage,
    gateResult,
    imageResult,
    metadata: providerResult.metadata,
  };
}
