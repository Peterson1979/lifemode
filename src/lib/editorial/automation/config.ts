import type { AutomationConfig, ScheduledAutomationConfig } from './types.ts';

const DEFAULT_CONFIG: AutomationConfig = {
  enabled: false,
  maxOpportunities: 1,
  dailyArticleLimit: 3,
  dryRun: true,
  minScoreThreshold: 80,
  providerMode: 'fixture',
  accelerationEnabled: false,
  accelerationMaxOpportunities: 5,
  allowCommit: false,
};

const DEFAULT_SCHEDULED_CONFIG: ScheduledAutomationConfig = {
  ...DEFAULT_CONFIG,
  allowCommit: false,
  allowPush: false,
  gitRemote: 'origin',
  gitBranch: 'master',
};

/**
 * Loads and validates configuration for Editorial Automation.
 * Supports LIFEMODE_DAILY_ARTICLE_LIMIT, LIFEMODE_AUTOMATION_* and EDITORIAL_AUTOMATION_* environment variables.
 * Safely defaults to opt-in execution (enabled: false) and dry-run mode (dryRun: true).
 */
export function loadAutomationConfig(overrides: Partial<AutomationConfig> = {}): AutomationConfig {
  const envEnabledRaw = process.env.LIFEMODE_AUTOMATION_ENABLED ?? process.env.EDITORIAL_AUTOMATION_ENABLED;
  const envEnabled = envEnabledRaw !== undefined
    ? envEnabledRaw === 'true'
    : DEFAULT_CONFIG.enabled;

  const envAccelerationRaw = process.env.LIFEMODE_AUTOMATION_ACCELERATION_ENABLED ?? process.env.EDITORIAL_AUTOMATION_ACCELERATION_ENABLED;
  const accelerationEnabled = overrides.accelerationEnabled ?? (envAccelerationRaw === 'true');

  const envAccMaxOppRaw = process.env.LIFEMODE_AUTOMATION_ACCELERATION_MAX_OPPORTUNITIES ?? process.env.EDITORIAL_AUTOMATION_ACCELERATION_MAX_OPPORTUNITIES;
  const accelerationMaxOpportunities = overrides.accelerationMaxOpportunities ?? (envAccMaxOppRaw ? parseInt(envAccMaxOppRaw, 10) : 5);

  const envDailyLimitRaw = process.env.LIFEMODE_DAILY_ARTICLE_LIMIT ?? process.env.DAILY_ARTICLE_LIMIT;
  const envMaxOppRaw = envDailyLimitRaw ?? process.env.LIFEMODE_AUTOMATION_MAX_OPPORTUNITIES ?? process.env.EDITORIAL_AUTOMATION_MAX_OPPORTUNITIES;
  const baseMaxOpp = envMaxOppRaw
    ? parseInt(envMaxOppRaw, 10)
    : (accelerationEnabled ? accelerationMaxOpportunities : DEFAULT_CONFIG.maxOpportunities);

  const effectiveMaxOpp = overrides.dailyArticleLimit ?? overrides.maxOpportunities ?? baseMaxOpp;
  const resolvedMaxOpp = Math.max(1, isNaN(effectiveMaxOpp) ? DEFAULT_CONFIG.maxOpportunities : effectiveMaxOpp);
  const resolvedDailyLimit = overrides.dailyArticleLimit ?? (envDailyLimitRaw ? parseInt(envDailyLimitRaw, 10) : (overrides.maxOpportunities ?? DEFAULT_CONFIG.dailyArticleLimit));

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

  const envCommitRaw = process.env.LIFEMODE_AUTOMATION_COMMIT ?? process.env.EDITORIAL_AUTOMATION_COMMIT;
  const envAllowCommit = envCommitRaw !== undefined
    ? envCommitRaw === 'true'
    : (DEFAULT_CONFIG.allowCommit ?? false);
  const allowCommit = overrides.allowCommit !== undefined
    ? overrides.allowCommit
    : envAllowCommit;

  return {
    enabled: overrides.enabled ?? envEnabled,
    maxOpportunities: resolvedMaxOpp,
    dailyArticleLimit: resolvedDailyLimit,
    dryRun: overrides.dryRun ?? envDryRun,
    minScoreThreshold: overrides.minScoreThreshold ?? (isNaN(envMinScore) ? DEFAULT_CONFIG.minScoreThreshold : envMinScore),
    providerMode: overrides.providerMode || envProviderMode,
    accelerationEnabled,
    accelerationMaxOpportunities,
    allowCommit,
  };
}

/**
 * Loads and validates configuration for Scheduled Editorial Automation runs.
 */
export function loadScheduledAutomationConfig(overrides: Partial<ScheduledAutomationConfig> = {}): ScheduledAutomationConfig {
  const base = loadAutomationConfig(overrides);

  const envCommitRaw = process.env.LIFEMODE_AUTOMATION_COMMIT ?? process.env.EDITORIAL_AUTOMATION_COMMIT;
  const allowCommit = overrides.allowCommit !== undefined
    ? overrides.allowCommit
    : (base.allowCommit ?? (envCommitRaw === 'true'));

  const envPushRaw = process.env.LIFEMODE_AUTOMATION_PUSH ?? process.env.EDITORIAL_AUTOMATION_PUSH;
  const allowPush = overrides.allowPush !== undefined
    ? overrides.allowPush
    : (envPushRaw === 'true');

  const gitRemote = overrides.gitRemote || process.env.LIFEMODE_AUTOMATION_GIT_REMOTE || DEFAULT_SCHEDULED_CONFIG.gitRemote;
  const gitBranch = overrides.gitBranch || process.env.LIFEMODE_AUTOMATION_GIT_BRANCH || DEFAULT_SCHEDULED_CONFIG.gitBranch;
  const lockPath = overrides.lockPath || process.env.LIFEMODE_AUTOMATION_LOCK_PATH;

  const envSocialEnabledRaw = process.env.LIFEMODE_SOCIAL_ENABLED ?? process.env.SOCIAL_AUTOMATION_ENABLED;
  const socialEnabled = overrides.socialEnabled ?? (envSocialEnabledRaw === 'true');
  const socialOptions = overrides.socialOptions;

  return {
    ...base,
    allowCommit,
    allowPush,
    gitRemote,
    gitBranch,
    lockPath,
    socialEnabled,
    socialOptions,
  };
}
