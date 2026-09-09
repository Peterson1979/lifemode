import type { AIProviderId } from './types.ts';

export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
  dailyTokenBudget: number;
}

export interface GroqProviderConfig {
  apiKey: string;
  model: string;
  dailyTokenBudget: number;
}

export interface RouterLimitsConfig {
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
  dailyTotalTokenBudget: number;
  requestsPerMinute: number;
  requestsPerDay: number;
}

export interface AIConfig {
  providerOrder: AIProviderId[];
  gemini: GeminiProviderConfig;
  groq: GroqProviderConfig;
  router: RouterLimitsConfig;
}

/**
 * Safely resolves an environment variable across Node and Vite runtimes without throwing.
 */
function getEnv(key: string, defaultValue = ''): string {
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
    return process.env[key] as string;
  }
  const metaEnv = (import.meta as any)?.env;
  if (metaEnv && metaEnv[key] !== undefined) {
    return String(metaEnv[key]);
  }
  return defaultValue;
}

/**
 * Parses an integer with fallback.
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const val = getEnv(key);
  if (!val) return defaultValue;
  const num = Number(val);
  return Number.isFinite(num) ? num : defaultValue;
}

/**
 * Loads and returns the complete typed AI Router configuration.
 */
export function loadAIConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  const providerOrderRaw = getEnv('AI_PROVIDER_ORDER', 'gemini,groq');
  const parsedProviderOrder = providerOrderRaw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean) as AIProviderId[];

  const defaultConfig: AIConfig = {
    providerOrder: parsedProviderOrder.length > 0 ? parsedProviderOrder : ['gemini', 'groq'],
    gemini: {
      apiKey: getEnv('GEMINI_API_KEY'),
      model: getEnv('GEMINI_MODEL', 'gemini-2.5-flash'),
      dailyTokenBudget: getEnvNumber('GEMINI_DAILY_TOKEN_BUDGET', 1_000_000),
    },
    groq: {
      apiKey: getEnv('GROQ_API_KEY'),
      model: getEnv('GROQ_MODEL', 'llama-3.3-70b-versatile'),
      dailyTokenBudget: getEnvNumber('GROQ_DAILY_TOKEN_BUDGET', 1_000_000),
    },
    router: {
      timeoutMs: getEnvNumber('AI_REQUEST_TIMEOUT_MS', 30_000),
      maxAttempts: getEnvNumber('AI_MAX_ATTEMPTS', 3),
      retryDelayMs: getEnvNumber('AI_RETRY_DELAY_MS', 1_000),
      dailyTotalTokenBudget: getEnvNumber('AI_DAILY_TOTAL_TOKEN_BUDGET', 2_000_000),
      requestsPerMinute: getEnvNumber('AI_RPM_LIMIT', 30),
      requestsPerDay: getEnvNumber('AI_RPD_LIMIT', 1_000),
    },
  };

  return {
    ...defaultConfig,
    ...overrides,
    gemini: { ...defaultConfig.gemini, ...overrides.gemini },
    groq: { ...defaultConfig.groq, ...overrides.groq },
    router: { ...defaultConfig.router, ...overrides.router },
  };
}
