import { runEditorialWatchdog, loadScheduledAutomationConfig } from '../src/lib/editorial/automation/index.ts';

async function main() {
  const args = process.argv.slice(2);

  const isJson = args.includes('--json');
  const isForce = args.includes('--force');
  const isLiveCommit = args.includes('--commit') || args.includes('--live');
  const isPush = args.includes('--push');
  const isRouter = args.includes('--router') || args.includes('--ai-router');
  const isFixture = args.includes('--fixture');
  const isExplicitDryRun = args.includes('--dry-run');

  let targetDate: string | undefined;
  const dateArg = args.find((a) => a.startsWith('--date='));
  if (dateArg) {
    targetDate = dateArg.split('=')[1];
  }

  let maxOpportunities: number | undefined;
  const maxArg = args.find((a) => a.startsWith('--max='));
  if (maxArg) {
    const val = parseInt(maxArg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) {
      maxOpportunities = val;
    }
  }

  const overrides: any = {
    enabled: true,
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

  const config = loadScheduledAutomationConfig(overrides);

  if (!isJson) {
    console.log('====================================================');
    console.log(' LifeMode Editorial Automation Watchdog             ');
    console.log('====================================================\n');
    console.log(`* Target Date:    ${targetDate || 'Today (UTC)'}`);
    console.log(`* Force Run:      ${isForce ? 'YES (Bypassing daily quota check)' : 'NO'}`);
    console.log(`* Provider Mode:  ${config.providerMode === 'router' ? 'AI Router (Managed Providers)' : 'Deterministic Fixtures (Offline)'}`);
    console.log(`* Dry-Run:        ${config.dryRun ? 'YES (Safe Mode)' : 'NO (Live Execution)'}`);
    console.log(`* Commit Allowed: ${config.allowCommit ? 'YES' : 'NO'}`);
    console.log(`* Push Allowed:   ${config.allowPush ? 'YES' : 'NO'}`);
    console.log(`* Daily Limit:    ${config.dailyArticleLimit || config.maxOpportunities}`);
    console.log('----------------------------------------------------\n');
  }

  const result = await runEditorialWatchdog({
    ...config,
    targetDate,
    force: isForce,
    allowUnrelatedChanges: true,
    commitAuthor: {
      name: 'LifeMode Editorial Watchdog',
      email: 'watchdog@lifemode.local',
    },
  });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[Watchdog Action]: ${result.action}`);
    console.log(`[Watchdog Status]: ${result.status}`);
    console.log(`[Details]:         ${result.reason}`);
    console.log(`[Published Today]: ${result.report.publishedTodayCount}/${result.report.dailyLimit} on ${result.report.targetDate}`);
    if (result.report.publishedArticles.length > 0) {
      console.log('\nArticles published for target date:');
      for (const a of result.report.publishedArticles) {
        console.log(`  - [${a.pillar}] ${a.title} (${a.slug})`);
      }
    }
    if (result.scheduledResult) {
      console.log('\n--- Scheduled Execution Output ---');
      console.log(result.scheduledResult.summary);
    }
    console.log('\n====================================================');
    console.log(` Watchdog Run Complete [${result.status}]`);
    console.log('====================================================\n');
  }

  if (result.status === 'FAILED') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal Watchdog Error:', err);
  process.exit(1);
});
