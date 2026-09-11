import type { IAIProvider, AIRequest, AIResponse, AIProviderError } from '../types.ts';

export interface AIRouterFixtureOptions {
  id?: string;
  defaultModel?: string;
  forcedError?: AIProviderError;
  latencyMs?: number;
  mockResponseText?: string;
  mockUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  isConfiguredOverride?: boolean;
}

/**
 * Deterministic In-Memory AI Provider specifically for testing AI Router V1.
 * Provides configurable responses, mock token usage, and simulated error conditions completely offline.
 */
export class AIRouterFixtureProvider implements IAIProvider {
  readonly id: string;
  readonly defaultModel: string;
  private forcedError?: AIProviderError;
  private latencyMs: number;
  private mockResponseText?: string;
  private mockUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  private isConfiguredValue: boolean;

  constructor(options: AIRouterFixtureOptions = {}) {
    this.id = options.id || 'fixture';
    this.defaultModel = options.defaultModel || 'fixture-router-v1';
    this.forcedError = options.forcedError;
    this.latencyMs = options.latencyMs || 5;
    this.mockResponseText = options.mockResponseText;
    this.mockUsage = options.mockUsage;
    this.isConfiguredValue = options.isConfiguredOverride !== undefined ? options.isConfiguredOverride : true;
  }

  isConfigured(): boolean {
    return this.isConfiguredValue;
  }

  setForcedError(error?: AIProviderError): void {
    this.forcedError = error;
  }

  setMockResponseText(text: string): void {
    this.mockResponseText = text;
  }

  setMockUsage(usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): void {
    this.mockUsage = usage;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.isConfigured()) {
      const error: AIProviderError = {
        code: 'NOT_CONFIGURED',
        message: `Fixture provider "${this.id}" is marked unconfigured.`,
        provider: this.id,
        retryable: false,
      };
      throw error;
    }

    if (this.forcedError) {
      throw { ...this.forcedError, provider: this.id };
    }

    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    // Default valid JSON article payload for content generation tasks
    const defaultJsonArticle = JSON.stringify({
      title: 'Intentional Living in 2026: A Modern Guide',
      slug: 'intentional-living-in-2026-a-modern-guide',
      description: 'An editorial exploration of modern intentional lifestyle design and mindful technology for curious readers.',
      excerpt: 'Discover the foundational shifts defining contemporary lifestyle design.',
      content: [
        'In contemporary lifestyle design, intentionality represents a foundational shift toward clarity and sustainable daily focus.',
        '',
        '## 1. The Modern Shift: Signal Over Noise',
        'Navigating digital overload requires cultivating a calm, deliberate relationship with our tools and physical spaces.',
        'Rather than reacting to every new impulse, we establish clear boundaries and structured daily rhythms.',
        '',
        '## 2. Practical Framework & Daily Protocols',
        'Implementing intentional design begins with small, repeatable workflows that compound over time.',
        'By focusing on essential priorities, modern knowledge workers and creators preserve cognitive bandwidth for deep, meaningful work.'
      ].join('\n'),
      faq: [
        { question: 'What is intentional lifestyle design?', answer: 'Focusing on signal over noise in daily choices and workflows.' }
      ],
      sources: [
        { name: 'LifeMode Editorial Standards', url: 'https://lifemode.life/editorial-standards' }
      ],
      internalLinks: ['/life'],
      affiliateIntents: [],
      socialHooks: ['Why intentional lifestyle design is the defining shift of 2026.']
    }, null, 2);

    const responseText = this.mockResponseText || defaultJsonArticle;
    const model = request.model || this.defaultModel;

    const inputTokens = this.mockUsage?.inputTokens ?? Math.max(10, Math.ceil(request.prompt.length / 4));
    const outputTokens = this.mockUsage?.outputTokens ?? Math.max(10, Math.ceil(responseText.length / 4));
    const totalTokens = this.mockUsage?.totalTokens ?? (inputTokens + outputTokens);

    return {
      text: responseText,
      provider: this.id,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      durationMs: this.latencyMs,
    };
  }
}
