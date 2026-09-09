import type { AutomationConfig } from './types.ts';

const DEFAULT_CONFIG: AutomationConfig = {
  enabled: false,
  maxOpportunities: 1,
  dryRun: true,
  minScoreThreshold: 80,
  providerMode: 'fixture',
};

/**
 * Loads and validates configuration for Editorial Automation V1.
 * Safely defaults to opt-in execution (enabled: false) and dry-run mode (dryRun: true).
 */
export function loadAutomationConfig(overrides: Partial<AutomationConfig> = {}): AutomationConfig {
  const envEnabled = process.env.EDITORIAL_AUTOMATION_ENABLED !== undefined
    ? process.env.EDITORIAL_AUTOMATION_ENABLED === 'true'
    : DEFAULT_CONFIG.enabled;

  const envMaxOpp = process.env.EDITORIAL_AUTOMATION_MAX_OPPORTUNITIES
    ? parseInt(process.env.EDITORIAL_AUTOMATION_MAX_OPPORTUNITIES, 10)
    : DEFAULT_CONFIG.maxOpportunities;

  const envDryRun = process.env.EDITORIAL_AUTOMATION_DRY_RUN !== undefined
    ? process.env.EDITORIAL_AUTOMATION_DRY_RUN !== 'false'
    : DEFAULT_CONFIG.dryRun;

  const envMinScore = process.env.EDITORIAL_AUTOMATION_MIN_SCORE
    ? parseInt(process.env.EDITORIAL_AUTOMATION_MIN_SCORE, 10)
    : DEFAULT_CONFIG.minScoreThreshold;

  const envProviderMode = (process.env.EDITORIAL_AUTOMATION_PROVIDER as 'fixture' | 'router') || DEFAULT_CONFIG.providerMode;

  return {
    enabled: overrides.enabled ?? envEnabled,
    maxOpportunities: Math.max(1, overrides.maxOpportunities ?? (isNaN(envMaxOpp) ? DEFAULT_CONFIG.maxOpportunities : envMaxOpp)),
    dryRun: overrides.dryRun ?? envDryRun,
    minScoreThreshold: overrides.minScoreThreshold ?? (isNaN(envMinScore) ? DEFAULT_CONFIG.minScoreThreshold : envMinScore),
    providerMode: overrides.providerMode || envProviderMode,
  };
}
