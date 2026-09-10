import { runSocialPipeline, loadSocialConfig } from '../src/lib/social/index.ts';

async function main() {
  const args = process.argv.slice(2);

  const isJson = args.includes('--json');
  const isLivePublish = args.includes('--publish') || args.includes('--live');
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
    enabled: true,
  };

  if (isLivePublish) {
    overrides.allowPublish = true;
    overrides.dryRun = false;
  }
  if (isExplicitDryRun) {
    overrides.dryRun = true;
    overrides.allowPublish = false;
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

  const config = loadSocialConfig(overrides);

  if (!isJson) {
    console.log('====================================================');
    console.log(' LifeMode Social Media Automation V1                ');
    console.log('====================================================\n');
    console.log(`* Provider Mode:   ${config.providerMode === 'router' ? 'AI Router (Managed Providers)' : 'Deterministic Fixtures (Offline)'}`);
    console.log(`* Image Mode:      ${config.imageProviderMode}`);
    console.log(`* Dry-Run:         ${config.dryRun ? 'YES (Safe Mode - No External API Calls)' : 'NO (Live Execution)'}`);
    console.log(`* Publish Allowed: ${config.allowPublish ? 'YES' : 'NO'}`);
    console.log(`* Max Selection:   ${config.maxOpportunities}`);
    console.log(`* Min Score:       ${config.minScoreThreshold}`);
    console.log(`* Platforms:       Facebook (${config.credentials.facebook.configured ? 'Configured' : 'NOT_CONFIGURED'}), Instagram (${config.credentials.instagram.configured ? 'Configured' : 'NOT_CONFIGURED'}), Pinterest (${config.credentials.pinterest.configured ? 'Configured' : 'NOT_CONFIGURED'})`);
    console.log('----------------------------------------------------\n');
  }

  const result = await runSocialPipeline({
    config,
  });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.summary);
    console.log('\n====================================================');
    console.log(` Social Automation Finished [${result.status}]`);
    console.log('====================================================\n');
  }

  if (result.status === 'FAILED') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal Social Automation Error:', err);
  process.exit(1);
});
