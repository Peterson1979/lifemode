import {
  runEditorialAutomation,
  formatAutomationSummary,
  loadAutomationConfig,
  type AutomationConfig,
} from '../src/lib/editorial/automation/index.ts';

async function main() {
  const args = process.argv.slice(2);

  const isLiveCommit = args.includes('--commit') || args.includes('--live');
  const isNoCommit = args.includes('--no-commit');
  const isExplicitDryRun = args.includes('--dry-run');
  const isRouter = args.includes('--router') || args.includes('--ai-router');
  const isFixture = args.includes('--fixture');

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

  const overrides: Partial<AutomationConfig> = {
    enabled: true, // CLI execution explicitly enables automation
  };

  if (isLiveCommit) {
    overrides.allowCommit = true;
    overrides.dryRun = false;
  } else if (isNoCommit) {
    overrides.allowCommit = false;
  }

  if (isExplicitDryRun) {
    overrides.dryRun = true;
    overrides.allowCommit = false;
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

  const config = loadAutomationConfig(overrides);

  console.log('====================================================');
  console.log(' LifeMode Editorial Automation V1 Execution Engine  ');
  console.log('====================================================\n');
  console.log(`* Mode:           ${config.providerMode === 'router' ? 'AI Router (Managed Providers)' : 'Deterministic Fixtures (Offline)'}`);
  console.log(`* Dry-Run:        ${config.dryRun ? 'YES (Safe Default)' : 'NO (Live Execution)'}`);
  console.log(`* Commit Allowed: ${config.allowCommit ? 'YES' : 'NO'}`);
  console.log(`* Max Selection:  ${config.maxOpportunities}`);
  console.log(`* Min Score:      ${config.minScoreThreshold}`);
  console.log('----------------------------------------------------\n');

  const result = await runEditorialAutomation({
    ...config,
    allowUnrelatedChanges: true,
    commitAuthor: {
      name: 'LifeMode Editorial Automation',
      email: 'automation@lifemode.local',
    },
  });

  console.log(formatAutomationSummary(result));
  console.log('\n====================================================');
  console.log(` Editorial Automation Finished [${result.status}]`);
  console.log('====================================================\n');

  if (result.status === 'FAILED') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal Automation Error:', err);
  process.exit(1);
});

