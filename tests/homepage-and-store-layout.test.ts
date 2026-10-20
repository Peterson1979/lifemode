import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CATEGORIES } from '../src/utils/categories.ts';

test('homepage exposes the adopted topic hubs without internal taxonomy labels', async () => {
  const source = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.ok(source.includes('...homepageCategories.map'), 'topic map must use the merged homepage categories');
  assert.equal(Object.keys(CATEGORIES).length, 5);
  for (const href of ['/life-hacks/', '/daily-ideas/']) {
    assert.ok(source.includes(`href: '${href}'`), `topic map must include ${href}`);
  }
  for (const internalLabel of ['Knowledge Taxonomy', 'Interactive Decision Support', 'Practical Reference Library']) {
    assert.equal(source.includes(internalLabel), false, `homepage must not expose ${internalLabel}`);
  }
  assert.ok(source.includes('href={topic.href}'), 'topic cards should be rendered from one compact map');
  assert.match(source, /!\['cleaning-laundry', 'storage-organization'\]\.includes\(category\.id\)/);
  assert.ok(source.includes('class="utility-nav-block"'));
  for (const href of ['/guides/', '/tools/', '/checklists/']) {
    assert.ok(source.includes(`href: '${href}'`), `utility navigation must include ${href}`);
  }
});

test('Daily Ideas disclosure is consolidated below the product grid and cards constrain images', async () => {
  const source = await readFile(new URL('../src/pages/daily-ideas/index.astro', import.meta.url), 'utf8');
  const grid = source.indexOf('class="store-grid"');
  const disclosure = source.indexOf('class="store-disclosure"');
  assert.ok(grid >= 0 && disclosure > grid);
  assert.equal((source.match(/class="affiliate-disclosure"/g) || []).length, 2);
  assert.match(source, /As an Amazon Associate I earn from qualifying purchases\./);
  assert.match(source, /aspect-ratio: 16 \/ 10/);
  assert.match(source, /object-fit: cover/);
  assert.match(source, /minmax\(min\(100%, 320px\), 1fr\)/);
});
