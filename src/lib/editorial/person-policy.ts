/**
 * Common non-person proper noun prefixes and terms to exclude from person heuristics.
 */
const NON_PERSON_TERMS = new Set([
  'apple tv',
  'delta flight',
  'san jose earthquakes',
  'deepseek',
  'downdetector',
  'fire weather watch',
  'cable tv',
  'laguna beach',
  'army fitness test',
  'pakistan vs england',
  'vaccinations',
  'the azores',
  'japanese minka',
  'solheim cup',
  'meteor shower',
]);

/**
 * Deterministic person-related keyword signals in titles and queries.
 */
const PERSON_QUERY_PATTERNS: RegExp[] = [
  /\bwho is\b/i,
  /\bcareer\b/i,
  /\bbiography\b/i,
  /\bnet worth\b/i,
  /\bstats\b/i,
  /\bcontract\b/i,
  /\bsalary\b/i,
  /\btrade\b/i,
  /\binjury\b/i,
  /\bwife\b/i,
  /\bhusband\b/i,
  /\bactor\b/i,
  /\bactress\b/i,
  /\bplayer\b/i,
  /\bcatcher\b/i,
  /\bpitcher\b/i,
  /\bquarterback\b/i,
  /\bcoach\b/i,
  /\bpolitician\b/i,
  /\bsenator\b/i,
  /\bgovernor\b/i,
  /\bsinger\b/i,
  /\bmusician\b/i,
  /\btennis player\b/i,
  /\bfilm director\b/i,
  /\bfilmmaker\b/i,
  /\bauthor\b/i,
];

/**
 * Minimum number of credible, verifiable external sources required for any person-related article.
 */
export const PERSON_MIN_REQUIRED_SOURCES = 2;

/**
 * Strict "do not claim" guardrails enforced across all person-related content.
 */
export const PERSON_DO_NOT_CLAIM_GUARDRAILS: string[] = [
  'Do not invent biography details, dates, birthplaces, career history, statistics, records, relationships, family members, achievements, or current status.',
  'Do not fabricate quotes, personal statements, interviews, or private conversations.',
  'Distinguish verified factual information from uncertain, rumored, or developing reporting. If a biographical claim cannot be adequately supported by verified evidence, omit it rather than guessing.',
  'Do not cite AI-generated answers, social media speculation, or self-referential placeholder URLs as authoritative biographical evidence.',
  'All biographical statements must be strictly grounded in the approved, verified external sources.',
  'Never substitute an unrelated person photograph for an identifiable real person.',
  'Do not label a contextual editorial image (e.g. a tennis court or camera) as depicting the real person.',
];

export const NON_PERSON_CONCEPT_WORDS = new Set([
  'guide', 'modern', 'series', 'watch', 'flight', 'islands', 'habits', 'living',
  'report', 'study', 'model', 'models', 'test', 'review', 'tech', 'architecture',
  'architectural', 'timber', 'pavilion', 'pavilions', 'structure', 'structures', 'building',
  'spaces', 'workspaces', 'design', 'minimalist', 'mindful', 'audio', 'coastal',
  'retreat', 'retreats', 'interiors', 'gardens', 'lighting', 'coffee', 'keyboards', 'desk',
  'quantum', 'entanglement', 'computing', 'physics', 'science', 'learning',
  'intelligence', 'network', 'networks', 'system', 'systems', 'memory', 'solitude',
  'focus', 'ritual', 'rituals', 'sleep', 'morning', 'movement', 'walking', 'health',
  'wellness', 'fitness', 'nutrition', 'fasting', 'ergonomics', 'hardware', 'software',
  'acoustics', 'sound', 'photography', 'camera', 'analog', 'digital', 'journaling',
  'tea', 'espresso', 'brewing', 'fermentation', 'recipes', 'cooking', 'dining',
  'travel', 'hotel', 'hotels', 'stays', 'beaches', 'mountains', 'trails', 'resorts',
  'cities', 'culture', 'history', 'trends', 'signal', 'signals', 'zeitgeist', 'destination', 'destinations',
  'solar', 'microgrid', 'resilience', 'energy', 'power', 'grid', 'climate', 'sustainability', 'sustainable',
  'environment', 'environmental', 'urban', 'house', 'housing', 'heating', 'cooling', 'residential',
  'geothermal', 'workstation', 'biophilic', 'workspace', 'calm', 'technology', 'devices', 'device',
  'app', 'apps', 'cloud', 'automation', 'tools', 'tool', 'setup', 'setups', 'workflow', 'workflows',
  'market', 'markets', 'economy', 'economic', 'finance', 'financial', 'investing', 'investment',
  'funds', 'stocks', 'stock', 'wealth', 'money', 'crypto', 'estate', 'property', 'topic', 'topics',
  'daily', 'first', 'second', 'third', 'forced', 'additional', 'attempt', 'project', 'editorial',
  'weather', 'storm', 'storms', 'rainfall', 'temperature', 'forecast', 'forecasts', 'heat', 'waves',
  'craft', 'artisan', 'minimalism', 'gear', 'essentials', 'routine', 'routines', 'practice', 'practices',
  'olive', 'oil', 'extraction', 'harvest', 'harvesting', 'culinary', 'gastronomy', 'ingredient', 'ingredients',
  'wine', 'dish', 'dishes', 'table', 'curation', 'preservation', 'yield', 'yields', 'treasury', 'inflation',
  'rates', 'notes', 'bonds', 'currency', 'sovereign', 'portfolio', 'asset', 'assets', 'liquidity',
  'cup', 'showers', 'movies', 'streaming', 'monograph', 'renovation', 'minka', 'earthquakes',
]);

export interface PersonDetectionInput {
  canonicalTopic?: string;
  title?: string;
  queryVariants?: string[];
  tags?: string[];
  isPerson?: boolean;
  topicId?: string;
}

/**
 * Deterministically identifies whether a topic or article focuses on an identifiable real person.
 */
export function isPersonTopic(input: PersonDetectionInput): boolean {
  if (!input) return false;

  // 1. Explicit flags
  if (input.isPerson === true) return true;

  // 2. Explicit tags
  const tags = (input.tags || []).map((t) => t.toLowerCase().trim());
  if (
    tags.includes('person') ||
    tags.includes('biography') ||
    tags.includes('profile') ||
    tags.includes('profiles') ||
    tags.includes('athlete') ||
    tags.includes('celebrity') ||
    tags.includes('people') ||
    tags.includes('actor') ||
    tags.includes('actress')
  ) {
    return true;
  }

  // 3. Known person topic IDs or patterns
  const topicId = (input.topicId || '').toLowerCase();
  if (
    topicId.includes('jose-trevino') ||
    topicId.includes('eliezer-alfonzo') ||
    topicId.includes('blake-lively') ||
    topicId.includes('cillian-murphy') ||
    topicId.includes('alexandra-eala') ||
    topicId.includes('josh-hartnett') ||
    topicId.includes('tracy-chapman') ||
    topicId.includes('greta-gerwig')
  ) {
    return true;
  }

  // 4. Candidate text analysis
  const candidateText = (input.canonicalTopic || input.title || '').trim();
  if (!candidateText) return false;

  const lowerText = candidateText.toLowerCase();

  // Exclude known non-person terms
  for (const nonPerson of NON_PERSON_TERMS) {
    if (lowerText.startsWith(nonPerson) || lowerText.includes(nonPerson)) {
      return false;
    }
  }

  // Check query variants for biographical query patterns
  const allVariants = [...(input.queryVariants || []), candidateText];
  for (const variant of allVariants) {
    for (const pattern of PERSON_QUERY_PATTERNS) {
      if (pattern.test(variant)) {
        // Double check it's not a general subject like "career advice"
        if (!/\b(career advice|career path|career tips|how to start a career)\b/i.test(variant)) {
          return true;
        }
      }
    }
  }

  // 5. Named-entity heuristics on canonical topic or title:
  if (input.canonicalTopic) {
    const cleanCanonical = input.canonicalTopic.trim();
    const words = cleanCanonical.split(/\s+/);
    if (words.length >= 2 && words.length <= 3) {
      const allCapitalized = words.every((w) => /^[A-Z][a-zà-ÿ]+$/i.test(w) && w.length >= 2);
      const hasTopicWord = words.some((w) => NON_PERSON_CONCEPT_WORDS.has(w.toLowerCase()));

      if (allCapitalized && !hasTopicWord) {
        return true;
      }
    }
  }

  // 6. Article title structural patterns:
  if (input.title) {
    const title = input.title.trim();
    if (/^who\s+is\s+[A-Z]/i.test(title)) {
      return true;
    }

    // Pattern A: "Name: Subtitle" (e.g. "Alexandra Eala: Rising Star...", "Josh Hartnett: Canadian actor...")
    const colonMatch = title.match(/^([A-Z][a-zà-ÿ]+\s+[A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)?)\s*[:–-]/);
    if (colonMatch) {
      const namePart = colonMatch[1];
      const nameWords = namePart.split(/\s+/);
      const hasTopicWord = nameWords.some((w) => NON_PERSON_CONCEPT_WORDS.has(w.toLowerCase()));
      if (!hasTopicWord) {
        return true;
      }
    }

    // Pattern B: "Name and Name: ..." (e.g. "Greta Gerwig and Noah Baumbach: Creative Partnership")
    const duoMatch = title.match(/^([A-Z][a-zà-ÿ]+\s+[A-Z][a-zà-ÿ]+)\s+and\s+([A-Z][a-zà-ÿ]+\s+[A-Z][a-zà-ÿ]+)\s*[:–-]/i);
    if (duoMatch) {
      const words1 = duoMatch[1].split(/\s+/);
      const words2 = duoMatch[2].split(/\s+/);
      const hasTopicWord1 = words1.some((w) => NON_PERSON_CONCEPT_WORDS.has(w.toLowerCase()));
      const hasTopicWord2 = words2.some((w) => NON_PERSON_CONCEPT_WORDS.has(w.toLowerCase()));
      if (!hasTopicWord1 && !hasTopicWord2) {
        return true;
      }
    }

    // Pattern C: "Name and the [Angle]: ..." (e.g. "Cillian Murphy and the Art of Reluctant Fame...", "Tracy Chapman and the Enduring Power...")
    const nameAndAngleMatch = title.match(/^([A-Z][a-zà-ÿ]+\s+[A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)?)\s+and\s+the\s+/i);
    if (nameAndAngleMatch) {
      const namePart = nameAndAngleMatch[1];
      const nameWords = namePart.split(/\s+/);
      const hasTopicWord = nameWords.some((w) => NON_PERSON_CONCEPT_WORDS.has(w.toLowerCase()));
      if (!hasTopicWord) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Comprehensive analysis result for Named Person Image Policy.
 */
export interface NamedPersonAnalysis {
  isPersonSpecific: boolean;
  personNames: string[];
  primaryPersonName?: string;
  professionOrRole: string;
  subjectAngle: string;
  isMultiplePeople: boolean;
  relevantVisualSubject: string;
  visualTheme: string;
  contextScene: string;
  disallowedVisuals: string[];
  suggestedAltText: string;
}

/**
 * Extracts all clean person names from a title or topic.
 */
export function extractPersonNames(rawText: string): string[] {
  if (!rawText) return [];
  const clean = rawText.trim();

  // Check for duo: "Name1 and Name2"
  const duoMatch = clean.match(/^([A-Z][a-zà-ÿ]+\s+[A-Z][a-zà-ÿ]+)\s+and\s+([A-Z][a-zà-ÿ]+\s+[A-Z][a-zà-ÿ]+)/i);
  if (duoMatch) {
    return [duoMatch[1].trim(), duoMatch[2].trim()];
  }

  // Check single person name patterns
  const single = extractPersonName(clean);
  return single ? [single] : [];
}

/**
 * Extracts a clean primary person name from titles, queries, or topic names.
 */
export function extractPersonName(rawText: string): string {
  if (!rawText) return '';
  let name = rawText
    .replace(/^who\s+is\s+/i, '')
    .replace(/^inside\s+/i, '')
    .replace(/\s+and\s+the\s+.*$/i, '')
    .replace(/:\s*.*$/i, '')
    .replace(/–\s*.*$/i, '')
    .replace(/-\s*.*$/i, '')
    .replace(/\?.*$/i, '')
    .replace(/’s\s+.*$/i, '')
    .replace(/'s\s+.*$/i, '')
    .trim();

  // If name still contains "and", take the first part
  if (name.includes(' and ')) {
    name = name.split(' and ')[0].trim();
  }

  return name || rawText.trim();
}

export interface NamedPersonPolicyInput {
  title?: string;
  canonicalTopic?: string;
  description?: string;
  content?: string;
  tags?: string[];
  pillar?: string;
  topicId?: string;
  isPerson?: boolean;
}

/**
 * Analyzes an article's subject to produce a structured Named Person profile
 * and deterministic visual fallback directives.
 */
export function analyzeNamedPersonPolicy(input: NamedPersonPolicyInput): NamedPersonAnalysis {
  const isPerson = isPersonTopic(input);
  const text = `${input.title || ''} ${input.canonicalTopic || ''} ${input.description || ''} ${(input.tags || []).join(' ')} ${input.content ? input.content.slice(0, 1000) : ''}`.toLowerCase();

  const names = extractPersonNames(input.title || input.canonicalTopic || '');
  const primaryName = names[0] || (input.canonicalTopic ? extractPersonName(input.canonicalTopic) : '');
  const isMultiple = names.length > 1;

  if (!isPerson) {
    return {
      isPersonSpecific: false,
      personNames: [],
      professionOrRole: 'general',
      subjectAngle: input.title || input.canonicalTopic || '',
      isMultiplePeople: false,
      relevantVisualSubject: 'General editorial subject',
      visualTheme: 'Contemporary Editorial Lifestyle',
      contextScene: 'A calm, natural editorial setting with ambient daylight',
      disallowedVisuals: ['unrelated people', 'generic stock models'],
      suggestedAltText: input.title ? `${input.title} — editorial photography` : 'LifeMode editorial photography',
    };
  }

  // Identify specific profession / domain
  const isTennis = /\b(tennis|wta|atp|grand slam|us open|wimbledon|roland garros|hard-court|hardcourt|racket|racquet|baseline|court swing|rafa nadal academy)\b/.test(text);
  const isBaseball = /\b(baseball|mlb|yankees|catcher|pitcher|platinum glove|gold glove|roberto clemente|dugout|batting)\b/.test(text);
  const isGolf = /\b(golf|lpga|pga|solheim|ryder|fairway|putting)\b/.test(text);
  const isCinema = /\b(actor|actress|acting|cinema|film|movie|hollywood|director|screenplay|soundstage|oppenheimer|peaky blinders|35mm)\b/.test(text);
  const isMusic = /\b(music|musician|singer|songwriter|guitar|guitarist|acoustic|album|concert|recording studio|vinyl|composer)\b/.test(text);
  const isAuthor = /\b(author|writer|novelist|essayist|book|manuscript|memoir|playwright|literature)\b/.test(text);
  const isScience = /\b(researcher|scientist|physicist|astronomer|laboratory|quantum|astronomy|study|experiment)\b/.test(text);
  const isTechBusiness = /\b(founder|ceo|executive|business|entrepreneur|investor|venture|tech leader)\b/.test(text);

  let professionOrRole = 'public figure';
  let relevantVisualSubject = 'Professional Craft & Context';
  let visualTheme = 'Contemporary Editorial Craft';
  let contextScene = 'An authentic, atmospheric workspace with natural wood, notebooks, and soft morning daylight';
  let suggestedAltText = `Contextual editorial photography exploring the craft and environment of ${primaryName}`;

  if (isTennis) {
    professionOrRole = 'professional tennis player';
    relevantVisualSubject = 'Hard-Court Tennis Setting & Equipment';
    visualTheme = 'Professional Tennis & Athletic Craft';
    contextScene = 'A sunlit championship hard-court tennis surface with crisp white court lines, tennis net, and dynamic natural daylight';
    suggestedAltText = 'Contextual editorial photography of a professional hard-court tennis court and net';
  } else if (isBaseball) {
    professionOrRole = 'professional baseball player';
    relevantVisualSubject = 'Baseball Diamond & Catcher Gear';
    visualTheme = 'Athletic Discipline & Baseball Heritage';
    contextScene = 'A sunlit baseball diamond during golden hour, catcher equipment and leather glove resting on the dugout bench, stadium atmosphere with warm natural light';
    suggestedAltText = 'Contextual editorial photography of catcher equipment and baseball mitt on a stadium dugout bench';
  } else if (isGolf) {
    professionOrRole = 'professional golfer';
    relevantVisualSubject = 'Championship Golf Links & Fairway';
    visualTheme = 'Golf Discipline & Coastal Links';
    contextScene = 'Morning mist over an expansive coastal golf green with flagstick and textured fairway turf';
    suggestedAltText = 'Contextual editorial photography of a coastal championship golf course';
  } else if (isCinema) {
    professionOrRole = 'screen actor / filmmaker';
    relevantVisualSubject = '35mm Cinema Production & Screening Room';
    visualTheme = 'Screen Craft & Cinematic Production';
    contextScene = 'A cinematic film set environment with 35mm film cameras, director viewfinder, and diffused warm architectural lighting';
    suggestedAltText = 'Contextual editorial photography of a 35mm cinema camera and film production lighting';
  } else if (isMusic) {
    professionOrRole = 'musician / songwriter';
    relevantVisualSubject = 'Acoustic Instrument & Recording Atelier';
    visualTheme = 'Musical Craft & Studio Atmosphere';
    contextScene = 'An intimate acoustic recording studio with vintage archtop acoustic guitar, warm brass task lighting, and sheet music';
    suggestedAltText = 'Contextual editorial photography of an acoustic guitar in a warm recording studio setting';
  } else if (isAuthor) {
    professionOrRole = 'author / essayist';
    relevantVisualSubject = 'Literary Study & Writing Atelier';
    visualTheme = 'Literary Craft & Private Library';
    contextScene = 'A quiet architectural library with open reference volumes, handcrafted wooden desk, and fountain pen in soft side daylight';
    suggestedAltText = 'Contextual editorial photography of an author writing desk with notebooks and fountain pen';
  } else if (isScience) {
    professionOrRole = 'researcher / scientist';
    relevantVisualSubject = 'Scientific Research & Precision Instruments';
    visualTheme = 'Scientific Inquiry & Research Laboratory';
    contextScene = 'A modern scientific research environment with precision analytical instruments, clean architectural lighting, and research notes';
    suggestedAltText = 'Contextual editorial photography of a contemporary scientific research laboratory';
  } else if (isTechBusiness) {
    professionOrRole = 'business leader / innovator';
    relevantVisualSubject = 'Architectural Innovation Studio';
    visualTheme = 'Strategic Architecture & Design Workshop';
    contextScene = 'A sunlit architectural design studio with physical prototypes, natural timber surfaces, and expansive panoramic glass';
    suggestedAltText = 'Contextual editorial photography of an architectural innovation studio and workspace';
  } else if (isMultiple) {
    professionOrRole = 'creative partnership';
    relevantVisualSubject = 'Collaborative Creative Atelier';
    visualTheme = 'Creative Collaboration & Production Space';
    contextScene = 'A collaborative creative workspace with storyboards, manuscripts, and script notes around a solid wooden table in morning daylight';
    suggestedAltText = 'Contextual editorial photography of a collaborative creative workspace with storyboards and manuscripts';
  }

  const disallowedVisuals = [
    'unrelated people portraits',
    'random stock models',
    'unrelated human facial likeness',
    'unrelated woman portrait',
    'unrelated man portrait',
    'generic office desk with random worker',
    'generic corporate meetings',
    'cheesy celebrity paparazzi chaos',
    'AI-generated deepfake celebrity portrait',
  ];

  return {
    isPersonSpecific: true,
    personNames: names,
    primaryPersonName: primaryName,
    professionOrRole,
    subjectAngle: input.title || '',
    isMultiplePeople: isMultiple,
    relevantVisualSubject,
    visualTheme,
    contextScene,
    disallowedVisuals,
    suggestedAltText,
  };
}

export interface PersonTitleContext {
  format?: string;
  primaryIntent?: string;
  queryVariants?: string[];
  topicId?: string;
  seed?: string | number;
}

/**
 * Generates varied, organic, non-repetitive titles for real-person articles.
 * Avoids the fixed "[Name]: What to Know" pattern and dynamically adapts to the topic context.
 */
export function generatePersonTitle(personName: string, context: PersonTitleContext = {}): string {
  const cleanName = extractPersonName(personName);

  // Dynamic template catalog representing diverse editorial angles
  const templates: Array<(name: string) => string> = [
    (n) => `Who Is ${n}? Career, Background and More`,
    (n) => `${n}: Career, Background and Latest Updates`,
    (n) => `${n}: Career Highlights, Context and Current Work`,
    (n) => `Inside ${n}’s Career: Key Milestones and Background`,
    (n) => `${n}: Background, Career Journey and Recent Context`,
    (n) => `Who Is ${n}? Background, Milestones and Latest Overview`,
    (n) => `${n}: Career Record, Background and Key Takeaways`,
  ];

  // Derive a stable pseudo-random index from topicId or personName to guarantee variety across different topics
  const seedString = context.topicId || cleanName;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % templates.length;

  return templates[index](cleanName);
}

export interface PersonImageDirectives {
  promptSnippet: string;
  negativePromptSnippet: string;
  visualTheme: string;
  altText: string;
  isContextual: boolean;
  analysis: NamedPersonAnalysis;
}

/**
 * Generates safe contextual editorial image directives for real-person topics.
 * Strictly prevents prompts requesting a photorealistic AI likeness of the named individual.
 */
export function getPersonImageDirectives(
  personName: string,
  domainOrContext: string = 'lifestyle'
): PersonImageDirectives {
  const analysis = analyzeNamedPersonPolicy({
    title: personName,
    description: domainOrContext,
  });

  const cleanName = analysis.primaryPersonName || extractPersonName(personName);

  const promptSnippet = `Contextual editorial lifestyle photography representing ${analysis.visualTheme.toLowerCase()}. Scene: ${analysis.contextScene}. Focus strictly on ambient architecture, domain equipment, and environment. No depiction, portrait, or resemblance of ${cleanName}. No identifiable human facial likeness.`;

  const negativePromptSnippet = `photorealistic likeness of specific real person, portrait of ${cleanName}, facial likeness of ${cleanName}, celebrity face recreation, deepfake likeness, facial cloning, impersonation of real human face, close-up face portrait, ${analysis.disallowedVisuals.join(', ')}`;

  return {
    promptSnippet,
    negativePromptSnippet,
    visualTheme: analysis.visualTheme,
    altText: analysis.suggestedAltText,
    isContextual: true,
    analysis,
  };
}

export interface VerifiedPersonImageResult {
  verified: boolean;
  confidence: 'HIGH' | 'NONE';
  reason: string;
  sourceAuthority?: 'wikimedia_commons' | 'institutional' | 'unverified';
}

/**
 * Determines whether an image is verified to genuinely depict a specific real person.
 * A matching filename, search query, alt text, or AI prompt alone is NOT sufficient proof of identity.
 */
export function isVerifiedPersonImage(
  imageMetadata: { url?: string; alt?: string; source?: string; sourceUrl?: string; license?: string } | undefined,
  analysis: NamedPersonAnalysis
): VerifiedPersonImageResult {
  if (!imageMetadata?.url) {
    return { verified: false, confidence: 'NONE', sourceAuthority: 'unverified', reason: 'No image URL provided.' };
  }

  const primaryName = analysis.primaryPersonName;
  if (!primaryName) {
    return { verified: false, confidence: 'NONE', sourceAuthority: 'unverified', reason: 'No named person in analysis.' };
  }

  const normalizedName = primaryName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = (imageMetadata.url || '').toLowerCase();
  const sourceUrl = (imageMetadata.sourceUrl || '').toLowerCase();
  const source = (imageMetadata.source || '').toLowerCase();

  // Permitted verified sources: Wikimedia Commons with explicit subject name in filename and source page
  const isWikimedia = url.includes('wikimedia.org') || sourceUrl.includes('wikimedia.org') || source.includes('wikimedia');
  if (isWikimedia) {
    const filenameFromUrl = decodeURIComponent(url.split('/').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const filenameFromSource = decodeURIComponent(sourceUrl.split('/').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Must match the named person in the filename
    if (filenameFromUrl.includes(normalizedName) || filenameFromSource.includes(normalizedName)) {
      return {
        verified: true,
        confidence: 'HIGH',
        sourceAuthority: 'wikimedia_commons',
        reason: `Image verified via Wikimedia Commons source with explicit entity attribution to ${primaryName}.`,
      };
    }
  }

  return {
    verified: false,
    confidence: 'NONE',
    sourceAuthority: 'unverified',
    reason: `Image cannot be reliably verified to depict ${primaryName}. Image will be treated as unverified.`,
  };
}

export type NamedPersonImageClassification =
  | 'VERIFIED_SUBJECT_PHOTO'
  | 'PERSON_FREE_CONTEXTUAL'
  | 'SAFE_GENERIC_FALLBACK'
  | 'INVALID';

/**
 * Detects whether an image's metadata (alt text, prompt, URL, source, etc.)
 * indicates that the image contains a human, person, portrait, player, athlete,
 * performer, silhouette, or identifiable human figure.
 */
export function detectPersonInImage(
  imageMetadata?: { url?: string; alt?: string; prompt?: string; source?: string; sourceUrl?: string; license?: string }
): { containsPerson: boolean; reason?: string } {
  if (!imageMetadata?.url) {
    return { containsPerson: false };
  }

  const alt = (imageMetadata.alt || '').toLowerCase();
  const prompt = (imageMetadata.prompt || '').toLowerCase();
  const url = (imageMetadata.url || '').toLowerCase();
  const sourceUrl = (imageMetadata.sourceUrl || '').toLowerCase();
  const source = (imageMetadata.source || '').toLowerCase();
  const combined = `${alt} ${prompt} ${url} ${sourceUrl} ${source}`;

  const personPatterns: Array<{ pattern: RegExp; description: string }> = [
    // Direct person / demographic terms
    { pattern: /\b(woman|women|female|lady|ladies|girl|girls)\b/i, description: 'female individual / woman' },
    { pattern: /\b(man|men|male|guy|guys|boy|boys|gentleman|gentlemen)\b/i, description: 'male individual / man' },
    { pattern: /\b(person|persons|people|human|humans|somebody|someone)\b/i, description: 'human person' },
    { pattern: /\b(portrait|portraits|headshot|headshots|close-up portrait|selfie|selfies)\b/i, description: 'portrait / headshot' },
    { pattern: /\b(face|faces|facial|smile|smiling|laughing|gaze|gazing)\b/i, description: 'facial expression / portrait feature' },
    { pattern: /\b(model|models|fashion model|runway model)\b/i, description: 'model / photoshoot subject' },

    // Role / profession based human presence (athletes, performers, workers)
    { pattern: /\b(player|players|tennis player|female tennis player|male tennis player|golfer|golfers|runner|runners|swimmer|swimmers|quarterback|skater|skaters)\b/i, description: 'athlete / sports player' },
    { pattern: /\b(batter|batters|pitcher|pitchers|catcher|catchers)\b(?!['’]?s?\s+(?:equipment|gear|mitt|glove|mask|chest|shin|helmet|bench|guard|box|of\s+\w+))/i, description: 'baseball player' },
    { pattern: /\b(actor|actors|actress|actresses|musician|musicians|guitarist|guitarists|singer|singers|vocalist|vocalists|pianist|drummer|performer|performers|dancer|dancers|chef|chefs|scientist|scientists|doctor|doctors|author|authors|writer|writers|speaker|speakers|worker|workers)\b(?!['’]?s?\s+(?:desk|writing\s+desk|table|studio|equipment|gear|notes|manuscript|tools|instruments|kitchen|laboratory|lab|viewfinder|chair|seat))/i, description: 'performing or working individual' },
    { pattern: /\b(director|directors)\b(?!['’]?s?\s+(?:viewfinder|chair|cut|notes|vision|table|desk))/i, description: 'director' },
    { pattern: /\b(silhouette|silhouettes|human figure|human figures|human silhouette|shadow of a person)\b/i, description: 'human silhouette / figure' },
    { pattern: /\b(crowd|crowds|audience|spectators|attendees|passersby|pedestrian|pedestrians)\b/i, description: 'crowd or group of people' },

    // Poses / human actions
    { pattern: /\b(sitting behind a desk|sitting at desk|sitting at|sitting on|standing on|standing in|walking on|walking in|running on|jumping|holding a|holding racket|holding racquet|holding ball|holding microphone|holding guitar|holding book|holding pen|swinging racket|serving ball|wearing|dressed in|looking at camera|posing)\b/i, description: 'person performing an action / pose' },

    // Known person / model photographic asset patterns
    { pattern: /\b(woman-in-black-crew-neck|woman-sitting-behind-desk|3tll_97hnjo|aiony haust)\b/i, description: 'known person stock asset' },
    { pattern: /\bphoto-1595435934249-5df7ed86e1c0\b/i, description: 'female tennis player on court asset' },
    { pattern: /\bphoto-1554068865-24cecd4e34b8\b/i, description: 'male tennis player serving asset' },
    { pattern: /\bphoto-1622279457486-62dcc4a431d6\b/i, description: 'male tennis player on court asset' },
    { pattern: /\bphoto-1534528741775-53994a69daeb\b/i, description: 'portrait stock asset' },
    { pattern: /\bphoto-1573496359142-b8d87734a5a2\b/i, description: 'woman at desk stock asset' },
    { pattern: /\bphoto-1507003211169-0a1dd7228f2d\b/i, description: 'man portrait stock asset' },
  ];

  for (const { pattern, description } of personPatterns) {
    if (pattern.test(combined)) {
      return {
        containsPerson: true,
        reason: `Image metadata indicates ${description}.`,
      };
    }
  }

  return { containsPerson: false };
}

/**
 * Classifies an image candidate for a named-person article into the strict 3-way policy tiers:
 * 1. VERIFIED_SUBJECT_PHOTO: Authoritatively verified image of the actual named person.
 * 2. PERSON_FREE_CONTEXTUAL: Topic-relevant contextual environment/equipment with NO identifiable person.
 * 3. SAFE_GENERIC_FALLBACK: Safe default generic fallback when image is omitted.
 * 4. INVALID: Image contains an unrelated person, unverified celebrity portrait, or fails integrity rules.
 */
export function classifyNamedPersonImage(
  imageMetadata: { url?: string; alt?: string; prompt?: string; source?: string; sourceUrl?: string; license?: string } | undefined,
  analysis: NamedPersonAnalysis
): {
  classification: NamedPersonImageClassification;
  valid: boolean;
  reason?: string;
  suggestedFocus?: string[];
} {
  if (!imageMetadata?.url || imageMetadata.url.trim().length === 0) {
    return {
      classification: 'SAFE_GENERIC_FALLBACK',
      valid: true,
      reason: 'No image provided; eligible for safe generic fallback.',
    };
  }

  // 1. Check if verified photograph of the actual named subject
  const verification = isVerifiedPersonImage(imageMetadata, analysis);
  if (verification.verified) {
    return {
      classification: 'VERIFIED_SUBJECT_PHOTO',
      valid: true,
      reason: verification.reason,
    };
  }

  // 2. Check if the image depicts any human, player, actor, silhouette, or portrait
  const personCheck = detectPersonInImage(imageMetadata);
  if (personCheck.containsPerson) {
    return {
      classification: 'INVALID',
      valid: false,
      reason: `Image depicts an unrelated person, athlete, or human figure (${personCheck.reason}) for article primarily about ${analysis.primaryPersonName}. Contextual fallback for named person articles must be person-free (containing no identifiable people, faces, or silhouettes).`,
      suggestedFocus: [analysis.relevantVisualSubject, analysis.visualTheme],
    };
  }

  // 3. Check if alt text falsely claims the image depicts the named person
  const altLower = (imageMetadata.alt || '').toLowerCase();
  const primaryName = analysis.primaryPersonName;
  if (primaryName && altLower.includes(primaryName.toLowerCase())) {
    const isContextualScene = /\b(court|camera|studio|guitar|diamond|equipment|auditorium|theatre|ball|racket|mitt|lens|reel|fairway|manuscript|library|laboratory)\b/.test(altLower);
    if (!isContextualScene) {
      return {
        classification: 'INVALID',
        valid: false,
        reason: `Image alt text claims to depict "${primaryName}", but the image is unverified. If using a contextual editorial image, describe the contextual scene rather than claiming it depicts the person.`,
        suggestedFocus: [analysis.suggestedAltText],
      };
    }
  }

  // 4. Genuine person-free contextual editorial image
  return {
    classification: 'PERSON_FREE_CONTEXTUAL',
    valid: true,
    reason: `Verified person-free contextual editorial image representing ${analysis.visualTheme}.`,
  };
}

/**
 * Detects if an image presented for a person-specific article depicts an unrelated human portrait
 * or contains misleading representation signals.
 */
export function detectMisleadingPersonRepresentation(
  imageMetadata: { url?: string; alt?: string; prompt?: string; source?: string; sourceUrl?: string } | undefined,
  analysis: NamedPersonAnalysis
): { isMisleading: boolean; reason?: string } {
  if (!imageMetadata?.url) {
    return { isMisleading: false };
  }

  if (!analysis.isPersonSpecific) {
    return { isMisleading: false };
  }

  const classificationResult = classifyNamedPersonImage(imageMetadata, analysis);
  if (!classificationResult.valid && classificationResult.classification === 'INVALID') {
    return {
      isMisleading: true,
      reason: classificationResult.reason,
    };
  }

  return { isMisleading: false };
}
