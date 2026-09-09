import type { AutomationConfig, ScheduledAutomationConfig } from './types.ts';

const DEFAULT_CONFIG: AutomationConfig = {
  enabled: false,
  maxOpportunities: 1,
  dryRun: true,
  minScoreThreshold: 80,
  providerMode: 'fixture',
};

const DEFAULT_SCHEDULED_CONFIG: ScheduledAutomationConfig = {
  ...DEFAULT_CONFIG,
  allowCommit: false,
  allowPush: false,
  gitRemote: 'origin',
  gitBranch: 'master',
};

/**
 * Loads and validates configuration for Editorial Automation V1.
 * Supports LIFEMODE_AUTOMATION_* and EDITORIAL_AUTOMATION_* environment variables.
 * Safely defaults to opt-in execution (enabled: false) and dry-run mode (dryRun: true).
 */
export function loadAutomationConfig(overrides: Partial<AutomationConfig> = {}): AutomationConfig {
  const envEnabledRaw = process.env.LIFEMODE_AUTOMATION_ENABLED ?? process.env.EDITORIAL_AUTOMATION_ENABLED;
  const envEnabled = envEnabledRaw !== undefined
    ? envEnabledRaw === 'true'
    : DEFAULT_CONFIG.enabled;

  const envMaxOppRaw = process.env.LIFEMODE_AUTOMATION_MAX_OPPORTUNITIES ?? process.env.EDITORIAL_AUTOMATION_MAX_OPPORTUNITIES;
  const envMaxOpp = envMaxOppRaw
    ? parseInt(envMaxOppRaw, 10)
    : DEFAULT_CONFIG.maxOpportunities;

  const envDryRunRaw = process.env.LIFEMODE_AUTOMATION_DRY_RUN ?? process.env.EDITORIAL_AUTOMATION_DRY_RUN;
  const envDryRun = envDryRunRaw !== undefined
    ? envDryRunRaw !== 'false'
    : DEFAULT_CONFIG.dryRun;

  const envMinScoreRaw = process.env.LIFEMODE_AUTOMATION_MIN_SCORE ?? process.env.EDITORIAL_AUTOMATION_MIN_SCORE;
  const envMinScore = envMinScoreRaw
    ? parseInt(envMinScoreRaw, 10)
    : DEFAULT_CONFIG.minScoreThreshold;

  const envProviderRaw = process.env.LIFEMODE_AUTOMATION_PROVIDER ?? process.env.EDITORIAL_AUTOMATION_PROVIDER;
  const envProviderMode = (envProviderRaw as 'fixture' | 'router') || DEFAULT_CONFIG.providerMode;

  return {
    enabled: overrides.enabled ?? envEnabled,
    maxOpportunities: Math.max(1, overrides.maxOpportunities ?? (isNaN(envMaxOpp) ? DEFAULT_CONFIG.maxOpportunities : envMaxOpp)),
    dryRun: overrides.dryRun ?? envDryRun,
    minScoreThreshold: overrides.minScoreThreshold ?? (isNaN(envMinScore) ? DEFAULT_CONFIG.minScoreThreshold : envMinScore),
    providerMode: overrides.providerMode || envProviderMode,
  };
}

/**
 * Loads and validates configuration for Scheduled Editorial Automation runs.
 */
export function loadScheduledAutomationConfig(overrides: Partial<ScheduledAutomationConfig> = {}): ScheduledAutomationConfig {
  const base = loadAutomationConfig(overrides);

  const envCommitRaw = process.env.LIFEMODE_AUTOMATION_COMMIT ?? process.env.EDITORIAL_AUTOMATION_COMMIT;
  const allowCommit = overrides.allowCommit ?? (envCommitRaw === 'true');

  const envPushRaw = process.env.LIFEMODE_AUTOMATION_PUSH ?? process.env.EDITORIAL_AUTOMATION_PUSH;
  const allowPush = overrides.allowPush ?? (envPushRaw === 'true');

  const gitRemote = overrides.gitRemote || process.env.LIFEMODE_AUTOMATION_GIT_REMOTE || DEFAULT_SCHEDULED_CONFIG.gitRemote;
  const gitBranch = overrides.gitBranch || process.env.LIFEMODE_AUTOMATION_GIT_BRANCH || DEFAULT_SCHEDULED_CONFIG.gitBranch;
  const lockPath = overrides.lockPath || process.env.LIFEMODE_AUTOMATION_LOCK_PATH;

  return {
    ...base,
    allowCommit,
    allowPush,
    gitRemote,
    gitBranch,
    lockPath,
  };
}

