import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Daily Ideas dashboard client script preserves apostrophes and handles load failures', async () => {
  const source = await readFile(new URL('../scripts/daily-ideas-store-dashboard.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('Why it&#39;s worth it'), true);
  assert.equal(source.includes("Why it\\\\'s worth it"), false);
  assert.match(source, /api\('\/api\/offers'/);
  assert.equal(source.includes("'Authorization':'Bearer '+token"), true);
  assert.equal(source.includes('Destination URL'), true);
  assert.equal(source.includes('Amazon affiliate URL'), false);
  assert.equal(source.includes('function isHttpUrl(value)'), true);
  assert.match(source, /Enter a valid absolute HTTP or HTTPS destination URL/);
  assert.equal(source.includes('extractAsin'), false);
  assert.equal(source.includes("Destination URL:</b> <a href=\"'+esc(o.affiliateUrl)+'\" target=\"_blank\" rel=\"noopener noreferrer\">'+esc(o.affiliateUrl)+'</a>"), true);
  assert.equal(source.includes('function renderPrivatePreview(button)'), true);
  assert.equal(source.includes("document.addEventListener('click'"), true);
  assert.equal(source.includes('event.stopImmediatePropagation()'), true);
  assert.equal(source.includes('data-preview-close'), true);
  assert.equal(source.includes('Private draft preview'), true);
  assert.equal(source.includes("data-preview=\"'+esc(o.id)+'\""), true);
  assert.match(source, /Array\.isArray\(data\.offers\)/);
  assert.match(source, /Could not load Daily Ideas offers/);
});
