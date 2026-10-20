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
  assert.equal(isApprovalAuthorizationValid('Bearer expected-token', 'expected-token'), true);
  assert.equal(isApprovalAuthorizationValid('Bearer wrong-token', 'expected-token'), false);
});

test('editorial approval dashboard renders the stored Markdown body and exact fingerprint', async () => {
  const source = await readFile(new URL('../scripts/editorial-approval-dashboard.ts', import.meta.url), 'utf8');
  assert.match(source, /renderMarkdownToHtml/);
  assert.match(source, /articleHtml/);
  assert.match(source, /Full article preview/);
  assert.match(source, /CONTENT HASH/);
  assert.match(source, /details open/);
});
