import type { GenerationRequest, GeneratedArticle, GenerationMetadata } from '../types.ts';

/**
 * Output payload returned directly from a generation provider implementation.
 */
export interface ProviderGenerationPayload {
  article: GeneratedArticle;
  metadata?: Partial<GenerationMetadata>;
}

/**
 * Common, provider-agnostic interface for AI article generation.
 * Decouples the editorial pipeline from specific AI SDKs (Gemini, Groq, Workers AI).
 */
export interface IGenerationProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Generates a structured article package from an editorial generation request.
   */
  generate(request: GenerationRequest): Promise<ProviderGenerationPayload>;
}
