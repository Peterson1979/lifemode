import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OWNED_PROJECTS,
  getOwnedProjectById,
  matchOwnedProject,
  evaluateOwnedProjectMatch,
} from '../src/lib/projects/index.ts';
import { ECOSYSTEM_PROJECTS } from '../src/config/ecosystem.ts';

test('Owned Projects Configuration Integrity', () => {
  assert.equal(OWNED_PROJECTS.length, 3, 'Must configure exactly 3 owned projects (without MatchSignal)');

  const expectedIds = ['ai-zodiac', 'dreamly-ai', 'get-ai-set'];
  for (const id of expectedIds) {
    const project = getOwnedProjectById(id);
    assert.ok(project, `Project with ID ${id} must exist in configuration`);
    assert.ok(project.url.startsWith('https://'), `Project ${id} must have a secure HTTPS URL`);
    assert.ok(project.keywords.length >= 5, `Project ${id} must define at least 5 keywords`);
    assert.ok(project.ctaLabel.length > 0, `Project ${id} must define a CTA label`);
  }

  // Verify backward compatible ECOSYSTEM_PROJECTS export
  assert.equal(ECOSYSTEM_PROJECTS.length, 3, 'ECOSYSTEM_PROJECTS must contain 3 projects');
  assert.equal(ECOSYSTEM_PROJECTS[0].url, 'https://play.google.com/store/apps/details?id=com.oberon.aizodiac');
  assert.equal(ECOSYSTEM_PROJECTS[1].url, 'https://play.google.com/store/apps/details?id=com.oberon.dreamlyai');
  assert.equal(ECOSYSTEM_PROJECTS[2].url, 'https://www.getaiset.com/');
});

test('Matching Rule: AI Zodiac (Astrology, Personality Archetypes & Self-Discovery)', () => {
  // Case 1: Astrology and birth charts
  const zodiacMatch = matchOwnedProject({
    pillar: 'culture',
    title: 'Understanding Your Sun and Moon Signs: A Guide to Cosmic Archetypes',
    description: 'Explore the nuances of your birth chart and how astrological archetypes influence self-discovery.',
    tags: ['astrology', 'zodiac', 'birth chart', 'archetypes'],
  });
  assert.ok(zodiacMatch, 'Must match AI Zodiac for astrology and birth chart topics');
  assert.equal(zodiacMatch?.id, 'ai-zodiac');

  // Case 2: Personality frameworks & self-discovery
  const personalityMatch = matchOwnedProject({
    pillar: 'life',
    title: 'Modern Personality Types and Self-Discovery Frameworks',
    description: 'How personality archetypes and enneagram patterns help navigate relational dynamics.',
    tags: ['personality type', 'self-discovery', 'archetypes'],
  });
  assert.ok(personalityMatch, 'Must match AI Zodiac for personality archetype topics');
  assert.equal(personalityMatch?.id, 'ai-zodiac');

  // Case 3: Negative rejection (Architecture in culture should NOT match AI Zodiac)
  const nonMatch = matchOwnedProject({
    pillar: 'culture',
    title: 'Japanese Minka Renovation: Blending Historic Timber with Modern Minimalism',
    description: 'A study in timber restoration, traditional joinery, and minimalist spatial design.',
    tags: ['architecture', 'design', 'japan', 'timber'],
  });
  assert.equal(nonMatch, null, 'Architecture article in culture must NOT match AI Zodiac');
});

test('Matching Rule: Dreamly AI (Sleep, Dreams, Bedtime & Relaxation)', () => {
  // Case 1: Dream journaling & nocturnal reflections
  const dreamMatch = matchOwnedProject({
    pillar: 'wellbeing',
    title: 'The Art of Dream Journaling: Uncovering Nocturnal Patterns',
    description: 'How keeping a mindful dream journal improves morning reflections and sleep quality.',
    tags: ['dreams', 'dream journal', 'sleep quality', 'mindfulness'],
  });
  assert.ok(dreamMatch, 'Must match Dreamly AI for dream journaling topic');
  assert.equal(dreamMatch?.id, 'dreamly-ai');

  // Case 2: Bedtime routine & sleep hygiene
  const sleepMatch = matchOwnedProject({
    pillar: 'life',
    title: 'Designing an Intentional Bedtime Routine for Deep Sleep',
    description: 'Simple protocols to optimize your sleep hygiene and evening wind down.',
    tags: ['bedtime routine', 'sleep hygiene', 'deep sleep', 'relaxation'],
  });
  assert.ok(sleepMatch, 'Must match Dreamly AI for bedtime and sleep hygiene');
  assert.equal(sleepMatch?.id, 'dreamly-ai');

  // Case 3: Negative rejection (Army fitness test in wellbeing should NOT match Dreamly AI)
  const fitnessMatch = matchOwnedProject({
    pillar: 'wellbeing',
    title: 'Army Fitness Test: A Modern Guide to Functional Endurance',
    description: 'Breakdown of conditioning drills, push-up standards, and tactical endurance training.',
    tags: ['fitness', 'workout', 'endurance', 'training'],
  });
  assert.equal(fitnessMatch, null, 'General fitness test article must NOT match Dreamly AI');
});

test('Matching Rule: GetAISet (AI Learning, Courses, Toolkits & Workflows)', () => {
  // Case 1: AI learning & courses
  const courseMatch = matchOwnedProject({
    pillar: 'tech-ai',
    title: 'Best AI Courses and Learning Paths for Beginners in 2026',
    description: 'A structured roadmap of top AI tutorials, prompt engineering courses, and practical AI resources.',
    tags: ['ai learning', 'ai courses', 'learn ai', 'prompt engineering course'],
  });
  assert.ok(courseMatch, 'Must match GetAISet for AI learning and courses');
  assert.equal(courseMatch?.id, 'get-ai-set');

  // Case 2: AI tools & productivity workflows
  const toolsMatch = matchOwnedProject({
    pillar: 'tech-ai',
    title: 'Essential AI Tools and Workflow Suites for Knowledge Workers',
    description: 'Curated AI toolkits to streamline research, writing, and daily team workflows.',
    tags: ['ai tools', 'ai workflows', 'ai productivity', 'ai toolkits'],
  });
  assert.ok(toolsMatch, 'Must match GetAISet for AI tools and workflow suites');
  assert.equal(toolsMatch?.id, 'get-ai-set');

  // Case 3: Negative rejection (Streaming television in tech-ai should NOT match GetAISet)
  const tvMatch = matchOwnedProject({
    pillar: 'tech-ai',
    title: 'Apple TV Last Seen Series: What You Need to Know',
    description: 'An overview of the new streaming thriller series, cast details, and critical reception.',
    tags: ['apple tv', 'streaming', 'entertainment', 'series'],
  });
  assert.equal(tvMatch, null, 'Streaming entertainment article in tech-ai must NOT match GetAISet');
});

test('MatchSignal Isolation: Sports betting or match predictions must NOT match any owned project', () => {
  const cricketMatch = matchOwnedProject({
    pillar: 'culture',
    title: 'Pakistan vs England: Cricket Match Overview and Tactical Review',
    description: 'Tactical preview, pitch momentum analysis, and match summary for the upcoming series.',
    tags: ['cricket match', 'sports analysis', 'match predictions', 'pakistan vs england'],
  });
  assert.equal(cricketMatch, null, 'Sports match article must not match MatchSignal or any project');

  const bettingMatch = matchOwnedProject({
    pillar: 'culture',
    title: 'Premier League Tactical Analysis and Match Odds Breakdown',
    description: 'Data-driven momentum signals, team stats, and predictive match analysis for matchday 12.',
    tags: ['sports', 'premier league analysis', 'match odds', 'tactical analysis'],
  });
  assert.equal(bettingMatch, null, 'Betting odds article must not match MatchSignal or any project');
});

test('Disambiguation: AI Learning (GetAISet) vs AI Self-Discovery (AI Zodiac)', () => {
  // AI Education / Tools -> GetAISet
  const eduArticle = matchOwnedProject({
    pillar: 'tech-ai',
    title: 'Mastering AI Tools: From Basic Prompts to Advanced Workflows',
    description: 'Practical tutorials and curated AI learning paths for professionals.',
    tags: ['ai tools', 'ai learning', 'ai workflows'],
  });
  assert.equal(eduArticle?.id, 'get-ai-set', 'Education & tools must route to GetAISet');

  // AI Cosmic / Archetypes -> AI Zodiac
  const cosmicArticle = matchOwnedProject({
    pillar: 'culture',
    title: 'AI and Cosmic Archetypes: Exploring Modern Astrology Tools',
    description: 'How AI conversational models map relational dynamics and horoscope charts.',
    tags: ['astrology', 'zodiac', 'cosmic patterns', 'self-discovery'],
  });
  assert.equal(cosmicArticle?.id, 'ai-zodiac', 'Astrology & archetypes must route to AI Zodiac');
});

test('Explicit Frontmatter Overrides (targetProject)', () => {
  // Explicit targetProject override forces specific project
  const forcedMatch = matchOwnedProject({
    pillar: 'travel',
    title: 'Quiet Islands in the Azores',
    description: 'A travel guide to hot springs and volcanic landscapes.',
    tags: ['travel', 'azores', 'islands'],
    targetProject: 'dreamly-ai',
  });
  assert.equal(forcedMatch?.id, 'dreamly-ai', 'Explicit targetProject must be honored');

  // Explicit targetProject: 'none' disables promotion even on matching topics
  const disabledMatch = matchOwnedProject({
    pillar: 'tech-ai',
    title: 'Best AI Courses and Learning Paths for Beginners',
    description: 'Comprehensive tutorials and roadmaps.',
    tags: ['ai learning', 'ai courses'],
    targetProject: 'none',
  });
  assert.equal(disabledMatch, null, 'targetProject: "none" must safely disable promotion');
});

test('Diagnostic Evaluation Details', () => {
  const evalResult = evaluateOwnedProjectMatch({
    pillar: 'tech-ai',
    title: 'Mastering AI Tools and Prompt Engineering Courses in 2026',
    description: 'Curated list of AI learning platforms and beginner courses.',
    tags: ['ai courses', 'ai learning', 'prompt engineering course'],
  });

  assert.ok(evalResult.project, 'Must return matched project');
  assert.equal(evalResult.project?.id, 'get-ai-set');
  assert.ok(evalResult.score >= 35, 'Score must meet or exceed match threshold');
  assert.ok(evalResult.matchedKeywords.length > 0, 'Must record matched keywords');
  assert.ok(evalResult.matchReason?.includes('GetAISet'), 'Must include human-readable match reason');
});
