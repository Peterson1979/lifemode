import test from 'node:test';
import assert from 'node:assert/strict';

import { selectEditorialCandidates } from '../src/lib/editorial/selection.ts';
import { loadAutomationConfig, loadScheduledAutomationConfig } from '../src/lib/editorial/automation/config.ts';
import type { EditorialTopic, PillarSlug } from '../src/lib/editorial/types.ts';

function createDummyTopic(id: string, pillar: PillarSlug, score: number): EditorialTopic {
  return {
    id,
    canonicalTopic: `Topic ${id}`,
    slug: `topic-${id}`,
    pillar,
    sourceSignals: [],
    queryVariants: [`topic ${id}`],
    scoring: {
      searchPotential: score,
      pinterestPotential: score,
      socialPotential: score,
      lifeModeRelevance: score,
      commercialPotential: score,
      freshness: score,
      competitionOpportunity: score,
      originalityPotential: score,
    },
    totalScore: score,
    priorityTier: score >= 93 ? 'IMMEDIATE_OPPORTUNITY' : score >= 88 ? 'PRIORITY' : score >= 80 ? 'CANDIDATE' : 'LOW_PRIORITY',
    opportunityType: 'ARTICLE',
    status: 'CANDIDATE',
    freshnessScore: score,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [pillar],
  };
}

test('Pillar Balancing - Distributes selections across pillars when scores are competitive', () => {
  const candidates: EditorialTopic[] = [
    createDummyTopic('life-1', 'life', 88),
    createDummyTopic('life-2', 'life', 87),
    createDummyTopic('life-3', 'life', 86),
    createDummyTopic('life-4', 'life', 85),
    createDummyTopic('travel-1', 'travel', 87),
    createDummyTopic('tech-1', 'tech-ai', 86),
    createDummyTopic('wellbeing-1', 'wellbeing', 85),
  ];

  // If life is heavily represented in existing articles (e.g. 5 articles already published in life)
  const existingDist: Partial<Record<PillarSlug, number>> = {
    life: 5,
    travel: 0,
    'tech-ai': 0,
    wellbeing: 0,
  };

  const { approved } = selectEditorialCandidates(candidates, {
    minScoreThreshold: 80,
    totalLimit: 4,
    existingPillarDistribution: existingDist,
    enablePillarBalancing: true,
  });

  assert.equal(approved.length, 4);

  // Verifies that underrepresented pillars (travel, tech, wellbeing) are selected alongside life
  const approvedPillars = approved.map((a) => a.pillar);
  assert.ok(approvedPillars.includes('travel'));
  assert.ok(approvedPillars.includes('tech-ai'));
  assert.ok(approvedPillars.includes('wellbeing'));
});

test('Pillar Balancing - Never approves a weak topic (< 80) merely to balance pillars', () => {
  const candidates: EditorialTopic[] = [
    createDummyTopic('life-1', 'life', 92),
    createDummyTopic('life-2', 'life', 90),
    createDummyTopic('weak-money-1', 'money', 65), // Sub-threshold
    createDummyTopic('weak-discover-1', 'discover', 55), // Rejected
  ];

  const { approved, rejected, deferred } = selectEditorialCandidates(candidates, {
    minScoreThreshold: 80,
    totalLimit: 4,
    existingPillarDistribution: { life: 3, money: 0, discover: 0 },
    enablePillarBalancing: true,
  });

  // Only qualified topics >= 80 are approved
  assert.equal(approved.length, 2);
  assert.ok(approved.every((a) => a.totalScore >= 80));

  // Weak topics are properly rejected or deferred
  assert.equal(rejected.length, 1);
  assert.equal(deferred.length, 1);
});

test('Initial Content Acceleration - Configures higher opportunity capacity safely', () => {
  // Default config without acceleration
  const normalConfig = loadAutomationConfig({});
  assert.equal(normalConfig.accelerationEnabled, false);
  assert.equal(normalConfig.maxOpportunities, 1);

  // Accelerated config via override or environment
  const acceleratedConfig = loadAutomationConfig({
    accelerationEnabled: true,
  });
  assert.equal(acceleratedConfig.accelerationEnabled, true);
  assert.equal(acceleratedConfig.maxOpportunities, 5);

  // Custom accelerated capacity override
  const customAccelerated = loadScheduledAutomationConfig({
    accelerationEnabled: true,
    maxOpportunities: 7,
  });
  assert.equal(customAccelerated.accelerationEnabled, true);
  assert.equal(customAccelerated.maxOpportunities, 7);
  // Quality threshold remains strictly unchanged (min 80)
  assert.equal(customAccelerated.minScoreThreshold, 80);
});
