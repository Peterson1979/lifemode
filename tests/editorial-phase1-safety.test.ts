import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { loadScheduledAutomationConfig } from '../src/lib/editorial/automation/config.ts';
import { loadEditorialImageConfig } from '../src/lib/editorial/images/config.ts';

const root = process.cwd();

test('Phase 1 disables scheduled normal editorial publication', () => {
  const workflow = fs.readFileSync(`${root}/.github/workflows/editorial-automation.yml`, 'utf8');
  const runner = fs.readFileSync(`${root}/scripts/run-scheduled-automation.ts`, 'utf8');

  assert.match(workflow, /LIFEMODE_AUTOMATION_ENABLED:\s*"false"/);
  assert.match(workflow, /LIFEMODE_AUTOMATION_COMMIT:\s*"false"/);
  assert.match(workflow, /LIFEMODE_AUTOMATION_PUSH:\s*"false"/);
  assert.doesNotMatch(runner, /enabled:\s*true\s*,\s*\/\/ CLI invocation explicitly enables execution/);
  assert.equal(loadScheduledAutomationConfig().enabled, false);
  assert.equal(loadScheduledAutomationConfig().allowCommit, false);
  assert.equal(loadScheduledAutomationConfig().allowPush, false);
});

test('Phase 1 disables automatic editorial image generation', () => {
  const workflow = fs.readFileSync(`${root}/.github/workflows/editorial-automation.yml`, 'utf8');

  assert.match(workflow, /LIFEMODE_IMAGE_ENABLED:\s*"false"/);
  assert.equal(loadEditorialImageConfig().enabled, false);
});

test('social automation remains separately enabled and preserves protected site areas', () => {
  const socialWorkflow = fs.readFileSync(`${root}/.github/workflows/social-automation.yml`, 'utf8');

  assert.match(socialWorkflow, /LIFEMODE_SOCIAL_ENABLED:\s*"true"/);
  assert.match(socialWorkflow, /run-social-automation\.ts/);
  assert.match(fs.readFileSync(`${root}/src/pages/life-hacks/index.astro`, 'utf8'), /Video|video/i);
  assert.ok(fs.existsSync(`${root}/src/content/tools`));
  assert.ok(fs.existsSync(`${root}/src/pages/daily-ideas.astro`) || fs.existsSync(`${root}/src/pages/daily-ideas/index.astro`));
});
