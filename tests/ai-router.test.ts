import test from 'node:test';
import assert from 'node:assert/strict';

import { AIRouter } from '../src/lib/ai/router.ts';
import { AIRouterFixtureProvider } from '../src/lib/ai/providers/fixture.ts';
import { GeminiProvider } from '../src/lib/ai/providers/gemini.ts';
import { GroqProvider } from '../src/lib/ai/providers/groq.ts';
import { InMemoryUsageTracker, getUtcDateKey } from '../src/lib/ai/usage.ts';
import { InMemoryRateLimiter } from '../src/lib/ai/rate-limit.ts';
import { InMemoryTelemetryRecorder } from '../src/lib/ai/telemetry.ts';
import { estimateRequestResponseTokens } from '../src/lib/ai/token-estimator.ts';

import { extractAndParseJson } from '../src/lib/ai/json-extractor.ts';
import { AIRouterGenerationProvider } from '../src/lib/editorial/generation/providers/ai-router.ts';
import { AIRouterReviewProvider } from '../src/lib/editorial/review/providers/ai-router.ts';
import { runGenerationPipeline } from '../src/lib/editorial/generation/runner.ts';
import type { AIRequest, IAIProvider } from '../src/lib/ai/types.ts';
import type { GenerationRequest } from '../src/lib/editorial/generation/types.ts';


const baseRequest: AIRequest = {
  prompt: 'Write an editorial guide on intentional digital habits in 2026.',
  systemPrompt: 'You are LifeMode Editorial Assistant.',
  taskType: 'content_generation',
  requestId: 'req-test-001',
};

test('1. Fixture provider succeeds', async () => {
  const fixture = new AIRouterFixtureProvider();
  assert.equal(fixture.isConfigured(), true);

  const response = await fixture.generate(baseRequest);
  assert.equal(response.provider, 'fixture');
  assert.ok(response.text.length > 50);
  assert.ok(response.totalTokens && response.totalTokens > 0);
});

test('2. Provider ordering works', async () => {
  const providerA = new AIRouterFixtureProvider({ id: 'provider-a' });
  const providerB = new AIRouterFixtureProvider({ id: 'provider-b' });

  const providers = new Map<string, IAIProvider>([
    ['provider-a', providerA],
    ['provider-b', providerB],
  ]);

  const router = new AIRouter({
    config: {
      providerOrder: ['provider-b', 'provider-a'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers,
    usageTracker: new InMemoryUsageTracker(),
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, 'provider-b');
    assert.equal(result.attempts.length, 1);
  }
});

test('3. First provider success prevents unnecessary fallback', async () => {
  const providerA = new AIRouterFixtureProvider({ id: 'primary-prov' });
  const providerB = new AIRouterFixtureProvider({
    id: 'backup-prov',
  });

  const providers = new Map<string, IAIProvider>([
    ['primary-prov', providerA],
    ['backup-prov', providerB],
  ]);

  const router = new AIRouter({
    config: {
      providerOrder: ['primary-prov', 'backup-prov'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers,
    usageTracker: new InMemoryUsageTracker(),
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, 'primary-prov');
    assert.equal(result.attempts.length, 1);
  }
});

test('4. Retryable provider failure falls back', async () => {
  const failingProvider = new AIRouterFixtureProvider({
    id: 'failing-primary',
    forcedError: {
      code: 'PROVIDER_ERROR',
      message: 'Temporary upstream 503 service unavailable',
      provider: 'failing-primary',
      retryable: true,
    },
  });

  const backupProvider = new AIRouterFixtureProvider({ id: 'healthy-backup' });

  const providers = new Map<string, IAIProvider>([
    ['failing-primary', failingProvider],
    ['healthy-backup', backupProvider],
  ]);

  const router = new AIRouter({
    config: {
      providerOrder: ['failing-primary', 'healthy-backup'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers,
    usageTracker: new InMemoryUsageTracker(),
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, 'healthy-backup');
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].success, false);
    assert.equal(result.attempts[1].success, true);
  }
});

test('5. Non-retryable authentication failure does not unnecessarily retry same provider', async () => {
  const authFailing = new AIRouterFixtureProvider({
    id: 'auth-failing',
    forcedError: {
      code: 'AUTH',
      message: 'Invalid API Key',
      provider: 'auth-failing',
      retryable: false,
    },
  });

  const healthyBackup = new AIRouterFixtureProvider({ id: 'healthy-backup' });

  const providers = new Map<string, IAIProvider>([
    ['auth-failing', authFailing],
    ['healthy-backup', healthyBackup],
  ]);

  const router = new AIRouter({
    config: {
      providerOrder: ['auth-failing', 'healthy-backup'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers,
    usageTracker: new InMemoryUsageTracker(),
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, 'healthy-backup');
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].error?.code, 'AUTH');
  }
});

test('6. Timeout failure falls back', async () => {
  const timeoutProvider = new AIRouterFixtureProvider({
    id: 'timeout-prov',
    forcedError: {
      code: 'TIMEOUT',
      message: 'Request timed out after 30000ms',
      provider: 'timeout-prov',
      retryable: true,
    },
  });

  const fastProvider = new AIRouterFixtureProvider({ id: 'fast-prov' });

  const providers = new Map<string, IAIProvider>([
    ['timeout-prov', timeoutProvider],
    ['fast-prov', fastProvider],
  ]);

  const router = new AIRouter({
    config: {
      providerOrder: ['timeout-prov', 'fast-prov'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers,
    usageTracker: new InMemoryUsageTracker(),
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, 'fast-prov');
    assert.equal(result.attempts[0].error?.code, 'TIMEOUT');
  }
});

test('7. Rate limit blocks request and falls back or reports RATE_LIMIT', async () => {
  const rateLimiter = new InMemoryRateLimiter();
  const provider = new AIRouterFixtureProvider({ id: 'rl-prov' });

  const providers = new Map<string, IAIProvider>([['rl-prov', provider]]);

  const router = new AIRouter({
    config: {
      providerOrder: ['rl-prov'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 1, requestsPerDay: 100 },
    },
    providers,
    rateLimiter,
    usageTracker: new InMemoryUsageTracker(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  // First request succeeds
  const res1 = await router.route(baseRequest);
  assert.equal(res1.success, true);

  // Second request within same minute hits RPM limit
  const res2 = await router.route(baseRequest);
  assert.equal(res2.success, false);
  if (!res2.success) {
    assert.equal(res2.error.code, 'RATE_LIMIT');
  }
});

test('8. Daily total token budget blocks request', async () => {
  const usageTracker = new InMemoryUsageTracker();
  usageTracker.recordUsage({
    provider: 'fixture',
    inputTokens: 100000,
    outputTokens: 150000,
    totalTokens: 250000,
    success: true,
  });

  const router = new AIRouter({
    config: {
      providerOrder: ['fixture'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 500000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 500000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['fixture', new AIRouterFixtureProvider()]]),
    usageTracker,
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'BUDGET_EXCEEDED');
  }
});

test('9. Provider-specific token budget works', async () => {
  const usageTracker = new InMemoryUsageTracker();
  // Exhaust Gemini budget specifically
  usageTracker.recordUsage({
    provider: 'gemini-prov',
    inputTokens: 30000,
    outputTokens: 30000,
    totalTokens: 60000,
    success: true,
  });

  const geminiProv = new AIRouterFixtureProvider({ id: 'gemini-prov' });
  const groqProv = new AIRouterFixtureProvider({ id: 'groq-prov' });

  const router = new AIRouter({
    config: {
      providerOrder: ['gemini-prov', 'groq-prov'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 50000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 500000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([
      ['gemini-prov', geminiProv],
      ['groq-prov', groqProv],
    ]),
    usageTracker,
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);
  if (result.success) {
    // Falls back to groq-prov because gemini-prov exceeded its budget
    assert.equal(result.provider, 'groq-prov');
    assert.equal(result.attempts[0].error?.code, 'BUDGET_EXCEEDED');
  }
});

test('10. Successful usage is recorded', async () => {
  const usageTracker = new InMemoryUsageTracker();
  const provider = new AIRouterFixtureProvider({
    id: 'fixture-track',
    mockUsage: { inputTokens: 120, outputTokens: 350, totalTokens: 470 },
  });

  const router = new AIRouter({
    config: {
      providerOrder: ['fixture-track'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['fixture-track', provider]]),
    usageTracker,
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);

  assert.equal(usageTracker.getProviderDailyTokens('fixture-track'), 470);
  assert.equal(usageTracker.getTotalDailyTokens(), 470);
  assert.equal(usageTracker.getProviderDailyRequests('fixture-track'), 1);
});

test('11. Estimated tokens are used when provider usage is unavailable', () => {
  const prompt = 'Short prompt text here for testing token approximation heuristics.';
  const responseText = 'A moderately sized generated response containing several sentences of editorial guidance.';

  const estimate = estimateRequestResponseTokens(prompt, undefined, responseText);
  assert.equal(estimate.isEstimate, true);
  assert.ok(estimate.inputTokens > 0);
  assert.ok(estimate.outputTokens > 0);
  assert.equal(estimate.totalTokens, estimate.inputTokens + estimate.outputTokens);
});

test('12. Actual provider usage overrides estimates', async () => {
  const telemetry = new InMemoryTelemetryRecorder();
  const provider = new AIRouterFixtureProvider({
    id: 'exact-usage-prov',
    mockUsage: { inputTokens: 555, outputTokens: 777, totalTokens: 1332 },
  });

  const router = new AIRouter({
    config: {
      providerOrder: ['exact-usage-prov'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['exact-usage-prov', provider]]),
    usageTracker: new InMemoryUsageTracker(),
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: telemetry,
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.response.inputTokens, 555);
    assert.equal(result.response.outputTokens, 777);
    assert.equal(result.response.totalTokens, 1332);
  }

  const events = telemetry.getEvents();
  assert.equal(events[0].isTokenEstimate, false);
  assert.equal(events[0].totalTokens, 1332);
});

test('13. Maximum attempts is respected', async () => {
  const p1 = new AIRouterFixtureProvider({ id: 'p1', forcedError: { code: 'PROVIDER_ERROR', message: 'err1', provider: 'p1', retryable: true } });
  const p2 = new AIRouterFixtureProvider({ id: 'p2', forcedError: { code: 'PROVIDER_ERROR', message: 'err2', provider: 'p2', retryable: true } });
  const p3 = new AIRouterFixtureProvider({ id: 'p3', forcedError: { code: 'PROVIDER_ERROR', message: 'err3', provider: 'p3', retryable: true } });

  const router = new AIRouter({
    config: {
      providerOrder: ['p1', 'p2', 'p3'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([
      ['p1', p1],
      ['p2', p2],
      ['p3', p3],
    ]),
    usageTracker: new InMemoryUsageTracker(),
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, false);
  if (!result.success) {
    // Only 2 attempts should have been made because maxAttempts = 2
    assert.equal(result.attempts.length, 2);
    assert.deepEqual(result.attemptedProviders, ['p1', 'p2']);
  }
});

test('14. All providers failing returns typed failed result', async () => {
  const p1 = new AIRouterFixtureProvider({ id: 'p1', forcedError: { code: 'NETWORK', message: 'net err', provider: 'p1', retryable: true } });
  const p2 = new AIRouterFixtureProvider({ id: 'p2', forcedError: { code: 'TIMEOUT', message: 'timeout err', provider: 'p2', retryable: true } });

  const router = new AIRouter({
    config: {
      providerOrder: ['p1', 'p2'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([
      ['p1', p1],
      ['p2', p2],
    ]),
    usageTracker: new InMemoryUsageTracker(),
    rateLimiter: new InMemoryRateLimiter(),
    telemetryRecorder: new InMemoryTelemetryRecorder(),
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'TIMEOUT');
    assert.equal(result.attemptedProviders.length, 2);
  }
});

test('15. Secrets are never included in telemetry', async () => {
  const telemetry = new InMemoryTelemetryRecorder();
  telemetry.recordEvent({
    taskType: 'content_generation',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    durationMs: 120,
    success: false,
    errorCode: 'AUTH',
    errorMessage: 'Failed with key=SECRET_KEY_VALUE_12345 and Bearer gsk_ABCDEF123456789',
    timestamp: new Date().toISOString(),
  });

  const events = telemetry.getEvents();
  assert.equal(events.length, 1);
  assert.ok(!events[0].errorMessage?.includes('SECRET_KEY_VALUE_12345'));
  assert.ok(!events[0].errorMessage?.includes('gsk_ABCDEF123456789'));
  assert.ok(events[0].errorMessage?.includes('REDACTED'));
});

test('16. Fixture provider never performs network access', async () => {
  const fixture = new AIRouterFixtureProvider();
  const response = await fixture.generate({
    prompt: 'Offline test prompt',
    taskType: 'classification',
  });

  assert.ok(response.text);
  assert.equal(response.provider, 'fixture');
});

test('17. UTC daily counter behavior works', () => {
  const usageTracker = new InMemoryUsageTracker();
  const todayKey = getUtcDateKey();

  usageTracker.recordUsage({
    provider: 'groq',
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    success: true,
    dateUtc: todayKey,
  });

  assert.equal(usageTracker.getProviderDailyTokens('groq', todayKey), 300);
  assert.equal(usageTracker.getProviderDailyTokens('groq', '1999-01-01'), 0);
});

test('18. Router handles unconfigured Gemini safely with mock fetch error testing', async () => {
  const unconfiguredGemini = new GeminiProvider({ apiKey: '' });
  assert.equal(unconfiguredGemini.isConfigured(), false);

  await assert.rejects(
    async () => unconfiguredGemini.generate(baseRequest),
    (err: any) => {
      assert.equal(err.code, 'NOT_CONFIGURED');
      return true;
    }
  );

  // Test with mock offline fetch error response (e.g. 401)
  const mockFetch401 = async () =>
    new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    });

  const configuredGeminiMock = new GeminiProvider({
    apiKey: 'dummy-test-key',
    fetchFn: mockFetch401 as any,
  });

  await assert.rejects(
    async () => configuredGeminiMock.generate(baseRequest),
    (err: any) => {
      assert.equal(err.code, 'AUTH');
      assert.equal(err.retryable, false);
      return true;
    }
  );
});

test('19. Router handles unconfigured Groq safely with mock fetch error testing', async () => {
  const unconfiguredGroq = new GroqProvider({ apiKey: '' });
  assert.equal(unconfiguredGroq.isConfigured(), false);

  await assert.rejects(
    async () => unconfiguredGroq.generate(baseRequest),
    (err: any) => {
      assert.equal(err.code, 'NOT_CONFIGURED');
      return true;
    }
  );

  // Test with mock offline fetch rate limit (429)
  const mockFetch429 = async () =>
    new Response(JSON.stringify({ error: { message: 'Rate limit reached for model' } }), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Content-Type': 'application/json' },
    });

  const configuredGroqMock = new GroqProvider({
    apiKey: 'dummy-groq-key',
    fetchFn: mockFetch429 as any,
  });

  await assert.rejects(
    async () => configuredGroqMock.generate(baseRequest),
    (err: any) => {
      assert.equal(err.code, 'RATE_LIMIT');
      assert.equal(err.retryable, true);
      return true;
    }
  );
});

test('20. Router can operate entirely with fixture provider', async () => {
  const router = new AIRouter({
    config: {
      providerOrder: ['fixture'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
  });

  const result = await router.route(baseRequest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, 'fixture');
    assert.ok(result.response.text.length > 50);
  }
});

test('21. AIRouterGenerationProvider bridges Content Generation Runner with AI Router', async () => {
  const router = new AIRouter({
    config: {
      providerOrder: ['fixture'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
  });

  const routerGenProvider = new AIRouterGenerationProvider(router);

  const genRequest: GenerationRequest = {
    topicId: 'lm-tech-test-001',
    titleAngle: 'Intentional Technology Architecture in 2026',
    pillar: 'tech-ai',
    format: 'guide',
    audience: 'Curious developers and knowledge workers.',
    primaryIntent: 'informational',
    searchTargets: { primaryKeyword: 'intentional tech setup' },
    affiliateIntent: false,
    riskLevel: 'low',
  };

  const result = await runGenerationPipeline({
    request: genRequest,
    provider: routerGenProvider,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.article.title, 'Intentional Living in 2026: A Modern Guide');
    assert.ok(result.article.content.includes('## 1. The Modern Shift'));
    assert.equal(result.metadata.provider, 'fixture');
    assert.equal(result.validation.isValid, true);
  }
});

test('22. Preflight TPM protection blocks requests exceeding token budget', async () => {
  const rateLimiter = new InMemoryRateLimiter();
  // Record 7,000 tokens consumed in the current minute
  rateLimiter.recordTokens('groq', 7000);

  // Request requiring ~2,500 tokens with limit 8,000 should exceed 7000 + 2500 = 9500 > 8000
  const check = rateLimiter.checkRateLimit('groq', {
    tokensPerMinute: 8000,
    estimatedTokens: 2500,
  });

  assert.equal(check.allowed, false);
  assert.equal(check.reason, 'TPM_EXCEEDED');
  assert.ok(check.retryAfterMs > 0);
  assert.equal(check.currentMinuteTokens, 7000);
});

test('23. Router falls back to next provider when preflight TPM blocks primary', async () => {
  const rateLimiter = new InMemoryRateLimiter();
  rateLimiter.recordTokens('groq', 7500);

  const groqMock = new AIRouterFixtureProvider({ id: 'groq' });
  const geminiMock = new AIRouterFixtureProvider({ id: 'gemini' });

  const providers = new Map<string, IAIProvider>([
    ['groq', groqMock],
    ['gemini', geminiMock],
  ]);

  const router = new AIRouter({
    config: {
      providerOrder: ['groq', 'gemini'],
      gemini: { apiKey: 'dummy', model: 'gemini-2.5-flash', dailyTokenBudget: 100000, tokensPerMinute: 100000 },
      groq: { apiKey: 'dummy', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000, tokensPerMinute: 8000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers,
    rateLimiter,
  });

  const result = await router.route({
    prompt: 'Generate an in-depth article.',
    taskType: 'content_generation',
    maxOutputTokens: 2500,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, 'gemini', 'Should fallback to gemini when groq TPM is saturated');
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].error?.code, 'RATE_LIMIT');
  }
});

test('24. Groq HTTP 429 extracts Retry-After header and backoff seconds', async () => {
  const mockFetch429 = async () => ({
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: {
      get: (h: string) => (h.toLowerCase() === 'retry-after' ? '14' : null),
    },
    json: async () => ({
      error: { message: 'Rate limit reached on tokens per minute (TPM). Please try again in 14.0s.' },
    }),
  });

  const groq = new GroqProvider({
    apiKey: 'dummy-key',
    fetchFn: mockFetch429 as any,
  });

  await assert.rejects(
    async () => groq.generate(baseRequest),
    (err: any) => {
      assert.equal(err.code, 'RATE_LIMIT');
      assert.equal(err.retryable, true);
      assert.equal(err.retryAfterMs, 14000);
      return true;
    }
  );
});

test('25. Truncated JSON in Groq response is detected and classified as MALFORMED_OUTPUT', async () => {
  const truncatedJson = '{\n  "title": "Incomplete Article",\n  "content": "This sentence cuts off in the mid';
  const mockFetchTruncated = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      choices: [{ message: { content: truncatedJson } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  });

  const groq = new GroqProvider({
    apiKey: 'dummy-key',
    fetchFn: mockFetchTruncated as any,
  });

  await assert.rejects(
    async () => groq.generate({ ...baseRequest, responseFormat: 'json', validateJson: true }),
    (err: any) => {
      assert.equal(err.code, 'MALFORMED_OUTPUT');
      assert.equal(err.retryable, true);
      assert.ok(err.message.includes('truncated or malformed JSON'));
      return true;
    }
  );
});

test('26. Router automatically falls back to secondary provider when primary returns malformed JSON', async () => {
  const truncatedJson = '{\n  "title": "Incomplete",\n  "content": "unterminated';
  const mockFetchTruncated = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      choices: [{ message: { content: truncatedJson } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  });

  const groqTruncating = new GroqProvider({
    apiKey: 'dummy-key',
    fetchFn: mockFetchTruncated as any,
  });

  const validJson = JSON.stringify({
    title: 'Valid Full Article',
    slug: 'valid-full-article',
    description: 'A complete article description.',
    excerpt: 'An excerpt.',
    content: '## 1. Introduction\n\nComplete content here.',
    faq: [],
    sources: [],
    internalLinks: [],
    affiliateIntents: [],
    socialHooks: [],
  });

  const backupProvider = new AIRouterFixtureProvider({
    id: 'gemini',
    mockResponseText: validJson,
  });

  const providers = new Map<string, IAIProvider>([
    ['groq', groqTruncating],
    ['gemini', backupProvider],
  ]);

  const router = new AIRouter({
    config: {
      providerOrder: ['groq', 'gemini'],
      gemini: { apiKey: 'dummy', model: 'gemini-2.5-flash', dailyTokenBudget: 100000, tokensPerMinute: 100000 },
      groq: { apiKey: 'dummy', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000, tokensPerMinute: 8000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers,
  });

  const result = await router.route({
    prompt: 'Write an article.',
    taskType: 'content_generation',
    responseFormat: 'json',
    validateJson: true,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, 'gemini');
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].error?.code, 'MALFORMED_OUTPUT');
  }
});

test('27. AIRouterGenerationProvider does not pass partial or malformed article to pipeline', async () => {
  const failingRouter = new AIRouter({
    config: {
      providerOrder: ['failing'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000, tokensPerMinute: 100000 },
      groq: { apiKey: '', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000, tokensPerMinute: 8000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([
      ['failing', new AIRouterFixtureProvider({ id: 'failing', forcedError: { code: 'MALFORMED_OUTPUT', message: 'Truncated JSON', provider: 'failing', retryable: false } })],
    ]),
  });

  const provider = new AIRouterGenerationProvider(failingRouter);
  await assert.rejects(
    async () => provider.generate({
      topicId: 'lm-test-01',
      titleAngle: 'Test Angle',
      pillar: 'life',
      format: 'guide',
      audience: 'General readers',
      primaryIntent: 'informational',
      searchTargets: { primaryKeyword: 'test' },
      affiliateIntent: false,
      riskLevel: 'low',
    }),
    /AI Router generation failed: \[MALFORMED_OUTPUT\]/
  );
});

test('28. GroqProvider correctly includes response_format json_object for structured requests', async () => {
  let capturedBody: any = null;
  const mockFetch = async (_url: string, init: any) => {
    capturedBody = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ title: 'Mock Article', content: 'Mock Content' }) } }],
        usage: { prompt_tokens: 50, completion_tokens: 50 },
      }),
    };
  };

  const groq = new GroqProvider({
    apiKey: 'dummy-key',
    fetchFn: mockFetch as any,
  });

  await groq.generate({
    prompt: 'Write JSON',
    taskType: 'content_generation',
    responseFormat: 'json',
  });

  assert.deepEqual(capturedBody.response_format, { type: 'json_object' });
  assert.equal(capturedBody.max_tokens, 6000);
});

test('29. TPM: Request fits immediately without delay when capacity is available', async () => {
  let sleepCalled = false;
  const mockSleep = async () => {
    sleepCalled = true;
  };

  const rateLimiter = new InMemoryRateLimiter();
  const groqMock = new AIRouterFixtureProvider({ id: 'groq' });

  const router = new AIRouter({
    config: {
      providerOrder: ['groq'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000, tokensPerMinute: 100000 },
      groq: { apiKey: 'dummy', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000, tokensPerMinute: 8000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['groq', groqMock]]),
    rateLimiter,
    sleepFn: mockSleep,
  });

  const result = await router.route({
    prompt: 'Short request',
    taskType: 'content_generation',
    maxOutputTokens: 1000,
  });

  assert.equal(result.success, true);
  assert.equal(sleepCalled, false, 'sleepFn should not be called when capacity fits immediately');
});

test('30. TPM: Rolling window exhaustion auto-waits calculated duration and completes successfully', async () => {
  const rateLimiter = new InMemoryRateLimiter();
  const pastTime = Date.now() - 15_000; // 15 seconds ago
  rateLimiter.recordTokens('groq', 6000, pastTime);

  let capturedWaitMs = 0;
  const mockSleep = async (ms: number) => {
    capturedWaitMs = ms;
    // Simulate passage of time by clearing old tokens
    rateLimiter.reset();
  };

  const groqMock = new AIRouterFixtureProvider({ id: 'groq' });

  const router = new AIRouter({
    config: {
      providerOrder: ['groq'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000, tokensPerMinute: 100000 },
      groq: { apiKey: 'dummy', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000, tokensPerMinute: 8000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['groq', groqMock]]),
    rateLimiter,
    sleepFn: mockSleep,
  });

  const result = await router.route({
    prompt: 'A request requiring 3000 tokens',
    taskType: 'content_generation',
    maxOutputTokens: 3000,
  });

  assert.equal(result.success, true);
  assert.ok(capturedWaitMs >= 40_000 && capturedWaitMs <= 61_000, `Expected wait around 45s, got ${capturedWaitMs}ms`);
  assert.equal(result.provider, 'groq');
});

test('31. TPM: Request exceeding total provider TPM capacity fails immediately without waiting', async () => {
  let sleepCalled = false;
  const mockSleep = async () => {
    sleepCalled = true;
  };

  const rateLimiter = new InMemoryRateLimiter();
  const groqMock = new AIRouterFixtureProvider({ id: 'groq' });

  const router = new AIRouter({
    config: {
      providerOrder: ['groq'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000, tokensPerMinute: 100000 },
      groq: { apiKey: 'dummy', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000, tokensPerMinute: 8000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['groq', groqMock]]),
    rateLimiter,
    sleepFn: mockSleep,
  });

  // Request estimating 10,000 tokens (limit is 8,000)
  const result = await router.route({
    prompt: 'Massive prompt '.repeat(800),
    taskType: 'content_generation',
    maxOutputTokens: 9000,
  });

  assert.equal(result.success, false);
  assert.equal(sleepCalled, false, 'Should not sleep when request can never fit in total TPM');
  if (!result.success) {
    assert.equal(result.error.code, 'RATE_LIMIT');
  }
});

test('32. TPM: Auto-wait does not create an unbounded retry loop if capacity remains unavailable', async () => {
  let sleepCount = 0;
  const mockSleep = async () => {
    sleepCount++;
    // Do NOT clear tokens, so second check still fails
  };

  const rateLimiter = new InMemoryRateLimiter();
  rateLimiter.recordTokens('groq', 7000);
  const groqMock = new AIRouterFixtureProvider({ id: 'groq' });

  const router = new AIRouter({
    config: {
      providerOrder: ['groq'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000, tokensPerMinute: 100000 },
      groq: { apiKey: 'dummy', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000, tokensPerMinute: 8000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['groq', groqMock]]),
    rateLimiter,
    sleepFn: mockSleep,
  });

  const result = await router.route({
    prompt: 'Request needing 2000 tokens',
    taskType: 'content_generation',
    maxOutputTokens: 2000,
  });

  assert.equal(result.success, false);
  assert.equal(sleepCount, 1, 'Should sleep exactly once, not loop indefinitely');
  if (!result.success) {
    assert.equal(result.error.code, 'RATE_LIMIT');
  }
});

test('33. extractAndParseJson: Robustly extracts JSON across diverse LLM formatting styles', () => {
  // Pure JSON
  const raw1 = '{"title": "Test Title", "count": 42}';
  assert.deepEqual(extractAndParseJson(raw1), { title: 'Test Title', count: 42 });

  // Markdown codeblock with ```json
  const raw2 = '```json\n{\n  "title": "Wrapped Title",\n  "active": true\n}\n```';
  assert.deepEqual(extractAndParseJson(raw2), { title: 'Wrapped Title', active: true });

  // Markdown codeblock without language specifier ```
  const raw3 = '```\n{\n  "name": "Generic Fence"\n}\n```';
  assert.deepEqual(extractAndParseJson(raw3), { name: 'Generic Fence' });

  // Conversational preamble + markdown fence + postamble
  const raw4 = `Here is the requested JSON representation:\n\n\`\`\`json\n{\n  "status": "ready",\n  "score": 95\n}\n\`\`\`\n\nHope this helps your workflow!`;
  assert.deepEqual(extractAndParseJson(raw4), { status: 'ready', score: 95 });

  // Conversational preamble and postamble around raw JSON object
  const raw5 = `Sure, here is the object:\n{"key": "value", "items": [1, 2, 3]}\nLet me know if you need changes.`;
  assert.deepEqual(extractAndParseJson(raw5), { key: 'value', items: [1, 2, 3] });

  // Trailing commas in objects and arrays
  const raw6 = '{\n  "title": "Trailing Comma",\n  "tags": ["a", "b", ],\n}';
  assert.deepEqual(extractAndParseJson(raw6), { title: 'Trailing Comma', tags: ['a', 'b'] });

  // Array candidate extraction
  const raw7 = 'Here is the array:\n[{"id": 1}, {"id": 2}]\nEnjoy!';
  assert.deepEqual(extractAndParseJson(raw7), [{ id: 1 }, { id: 2 }]);
});

test('34. extractAndParseJson: Throws clean descriptive error on unrecoverable non-JSON input', () => {
  assert.throws(
    () => extractAndParseJson(''),
    /Cannot parse JSON from empty/
  );
  assert.throws(
    () => extractAndParseJson('This is completely plain prose with no braces or JSON structure at all.'),
    /Failed to extract valid JSON/
  );
});

test('35. GroqProvider: Recovers from HTTP 400 "Failed to generate JSON" via bounded fallback retry without response_format', async () => {
  let callCount = 0;
  const requestsMade: any[] = [];

  const mockFetch: typeof fetch = async (_input, init) => {
    callCount++;
    const body = JSON.parse(init?.body as string);
    requestsMade.push(body);

    if (callCount === 1) {
      // First attempt with response_format fails with Groq's known error
      return new Response(
        JSON.stringify({
          error: {
            message: 'Failed to generate JSON. Please adjust your prompt.',
            type: 'invalid_request_error',
            code: null,
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fallback retry without response_format succeeds
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '```json\n{\n  "title": "Recovered Article Title",\n  "slug": "recovered-title"\n}\n```',
            },
          },
        ],
        usage: { prompt_tokens: 150, completion_tokens: 45, total_tokens: 195 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const provider = new GroqProvider({
    apiKey: 'gsk-mock-key',
    defaultModel: 'openai/gpt-oss-20b',
    fetchFn: mockFetch,
  });

  const response = await provider.generate({
    prompt: 'Generate an article package in JSON format.',
    taskType: 'content_generation',
    responseFormat: 'json',
  });

  assert.equal(callCount, 2, 'Should have made initial attempt and one fallback retry');
  assert.deepEqual(requestsMade[0].response_format, { type: 'json_object' });
  assert.equal(requestsMade[1].response_format, undefined, 'Fallback retry must omit response_format');
  assert.ok(response.text.includes('Recovered Article Title'));
  assert.equal(response.inputTokens, 150);
  assert.equal(response.outputTokens, 45);
});

test('36. GroqProvider: Unrecoverable JSON error is classified as retryable MALFORMED_OUTPUT', async () => {
  let callCount = 0;

  const mockFetch: typeof fetch = async () => {
    callCount++;
    return new Response(
      JSON.stringify({
        error: {
          message: 'Failed to generate JSON. Please adjust your prompt.',
          type: 'invalid_request_error',
        },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const provider = new GroqProvider({
    apiKey: 'gsk-mock-key',
    fetchFn: mockFetch,
  });

  try {
    await provider.generate({
      prompt: 'Invalid prompt structure',
      taskType: 'content_generation',
      responseFormat: 'json',
    });
    assert.fail('Should have thrown an error');
  } catch (err: any) {
    assert.equal(err.code, 'MALFORMED_OUTPUT');
    assert.equal(err.retryable, true, 'JSON grammar failure must be retryable for AI Router failover');
    assert.ok(err.message.includes('Failed to generate JSON'));
  }
});

test('37. GroqProvider: Standard client errors remain non-retryable INVALID_REQUEST', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          message: 'Model "unknown-model-xyz" does not exist.',
          type: 'invalid_request_error',
        },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const provider = new GroqProvider({
    apiKey: 'gsk-mock-key',
    fetchFn: mockFetch,
  });

  try {
    await provider.generate({
      prompt: 'Simple test prompt',
      taskType: 'content_generation',
    });
    assert.fail('Should have thrown an error');
  } catch (err: any) {
    assert.equal(err.code, 'INVALID_REQUEST');
    assert.equal(err.retryable, false);
  }
});

test('38. AIRouter: Fails over to fallback provider when primary provider returns unrecoverable JSON error', async () => {
  const failingGroq = new GroqProvider({
    apiKey: 'gsk-mock-key',
    fetchFn: async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Failed to generate JSON. Please adjust your prompt.',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    },
  });

  const backupGemini = new AIRouterFixtureProvider({
    id: 'gemini',
    defaultModel: 'gemini-2.5-flash',
  });

  const router = new AIRouter({
    config: {
      providerOrder: ['groq', 'gemini'],
      gemini: { apiKey: 'gem-mock', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: 'gsk-mock', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 2, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map<any, any>([
      ['groq', failingGroq],
      ['gemini', backupGemini],
    ]),
  });

  const result = await router.route({
    prompt: 'Generate article package',
    taskType: 'content_generation',
    responseFormat: 'json',
    validateJson: true,
  });

  assert.equal(result.success, true, 'AI Router should failover to Gemini and succeed');
  if (result.success) {
    assert.equal(result.provider, 'gemini');
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].provider, 'groq');
    assert.equal(result.attempts[0].success, false);
    assert.equal(result.attempts[0].error?.code, 'MALFORMED_OUTPUT');
    assert.equal(result.attempts[1].provider, 'gemini');
    assert.equal(result.attempts[1].success, true);
  }
});

test('39. AIRouterReviewProvider: Parses wrapped review JSON and extracts structured dimensions', async () => {
  const mockReviewResponse = `\`\`\`json
{
  "overallScore": 92,
  "dimensions": {
    "factuality": { "score": 95, "rationale": "Well cited.", "issues": [] },
    "usefulness": { "score": 90, "rationale": "Actionable.", "issues": [] }
  },
  "criticalIssues": [],
  "warnings": ["Consider adding 1 more source."]
}
\`\`\``;

  const mockProvider = new AIRouterFixtureProvider({
    id: 'groq',
    defaultModel: 'openai/gpt-oss-20b',
  });
  mockProvider.generate = async () => ({
    text: mockReviewResponse,
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    durationMs: 120,
  });

  const router = new AIRouter({
    config: {
      providerOrder: ['groq'],
      gemini: { apiKey: '', model: 'gemini-2.5-flash', dailyTokenBudget: 100000 },
      groq: { apiKey: 'gsk-mock', model: 'openai/gpt-oss-20b', dailyTokenBudget: 100000 },
      router: { timeoutMs: 5000, maxAttempts: 1, retryDelayMs: 10, dailyTotalTokenBudget: 200000, requestsPerMinute: 30, requestsPerDay: 100 },
    },
    providers: new Map([['groq', mockProvider]]),
  });

  const reviewProvider = new AIRouterReviewProvider(router);
  const reviewResult = await reviewProvider.review({
    topicId: 'lm-test-topic',
    pillar: 'tech-ai',
    format: 'guide',
    audience: 'General',
    primaryIntent: 'informational',
    riskLevel: 'low',
    affiliateIntent: false,
    sources: [],
    internalLinks: [],
    title: 'Test Article Title',
    description: 'Test article description of sufficient length for review testing.',
    excerpt: 'Test excerpt',
    content: '## Heading One\n\nSubstantive content paragraph.\n\n## Heading Two\n\nAnother substantive paragraph.',
  });

  assert.equal(reviewResult.overallScore, 92);
  assert.equal(reviewResult.dimensions.factuality?.score, 95);
  assert.deepEqual(reviewResult.warnings, ['Consider adding 1 more source.']);
  assert.equal(reviewResult.metadata?.provider, 'groq');
});



