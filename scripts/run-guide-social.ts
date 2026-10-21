import * as path from 'node:path';
import { runGuideSocialPipeline, loadSocialConfig } from '../src/lib/social/index.ts';
import { GitCli } from '../src/lib/editorial/git-publisher/git-cli.ts';

async function main() {
  try {
    process.loadEnvFile?.();
  } catch {}

  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const isLivePublish = args.includes('--publish') || args.includes('--live');
  const isExplicitDryRun = args.includes('--dry-run');
  const isCommit = args.includes('--commit');
  const isPush = args.includes('--push');

  // Safe defaults: dryRun: true, allowPublish: false, allowCommit: false, allowPush: false
  const overrides: any = {
    enabled: true,
  };

  if (isLivePublish && !isExplicitDryRun) {
    overrides.allowPublish = true;
    overrides.dryRun = false;
    overrides.allowCommit = isCommit;
    overrides.allowPush = isPush;
  } else {
    overrides.allowPublish = false;
    overrides.dryRun = true;
    overrides.allowCommit = false;
    overrides.allowPush = false;
  }

  const config = loadSocialConfig(overrides);

  if (!isJson) {
    console.log('====================================================');
    console.log(' LifeMode Guide Social Publishing Pipeline          ');
    console.log('====================================================\n');
    console.log(`* Dry-Run:         ${config.dryRun ? 'YES (Safe Mode - No External API Calls)' : 'NO (Live Execution)'}`);
    console.log(`* Publish Allowed: ${config.allowPublish ? 'YES' : 'NO'}`);
    console.log('----------------------------------------------------\n');
  }

  const result = await runGuideSocialPipeline({
    config,
    dryRun: config.dryRun,
    allowPublish: config.allowPublish,
  });

  let pushedToRemote = false;
  if (config.allowCommit && !config.dryRun && result.status === 'COMPLETED') {
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
            'chore(social): publish guide social [skip ci]',
            {
              name: 'LifeMode Guide Social Automation',
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
      console.error('[Guide Social Git Persistence Notice]', gitErr?.message || gitErr);
    }
  }

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.summary);
    if (config.allowCommit && !config.dryRun) {
      console.log(`* Git Push:        ${pushedToRemote ? 'COMPLETED' : 'SKIPPED'}`);
    }
    console.log('\n====================================================');
    console.log(` Guide Social Publishing Finished [${result.status}]`);
    console.log('====================================================\n');
  }

  if (result.status === 'FAILED') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal Guide Social Publishing Error:', err);
  process.exit(1);
});
