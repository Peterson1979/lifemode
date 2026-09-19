import test from 'node:test';
import assert from 'node:assert/strict';

import { TopicDataCache } from '../src/lib/topic-data/cache/store.ts';
import { formatFreshnessLabel } from '../src/lib/topic-data/cache/policies.ts';
import type { TopicDataBlock } from '../src/lib/topic-data/types/core.ts';

const dummyBlock: TopicDataBlock<{ testVal: string }> = {
  id: 'test-block-01',
  pillar: 'now',
  domain: 'earthquakes',
  title: 'Earth Activity Test',
  status: 'available',
  data: { testVal: 'active-data' },
  source: {
    id: 'test-src',
    name: 'Test Source',
  },
  freshness: {
    status: 'fresh',
    fetchedAt: new Date(1773936000000).toISOString(),
    expiresAt: new Date(1773936600000).toISOString(),
    ttlSeconds: 600,
    ageSeconds: 0,
    label: 'Updated just now',
  },
};

test('1. TopicDataCache: Stores and retrieves fresh entry with cache hit', () => {
  const cache = new TopicDataCache();
  const baseTime = 1773936000000;
  const key = cache.makeKey('earthquakes', 'test-01');

  cache.set(key, dummyBlock, 600, baseTime);

  // Lookup 1 minute later -> should be a fresh hit
  const lookup = cache.get(key, baseTime + 60000);
  assert.equal(lookup.hit, true);
  assert.equal(lookup.isStale, false);
  assert.equal(lookup.isExpired, false);
  assert.ok(lookup.block);
  assert.equal(lookup.block.status, 'available');
  assert.equal(lookup.block.freshness.status, 'cached');
});

test('2. TopicDataCache: Classifies data past fresh TTL as stale but available within grace window', () => {
  const cache = new TopicDataCache();
  const baseTime = 1773936000000;
  const key = cache.makeKey('earthquakes', 'test-02');

  // Earthquakes: 10 min fresh (600s), 50 min grace (3000s) -> total 60 min (3600s)
  cache.set(key, dummyBlock, 600, baseTime);

  // Lookup 20 minutes later (past 10 min fresh, before 60 min total)
  const lookup = cache.get(key, baseTime + 20 * 60 * 1000);
  assert.equal(lookup.hit, true);
  assert.equal(lookup.isStale, true);
  assert.equal(lookup.isExpired, false);
  assert.ok(lookup.block);
  assert.equal(lookup.block.status, 'stale_available');
  assert.equal(lookup.block.freshness.status, 'stale');
  assert.ok(lookup.block.freshness.label.includes('data may be outdated') || lookup.block.freshness.label.includes('archived'));
});

test('3. TopicDataCache: Evicts and returns expired status past total grace window', () => {
  const cache = new TopicDataCache();
  const baseTime = 1773936000000;
  const key = cache.makeKey('earthquakes', 'test-03');

  cache.set(key, dummyBlock, 600, baseTime);

  // Lookup 90 minutes later (past total 60 min grace window)
  const lookup = cache.get(key, baseTime + 90 * 60 * 1000);
  assert.equal(lookup.hit, false);
  assert.equal(lookup.isExpired, true);
  assert.equal(lookup.block, null);
});

test('4. Anti-Fabrication Guarantee: Stale data is never marked fresh', () => {
  const cache = new TopicDataCache();
  const baseTime = 1773936000000;
  const key = cache.makeKey('earthquakes', 'test-04');

  cache.set(key, dummyBlock, 600, baseTime);

  const lookup = cache.get(key, baseTime + 15 * 60 * 1000); // 15 min later
  assert.ok(lookup.block);
  assert.notEqual(lookup.block.freshness.status, 'fresh');
  assert.equal(lookup.block.freshness.status, 'stale');
});

test('5. formatFreshnessLabel: Returns accurate human-readable text for various ages', () => {
  const now = 1773936000000;
  const tJustNow = new Date(now - 10000).toISOString(); // 10 sec ago
  const t15Min = new Date(now - 15 * 60000).toISOString(); // 15 min ago
  const t3Hours = new Date(now - 3 * 3600000).toISOString(); // 3 hours ago
  const t2Days = new Date(now - 2 * 86400000).toISOString(); // 2 days ago

  assert.equal(formatFreshnessLabel(tJustNow, 'fresh', undefined, now), 'Updated just now');
  assert.equal(formatFreshnessLabel(t15Min, 'fresh', undefined, now), 'Updated 15 min ago');
  assert.equal(formatFreshnessLabel(t15Min, 'stale', undefined, now), 'Updated 15 min ago · data may be outdated');
  assert.equal(formatFreshnessLabel(t3Hours, 'fresh', undefined, now), 'Updated 3h ago');
  assert.equal(formatFreshnessLabel(t2Days, 'stale', undefined, now), 'Updated 2d ago · archived reference');
  assert.equal(formatFreshnessLabel(t2Days, 'expired', undefined, now), 'Data temporarily unavailable');
});
