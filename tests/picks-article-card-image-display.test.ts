import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LifeMode Picks article cards in /picks/ use object-fit: contain and centered display', async () => {
  const source = await readFile(new URL('../src/pages/picks/index.astro', import.meta.url), 'utf8');
  assert.match(source, /\.feature-card-img-wrap\s*\{[^}]*display:\s*flex;/s);
  assert.match(source, /\.feature-card-img-wrap\s*\{[^}]*align-items:\s*center;/s);
  assert.match(source, /\.feature-card-img-wrap\s*\{[^}]*justify-content:\s*center;/s);
  assert.match(source, /\.feature-card-img\s*\{[^}]*object-fit:\s*contain;/s);
  assert.match(source, /\.feature-card-img\s*\{[^}]*object-position:\s*center;/s);
});

test('LifeMode Picks article cards in /picks/articles/ use object-fit: contain and centered display', async () => {
  const source = await readFile(new URL('../src/pages/picks/articles/index.astro', import.meta.url), 'utf8');
  assert.match(source, /\.card-image-wrapper\s*\{[^}]*display:\s*flex;/s);
  assert.match(source, /\.card-image-wrapper\s*\{[^}]*align-items:\s*center;/s);
  assert.match(source, /\.card-image-wrapper\s*\{[^}]*justify-content:\s*center;/s);
  assert.match(source, /\.card-image\s*\{[^}]*object-fit:\s*contain;/s);
  assert.match(source, /\.card-image\s*\{[^}]*object-position:\s*center;/s);
});

test('LifeMode Picks article cards in /picks/category/[category] use object-fit: contain and centered display', async () => {
  const source = await readFile(new URL('../src/pages/picks/category/[category].astro', import.meta.url), 'utf8');
  assert.match(source, /\.article-image-box\s*\{[^}]*display:\s*flex;/s);
  assert.match(source, /\.article-image-box\s*\{[^}]*align-items:\s*center;/s);
  assert.match(source, /\.article-image-box\s*\{[^}]*justify-content:\s*center;/s);
  assert.match(source, /\.article-img\s*\{[^}]*object-fit:\s*contain;/s);
  assert.match(source, /\.article-img\s*\{[^}]*object-position:\s*center;/s);
});

test('LifeMode Picks article cards on homepage use object-fit: contain and centered display', async () => {
  const source = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.match(source, /\.picks-card-image-wrap\s*\{[^}]*display:\s*flex;/s);
  assert.match(source, /\.picks-card-image-wrap\s*\{[^}]*align-items:\s*center;/s);
  assert.match(source, /\.picks-card-image-wrap\s*\{[^}]*justify-content:\s*center;/s);
  assert.match(source, /\.picks-card-img\s*\{[^}]*object-fit:\s*contain;/s);
  assert.match(source, /\.picks-card-img\s*\{[^}]*object-position:\s*center;/s);
});
