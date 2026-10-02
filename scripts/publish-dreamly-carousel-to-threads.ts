import {
  loadSocialConfig,
  publishCrossProjectToThreads,
  getThreadsUserProfile,
  FilesystemSocialHistoryRepository,
  type CrossProjectSocialContent,
} from '../src/lib/social/index.ts';

async function main() {
  try {
    process.loadEnvFile?.();
  } catch {}

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  console.log('====================================================');
  console.log(' Dreamly AI -> LifeMode Threads Controlled Publisher');
  console.log('====================================================\n');

  const config = loadSocialConfig();
  const { accessToken, userId } = config.credentials.threads;
  const targetUserId = userId || '28272717349017680';

  console.log(`* Target Threads User ID:  ${targetUserId}`);
  console.log(`* THREADS_ACCESS_TOKEN:    ${accessToken ? 'PRESENT (Secure / Redacted)' : 'NOT_FOUND_IN_LOCAL_ENV'}`);
  console.log(`* Execution Mode:          ${isDryRun ? 'DRY_RUN (Offline Validation)' : 'LIVE_CONTROLLED_PUBLICATION'}`);
  console.log('----------------------------------------------------\n');

  if (!accessToken && !isDryRun) {
    console.error('❌ THREADS_ACCESS_TOKEN is not set in the current process environment.');
    console.error('   The token was securely registered in GitHub Repository Secrets.');
    console.error('\nTo run this controlled publication test locally:');
    console.error('   $env:THREADS_ACCESS_TOKEN="<your_lifemodehq_threads_token>"');
    console.error('   npx tsx scripts/publish-dreamly-carousel-to-threads.ts\n');
    process.exit(1);
  }

  // 1. Inspect existing production-ready Dreamly AI carousel manifest
  const dreamlyCarousel: CrossProjectSocialContent = {
    sourceProject: 'dreamly-ai',
    contentId: 'social-2026-10-02',
    contentType: 'carousel',
    title: 'Neurobiology of Dreaming',
    caption: 'Ever wonder why your mind paints such vivid pictures at night? Dive into the brain’s nightly rhythm and see how REM turns thoughts into dreams. 🌙✨\n\nExplore Dreamly AI → https://play.google.com/store/apps/details?id=com.oberon.dreamlyai',
    destinationUrl: 'https://play.google.com/store/apps/details?id=com.oberon.dreamlyai',
    hashtags: ['#DreamlyAI', '#SleepScience', '#Neurobiology', '#LucidDreams'],
    carouselItems: [
      { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-01.jpg', mediaType: 'image' },
      { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-02.jpg', mediaType: 'image' },
      { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-03.jpg', mediaType: 'image' },
      { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-04.jpg', mediaType: 'image' },
      { url: 'https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/10/02/slide-05.jpg', mediaType: 'image' },
    ],
  };

  console.log('--- Selected Existing Dreamly AI Carousel ---');
  console.log(`* Source Project:          ${dreamlyCarousel.sourceProject}`);
  console.log(`* Content ID:              ${dreamlyCarousel.contentId}`);
  console.log(`* Content Type:            ${dreamlyCarousel.contentType}`);
  console.log(`* Title:                   "${dreamlyCarousel.title}"`);
  console.log(`* Slide Count:             ${dreamlyCarousel.carouselItems?.length} images (1080x1350 JPEG)`);
  console.log('* Slide Asset URLs:');
  dreamlyCarousel.carouselItems?.forEach((item, idx) => {
    console.log(`    [Slide ${idx + 1}] ${item.url}`);
  });
  console.log('----------------------------------------------------\n');

  const historyRepo = new FilesystemSocialHistoryRepository('data/social');

  // 2. Check Idempotency before publication
  const alreadyPublished = await historyRepo.isPlatformPublished(
    dreamlyCarousel.contentId,
    'threads',
    'dreamly-ai'
  );

  console.log(`* Prior Threads publication in history: ${alreadyPublished ? 'YES (Already published)' : 'NO (Fresh)'}\n`);

  if (alreadyPublished && !isDryRun) {
    console.log('⚠️ Item is already recorded as published in history. Duplicate skipped.');
    return;
  }

  // 3. Verify Account Identity & Auth first (without publishing)
  if (!isDryRun && accessToken) {
    console.log('Verifying account authentication with Threads API...');
    const profile = await getThreadsUserProfile(accessToken, targetUserId);
    if (!profile.valid) {
      console.error(`❌ Authentication failed: ${profile.error}`);
      process.exit(1);
    }
    console.log(`✅ Authenticated account: @${profile.username} (ID: ${profile.userId})\n`);
  }

  // 4. Perform Exactly ONE Controlled Publication
  console.log(`Publishing Dreamly AI carousel to @lifemodehq (${isDryRun ? 'DRY RUN' : 'LIVE'})...`);
  const result = await publishCrossProjectToThreads(dreamlyCarousel, {
    historyRepository: historyRepo,
    dryRun: isDryRun,
  });

  console.log('\n====================================================');
  console.log(' Publication Execution Summary');
  console.log('====================================================');
  console.log(`* Overall Status:          ${result.overallStatus}`);
  console.log(`* Threads Status:          ${result.platformResults.threads?.status}`);
  console.log(`* Threads Post ID:         ${result.platformResults.threads?.postId || 'N/A'}`);
  console.log(`* Threads Post URL:        ${result.platformResults.threads?.postUrl || 'N/A'}`);
  console.log(`* Idempotency Key:         ${result.idempotencyKey}`);
  if (result.error) {
    console.log(`* Error:                   ${result.error}`);
  }
  console.log('====================================================\n');

  if (result.overallStatus === 'COMPLETED') {
    // 5. Verify Idempotency on immediate retry
    console.log('--- Testing Duplicate Prevention on Immediate Retry ---');
    const retryResult = await publishCrossProjectToThreads(dreamlyCarousel, {
      historyRepository: historyRepo,
      dryRun: isDryRun,
    });
    console.log(`* Retry Overall Status:    ${retryResult.overallStatus} (Expected: SKIPPED)`);
    console.log(`* Duplicate Post Created:  ${retryResult.overallStatus === 'SKIPPED' ? 'NO (Zero duplicate posts)' : 'YES'}`);
    console.log('----------------------------------------------------\n');
  }
}

main().catch((err) => {
  console.error('\nFatal Error in Dreamly AI Threads Publication:', err?.message || err);
  process.exit(1);
});
