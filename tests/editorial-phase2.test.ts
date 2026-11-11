import test from 'node:test';
import assert from 'node:assert/strict';
import { listPublishedTools, getPublishedTool, formatToolMarkdown } from '../src/lib/editorial/cms/tools.ts';
import { listPublishedChecklists, getPublishedChecklist, formatChecklistMarkdown, renderChecklistStructuredPreview } from '../src/lib/editorial/cms/checklists.ts';
import { listDrafts, getDraft, saveDraft, deleteDraft } from '../src/lib/editorial/cms/drafts.ts';
import { listMediaAssets, uploadMediaAsset } from '../src/lib/editorial/cms/media.ts';
import {
  validateToolData,
  publishTool,
  validateChecklistData,
  publishChecklist,
  validateGuideData,
} from '../src/lib/editorial/cms/publisher.ts';
import { listPublishedGuides } from '../src/lib/editorial/cms/guides.ts';
import type { ToolData, ChecklistData } from '../src/lib/editorial/cms/types.ts';

test('Tools CMS: loads all 8 existing active tools from content/tools', async () => {
  const tools = await listPublishedTools();
  assert.equal(tools.length, 8, `Expected exactly 8 published tools, found ${tools.length}`);

  const expectedSlugs = [
    'cookware-material-finder',
    'fabric-care-washing-advisor',
    'food-storage-calculator',
    'laundry-stain-solver',
    'protein-intake-calculator',
    'seasonal-maintenance-planner',
    'small-space-storage-planner',
    'zone-2-heart-rate-calculator',
  ];

  for (const slug of expectedSlugs) {
    const found = tools.find((t) => t.slug === slug);
    assert.ok(found, `Tool slug "${slug}" must be present in published list`);
  }
});

test('Tools CMS: loads tool detail and validates against exact Astro schema', async () => {
  const tool = await getPublishedTool('cookware-material-finder');
  assert.ok(tool, 'Cookware tool must be loaded');
  assert.equal(tool.slug, 'cookware-material-finder');
  assert.equal(tool.category, 'food-kitchen');
  assert.equal(tool.toolType, 'cookware-selector');
  assert.ok(tool.summary.length > 20);
  assert.ok(tool.content.length > 50);

  const validation = validateToolData(tool);
  assert.equal(validation.isValid, true, `Validation failed: ${validation.errors.join(', ')}`);
});

test('Tools CMS: formats markdown with frontmatter and dry-run publish works', async () => {
  const sampleTool: ToolData = {
    title: 'Precision Coffee Extraction Ratio Calculator',
    slug: 'coffee-extraction-ratio-calculator',
    category: 'food-kitchen',
    toolType: 'cookware-selector',
    summary: 'Calculate optimal water-to-coffee brew ratios, TDS targets, and grind adjustments for immersion and pour-over methods.',
    instructions: 'Select your brew method, enter dry coffee dose in grams, and select your target strength profile.',
    badge: 'Interactive Ratio Calculator',
    relatedGuides: ['how-to-cook-with-stainless-steel-without-sticking'],
    content: '## Coffee Extraction Science\n\nOptimal solubles extraction lies between 18% and 22% according to SCA standards.',
  };

  const md = formatToolMarkdown(sampleTool);
  assert.match(md, /title: "?Precision Coffee Extraction Ratio Calculator"?/);
  assert.match(md, /category: "?food-kitchen"?/);
  assert.match(md, /toolType: "?cookware-selector"?/);
  assert.match(md, /## Coffee Extraction Science/);

  const dryResult = await publishTool(sampleTool, { dryRun: true });
  assert.equal(dryResult.status, 'success');
  assert.match(dryResult.message, /\[DRY RUN\]/);
  assert.equal(dryResult.route, '/tools/coffee-extraction-ratio-calculator/');
  const fs = await import('node:fs/promises');
  await fs.unlink(dryResult.filePath).catch(() => {});
});

test('Tools CMS: draft lifecycle (save, reopen, edit, delete)', async () => {
  const draft = await saveDraft({
    contentType: 'tool',
    title: 'Temporary Tool Draft Test',
    category: 'smart-home',
    toolType: 'maintenance-planner',
    summary: 'A temporary tool draft created during Phase 2 automated test.',
    content: '## Draft Content\nTesting tool draft storage.',
  });

  assert.ok(draft.id);
  assert.equal(draft.contentType, 'tool');
  assert.equal(draft.slug, 'temporary-tool-draft-test');

  const fetched = await getDraft(draft.id);
  assert.ok(fetched);
  assert.equal(fetched.contentType, 'tool');
  assert.equal(fetched.toolType, 'maintenance-planner');

  const deleted = await deleteDraft(draft.id);
  assert.equal(deleted, true);

  const afterDelete = await getDraft(draft.id);
  assert.equal(afterDelete, null);
});

test('Checklists CMS: loads all 4 existing active checklists from content/checklists', async () => {
  const checklists = await listPublishedChecklists();
  assert.equal(checklists.length, 4, `Expected exactly 4 published checklists, found ${checklists.length}`);

  const expectedSlugs = [
    'kitchen-deep-clean-checklist',
    'laundry-care-cheat-sheet',
    'master-seasonal-home-checklist',
    'pantry-organization-cheat-sheet',
  ];

  for (const slug of expectedSlugs) {
    const found = checklists.find((c) => c.slug === slug);
    assert.ok(found, `Checklist slug "${slug}" must be present in published list`);
  }
});

test('Checklists CMS: loads checklist detail with sections & tasks and validates against schema', async () => {
  const checklist = await getPublishedChecklist('kitchen-deep-clean-checklist');
  assert.ok(checklist, 'Kitchen checklist must be loaded');
  assert.equal(checklist.slug, 'kitchen-deep-clean-checklist');
  assert.equal(checklist.category, 'cleaning-laundry');
  assert.ok(checklist.sections.length >= 3, 'Must have at least 3 sections');

  const firstSec = checklist.sections[0];
  assert.ok(firstSec.title);
  assert.ok(firstSec.items.length >= 3);
  assert.ok(firstSec.items[0].id);
  assert.ok(firstSec.items[0].text);

  const validation = validateChecklistData(checklist);
  assert.equal(validation.isValid, true, `Validation failed: ${validation.errors.join(', ')}`);
});

test('Checklists CMS: formats markdown with nested sections and dry-run publish works', async () => {
  const sampleChecklist: ChecklistData = {
    title: 'Spring Deep Cleaning Protocol Checklist',
    slug: 'spring-deep-cleaning-protocol-checklist',
    category: 'cleaning-laundry',
    summary: 'Comprehensive seasonal spring cleaning protocol covering windows, carpets, upholstery, and air handling filters.',
    estimatedTime: '4 hours',
    printSubtitle: 'Printable Spring Cleaning Framework',
    sections: [
      {
        title: 'Windows & Glazing',
        items: [
          { id: 'w-1', text: 'Wash window glass inside and outside with squeegee', note: 'Use dilute dish soap rinse', frequency: 'Seasonal' },
          { id: 'w-2', text: 'Vacuum and wipe window tracks and wipe window screens', frequency: 'Seasonal' },
        ],
      },
    ],
    content: '## Spring Cleaning Methodology\n\nAlways wipe frames before washing glazing to prevent muddy water streaks.',
  };

  const md = formatChecklistMarkdown(sampleChecklist);
  assert.match(md, /title: "?Spring Deep Cleaning Protocol Checklist"?/);
  assert.match(md, /sections:/);
  assert.match(md, /title: "?Windows & Glazing"?/);
  assert.match(md, /id: "?w-1"?/);
  assert.match(md, /## Spring Cleaning Methodology/);

  const dryResult = await publishChecklist(sampleChecklist, { dryRun: true });
  assert.equal(dryResult.status, 'success');
  assert.match(dryResult.message, /\[DRY RUN\]/);
  assert.equal(dryResult.route, '/checklists/spring-deep-cleaning-protocol-checklist/');
  const fs = await import('node:fs/promises');
  await fs.unlink(dryResult.filePath).catch(() => {});
});

test('Checklists CMS: structured preview generator mirrors interactive component', () => {
  const sampleChecklist: ChecklistData = {
    title: 'Preview Verification Checklist',
    slug: 'preview-verify',
    category: 'home-maintenance',
    summary: 'A short summary for testing preview markup generation.',
    estimatedTime: '45 mins',
    sections: [
      {
        title: 'Roof & Gutters',
        items: [
          { id: 'rg-1', text: 'Clear pine needles and debris from gutters', note: 'Wear heavy leather gloves', frequency: 'Annual' },
        ],
      },
    ],
    content: '## Safety First\n\nEnsure ladder is pitched at a 4-to-1 ratio against the wall.',
  };

  const html = renderChecklistStructuredPreview(sampleChecklist);
  assert.match(html, /Preview Verification Checklist/);
  assert.match(html, /Section 1: Roof &amp; Gutters/);
  assert.match(html, /Clear pine needles and debris from gutters/);
  assert.match(html, /Wear heavy leather gloves/);
  assert.match(html, /Annual/);
  assert.match(html, /45 mins/);
  assert.match(html, /Ensure ladder is pitched at a 4-to-1 ratio/);
});

test('Checklists CMS: draft lifecycle (save, reopen, edit, delete)', async () => {
  const draft = await saveDraft({
    contentType: 'checklist',
    title: 'Temporary Checklist Draft Test',
    category: 'home-organization',
    summary: 'A temporary checklist draft created during Phase 2 automated test.',
    sections: [
      {
        title: 'Closet Organization',
        items: [{ id: 'c-1', text: 'Group clothes by category', note: 'Sort by color', frequency: 'Quarterly' }],
      },
    ],
    content: '## Closet Advice\nUse matching slim velvet hangers.',
  });

  assert.ok(draft.id);
  assert.equal(draft.contentType, 'checklist');
  assert.equal(draft.slug, 'temporary-checklist-draft-test');
  assert.equal(draft.sections?.length, 1);

  const fetched = await getDraft(draft.id);
  assert.ok(fetched);
  assert.equal(fetched.contentType, 'checklist');
  assert.equal(fetched.sections?.[0].items[0].text, 'Group clothes by category');

  const deleted = await deleteDraft(draft.id);
  assert.equal(deleted, true);

  const afterDelete = await getDraft(draft.id);
  assert.equal(afterDelete, null);
});

test('Media Library: accepts PDF attachments for downloadable checklists', async () => {
  // Minimal valid PDF binary (base64)
  const samplePdfBase64 = 'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDEwOCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDQKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjE2NwolaU9GCg==';

  const asset = await uploadMediaAsset({
    fileName: 'test-printable-checklist.pdf',
    mimeType: 'application/pdf',
    base64Data: samplePdfBase64,
  });

  assert.ok(asset.id);
  assert.equal(asset.mimeType, 'application/pdf');
  assert.match(asset.fileName, /test-printable-checklist\.pdf/);
  assert.match(asset.url, /\.pdf$/);
});

test('Guides module integrity: all 19 guides and guide validation remain untouched', async () => {
  const guides = await listPublishedGuides();
  assert.equal(guides.length, 19, `Expected 19 published guides, found ${guides.length}`);

  const validGuide: any = {
    title: 'Valid Guide Title Sample',
    slug: 'valid-guide-title-sample',
    category: 'home-maintenance',
    description: 'A valid description of sufficient length for test.',
    content: 'A'.repeat(80),
  };
  const val = validateGuideData(validGuide);
  assert.equal(val.isValid, true);
});

test('Server API Integration: Tools, Checklists, Overview, and Dry-Run Publishing Endpoints', async () => {
  const { spawn } = await import('node:child_process');
  const { readFile, unlink } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const http = await import('node:http');

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
          res.on('data', chunk => body += chunk);
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

  const port = 4337;
  const urlFile = join(process.cwd(), 'logs', 'test-phase2-server.url');
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
        if (m) { token = m[1]; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(token, 'Server must emit a valid token');

    // 1. Overview counts
    const overview = await makeReq(port, '/api/overview', 'GET', null, token);
    assert.equal(overview.status, 200);
    assert.equal(overview.body.toolsCount, 8);
    assert.equal(overview.body.checklistsCount, 4);
    assert.equal(overview.body.guidesCount, 19);
    assert.equal(overview.body.publishedCount, 19 + 8 + 4 + (overview.body.lifeHacksCount || 0));

    // 2. Tools list & detail
    const tools = await makeReq(port, '/api/tools', 'GET', null, token);
    assert.equal(tools.status, 200);
    assert.equal(tools.body.length, 8);

    const toolDetail = await makeReq(port, '/api/tools/cookware-material-finder', 'GET', null, token);
    assert.equal(toolDetail.status, 200);
    assert.equal(toolDetail.body.toolType, 'cookware-selector');

    // 3. Checklists list & detail
    const checklists = await makeReq(port, '/api/checklists', 'GET', null, token);
    assert.equal(checklists.status, 200);
    assert.equal(checklists.body.length, 4);

    const checklistDetail = await makeReq(port, '/api/checklists/kitchen-deep-clean-checklist', 'GET', null, token);
    assert.equal(checklistDetail.status, 200);
    assert.ok(checklistDetail.body.sections.length >= 3);

    // 4. Checklist Structured Preview
    const prevRes = await makeReq(port, '/api/preview/checklist', 'POST', checklistDetail.body, token);
    assert.equal(prevRes.status, 200);
    assert.match(prevRes.body.html, /Appliance Deep Care/);
    assert.match(prevRes.body.html, /checklist-preview-wrapper/);

    // 5. Tool Draft Save & Delete
    const toolDraft = await makeReq(port, '/api/drafts', 'POST', {
      contentType: 'tool',
      title: 'Server Test Tool Draft',
      category: 'food-kitchen',
      toolType: 'food-storage',
      summary: 'Tool draft created via server test suite.',
      content: '## Instructions\nTest guide content.',
    }, token);
    assert.equal(toolDraft.status, 200);
    assert.equal(toolDraft.body.contentType, 'tool');

    const delToolDraft = await makeReq(port, `/api/drafts/${encodeURIComponent(toolDraft.body.id)}`, 'DELETE', null, token);
    assert.equal(delToolDraft.status, 200);

    // 6. Checklist Draft Save & Delete
    const checkDraft = await makeReq(port, '/api/drafts', 'POST', {
      contentType: 'checklist',
      title: 'Server Test Checklist Draft',
      category: 'cleaning-laundry',
      summary: 'Checklist draft created via server test suite.',
      sections: [{ title: 'Sec 1', items: [{ id: '1', text: 'Task 1' }] }],
      content: '## Checklist Guidelines\nBest practice instructions.',
    }, token);
    assert.equal(checkDraft.status, 200);
    assert.equal(checkDraft.body.contentType, 'checklist');

    const delCheckDraft = await makeReq(port, `/api/drafts/${encodeURIComponent(checkDraft.body.id)}`, 'DELETE', null, token);
    assert.equal(delCheckDraft.status, 200);

    // 7. Publishing Dry-Run for Tool
    const toolPub = await makeReq(port, '/api/publish', 'POST', {
      contentType: 'tool',
      tool: {
        title: 'Valid Coffee Scale Tool',
        slug: 'valid-coffee-scale-tool',
        category: 'food-kitchen',
        toolType: 'cookware-selector',
        summary: 'A complete precision coffee scale finder tool summary.',
        content: '## Guide Body\nAt least twenty characters of instructions.',
      },
      dryRun: true,
    }, token);
    assert.equal(toolPub.status, 200);
    assert.match(toolPub.body.message, /\[DRY RUN\]/);

    // 8. Publishing Dry-Run for Checklist
    const checkPub = await makeReq(port, '/api/publish', 'POST', {
      contentType: 'checklist',
      checklist: {
        title: 'Valid Bathroom Deep Clean Checklist',
        slug: 'valid-bathroom-deep-clean-checklist',
        category: 'cleaning-laundry',
        summary: 'A complete bathroom sanitation checklist summary.',
        sections: [{ title: 'Fixtures', items: [{ id: 'b-1', text: 'Scrub tiles' }] }],
        content: '## Bathroom Guidelines\nAt least twenty characters of instructions.',
      },
      dryRun: true,
    }, token);
    assert.equal(checkPub.status, 200);
    assert.match(checkPub.body.message, /\[DRY RUN\]/);

    const fs = await import('node:fs/promises');
    await fs.unlink(toolPub.body.filePath).catch(() => {});
    await fs.unlink(checkPub.body.filePath).catch(() => {});
  } finally {
    child.kill();
    await unlink(urlFile).catch(() => {});
  }
});

