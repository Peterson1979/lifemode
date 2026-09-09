/**
 * Lightweight, deterministic token estimation for prompt payloads and responses.
 *
 * Approximation heuristics:
 * - In standard English editorial text and JSON formatting, 1 token ~ 4 characters (~0.75 words).
 * - System prompts, message framing, and control tokens add a baseline overhead (~10-20 tokens).
 *
 * Note: These approximations are clearly labelled as estimates. Provider-reported
 * usage figures must always take precedence when available.
 */

export interface TokenEstimation {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  isEstimate: true;
}

/**
 * Estimates token count from raw character length.
 */
export function estimateTokensFromText(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  // ~4 characters per token with a minimum of 1
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

/**
 * Estimates input tokens from user prompt and optional system prompt.
 */
export function estimateInputTokens(prompt: string, systemPrompt?: string): number {
  const promptTokens = estimateTokensFromText(prompt);
  const systemTokens = systemPrompt ? estimateTokensFromText(systemPrompt) + 8 : 0;
  return promptTokens + systemTokens + 4; // Add framing token buffer
}

/**
 * Estimates output tokens from generated text.
 */
export function estimateOutputTokens(text: string): number {
  return estimateTokensFromText(text);
}

/**
 * Produces a complete structured token estimate for a request/response pair.
 */
export function estimateRequestResponseTokens(
  prompt: string,
  systemPrompt: string | undefined,
  responseText: string
): TokenEstimation {
  const inputTokens = estimateInputTokens(prompt, systemPrompt);
  const outputTokens = estimateOutputTokens(responseText);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    isEstimate: true,
  };
}

/**
 * Estimates preflight token consumption (input + expected output) for an AIRequest.
 */
export function estimateRequestTokens(request: {
  prompt: string;
  systemPrompt?: string;
  maxOutputTokens?: number;
  taskType?: string;
}): number {
  const inputTokens = estimateInputTokens(request.prompt, request.systemPrompt);
  const expectedOutputTokens = request.maxOutputTokens ?? (
    request.taskType === 'content_generation' ? 2500 :
    request.taskType === 'content_review' ? 800 :
    request.taskType === 'social_generation' ? 400 : 500
  );
  return inputTokens + expectedOutputTokens;
}
