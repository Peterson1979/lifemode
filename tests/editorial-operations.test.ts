import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isApprovalAuthorizationValid } from '../src/lib/editorial/approval/auth.ts';

test('editorial operations dashboard remains loopback and human-gated', async () => {
  const source = await readFile(new URL('../scripts/editorial-approval-dashboard.ts', import.meta.url), 'utf8');
  assert.match(source, /const host = '127\.0\.0\.1'/);
  assert.match(source, /approveEditorialQueueItem/);
  assert.match(source, /requestEditorialRevision/);
  assert.match(source, /isApprovalAuthorizationValid/);
  assert.match(source, /getEditorialDailyPlan/);
  assert.doesNotMatch(source, /runScheduledEditorialAutomation/);
  assert.doesNotMatch(source, /git push|git commit/);
  assert.doesNotMatch(source, /Reviewer name|class="reviewer"|querySelector\('\.reviewer'\)/);
  assert.match(source, /feedback,version:item\.version/);
  assert.equal(isApprovalAuthorizationValid('Bearer expected-token', 'expected-token'), true);
  assert.equal(isApprovalAuthorizationValid('Bearer wrong-token', 'expected-token'), false);
});

test('cast iron approval remains an approval-queue record until publication', async () => {
  const queue = JSON.parse(await readFile(new URL('../data/editorial/approval-queue.json', import.meta.url), 'utf8'));
  const item = queue.find((entry: any) => entry.publishingRequest?.article?.title === 'How to clean and season a cast iron skillet using the oil polymerization protocol');
  assert.ok(item, 'cast iron queue record should exist');
  assert.equal(item.status, 'APPROVED');
  assert.equal(item.publishingRequest.article.slug, 'how-to-clean-and-season-cast-iron-skillet-oil-polymerization');
  assert.equal(item.approval?.contentVersion, item.version);
});

test('editorial approval dashboard renders the stored Markdown body and exact fingerprint', async () => {
  const source = await readFile(new URL('../scripts/editorial-approval-dashboard.ts', import.meta.url), 'utf8');
  assert.match(source, /renderMarkdownToHtml/);
  assert.match(source, /articleHtml/);
  assert.match(source, /Full article preview/);
  assert.match(source, /CONTENT HASH/);
  assert.match(source, /details open/);
});
