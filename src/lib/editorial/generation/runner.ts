import type { IGenerationProvider } from './providers/types.ts';
import type { GenerationRequest, GenerationResult, GenerationMetadata } from './types.ts';
import { buildGenerationPrompt } from './prompt.ts';
import { validateGeneratedArticle, type ValidationRulesOptions } from './validation.ts';

export interface GenerationPipelineOptions {
  request: GenerationRequest;
  provider: IGenerationProvider;
  validationOptions?: ValidationRulesOptions;
}

/**
 * Validates the incoming GenerationRequest before passing it to any provider.
 */
function validateRequest(request: GenerationRequest): { isValid: boolean; error?: string } {
  if (!request) {
    return { isValid: false, error: 'GenerationRequest is undefined or null.' };
  }
  if (!request.topicId || !request.topicId.trim()) {
    return { isValid: false, error: 'GenerationRequest is missing required field: topicId.' };
  }
  if (!request.titleAngle || !request.titleAngle.trim()) {
    return { isValid: false, error: 'GenerationRequest is missing required field: titleAngle.' };
  }
  if (!request.pillar) {
    return { isValid: false, error: 'GenerationRequest is missing required field: pillar.' };
  }
  if (!request.format) {
    return { isValid: false, error: 'GenerationRequest is missing required field: format.' };
  }
  if (!request.primaryIntent) {
    return { isValid: false, error: 'GenerationRequest is missing required field: primaryIntent.' };
  }
  if (!request.searchTargets || !request.searchTargets.primaryKeyword?.trim()) {
    return { isValid: false, error: 'GenerationRequest is missing required field: searchTargets.primaryKeyword.' };
  }
  return { isValid: true };
}

/**
 * Executes the provider-neutral Content Generation V1 pipeline.
 *
 * Flow:
 * 1. Request validation
 * 2. Neutral prompt building
 * 3. Provider invocation
 * 4. Deterministic content validation
 * 5. Typed GenerationResult assembly
 */
export async function runGenerationPipeline(
  options: GenerationPipelineOptions
): Promise<GenerationResult> {
  const { request, provider, validationOptions } = options;

  // 1. Validate the GenerationRequest
  const requestValidation = validateRequest(request);
  if (!requestValidation.isValid) {
    return {
      success: false,
      errorCode: 'INVALID_REQUEST',
      errorMessage: requestValidation.error || 'Invalid generation request parameters.',
      provider: provider?.name,
    };
  }

  // 2. Build the provider-neutral prompt payload
  // (Provides telemetry and token estimation for the generation request)
  const promptPayload = buildGenerationPrompt(request);

  // 3. Invoke the provider within a safe error boundary
  let providerPayload;
  const startTime = Date.now();

  try {
    providerPayload = await provider.generate(request);
  } catch (err: any) {
    return {
      success: false,
      errorCode: 'PROVIDER_ERROR',
      errorMessage: err?.message || 'Unknown error occurred during provider execution.',
      provider: provider.name,
    };
  }

  if (!providerPayload || !providerPayload.article) {
    return {
      success: false,
      errorCode: 'PROVIDER_ERROR',
      errorMessage: 'Provider returned an empty or malformed article payload.',
      provider: provider.name,
    };
  }

  const { article, metadata } = providerPayload;

  // 4. Deterministic Validation of the generated article package
  const validationReport = validateGeneratedArticle(article, request, validationOptions);

  if (!validationReport.isValid) {
    const errorMessages = validationReport.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `[${i.field}] ${i.message}`)
      .join('; ');

    return {
      success: false,
      errorCode: 'VALIDATION_FAILED',
      errorMessage: `Generated article failed deterministic quality validation: ${errorMessages}`,
      provider: provider.name,
      validation: validationReport,
    };
  }

  // 5. Assemble complete GenerationMetadata
  const estimatedInputTokens = Math.max(10, Math.ceil(promptPayload.fullPromptText.length / 4));
  const fullMetadata: GenerationMetadata = {
    provider: metadata?.provider || provider.name,
    model: metadata?.model || provider.model,
    generatedAt: metadata?.generatedAt || new Date().toISOString(),
    inputTokenEstimate: metadata?.inputTokenEstimate || estimatedInputTokens,
    outputTokenEstimate: metadata?.outputTokenEstimate || 500,
    durationMs: metadata?.durationMs || Math.max(1, Date.now() - startTime),
  };

  return {
    success: true,
    article,
    metadata: fullMetadata,
    validation: validationReport,
  };
}
