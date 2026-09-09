import { runScheduledEditorialAutomation, loadScheduledAutomationConfig } from '../src/lib/editorial/automation/index.ts';

async function main() {
  const args = process.argv.slice(2);

  const isJson = args.includes('--json');
  const isLiveCommit = args.includes('--commit') || args.includes('--live');
  const isPush = args.includes('--push');
  const isRouter = args.includes('--router') || args.includes('--ai-router');
  const isFixture = args.includes('--fixture');
  const isExplicitDryRun = args.includes('--dry-run');

  let maxOpportunities: number | undefined;
  const maxArg = args.find((a) => a.startsWith('--max='));
  if (maxArg) {
    const val = parseInt(maxArg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) {
      maxOpportunities = val;
    }
  }

  let minScore: number | undefined;
  const scoreArg = args.find((a) => a.startsWith('--min-score='));
  if (scoreArg) {
    const val = parseInt(scoreArg.split('=')[1], 10);
    if (!isNaN(val) && val >= 0) {
      minScore = val;
    }
  }

  const overrides: any = {
    enabled: true, // CLI invocation explicitly enables execution
  };

  if (isLiveCommit) {
    overrides.allowCommit = true;
    overrides.dryRun = false;
  }
  if (isPush) {
    overrides.allowPush = true;
  }
  if (isExplicitDryRun) {
    overrides.dryRun = true;
    overrides.allowCommit = false;
    overrides.allowPush = false;
  }
  if (isRouter) {
    overrides.providerMode = 'router';
  } else if (isFixture) {
    overrides.providerMode = 'fixture';
  }
  if (maxOpportunities !== undefined) {
    overrides.maxOpportunities = maxOpportunities;
  }
  if (minScore !== undefined) {
    overrides.minScoreThreshold = minScore;
  }

  const config = loadScheduledAutomationConfig(overrides);

  if (!isJson) {
    console.log('====================================================');
    console.log(' LifeMode Scheduled Editorial Automation V1        ');
    console.log('====================================================\n');
    console.log(`* Provider Mode:  ${config.providerMode === 'router' ? 'AI Router (Managed Providers)' : 'Deterministic Fixtures (Offline)'}`);
    console.log(`* Dry-Run:        ${config.dryRun ? 'YES (Safe Mode)' : 'NO (Live Execution)'}`);
    console.log(`* Commit Allowed: ${config.allowCommit ? 'YES' : 'NO'}`);
    console.log(`* Push Allowed:   ${config.allowPush ? 'YES' : 'NO'}`);
    console.log(`* Max Selection:  ${config.maxOpportunities}`);
    console.log(`* Min Score:      ${config.minScoreThreshold}`);
    console.log('----------------------------------------------------\n');
  }

  const result = await runScheduledEditorialAutomation({
    ...config,
    allowUnrelatedChanges: true,
    commitAuthor: {
      name: 'LifeMode Editorial Automation',
      email: 'automation@lifemode.local',
    },
  });

  if (isJson) {
    console.log(JSON.stringify(result.jsonResult, null, 2));
  } else {
    console.log(result.summary);
    console.log('\n====================================================');
    console.log(` Scheduled Automation Finished [${result.status}]`);
    console.log('====================================================\n');
  }

  // Only infrastructure or fatal errors exit with 1
  // SUCCESS, PARTIAL_SUCCESS, and SUCCESS_NO_PUBLICATION exit with 0
  if (result.status === 'FAILED') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal Scheduled Automation Error:', err);
  process.exit(1);
});
