import {
  runMaintenanceBackfill,
  formatMaintenanceSummary,
  auditAndMigrateTitles,
  findEmptyTopics,
} from '../src/lib/editorial/maintenance/index.ts';
import { loadEditorialImageConfig } from '../src/lib/editorial/images/config.ts';
import {
  CloudflareWorkersAIImageProvider,
  CloudflareKVCostGuardStore,
  EditorialImageCostGuard,
} from '../src/lib/editorial/index.ts';
import { CloudflareR2SocialAssetStorageProvider } from '../src/lib/social/images/storage/r2.ts';
import { loadSocialConfig } from '../src/lib/social/config.ts';

async function main() {
  const args = process.argv.slice(2);

  const isLive = args.includes('--live');
  const isDryRun = args.includes('--dry-run') || !isLive;
  const isCommit = args.includes('--commit');
  const isRouter = args.includes('--router') || args.includes('--ai-router');
  const isFixture = args.includes('--fixture');
  const titlesOnly = args.includes('--titles-only');

  const providerEnv = process.env.LIFEMODE_AUTOMATION_PROVIDER || process.env.EDITORIAL_AUTOMATION_PROVIDER;
  const providerMode: 'fixture' | 'router' = isRouter
    ? 'router'
    : isFixture
    ? 'fixture'
    : providerEnv === 'router'
    ? 'router'
    : 'fixture';

  console.log('====================================================');
  console.log(' LifeMode One-Time Maintenance & Backfill Engine     ');
  console.log('====================================================\n');
  console.log(`* Execution Mode: ${isDryRun ? 'DRY-RUN (Safe, no changes applied)' : 'LIVE (Changes will be written)'}`);
  console.log(`* Provider:       ${providerMode.toUpperCase()}`);
  console.log(`* Git Commit:     ${isCommit ? 'ENABLED' : 'DISABLED'}`);
  console.log('----------------------------------------------------\n');

  if (titlesOnly) {
    console.log('[MAINTENANCE] Running title audit and migration only...\n');
    const titleReport = await auditAndMigrateTitles({ dryRun: isDryRun });
    console.log(`Total Scanned:    ${titleReport.totalScanned}`);
    console.log(`Formulaic Found:  ${titleReport.formulaicCount}`);
    console.log(`Titles Corrected: ${titleReport.correctedCount}`);
    for (const r of titleReport.results.filter((res) => res.isFormulaic)) {
      console.log(`  - [${r.pillar}] "${r.currentTitle}" -> "${r.proposedTitle}" (${r.updated ? 'UPDATED' : 'DRY RUN'})`);
    }
    return;
  }

  // Set up real providers if in live mode and configured
  const imageConfig = loadEditorialImageConfig();
  let imagePrimaryProvider;
  let imageStorageProvider;
  let costGuard;

  if (!isDryRun) {
    if (imageConfig.cloudflare.configured) {
      imagePrimaryProvider = new CloudflareWorkersAIImageProvider({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
        apiToken: process.env.CLOUDFLARE_AI_GATEWAY_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '',
        model: imageConfig.cloudflare.model,
      });
    }

    const socialConfig = loadSocialConfig();
    const r2PublicBaseUrl =
      process.env.R2_PUBLIC_BASE_URL ||
      process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN ||
      process.env.R2_PUBLIC_DOMAIN ||
      socialConfig.storageConfig.publicBaseUrl;

    imageStorageProvider = new CloudflareR2SocialAssetStorageProvider({
      accountId: process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || socialConfig.storageConfig.accountId,
      accessKeyId: process.env.R2_ACCESS_KEY_ID || socialConfig.storageConfig.accessKeyId,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || socialConfig.storageConfig.secretAccessKey,
      bucketName: process.env.R2_BUCKET_NAME || socialConfig.storageConfig.bucketName || 'lifemode-assets',
      publicBaseUrl: r2PublicBaseUrl,
    });

    const kvAccountId = process.env.CLOUDFLARE_KV_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const kvApiToken = process.env.CLOUDFLARE_KV_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
    const kvNamespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;

    if (kvAccountId && kvApiToken && kvNamespaceId) {
      const kvStore = new CloudflareKVCostGuardStore({
        accountId: kvAccountId,
        apiToken: kvApiToken,
        namespaceId: kvNamespaceId,
      });
      costGuard = new EditorialImageCostGuard({
        enabled: imageConfig.costGuard.enabled,
        dailyLimit: imageConfig.costGuard.dailyLimit,
        monthlyLimit: imageConfig.costGuard.monthlyLimit,
        store: kvStore,
      });
    }
  }

  const report = await runMaintenanceBackfill({
    dryRun: isDryRun,
    providerMode,
    allowCommit: isCommit,
    imageConfig,
    imagePrimaryProvider,
    imageStorageProvider,
    costGuard,
    logger: console.log,
  });

  console.log('\n' + report.summary);
  console.log('\n====================================================');
  console.log(` Maintenance Operation Finished [${isDryRun ? 'DRY-RUN' : 'LIVE'}]`);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('\nFatal Maintenance Error:', err);
  process.exit(1);
});
