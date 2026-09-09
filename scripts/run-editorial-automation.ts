import { runEditorialAutomation, formatAutomationSummary } from '../src/lib/editorial/automation/index.ts';

async function main() {
  const args = process.argv.slice(2);

  const isLiveCommit = args.includes('--commit') || args.includes('--live');
  const isRouter = args.includes('--router') || args.includes('--ai-router');
  
  let maxOpportunities = 1;
  const maxArg = args.find((a) => a.startsWith('--max='));
  if (maxArg) {
    const val = parseInt(maxArg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) {
      maxOpportunities = val;
    }
  }

  let minScore = 80;
  const scoreArg = args.find((a) => a.startsWith('--min-score='));
  if (scoreArg) {
    const val = parseInt(scoreArg.split('=')[1], 10);
    if (!isNaN(val) && val >= 0) {
      minScore = val;
    }
  }

  console.log('====================================================');
  console.log(' LifeMode Editorial Automation V1 Execution Engine  ');
  console.log('====================================================\n');
  console.log(`* Mode:           ${isRouter ? 'AI Router (Managed Providers)' : 'Deterministic Fixtures (Offline)'}`);
  console.log(`* Dry-Run:        ${isLiveCommit ? 'NO (Local Commit Allowed)' : 'YES (Safe Default)'}`);
  console.log(`* Max Selection:  ${maxOpportunities}`);
  console.log(`* Min Score:      ${minScore}`);
  console.log('----------------------------------------------------\n');

  const result = await runEditorialAutomation({
    enabled: true,
    dryRun: !isLiveCommit,
    allowCommit: isLiveCommit,
    maxOpportunities,
    minScoreThreshold: minScore,
    providerMode: isRouter ? 'router' : 'fixture',
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
