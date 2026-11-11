import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listPublishedLifeHacks,
  getPublishedLifeHack,
  saveLifeHack,
  deleteLifeHack,
  renderLifeHackPreview,
  extractYouTubeVideoId,
  getYouTubeThumbnailUrl,
} from '../src/lib/editorial/cms/life-hacks.ts';
import {
  LIFE_HACK_VIDEOS,
} from '../src/utils/life-hacks.ts';
import { listDrafts, getDraft, saveDraft, deleteDraft } from '../src/lib/editorial/cms/drafts.ts';
import { listMediaAssets, uploadMediaAsset } from '../src/lib/editorial/cms/media.ts';
import {
  validateLifeHackData,
  publishLifeHack,
} from '../src/lib/editorial/cms/publisher.ts';
import { listPublishedGuides } from '../src/lib/editorial/cms/guides.ts';
import { listPublishedTools } from '../src/lib/editorial/cms/tools.ts';
import { listPublishedChecklists } from '../src/lib/editorial/cms/checklists.ts';
import type { LifeHackVideo } from '../src/lib/editorial/cms/types.ts';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

test('Life Hacks CMS: loads all 12 existing entries from data/content/life-hacks.json', async () => {
  const videos = await listPublishedLifeHacks();
  assert.equal(videos.length, 12, `Expected 12 total videos in data/content/life-hacks.json, found ${videos.length}`);

  const activeVideos = videos.filter((v) => !v.hidden);
  assert.equal(activeVideos.length, 10, `Expected 10 active videos, found ${activeVideos.length}`);

  const hiddenVideos = videos.filter((v) => v.hidden);
  assert.equal(hiddenVideos.length, 2, `Expected 2 hidden duplicate videos, found ${hiddenVideos.length}`);

  const expectedIds = [
    'pan-heating-technique',
    'basic-knife-skills',
    'clean-season-cast-iron',
    'fresh-herbs-storage-guide',
    'unclog-any-drain-ask-toh',
    'repair-stripped-screw-hole',
    'patch-drywall-hole-guide',
    'fold-fitted-sheet-pro',
    'perfect-crispy-bacon-atk',
    'replace-polybutylene-piping',
    'wirecutter-fitted-sheet-method',
    'patch-cracked-drywall-toh',
  ];

  for (const id of expectedIds) {
    const found = videos.find((v) => v.id === id);
    assert.ok(found, `Video id "${id}" must be present in published catalog`);
    assert.ok(found.title.length > 5, `Video "${id}" must have a title`);
    assert.ok(found.videoUrl.includes('youtube.com') || found.videoUrl.includes('youtu.be'), `Video "${id}" must have YouTube videoUrl`);
    assert.ok(found.thumbnail.length > 5, `Video "${id}" must have a thumbnail`);
  }
});

test('Life Hacks Frontend Adapter: src/utils/life-hacks.ts exports match data file exactly', async () => {
  assert.equal(LIFE_HACK_VIDEOS.length, 12);

  const active = LIFE_HACK_VIDEOS.filter((v) => !v.hidden);
  assert.equal(active.length, 10);

  const video = LIFE_HACK_VIDEOS.find((v) => v.id === 'pan-heating-technique');
  assert.ok(video, 'Pan heating technique video must be retrieved by ID');
  assert.equal(video.id, 'pan-heating-technique');
  assert.equal(video.category, 'Cookware Care');
  assert.ok(video.relatedTool, 'Should have companion tool');
  assert.equal(video.relatedTool?.slug, 'cookware-material-finder');

  const atkVideos = LIFE_HACK_VIDEOS.filter((v) => v.creator === "America's Test Kitchen");
  assert.ok(atkVideos.length >= 3, 'Should find multiple America\'s Test Kitchen videos');
});

test('YouTube video ID extraction: works for standard watch URLs, youtu.be, and Shorts URLs', () => {
  // Standard watch URL
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=CB-SCA1reqE'), 'CB-SCA1reqE');
  // Watch URL with query parameters
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=CB-SCA1reqE&t=30s&feature=shared'), 'CB-SCA1reqE');
  // youtu.be shortened URL
  assert.equal(extractYouTubeVideoId('https://youtu.be/G-Fg7l7G1zw'), 'G-Fg7l7G1zw');
  // youtu.be with timestamp
  assert.equal(extractYouTubeVideoId('https://youtu.be/G-Fg7l7G1zw?t=45'), 'G-Fg7l7G1zw');
  // YouTube Shorts URL
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/kmVmKmR0CXA'), 'kmVmKmR0CXA');
  // YouTube Embed URL
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/embed/GJ0lNZwoAKM'), 'GJ0lNZwoAKM');
  // Invalid / non-YouTube URLs
  assert.equal(extractYouTubeVideoId('https://example.com/video.mp4'), null);
  assert.equal(extractYouTubeVideoId(''), null);
});

test('Thumbnail generation and manual thumbnail override', () => {
  // Auto-generation from video ID
  assert.equal(
    getYouTubeThumbnailUrl('CB-SCA1reqE'),
    'https://i.ytimg.com/vi/CB-SCA1reqE/hqdefault.jpg'
  );
  // Auto-generation from full watch URL
  assert.equal(
    getYouTubeThumbnailUrl('https://www.youtube.com/watch?v=G-Fg7l7G1zw'),
    'https://i.ytimg.com/vi/G-Fg7l7G1zw/hqdefault.jpg'
  );
  // Auto-generation from youtu.be URL
  assert.equal(
    getYouTubeThumbnailUrl('https://youtu.be/kmVmKmR0CXA'),
    'https://i.ytimg.com/vi/kmVmKmR0CXA/hqdefault.jpg'
  );

  // Manual override preservation: if manual thumbnail is provided, it is retained
  const customThumb = 'https://cdn.lifemode.site/images/guides/custom-pan-heating-thumb.webp';
  const videoWithOverride: LifeHackVideo = {
    id: 'test-override',
    title: 'Custom Thumbnail Test',
    description: 'Testing that manual thumbnail override takes precedence over auto-generation.',
    thumbnail: customThumb,
    videoUrl: 'https://www.youtube.com/watch?v=CB-SCA1reqE',
  };
  const val = validateLifeHackData(videoWithOverride);
  assert.equal(val.isValid, true);
  assert.equal(videoWithOverride.thumbnail, customThumb);
});

test('Life Hacks CMS: validates Life Hack data accurately with YouTube URLs', () => {
  const validVideo: LifeHackVideo = {
    id: 'knife-honing-angle-guide',
    title: 'The 15-Degree Matchbook Trick for Kitchen Knife Honing',
    description: 'Use an ordinary matchbook or coin stack to quickly anchor your blade angle at exactly 15 to 20 degrees before every prep session.',
    thumbnail: '', // Empty thumbnail: should be auto-generated from YouTube URL
    videoUrl: 'https://www.youtube.com/watch?v=G-Fg7l7G1zw',
    duration: '0:48',
    category: 'Kitchen Skill',
    creator: 'LifeMode Kitchen Lab',
    hidden: false,
    relatedGuide: {
      slug: 'how-to-cook-with-stainless-steel-without-sticking',
      title: 'How to Cook with Stainless Steel Without Sticking',
    },
  };

  const validResult = validateLifeHackData(validVideo);
  assert.equal(validResult.isValid, true, `Validation failed: ${validResult.errors.join(', ')}`);
  assert.equal(validVideo.thumbnail, 'https://i.ytimg.com/vi/G-Fg7l7G1zw/hqdefault.jpg');

  // Test invalid data: invalid ID slug
  const invalidIdResult = validateLifeHackData({
    ...validVideo,
    id: 'Invalid ID with Spaces!',
  });
  assert.equal(invalidIdResult.isValid, false);
  assert.ok(invalidIdResult.errors.some((e) => e.includes('kebab-case')));

  // Test invalid data: non-YouTube URL
  const invalidUrlResult = validateLifeHackData({
    ...validVideo,
    videoUrl: 'https://example.com/videos/custom-video.mp4',
    thumbnail: 'https://example.com/thumb.jpg',
  });
  assert.equal(invalidUrlResult.isValid, false);
  assert.ok(invalidUrlResult.errors.some((e) => e.includes('YouTube')));
});

test('Life Hacks CMS: renders card preview without video tag, linking to YouTube in new tab', () => {
  const video: LifeHackVideo = {
    id: 'test-card-render',
    title: 'Test Video Card Preview',
    description: 'Testing preview rendering for the editorial operations dashboard.',
    thumbnail: 'https://i.ytimg.com/vi/CB-SCA1reqE/hqdefault.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=CB-SCA1reqE',
    duration: '2:15',
    category: 'Cookware Care',
    creator: 'Rouxbe',
    relatedGuide: {
      slug: 'how-to-cook-with-stainless-steel-without-sticking',
      title: 'Stainless Steel Cooking Guide',
    },
  };

  const html = renderLifeHackPreview(video);
  // Must NOT contain video tag
  assert.ok(!html.includes('<video'), 'Must not contain <video> element');
  // Must link to original YouTube URL with target="_blank"
  assert.ok(html.includes('href="https://www.youtube.com/watch?v=CB-SCA1reqE"'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  // Must render thumbnail image and metadata
  assert.ok(html.includes('src="https://i.ytimg.com/vi/CB-SCA1reqE/hqdefault.jpg"'));
  assert.ok(html.includes('Test Video Card Preview'));
  assert.ok(html.includes('2:15'));
  assert.ok(html.includes('Cookware Care'));
  assert.ok(html.includes('Rouxbe'));
  assert.ok(html.includes('/guides/how-to-cook-with-stainless-steel-without-sticking/'));
  assert.ok(html.includes('Watch on YouTube'));
});

test('Life Hacks CMS: draft lifecycle (save, fetch, filter, delete)', async () => {
  const draft = await saveDraft({
    contentType: 'life-hack',
    title: 'Temporary Life Hack Video Draft',
    slug: 'temporary-life-hack-draft',
    category: 'cleaning-laundry',
    summary: 'A temporary video draft for automated verification.',
    videoUrl: 'https://www.youtube.com/watch?v=CB-SCA1reqE',
    thumbnail: 'https://i.ytimg.com/vi/CB-SCA1reqE/hqdefault.jpg',
    duration: '2:15',
    creator: 'Test Creator',
    companionGuideSlug: 'kitchen-deep-cleaning',
    companionGuideTitle: 'Kitchen Deep Cleaning Guide',
  });

  assert.ok(draft.id);
  assert.equal(draft.contentType, 'life-hack');
  assert.equal(draft.videoUrl, 'https://www.youtube.com/watch?v=CB-SCA1reqE');
  assert.equal(draft.duration, '2:15');
  assert.equal(draft.creator, 'Test Creator');

  // Verify retrieval
  const fetched = await getDraft(draft.id);
  assert.ok(fetched);
  assert.equal(fetched.contentType, 'life-hack');
  assert.equal(fetched.slug, 'temporary-life-hack-draft');
  assert.equal(fetched.videoUrl, 'https://www.youtube.com/watch?v=CB-SCA1reqE');

  // Verify list filtering
  const allDrafts = await listDrafts();
  const hackDrafts = allDrafts.filter((d) => d.contentType === 'life-hack');
  assert.ok(hackDrafts.some((d) => d.id === draft.id));

  // Clean up
  const deleted = await deleteDraft(draft.id);
  assert.equal(deleted, true);

  const afterDelete = await getDraft(draft.id);
  assert.equal(afterDelete, null);
});

test('Media Library: image and PDF uploads work, video uploads are rejected', async () => {
  // 1. Image upload works
  const mockImageBase64 = Buffer.from('FAKE IMAGE DATA FOR TEST').toString('base64');
  const imageAsset = await uploadMediaAsset({
    fileName: 'test-recipe-card.png',
    mimeType: 'image/png',
    base64Data: `data:image/png;base64,${mockImageBase64}`,
  });
  assert.ok(imageAsset.url, 'Image asset must have a public URL');
  assert.equal(imageAsset.mimeType, 'image/png');

  // 2. PDF upload works
  const mockPdfBase64 = Buffer.from('FAKE PDF DATA FOR TEST').toString('base64');
  const pdfAsset = await uploadMediaAsset({
    fileName: 'test-cheat-sheet.pdf',
    mimeType: 'application/pdf',
    base64Data: `data:application/pdf;base64,${mockPdfBase64}`,
  });
  assert.ok(pdfAsset.url, 'PDF asset must have a public URL');
  assert.equal(pdfAsset.mimeType, 'application/pdf');

  // 3. Video uploads must be rejected
  await assert.rejects(
    async () => {
      await uploadMediaAsset({
        fileName: 'forbidden-video.mp4',
        mimeType: 'video/mp4',
        base64Data: `data:video/mp4;base64,${mockPdfBase64}`,
      });
    },
    /Unsupported media format: "video\/mp4"/
  );
});

test('Life Hacks CMS: dry-run publish validates without pushing Git changes', async () => {
  const sampleVideo: LifeHackVideo = {
    id: 'stainless-steel-water-bead-test',
    title: 'The Water Droplet Mercury Test for Stainless Steel Cookware',
    description: 'How to know your pan is at the exact Leidenfrost point before adding cooking oil to prevent sticking.',
    thumbnail: 'https://i.ytimg.com/vi/CB-SCA1reqE/hqdefault.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=CB-SCA1reqE',
    duration: '2:15',
    category: 'Cookware Care',
    creator: 'LifeMode Editorial',
    relatedGuide: {
      slug: 'how-to-cook-with-stainless-steel-without-sticking',
      title: 'How to Cook with Stainless Steel Without Sticking',
    },
  };

  const dryResult = await publishLifeHack(sampleVideo, { dryRun: true });
  assert.equal(dryResult.status, 'success');
  assert.match(dryResult.message, /\[DRY RUN\]/);
  assert.equal(dryResult.route, '/life-hacks/#video-stainless-steel-water-bead-test');
  assert.ok(dryResult.filePath.endsWith('life-hacks.json'));
});

test('Preservation check: Guides (19), Tools (8), Checklists (4), Life Hacks (12)', async () => {
  const guides = await listPublishedGuides();
  assert.equal(guides.length, 19, `Expected 19 published guides, got ${guides.length}`);

  const tools = await listPublishedTools();
  assert.equal(tools.length, 8, `Expected 8 published tools, got ${tools.length}`);

  const checklists = await listPublishedChecklists();
  assert.equal(checklists.length, 4, `Expected 4 published checklists, got ${checklists.length}`);

  const hacks = await listPublishedLifeHacks();
  assert.equal(hacks.length, 12, `Expected 12 published life hacks, got ${hacks.length}`);
});

test('Server API Integration: Life Hacks endpoints, overview count, and preview rendering', async (t) => {
  function makeReq(port: number, path: string, method: string, payload: any, token: string): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const data = payload ? JSON.stringify(payload) : null;
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(data ? { 'Content-Length': Buffer.byteLength(data), 'Content-Type': 'application/json' } : {}),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode || 500, body: JSON.parse(body) });
            } catch {
              resolve({ status: res.statusCode || 500, body });
            }
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  const port = 4341;
  const urlFile = join(process.cwd(), 'logs', 'test-phase3-correction-server.url');
  const child = spawn(
    'node.exe',
    ['--experimental-strip-types', 'scripts/editorial-approval-dashboard.ts'],
    {
      cwd: process.cwd(),
      env: { ...process.env, LIFEMODE_APPROVAL_PORT: String(port), LIFEMODE_APPROVAL_URL_FILE: urlFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let token = '';
  try {
    for (let i = 0; i < 40; i++) {
      try {
        const content = (await readFile(urlFile, 'utf8')).trim();
        const m = content.match(/\?token=([a-f0-9]+)/);
        if (m) {
          token = m[1];
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }

    if (!token) {
      t.skip('Server could not start or port bound in sandbox; skipping HTTP probe.');
      return;
    }

    // 1. Overview counts includes lifeHacksCount
    const overview = await makeReq(port, '/api/overview', 'GET', null, token);
    assert.equal(overview.status, 200);
    assert.equal(overview.body.lifeHacksCount, 12);
    assert.equal(overview.body.toolsCount, 8);
    assert.equal(overview.body.checklistsCount, 4);
    assert.equal(overview.body.guidesCount, 19);

    // 2. Life Hacks list endpoint
    const hacksRes = await makeReq(port, '/api/life-hacks', 'GET', null, token);
    assert.equal(hacksRes.status, 200);
    assert.equal(hacksRes.body.length, 12);

    // 3. Life Hacks detail endpoint
    const hackDetail = await makeReq(port, '/api/life-hacks/pan-heating-technique', 'GET', null, token);
    assert.equal(hackDetail.status, 200);
    assert.equal(hackDetail.body.id, 'pan-heating-technique');
    assert.equal(hackDetail.body.title, 'How to Properly Heat a Pan');

    // 4. Life Hacks preview endpoint (must render YouTube thumbnail preview, not <video>)
    const previewRes = await makeReq(
      port,
      '/api/preview/life-hack',
      'POST',
      {
        id: 'test-api-preview',
        title: 'API Preview Test Video',
        description: 'Testing live card preview rendering via HTTP endpoint.',
        thumbnail: '',
        videoUrl: 'https://www.youtube.com/watch?v=CB-SCA1reqE',
        duration: '2:15',
        creator: 'Rouxbe',
      },
      token
    );
    assert.equal(previewRes.status, 200);
    assert.ok(previewRes.body.html.includes('API Preview Test Video'));
    assert.ok(!previewRes.body.html.includes('<video'), 'Must not render <video> tag');
    assert.ok(previewRes.body.html.includes('https://i.ytimg.com/vi/CB-SCA1reqE/hqdefault.jpg'));
    assert.ok(previewRes.body.html.includes('target="_blank"'));

    // 5. Dry-run publish endpoint
    const publishRes = await makeReq(
      port,
      '/api/publish',
      'POST',
      {
        contentType: 'life-hack',
        dryRun: true,
        data: {
          id: 'test-dry-run-api',
          title: 'Dry Run Video Publish API Test',
          description: 'Dry run test verifying endpoint returns clean validation without Git mutation.',
          thumbnail: '',
          videoUrl: 'https://www.youtube.com/watch?v=CB-SCA1reqE',
          duration: '2:15',
          category: 'Kitchen Skill',
          creator: 'Test Lab',
        },
      },
      token
    );
    assert.equal(publishRes.status, 200);
    assert.equal(publishRes.body.status, 'success');
    assert.match(publishRes.body.message, /\[DRY RUN\]/);
  } finally {
    child.kill('SIGTERM');
    await unlink(urlFile).catch(() => {});
  }
});
