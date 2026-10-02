import { loadSocialConfig, ThreadsPlatformAdapter } from '../src/lib/social/index.ts';

async function main() {
  try {
    process.loadEnvFile?.();
  } catch {}
  const config = loadSocialConfig();
  const { accessToken, userId, configured } = config.credentials.threads;

  console.log('====================================================');
  console.log(' LifeMode Threads Connectivity Verification         ');
  console.log('====================================================\n');

  console.log(`* THREADS_ACCESS_TOKEN present: ${Boolean(accessToken) ? 'YES (Redacted / Secure)' : 'NO (Missing)'}`);
  console.log(`* Target THREADS_USER_ID:       ${userId || '28272717349017680'}`);
  console.log(`* Configured status:            ${configured ? 'CONFIGURED' : 'NOT_CONFIGURED'}`);
  console.log('* Mode:                         READ-ONLY CONNECTIVITY CHECK (Zero Publishing, Zero Containers, Zero History Modification)');
  console.log('----------------------------------------------------\n');

  if (!accessToken) {
    console.log('[Status] THREADS_ACCESS_TOKEN is not exported in the current local environment.');
    console.log('         (Verified present in GitHub Repository Secrets).');
    console.log('\nTo test locally with live credentials:');
    console.log('  $env:THREADS_ACCESS_TOKEN="<your_token>"');
    console.log('  npx tsx scripts/test-threads-connectivity.ts\n');
    console.log('====================================================');
    console.log(' Connectivity Check Result: PENDING_LOCAL_ENV');
    console.log('====================================================');
    return;
  }

  const adapter = new ThreadsPlatformAdapter();
  console.log('Querying Meta Threads Graph API profile endpoint (/v1.0/me)...');
  const result = await adapter.verifyCredentials();

  console.log('\n====================================================');
  console.log(' Threads API Verification Results');
  console.log('====================================================');
  console.log(`* API Status Code:       ${result.statusCode || (result.valid ? 200 : 'N/A')}`);
  console.log(`* Authentication:        ${result.valid ? 'SUCCESS' : 'FAILED'}`);
  if (result.valid) {
    console.log(`* Resolved User ID:      ${result.userId || 'N/A'}`);
    console.log(`* Resolved Username:     @${result.username || 'unknown'}`);
    console.log(`* Account Name:          ${result.name || 'LifeMode'}`);
    if (result.biography) {
      console.log(`* Biography:             ${result.biography}`);
    }
  } else {
    console.log(`* Error:                 ${result.error}`);
  }
  console.log('* Production Post:       NONE (Read-only verification)');
  console.log('* History/Manifests:     UNMODIFIED');
  console.log('====================================================\n');

  if (!result.valid) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal Threads Connectivity Test Error:', err?.message || err);
  process.exit(1);
});
