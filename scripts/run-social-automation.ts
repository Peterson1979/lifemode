import * as path from 'node:path';
import {
  runSocialPipeline,
  loadSocialConfig,
  publishCrossProjectToThreads,
  resolveCrossProjectItem,
  normalizeSourceProject,
  FilesystemSocialHistoryRepository,
} from '../src/lib/social/index.ts';
import { GitCli } from '../src/lib/editorial/git-publisher/git-cli.ts';

async function main() {
  try {
    process.loadEnvFile?.();
  } catch {}

  const args = process.argv.slice(2);

  const isJson = args.includes('--json');
  const isStorageTest = args.includes('--storage-test');
  const isLivePublish = args.includes('--publish') || args.includes('--live');
  const isCommit = args.includes('--commit') || args.includes('--live');
  const isPush = args.includes('--push');
  const isRouter = args.includes('--router') || args.includes('--ai-router');
  const isFixture = args.includes('--fixture');
  const isExplicitDryRun = args.includes('--dry-run');

  let source = process.env.LIFEMODE_SOCIAL_SOURCE || 'lifemode';
  const sourceArg = args.find((a) => a.startsWith('--source='));
  if (sourceArg) {
    source = sourceArg.split('=')[1].trim();
  }

  let contentId = process.env.LIFEMODE_SOCIAL_CONTENT_ID || '';
  const contentIdArg = args.find((a) => a.startsWith('--content-id=') || a.startsWith('--manifest='));
  if (contentIdArg) {
    contentId = contentIdArg.split('=')[1].trim();
  }

  let maxOpportunities: number | undefined;
  const maxArg = args.find((a) => a.startsWith('--max='));
  if (maxArg) {
    const val = parseInt(maxArg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) {
      maxOpportunities = val;
    }
  }

  let maxFreshnessDays: number | undefined;
  const freshnessArg = args.find((a) => a.startsWith('--freshness-days=') || a.startsWith('--max-freshness='));
  if (freshnessArg) {
    const val = parseInt(freshnessArg.split('=')[1], 10);
    if (!isNaN(val) && val >= 0) {
      maxFreshnessDays = val;
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

  if (isStorageTest) {
    overrides.storageTest = true;
    overrides.dryRun = true;
    overrides.allowPublish = false;
    overrides.allowCommit = false;
    overrides.allowPush = false;
    if (!isRouter) {
      overrides.providerMode = 'fixture';
    }
    overrides.imageProviderMode = 'fixture';
    if (maxOpportunities === undefined) {
      overrides.maxOpportunities = 1;
    }
  } else {
    if (isLivePublish) {
      overrides.allowPublish = true;
      overrides.dryRun = false;
    }
    if (isCommit) {
      overrides.allowCommit = true;
    }
    if (isPush) {
      overrides.allowPush = true;
    }
    if (isExplicitDryRun) {
      overrides.dryRun = true;
      overrides.allowPublish = false;
      overrides.allowCommit = false;
      overrides.allowPush = false;
    }
    if (isRouter) {
      overrides.providerMode = 'router';
    } else if (isFixture) {
      overrides.providerMode = 'fixture';
    }
  }

  if (maxOpportunities !== undefined) {
    overrides.maxOpportunities = maxOpportunities;
  }
  if (maxFreshnessDays !== undefined) {
    overrides.maxFreshnessDays = maxFreshnessDays;
  }
  if (minScore !== undefined) {
    overrides.minScoreThreshold = minScore;
  }

  const config = loadSocialConfig(overrides);
  const normalizedSource = normalizeSourceProject(source);

  if (!isJson) {
    console.log('====================================================');
    console.log(
      isStorageTest
        ? ' LifeMode Social Storage Test (Controlled R2 Path)'
        : normalizedSource !== 'lifemode'
          ? ` LifeMode Cross-Project Social Automation [${normalizedSource.toUpperCase()}]`
          : ' LifeMode Social Media Automation V1                '
    );
    console.log('====================================================\n');
    if (isStorageTest) {
      console.log('* Mode:            CONTROLLED STORAGE TEST (Real R2, Zero Publishing)');
      console.log('* Storage Provider: REAL (Cloudflare R2 Bucket lifemode-assets)');
      console.log('* Content Provider: Deterministic Fixture (Zero AI Token Cost)');
      console.log('* Image Provider:   Deterministic Buffer (Zero Image API Cost)');
      console.log('* External Publish: STRICTLY DISABLED (Bypassed / Skipped)');
      console.log('* Git Commit/Push:  STRICTLY DISABLED (Skipped)');
    } else {
      console.log(`* Content Source:  ${normalizedSource}`);
      if (contentId) {
        console.log(`* Content ID:      ${contentId}`);
      }
      console.log(`* Dry-Run:         ${config.dryRun ? 'YES (Safe Mode - No External API Calls)' : 'NO (Live Execution)'}`);
      console.log(`* Publish Allowed: ${config.allowPublish ? 'YES' : 'NO'}`);
      console.log(`* Target Threads:  @lifemodehq (${config.credentials.threads.userId}) [${config.credentials.threads.configured ? 'Configured' : 'NOT_CONFIGURED'}]`);
    }
    console.log('----------------------------------------------------\n');
  }

  // Cross-Project Execution Path (Dreamly AI, AI Zodiac, GetAISet)
  if (normalizedSource !== 'lifemode') {
    const historyRepo = new FilesystemSocialHistoryRepository(config.storageDir);
    const item = resolveCrossProjectItem(normalizedSource, contentId);

    console.log(`Executing cross-project publication for "${item.title}" (${item.contentType})...`);
    const publishResult = await publishCrossProjectToThreads(item, {
      config,
      historyRepository: historyRepo,
      dryRun: config.dryRun || !config.allowPublish,
    });

    const isSuccess = publishResult.overallStatus === 'COMPLETED' || publishResult.overallStatus === 'DRY_RUN' || publishResult.overallStatus === 'SKIPPED';
    let pushedToRemote = false;

    // Persist to git if enabled
    if (config.allowCommit && !config.dryRun && publishResult.overallStatus === 'COMPLETED') {
      try {
        const gitCli = new GitCli();
        const repoRoot = path.resolve(process.cwd());
        const isRepo = await gitCli.isGitRepo(repoRoot);
        if (isRepo) {
          const historyRelPath = gitCli.normalizeGitPath(
            path.relative(repoRoot, path.resolve(process.cwd(), config.storageDir, 'history.json'))
          );
          const currentStatus = await gitCli.getRepoStatus(repoRoot, historyRelPath);
          if (
            currentStatus.modifiedFiles.includes(historyRelPath) ||
            currentStatus.untrackedFiles.includes(historyRelPath)
          ) {
            await gitCli.stageSingleFile(repoRoot, historyRelPath);
            await gitCli.createCommit(
              repoRoot,
              `chore(social): publish cross-project ${normalizedSource} to Threads [skip ci]`,
              {
                name: 'LifeMode Social Automation',
                email: 'social-automation@lifemode.local',
              }
            );
          }
          if (config.allowPush) {
            await gitCli.push(repoRoot, config.gitRemote, config.gitBranch);
            pushedToRemote = true;
          }
        }
      } catch (gitErr: any) {
        console.error('[Social Git Persistence Notice]', gitErr?.message || gitErr);
      }
    }

    if (isJson) {
      console.log(JSON.stringify(publishResult, null, 2));
    } else {
      console.log('\n====================================================');
      console.log(' Cross-Project Publication Result');
      console.log('====================================================');
      console.log(`* Source:          ${publishResult.sourceProject}`);
      console.log(`* Content ID:      ${publishResult.contentId}`);
      console.log(`* Content Type:    ${publishResult.contentType}`);
      console.log(`* Overall Status:  ${publishResult.overallStatus}`);
      console.log(`* Threads Status:  ${publishResult.platformResults.threads?.status}`);
      console.log(`* Threads Post ID: ${publishResult.platformResults.threads?.postId || 'N/A'}`);
      console.log(`* Threads Post URL:${publishResult.platformResults.threads?.postUrl || 'N/A'}`);
      console.log(`* Idempotency Key: ${publishResult.idempotencyKey}`);
      console.log(`* Git Push:        ${pushedToRemote ? 'COMPLETED' : 'SKIPPED'}`);
      if (publishResult.error) {
        console.log(`* Error:           ${publishResult.error}`);
      }
      console.log('====================================================\n');
    }

    if (!isSuccess) {
      process.exit(1);
    }
    return;
  }

  // Standard LifeMode Social Run
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
