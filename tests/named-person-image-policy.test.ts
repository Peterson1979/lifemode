import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  analyzeNamedPersonPolicy,
  isVerifiedPersonImage,
  classifyNamedPersonImage,
  detectPersonInImage,
} from '../src/lib/editorial/person-policy.ts';

import {
  validateImageSemanticRelevance,
} from '../src/lib/editorial/image-prompt.ts';

import {
  validateEditorialArticle,
} from '../src/lib/editorial/validation/validator.ts';

// ---------------------------------------------------------------------------
// Suite: Named Person Image Policy & Person-Free Contextual Integrity
// ---------------------------------------------------------------------------

test('1. Alexandra Eala + verified Eala image is accepted as Priority 1 (VERIFIED_SUBJECT_PHOTO)', () => {
  const analysis = analyzeNamedPersonPolicy({
    title: 'Alexandra Eala: Rising Star of the Hard-Court Swing',
    tags: ['entertainment', 'tennis', 'sports', 'wta', 'profiles'],
    pillar: 'entertainment',
  });

  const verifiedEalaImage = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Alexandra_Eala_2023.jpg/800px-Alexandra_Eala_2023.jpg',
    alt: 'Alexandra Eala competing at the US Open tennis championship',
    source: 'Wikimedia Commons (CC BY-SA 4.0)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Alexandra_Eala_2023.jpg',
    license: 'CC BY-SA 4.0',
  };

  const verification = isVerifiedPersonImage(verifiedEalaImage, analysis);
  assert.equal(verification.verified, true);
  assert.equal(verification.sourceAuthority, 'wikimedia_commons');

  const classification = classifyNamedPersonImage(verifiedEalaImage, analysis);
  assert.equal(classification.classification, 'VERIFIED_SUBJECT_PHOTO');
  assert.equal(classification.valid, true);

  const semanticValidation = validateImageSemanticRelevance(
    'Alexandra Eala: Rising Star of the Hard-Court Swing',
    'entertainment',
    verifiedEalaImage,
    { tags: ['tennis', 'sports'] }
  );

  assert.equal(semanticValidation.valid, true);
  assert.equal(semanticValidation.priorityLevel, 'PRIORITY_1_VERIFIED_PERSON');
  assert.equal(semanticValidation.namedPersonClassification, 'VERIFIED_SUBJECT_PHOTO');
});

test('2. Alexandra Eala + unrelated female tennis player is strictly rejected', () => {
  const unrelatedPlayerImage = {
    url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1200&q=80',
    alt: 'Female tennis player hitting a forehand on a hard court',
    source: 'Unsplash Contributor',
    sourceUrl: 'https://unsplash.com/photos/female-tennis-player',
    license: 'Unsplash License (Free)',
  };

  const validation = validateImageSemanticRelevance(
    'Alexandra Eala: Rising Star of the Hard-Court Swing',
    'entertainment',
    unrelatedPlayerImage,
    { tags: ['tennis', 'sports'] }
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.priorityLevel, 'INVALID');
  assert.equal(validation.namedPersonClassification, 'INVALID');
  assert.ok(validation.reason?.includes('unrelated person') || validation.reason?.includes('person-free'));
});

test('3. Alexandra Eala + unrelated woman on tennis court is strictly rejected', () => {
  const womanOnCourtImage = {
    url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
    alt: 'Woman on tennis court holding racket with smile',
    source: 'Unsplash Contributor',
    sourceUrl: 'https://unsplash.com/photos/woman-on-tennis-court',
    license: 'Unsplash License (Free)',
  };

  const validation = validateImageSemanticRelevance(
    'Alexandra Eala: Rising Star of the Hard-Court Swing',
    'entertainment',
    womanOnCourtImage,
    { tags: ['tennis', 'sports'] }
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.priorityLevel, 'INVALID');
  assert.equal(validation.namedPersonClassification, 'INVALID');
});

test('4. Alexandra Eala + tennis player silhouette/person is strictly rejected as contextual fallback', () => {
  const silhouetteImage = {
    url: 'https://images.unsplash.com/photo-1531315630201-bb15abeb1653?auto=format&fit=crop&w=1200&q=80',
    alt: 'Dramatic human silhouette of tennis player serving at golden hour',
    source: 'Unsplash Contributor',
    sourceUrl: 'https://unsplash.com/photos/tennis-player-silhouette',
    license: 'Unsplash License (Free)',
  };

  const validation = validateImageSemanticRelevance(
    'Alexandra Eala: Rising Star of the Hard-Court Swing',
    'entertainment',
    silhouetteImage,
    { tags: ['tennis', 'sports'] }
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.priorityLevel, 'INVALID');
  assert.equal(validation.namedPersonClassification, 'INVALID');
  assert.ok(validation.reason?.includes('silhouette') || validation.reason?.includes('human figure') || validation.reason?.includes('player'));
});

test('5. Alexandra Eala + empty hard-court tennis court is accepted as Priority 2 (PERSON_FREE_CONTEXTUAL)', () => {
  const emptyCourtImage = {
    url: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=80',
    alt: 'Contextual editorial photography of an empty championship hard-court tennis surface with court lines and net',
    source: 'Photo by Moises Alex on Unsplash (Free)',
    sourceUrl: 'https://unsplash.com/photos/blue-and-green-tennis-court-pZ1wW_0b2vA',
    license: 'Unsplash License (Free)',
  };

  const personCheck = detectPersonInImage(emptyCourtImage);
  assert.equal(personCheck.containsPerson, false);

  const validation = validateImageSemanticRelevance(
    'Alexandra Eala: Rising Star of the Hard-Court Swing',
    'entertainment',
    emptyCourtImage,
    { tags: ['tennis', 'sports'] }
  );

  assert.equal(validation.valid, true);
  assert.equal(validation.priorityLevel, 'PRIORITY_2_CONTEXTUAL');
  assert.equal(validation.namedPersonClassification, 'PERSON_FREE_CONTEXTUAL');
});

test('6. Alexandra Eala + tennis racket/balls/court with no person is accepted as Priority 2 (PERSON_FREE_CONTEXTUAL)', () => {
  const equipmentImage = {
    url: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?auto=format&fit=crop&w=1200&q=80',
    alt: 'Contextual editorial photography of a tennis racket and ball resting on hard court surface',
    source: 'Photo by Valentin Balan on Unsplash (Free)',
    sourceUrl: 'https://unsplash.com/photos/tennis-racket-on-court',
    license: 'Unsplash License (Free)',
  };

  const personCheck = detectPersonInImage(equipmentImage);
  assert.equal(personCheck.containsPerson, false);

  const validation = validateImageSemanticRelevance(
    'Alexandra Eala: Rising Star of the Hard-Court Swing',
    'entertainment',
    equipmentImage,
    { tags: ['tennis', 'sports'] }
  );

  assert.equal(validation.valid, true);
  assert.equal(validation.priorityLevel, 'PRIORITY_2_CONTEXTUAL');
  assert.equal(validation.namedPersonClassification, 'PERSON_FREE_CONTEXTUAL');
});

test('7. Cillian Murphy + verified Murphy image is accepted as Priority 1 (VERIFIED_SUBJECT_PHOTO)', () => {
  const analysis = analyzeNamedPersonPolicy({
    title: 'Cillian Murphy and the Art of Reluctant Fame: Acting as Craft Over Celebrity',
    tags: ['entertainment', 'acting', 'cinema', 'profiles'],
    pillar: 'entertainment',
  });

  const verifiedMurphyImage = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Cillian_Murphy_2023.jpg/800px-Cillian_Murphy_2023.jpg',
    alt: 'Cillian Murphy at the UK premiere of Oppenheimer in London',
    source: 'Wikimedia Commons (CC BY-SA 4.0)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cillian_Murphy_2023.jpg',
    license: 'CC BY-SA 4.0',
  };

  const verification = isVerifiedPersonImage(verifiedMurphyImage, analysis);
  assert.equal(verification.verified, true);
  assert.equal(verification.sourceAuthority, 'wikimedia_commons');

  const validation = validateImageSemanticRelevance(
    'Cillian Murphy and the Art of Reluctant Fame: Acting as Craft Over Celebrity',
    'entertainment',
    verifiedMurphyImage,
    { tags: ['acting', 'cinema'] }
  );

  assert.equal(validation.valid, true);
  assert.equal(validation.priorityLevel, 'PRIORITY_1_VERIFIED_PERSON');
  assert.equal(validation.namedPersonClassification, 'VERIFIED_SUBJECT_PHOTO');
});

test('8. Cillian Murphy + unrelated male actor portrait is strictly rejected', () => {
  const unrelatedActorPortrait = {
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=80',
    alt: 'Portrait photograph of male actor smiling in studio',
    source: 'Unsplash Contributor',
    sourceUrl: 'https://unsplash.com/photos/man-smiling-portrait',
    license: 'Unsplash License (Free)',
  };

  const validation = validateImageSemanticRelevance(
    'Cillian Murphy and the Art of Reluctant Fame: Acting as Craft Over Celebrity',
    'entertainment',
    unrelatedActorPortrait,
    { tags: ['acting', 'cinema'] }
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.priorityLevel, 'INVALID');
  assert.equal(validation.namedPersonClassification, 'INVALID');
});

test('9. Cillian Murphy + unrelated person on film set is strictly rejected', () => {
  const personOnSetImage = {
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
    alt: 'Director and camera operator standing on film set with lighting equipment',
    source: 'Unsplash Contributor',
    sourceUrl: 'https://unsplash.com/photos/film-set-with-crew',
    license: 'Unsplash License (Free)',
  };

  const validation = validateImageSemanticRelevance(
    'Cillian Murphy and the Art of Reluctant Fame: Acting as Craft Over Celebrity',
    'entertainment',
    personOnSetImage,
    { tags: ['acting', 'cinema'] }
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.priorityLevel, 'INVALID');
  assert.equal(validation.namedPersonClassification, 'INVALID');
});

test('10. Cillian Murphy + empty cinema/film equipment/stage without people is accepted as Priority 2 (PERSON_FREE_CONTEXTUAL)', () => {
  const emptyCinemaImage = {
    url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80',
    alt: 'Contextual editorial photography of an atmospheric cinema auditorium with warm lighting and theatrical screen',
    source: 'Photo by Felix Mooneeram on Unsplash (Free)',
    sourceUrl: 'https://unsplash.com/photos/red-theater-chairs-inside-theater-evlkOfkQ5rE',
    license: 'Unsplash License (Free)',
  };

  const personCheck = detectPersonInImage(emptyCinemaImage);
  assert.equal(personCheck.containsPerson, false);

  const validation = validateImageSemanticRelevance(
    'Cillian Murphy and the Art of Reluctant Fame: Acting as Craft Over Celebrity',
    'entertainment',
    emptyCinemaImage,
    { tags: ['acting', 'cinema'] }
  );

  assert.equal(validation.valid, true);
  assert.equal(validation.priorityLevel, 'PRIORITY_2_CONTEXTUAL');
  assert.equal(validation.namedPersonClassification, 'PERSON_FREE_CONTEXTUAL');
});

test('11. The same person-free contextual rule works across musicians, authors, chefs, athletes, scientists', () => {
  // Musician with unrelated guitarist -> Rejected
  const unrelatedGuitarist = validateImageSemanticRelevance(
    'Tracy Chapman and the Enduring Power of Acoustic Truth',
    'entertainment',
    {
      url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
      alt: 'Female guitarist playing acoustic guitar on stage',
    },
    { tags: ['music', 'acoustic'] }
  );
  assert.equal(unrelatedGuitarist.valid, false);

  // Musician with empty recording studio / acoustic guitar -> Accepted
  const emptyStudio = validateImageSemanticRelevance(
    'Tracy Chapman and the Enduring Power of Acoustic Truth',
    'entertainment',
    {
      url: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80',
      alt: 'Contextual editorial photography of an empty acoustic recording studio with instruments and mixing board',
    },
    { tags: ['music', 'acoustic'] }
  );
  assert.equal(emptyStudio.valid, true);
  assert.equal(emptyStudio.namedPersonClassification, 'PERSON_FREE_CONTEXTUAL');

  // Baseball player with unrelated catcher -> Rejected
  const unrelatedCatcher = validateImageSemanticRelevance(
    'Who Is José Trevino? Career, Background and Community Impact',
    'entertainment',
    {
      url: 'https://images.unsplash.com/photo-1508344928928-7165b67de128?auto=format&fit=crop&w=1200&q=80',
      alt: 'Baseball player crouching behind home plate in stadium',
    },
    { tags: ['baseball', 'person'] }
  );
  assert.equal(unrelatedCatcher.valid, false);

  // Baseball player with empty diamond and gear -> Accepted
  const emptyDugoutGear = validateImageSemanticRelevance(
    'Who Is José Trevino? Career, Background and Community Impact',
    'entertainment',
    {
      url: 'https://images.unsplash.com/photo-1516731415730-0c607149933a?auto=format&fit=crop&w=1200&q=80',
      alt: 'Contextual editorial photography of catcher equipment and baseball mitt on a stadium dugout bench',
    },
    { tags: ['baseball', 'person'] }
  );
  assert.equal(emptyDugoutGear.valid, true);
  assert.equal(emptyDugoutGear.namedPersonClassification, 'PERSON_FREE_CONTEXTUAL');
});

test('12. Existing non-person article image behavior remains unchanged', () => {
  // Travel article with scenic coastal landscape
  const validTravel = validateImageSemanticRelevance(
    'The Quietest Islands in the Azores',
    'travel',
    {
      url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
      alt: 'Solitary coastal cliffs and volcanic trails in the Azores',
    },
    { tags: ['travel', 'islands'] }
  );
  assert.equal(validTravel.valid, true);

  // Food article with irrelevant computer chip
  const invalidFood = validateImageSemanticRelevance(
    'Why Sourdough Became a Global Food Culture',
    'food-drink',
    {
      url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
      alt: 'Computer circuit board and semiconductor chips',
    }
  );
  assert.equal(invalidFood.valid, false);
});

test('13. Existing provenance and license requirements remain strictly enforced', () => {
  const articleWithValidProvenance = {
    title: 'Cillian Murphy and the Art of Reluctant Fame: Acting as Craft Over Celebrity',
    slug: 'cillian-murphy-and-the-art-of-reluctant-fame',
    description: 'An editorial analysis of Cillian Murphy’s craft, screen presence, and dedication to performance excellence.',
    excerpt: 'Examining Cillian Murphy’s acting approach, micro-expressions, and deliberate privacy.',
    content: `## The Physicality of Silence and Craft\n\nCillian Murphy represents an acting philosophy focused entirely on character immersion and emotional restraint. Across three decades spanning independent Irish theatre, gritty crime epics, and sweeping historical dramas, his performances hinge on micro-expressions, deliberate stillness, and technical discipline.\n\n## Sustained Creative Collaborations\n\nWorking repeatedly with visionary filmmakers such as Christopher Nolan has allowed Murphy to explore complex psychological landscapes without succumbing to the superficial demands of celebrity branding. His commitment to literature-driven narrative storytelling remains a defining benchmark for contemporary performers.`,
    sources: [
      { name: 'Irish Film & Television Academy', url: 'https://www.ifta.ie' },
      { name: 'BAFTA Archive', url: 'https://www.bafta.org' },
    ],
  };

  const valResult = validateEditorialArticle(
    articleWithValidProvenance,
    {
      topicId: 'lm-entertainment-cillian-murphy',
      pillar: 'entertainment',
      isPerson: true,
      imageMetadata: {
        url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80',
        alt: 'Contextual editorial photography of an atmospheric cinema auditorium with warm lighting and theatrical screen',
        source: 'Photo by Felix Mooneeram on Unsplash (Free)',
        sourceUrl: 'https://unsplash.com/photos/red-theater-chairs-inside-theater-evlkOfkQ5rE',
        license: 'Unsplash License (Free)',
      },
    },
    { requireImage: true }
  );

  assert.equal(valResult.passed, true);
  assert.equal(valResult.checks.image, true);
  assert.equal(valResult.errors.length, 0);
});

test('14. Social-card image consistency: Both production articles use verified person-free editorial images', () => {
  const entertainmentRoot = join(process.cwd(), 'src', 'content', 'entertainment');

  // 1. Cillian Murphy article
  const cillianFile = readFileSync(join(entertainmentRoot, 'cillian-murphy-and-the-art-of-reluctant-fame.md'), 'utf-8');
  assert.ok(cillianFile.includes('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba'));
  assert.ok(cillianFile.includes('atmospheric cinema auditorium'));
  assert.ok(!cillianFile.includes('woman-in-black-crew-neck-shirt'));

  // 2. Alexandra Eala article
  const ealaFile = readFileSync(join(entertainmentRoot, 'alexandra-eala-rising-star-of-the-hard-court-swing.md'), 'utf-8');
  assert.ok(ealaFile.includes('https://images.unsplash.com/photo-1622279457486-62dcc4a431d6'));
  assert.ok(ealaFile.includes('empty championship hard-court tennis surface'));
  assert.ok(!ealaFile.includes('photo-1595435934249-5df7ed86e1c0'));
  assert.ok(!ealaFile.includes('woman-sitting-behind-desk'));
});
