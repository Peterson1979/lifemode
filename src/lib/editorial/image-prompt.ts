import type { PillarSlug } from '../../config/site.ts';
import {
  PILLAR_IMAGE_STYLES,
  GLOBAL_IMAGE_GUIDELINES,
  EDITORIAL_ASPECT_RATIOS,
} from '../../config/images.ts';
import {
  isPersonTopic,
  getPersonImageDirectives,
  analyzeNamedPersonPolicy,
  classifyNamedPersonImage,
  type NamedPersonAnalysis,
  type NamedPersonImageClassification,
} from './person-policy.ts';

export interface ImagePromptInput {
  title: string;
  description: string;
  pillar: PillarSlug | string;
  tags?: string[];
  format?: string;
  aspectRatio?: 'hero' | 'card' | 'socialStory' | 'socialSquare';
}

export interface ArticleToImageBrief {
  articleTopic: string;
  editorialCategory: PillarSlug | string;
  primarySubject: string;
  keyConcepts: string[];
  relevantObjects: string[];
  relevantEnvironments: string[];
  visualMetaphors: string[];
  contextualAvoid: string[];
  avoidThings: string[];
  isPerson?: boolean;
  personAnalysis?: NamedPersonAnalysis;
}

export interface EditorialImagePromptResult {
  prompt: string;
  negativePrompt: string;
  recommendedAspectRatio: string;
  altText: string;
  visualTheme: string;
  brief?: ArticleToImageBrief;
}

/**
 * Normalizes input pillar to a valid PillarSlug.
 */
function normalizePillar(pillar: string): PillarSlug {
  const p = pillar.toLowerCase().trim();
  if (p === 'discover' || p === 'now' || p === 'culture') return 'entertainment';
  const valid: PillarSlug[] = ['style', 'travel', 'food-drink', 'tech-ai', 'money', 'wellbeing', 'entertainment'];
  return valid.includes(p as PillarSlug) ? (p as PillarSlug) : 'style';
}

/**
 * Cleans titles from formulaic boilerplate to identify the genuine primary subject.
 */
function extractCleanSubject(title: string): string {
  return title
    .replace(/:\s*(what to know|a modern guide.*|what you need to know.*|what changed.*)$/i, '')
    .replace(/^(how|why|inside|understanding|navigating|the craft of|the science of|the art of|the physiology of|the architecture of|building flavor with)\s+/i, '')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

/**
 * Builds a structured, context-aware Article-to-Image Brief.
 */
export function buildArticleToImageBrief(input: ImagePromptInput): ArticleToImageBrief {
  const category = normalizePillar(input.pillar);
  const cleanSubject = extractCleanSubject(input.title);
  const text = `${input.title} ${input.description || ''} ${(input.tags || []).join(' ')}`.toLowerCase();

  const isPerson = isPersonTopic({
    title: input.title,
    tags: input.tags,
  });

  const personAnalysis = isPerson
    ? analyzeNamedPersonPolicy({
        title: input.title,
        description: input.description,
        tags: input.tags,
        pillar: category,
      })
    : undefined;

  const keyConcepts: string[] = [];
  const relevantObjects: string[] = [];
  const relevantEnvironments: string[] = [];
  const visualMetaphors: string[] = [];
  const contextualAvoid: string[] = [];

  if (isPerson && personAnalysis) {
    keyConcepts.push(personAnalysis.visualTheme.toLowerCase(), `${personAnalysis.professionOrRole} craft`, personAnalysis.relevantVisualSubject.toLowerCase());
    relevantObjects.push(personAnalysis.relevantVisualSubject);
    relevantEnvironments.push(personAnalysis.contextScene);
    visualMetaphors.push('authentic craftsmanship', 'dedication to discipline', 'quiet excellence');
    contextualAvoid.push(
      'unrelated people portraits',
      'unrelated woman portrait',
      'unrelated man portrait',
      'random stock models',
      'generic office desk',
      'generic office workers',
      'unrelated models sitting at desks',
      'paparazzi flash chaos',
      'fake celebrity likeness'
    );

    return {
      articleTopic: input.title,
      editorialCategory: category,
      primarySubject: personAnalysis.primaryPersonName || cleanSubject || input.title,
      keyConcepts,
      relevantObjects,
      relevantEnvironments,
      visualMetaphors,
      contextualAvoid,
      avoidThings: contextualAvoid,
      isPerson: true,
      personAnalysis,
    };
  }

  switch (category) {
    case 'tech-ai': {
      const isAI = /\b(ai|model|llm|deepseek|gpt|neural|agent|transformer|inference|prompt|dataset)\b/.test(text);
      if (isAI) {
        keyConcepts.push('artificial intelligence', 'computational architecture', 'neural computation', 'developer workflow');
        relevantObjects.push('minimalist designer workstation', 'matte mechanical keyboard', 'dual monitor developer setup', 'clean code terminal', 'architectural hardware');
        relevantEnvironments.push('sunlit contemporary developer studio', 'quiet architectural office with natural oak desk', 'modern tech research workshop');
        visualMetaphors.push('structured mathematical elegance', 'clean tactile workspace without screen glare');
      } else {
        keyConcepts.push('software architecture', 'hardware engineering', 'digital tooling', 'system design');
        relevantObjects.push('clean modern hardware', 'bespoke workstation', 'technical notes and folio', 'precision peripherals');
        relevantEnvironments.push('minimalist creative workspace', 'architectural studio with soft ambient daylight');
        visualMetaphors.push('focus, intentional digital craftsmanship');
      }
      contextualAvoid.push(
        'random people on streets',
        'crowded sidewalks',
        'generic corporate businessmen',
        'generic office meetings',
        'unrelated lifestyle models',
        'generic travel scenes',
        'generic portraits',
        'futuristic neon cybernetic grids',
        '3D holograms'
      );
      break;
    }

    case 'food-drink': {
      keyConcepts.push('culinary craft', 'seasonal gastronomy', 'artisanal kitchen methods', 'ingredient integrity');
      relevantObjects.push('fresh organic produce', 'artisan ceramic bowl', 'weathered wood cutting board', 'copper cookware', 'linen kitchen towel');
      relevantEnvironments.push('warm sunlit rustic kitchen', 'artisanal food workshop', 'minimalist dining table with natural side daylight');
      visualMetaphors.push('tactile textures', 'culinary heritage', 'mindful dining');
      contextualAvoid.push(
        'unrelated people eating',
        'unrelated people',
        'generic fast food',
        'restaurant crowd',
        'generic sterile stainless steel kitchens',
        'fast food packaging',
        'artificial neon lighting',
        'duplicate generic food imagery',
        'messy commercial restaurant dining rooms'
      );
      break;
    }

    case 'travel': {
      keyConcepts.push('slow travel', 'authentic regional landscape', 'architectural heritage', 'solitary journeys');
      relevantObjects.push('vintage leather travel journal', 'slow passenger train window', 'bespoke boutique facade', 'local artisan craft');
      relevantEnvironments.push('atmospheric coastal cliffs', 'historic stone streets at golden hour', 'peaceful alpine trail', 'quiet boutique villa');
      visualMetaphors.push('wanderlust', 'spacious contemplative landscapes');
      contextualAvoid.push(
        'generic crowded airport',
        'unrelated tropical beach',
        'tourist buses',
        'crowded tourist queues',
        'generic airport terminals',
        'unrelated indoor models',
        'unrelated office spaces',
        'tour bus crowds',
        'stock travel selfies'
      );
      break;
    }

    case 'entertainment': {
      const isAstronomy = /\b(meteor|perseid|geminid|stargazing|astronomy|night sky|celestial|telescope|eclipse|comet|aurora|cosmos|space|shooting star)\b/.test(text);
      const isMusic = /\b(music|album|concert|song|musician|band|soundtrack|vinyl|acoustic|composer|singer)\b/.test(text);
      const isFilmTv = /\b(film|movie|cinema|actor|actress|director|television|series|hollywood|screenplay|streaming)\b/.test(text);

      if (isAstronomy) {
        keyConcepts.push('night-sky observation', 'celestial astronomy', 'meteor showers', 'stargazing in dark sky sanctuaries', 'atmospheric cosmos');
        relevantObjects.push('astronomy telescope', 'meteor streaks across starry night sky', 'star trails above mountain silhouette', 'field observation notebook', 'optical binoculars');
        relevantEnvironments.push('remote mountain observatory under deep star-filled sky', 'dark sky reserve terrace overlooking Milky Way', 'open meadow under midnight celestial canopy');
        visualMetaphors.push('cosmic scale', 'quiet wonder', 'clear pristine night atmosphere');
        contextualAvoid.push(
          'generic office desk',
          'hand holding pen',
          'office cubicle',
          'coffee cup on blank table',
          'daytime office meeting',
          'generic business suits',
          'unrelated indoor models',
          'shopping malls'
        );
      } else if (isMusic) {
        keyConcepts.push('musical artistry', 'sound composition', 'acoustic performance', 'live performance atmosphere');
        relevantObjects.push('vintage archtop acoustic guitar', 'analog audio mixing console', 'brass microphone in soft stage lighting', 'vinyl record on turntable');
        relevantEnvironments.push('sunlit music recording atelier', 'intimate historic acoustic hall', 'warm atmospheric sound studio');
        visualMetaphors.push('creative resonance', 'sound texture', 'timeless musical craft');
        contextualAvoid.push(
          'generic office desk',
          'hand holding pen',
          'low-res concert crowd phone screens',
          'garish club strobe lights'
        );
      } else if (isFilmTv) {
        keyConcepts.push('cinema and screen culture', 'filmmaking craft', 'cinematic storytelling', 'directing and acting');
        relevantObjects.push('35mm cinema camera', 'director viewfinder', 'archival film canister', 'theatrical script with handwritten notes', 'clapperboard');
        relevantEnvironments.push('atmospheric film screening room', 'intimate cinema projection booth', 'cinematic soundstage with soft tungsten lighting');
        visualMetaphors.push('cinematic mood', 'creative depth', 'timeless visual storytelling');
        contextualAvoid.push(
          'generic office desk',
          'hand holding pen',
          'generic paparazzi flash chaos',
          'low-res tabloid screenshots'
        );
      } else {
        keyConcepts.push('contemporary entertainment', 'cultural storytelling', 'celebrity profiles and interviews', 'creative arts');
        relevantObjects.push('curated cultural monograph', 'editorial portraiture camera', 'acoustic instrument', 'theatrical script folio');
        relevantEnvironments.push('sunlit green room atelier', 'historic theatre balcony', 'intimate portraiture studio', 'atmospheric screening lounge');
        visualMetaphors.push('cultural resonance', 'timeless storytelling', 'editorial intimacy');
        contextualAvoid.push(
          'generic office desk with pen',
          'generic paparazzi flash chaos',
          'low-res tabloid screenshots',
          'tacky red-carpet logos',
          'commercial billboard clutter'
        );
      }
      break;
    }

    case 'money': {
      keyConcepts.push('strategic clarity', 'financial autonomy', 'long-term allocation', 'disciplined wealth');
      relevantObjects.push('bespoke leather folio', 'fountain pen and analytical ledger', 'architectural desk lamp', 'financial journal');
      relevantEnvironments.push('quiet modern library corner', 'architectural study overlooking dawn skyline', 'refined executive studio');
      visualMetaphors.push('calm strategic perspective', 'grounded discernment');
      contextualAvoid.push(
        'stacks of cash',
        'flying dollar bills',
        'cheesy crypto graphics',
        'piles of cash',
        'gold coins',
        'stock market green/red arrows',
        'generic corporate handshakes',
        'flashy luxury clichés',
        'unrelated party scenes'
      );
      break;
    }

    case 'wellbeing': {
      keyConcepts.push('evidence-based health', 'vitality', 'restorative stillness', 'circadian mindfulness');
      relevantObjects.push('handmade ceramic tea bowl', 'crisp linen bedding', 'botanical greenery', 'meditation cushion');
      relevantEnvironments.push('sunlit morning room', 'tranquil garden pavilion', 'natural reflecting pool', 'quiet peaceful cedar terrace');
      visualMetaphors.push('serenity', 'restoration', 'organic vitality');
      contextualAvoid.push(
        'clinical hospital equipment',
        'pill bottles',
        'stressful gym workouts',
        'crowded city noise',
        'unrelated commercial models'
      );
      break;
    }

    case 'style': {
      const isBeauty = /\b(beauty|skincare|makeup|cosmetics|serum|hair|haircare|fragrance|perfume|routine|dermatology|moisturizer|cleanser|lipstick|scent)\b/.test(text);
      if (isBeauty) {
        keyConcepts.push('beauty rituals', 'skincare formulations', 'fragrance notes', 'clean cosmetic aesthetics', 'hair texture and care');
        relevantObjects.push('amber glass dropper flacons', 'minimalist ceramic vanity tray', 'textured cream formulations', 'sculptural perfume flacon', 'soft cosmetic brushes', 'botanical facial oils');
        relevantEnvironments.push('sunlit minimalist bathroom vanity', 'warm marble dressing table with morning daylight', 'botanical skincare studio');
        visualMetaphors.push('luminous skin texture', 'tactile organic ingredients', 'clean thoughtful self-care');
      } else {
        keyConcepts.push('contemporary personal style', 'capsule wardrobe curation', 'tailored silhouette', 'textile craftsmanship', 'essential accessories');
        relevantObjects.push('tactile linen tailoring', 'leather strap timepiece', 'curated outerwear', 'fine wool knitwear', 'minimalist leather tote');
        relevantEnvironments.push('sunlit contemporary wardrobe room', 'architectural boutique fitting studio', 'candid city street at golden hour');
        visualMetaphors.push('effortless elegance', 'tactile material quality', 'individual expression');
      }
      contextualAvoid.push(
        'overly photoshopped commercial cosmetic ads',
        'harsh flash runway models',
        'generic supermarket beauty aisles',
        'unrelated corporate offices',
        'garish neon clothing',
        'plastic-looking synthetic skin retouching',
        'celebrity impersonation / fake likenesses'
      );
      break;
    }

    default: {
      keyConcepts.push('contemporary aesthetic', 'material craft', 'calm focus', 'curated lifestyle');
      relevantObjects.push('tactile design objects', 'ceramic vessels', 'natural wood surfaces', 'minimalist accessories');
      relevantEnvironments.push('sunlit architectural interior', 'creative design studio', 'decluttered minimalist space');
      visualMetaphors.push('balance, restraint, warm tactile presence');
      contextualAvoid.push(
        'cluttered disordered spaces',
        'generic office cubicles',
        'unrelated street crowds',
        'artificial digital graphics'
      );
      break;
    }
  }

  return {
    articleTopic: input.title,
    editorialCategory: category,
    primarySubject: cleanSubject || input.title,
    keyConcepts,
    relevantObjects,
    relevantEnvironments,
    visualMetaphors,
    contextualAvoid,
    avoidThings: contextualAvoid,
  };
}

/**
 * Generates a structured editorial photography prompt for AI image generators (e.g. FLUX, Imagen 3).
 *
 * Employs a structured Article-to-Image brief to guarantee subject-specific relevance
 * and enforces category-aware negative constraints and Named Person Image Policy.
 */
export function generateEditorialImagePrompt(
  input: ImagePromptInput
): EditorialImagePromptResult {
  const brief = buildArticleToImageBrief(input);
  const pillarStyle = PILLAR_IMAGE_STYLES[brief.editorialCategory as PillarSlug] || PILLAR_IMAGE_STYLES.style;
  const ratioKey = input.aspectRatio || 'hero';
  const recommendedAspectRatio = EDITORIAL_ASPECT_RATIOS[ratioKey] || EDITORIAL_ASPECT_RATIOS.hero;

  const isPerson = isPersonTopic({
    title: input.title,
    tags: input.tags,
  });

  if (isPerson) {
    const contextHints = [brief.editorialCategory, ...(input.tags || []), input.title, input.description || ''].join(' ');
    const personDirectives = getPersonImageDirectives(input.title, contextHints);

    const promptParts: string[] = [
      `Editorial photography for high-end lifestyle magazine LifeMode.`,
      `Subject Focus: ${personDirectives.promptSnippet}.`,
      `Context & Category: ${pillarStyle.theme}.`,
      `Atmosphere: ${pillarStyle.mood} mood, ${pillarStyle.lighting}.`,
      `Composition: Shot on ${pillarStyle.cameraLens}, 35mm film grain texture, natural depth of field, authentic candid framing, generous negative space.`,
      `Aesthetic: Contemporary documentary lifestyle photography, warm neutral palette, tactile textures, completely realistic, no artificial digital artifacts. Do not depict or impersonate any specific real person.`,
    ];

    const fullPrompt = promptParts.join(' ');
    const negativePrompt = [
      ...GLOBAL_IMAGE_GUIDELINES.negativePromptRules,
      ...brief.contextualAvoid,
      personDirectives.negativePromptSnippet,
    ].join(', ');

    return {
      prompt: fullPrompt,
      negativePrompt,
      recommendedAspectRatio,
      altText: personDirectives.altText,
      visualTheme: personDirectives.visualTheme,
      brief,
    };
  }

  // Compose prompt from structured brief
  const promptParts: string[] = [
    `Editorial photography for high-end lifestyle magazine LifeMode.`,
    `Subject: ${brief.primarySubject}.`,
    `Visual Focus: ${brief.keyConcepts.slice(0, 3).join(', ')}.`,
    `Setting & Environment: ${brief.relevantEnvironments[0] || pillarStyle.exampleScenes[0]}.`,
    `Key Elements: ${brief.relevantObjects.slice(0, 3).join(', ')}.`,
    `Lighting: ${pillarStyle.lighting}.`,
    `Camera & Composition: Shot on ${pillarStyle.cameraLens}, natural 35mm film grain texture, natural depth of field, authentic candid framing, generous negative space, warm organic color grading.`,
    `Aesthetic: Contemporary documentary lifestyle photography, warm neutral palette, tactile organic textures, completely realistic, no artificial CGI or video game graphics.`,
  ];

  const fullPrompt = promptParts.join(' ');
  const negativePrompt = [
    ...GLOBAL_IMAGE_GUIDELINES.negativePromptRules,
    ...brief.contextualAvoid,
  ].join(', ');

  const altText = `${input.title} — editorial photography exploring ${pillarStyle.theme.toLowerCase()}`;

  return {
    prompt: fullPrompt,
    negativePrompt,
    recommendedAspectRatio,
    altText,
    visualTheme: pillarStyle.theme,
    brief,
  };
}

export interface SemanticImageValidationResult {
  valid: boolean;
  score: number;
  reason?: string;
  suggestedFocus?: string[];
  priorityLevel?: 'PRIORITY_1_VERIFIED_PERSON' | 'PRIORITY_2_CONTEXTUAL' | 'PRIORITY_3_GENERATED' | 'PRIORITY_4_SAFE_FALLBACK' | 'INVALID';
  namedPersonClassification?: NamedPersonImageClassification;
  isPersonSpecific?: boolean;
}

export interface ImageValidationOptions {
  title: string;
  pillar?: string;
  tags?: string[];
  topicId?: string;
  isPerson?: boolean;
  imageMetadata?: {
    url?: string;
    alt?: string;
    prompt?: string;
    source?: string;
    sourceUrl?: string;
    license?: string;
  };
}

/**
 * Validates that an article's hero image satisfies:
 * 1. Topic Relevance (matches the article's actual subject matter)
 * 2. Named Person Image Policy & Representation Integrity (never substitutes an unrelated person)
 * 3. Identity Integrity (does not falsely claim an unverified image or contextual scene depicts a person)
 * 4. Contextual Fallback Integrity (contextual fallbacks for named persons must be strictly person-free)
 * 5. Metadata Integrity (accurate alt text and description)
 */
export function validateImageSemanticRelevance(
  title: string,
  pillar: string,
  imageMetadata?: { url?: string; alt?: string; prompt?: string; source?: string; sourceUrl?: string; license?: string },
  options: { tags?: string[]; isPerson?: boolean; topicId?: string } = {}
): SemanticImageValidationResult {
  if (!imageMetadata?.url || imageMetadata.url.trim().length === 0) {
    return { valid: true, score: 100, priorityLevel: 'PRIORITY_4_SAFE_FALLBACK', namedPersonClassification: 'SAFE_GENERIC_FALLBACK' };
  }

  const isPerson = options.isPerson ?? isPersonTopic({
    title,
    tags: options.tags,
    topicId: options.topicId,
  });

  const titleLower = title.toLowerCase();
  const altLower = (imageMetadata.alt || '').toLowerCase();
  const promptLower = (imageMetadata.prompt || '').toLowerCase();
  const urlLower = imageMetadata.url.toLowerCase();
  const sourceUrlLower = (imageMetadata.sourceUrl || '').toLowerCase();
  const sourceLower = (imageMetadata.source || '').toLowerCase();
  const imageSignals = `${altLower} ${promptLower} ${urlLower} ${sourceUrlLower} ${sourceLower}`;

  // -------------------------------------------------------------------
  // A. NAMED PERSON IMAGE POLICY & INTEGRITY VALIDATION
  // -------------------------------------------------------------------
  if (isPerson) {
    const analysis = analyzeNamedPersonPolicy({
      title,
      tags: options.tags,
      topicId: options.topicId,
      pillar,
    });

    // 1. Run strict Named Person Image Classification
    const classResult = classifyNamedPersonImage(imageMetadata, analysis);
    if (!classResult.valid || classResult.classification === 'INVALID') {
      return {
        valid: false,
        score: 10,
        reason: classResult.reason || `Image depicts an unrelated person or unverified portrait for article primarily about ${analysis.primaryPersonName}. Named Person Image Policy strictly prohibits using unrelated people or generic human models as contextual fallbacks; contextual fallback must be person-free.`,
        suggestedFocus: classResult.suggestedFocus || [analysis.relevantVisualSubject, analysis.visualTheme],
        priorityLevel: 'INVALID',
        namedPersonClassification: 'INVALID',
        isPersonSpecific: true,
      };
    }

    if (classResult.classification === 'VERIFIED_SUBJECT_PHOTO') {
      return {
        valid: true,
        score: 100,
        priorityLevel: 'PRIORITY_1_VERIFIED_PERSON',
        namedPersonClassification: 'VERIFIED_SUBJECT_PHOTO',
        isPersonSpecific: true,
      };
    }

    // 2. Discipline-specific topic relevance for PERSON_FREE_CONTEXTUAL fallback
    // 2a. Tennis (e.g. Alexandra Eala)
    if (analysis.professionOrRole.includes('tennis')) {
      const hasIrrelevantOfficeSignals = /\b(desk|pen|hand holding|writing note|laptop keyboard|office meeting|coffee cup|business suit|shopping|bedroom|sink)\b/.test(imageSignals);
      const hasTennisSignals = /\b(tennis|court|racket|racquet|net|ball|hard-court|hardcourt|stadium|wta|atp|slam|serve|baseline)\b/.test(imageSignals);

      if (hasIrrelevantOfficeSignals && !hasTennisSignals) {
        return {
          valid: false,
          score: 20,
          reason: `Image content ("${imageMetadata.alt || imageMetadata.prompt || 'generic desk/office image'}") is editorially irrelevant to tennis article "${title}". Expected tennis court, hard-court surface, net, or tennis equipment without people.`,
          suggestedFocus: ['hard-court tennis court', 'tennis net and ball', 'professional tournament setting'],
          priorityLevel: 'INVALID',
          namedPersonClassification: 'INVALID',
          isPersonSpecific: true,
        };
      }
    }

    // 2b. Screen Actor / Cinema (e.g. Cillian Murphy)
    if (analysis.professionOrRole.includes('actor') || analysis.professionOrRole.includes('film')) {
      const hasIrrelevantOfficeSignals = /\b(desk|pen|hand holding|writing note|laptop keyboard|office meeting|office cubicle|business meeting|cash|crypto|server rack|beauty salon)\b/.test(imageSignals);
      const hasCinemaSignals = /\b(cinema|film|camera|auditorium|theatre|movie|screen|projector|soundstage|stage|studio|35mm|lighting|actor)\b/.test(imageSignals);

      if (hasIrrelevantOfficeSignals && !hasCinemaSignals) {
        return {
          valid: false,
          score: 20,
          reason: `Image content is editorially irrelevant to cinematic actor article "${title}". Expected 35mm cinema camera, film set lighting, or cinema auditorium without people.`,
          suggestedFocus: ['cinema camera', 'film production set', 'cinema auditorium'],
          priorityLevel: 'INVALID',
          namedPersonClassification: 'INVALID',
          isPersonSpecific: true,
        };
      }
    }

    // 2c. Baseball (e.g. Jose Trevino)
    if (analysis.professionOrRole.includes('baseball')) {
      const hasIrrelevantOfficeSignals = /\b(desk|pen|hand holding|writing note|laptop keyboard|office meeting|office cubicle|business meeting|kitchen|makeup|perfume)\b/.test(imageSignals);
      const hasBaseballSignals = /\b(baseball|diamond|dugout|catcher|mitt|glove|stadium|field|bat|mlb)\b/.test(imageSignals);

      if (hasIrrelevantOfficeSignals && !hasBaseballSignals) {
        return {
          valid: false,
          score: 20,
          reason: `Image content is editorially irrelevant to baseball player article "${title}". Expected baseball diamond, catcher equipment, or stadium setting without people.`,
          suggestedFocus: ['baseball diamond', 'catcher equipment and mitt', 'stadium dugout'],
          priorityLevel: 'INVALID',
          namedPersonClassification: 'INVALID',
          isPersonSpecific: true,
        };
      }
    }

    return {
      valid: true,
      score: 100,
      priorityLevel: 'PRIORITY_2_CONTEXTUAL',
      namedPersonClassification: 'PERSON_FREE_CONTEXTUAL',
      isPersonSpecific: true,
    };
  }

  // -------------------------------------------------------------------
  // B. GENERAL NON-PERSON ARTICLE VALIDATION
  // -------------------------------------------------------------------

  // 1. Celestial / Astronomy topics (meteors, stars, telescopes, night sky, eclipses)
  const isAstronomyTopic = /\b(meteor|perseid|geminid|stargazing|astronomy|night sky|celestial|telescope|eclipse|comet|aurora|cosmos|shooting star)\b/.test(titleLower);
  if (isAstronomyTopic) {
    const hasIrrelevantOfficeSignals = /\b(desk|pen|hand holding|writing note|laptop keyboard|office meeting|coffee cup|business suit|shopping)\b/.test(imageSignals);
    const hasNightSkySignals = /\b(sky|star|meteor|night|space|celestial|galaxy|astronomy|telescope|constellation|mountain|aurora|milky way|dark)\b/.test(imageSignals);

    if (hasIrrelevantOfficeSignals && !hasNightSkySignals) {
      return {
        valid: false,
        score: 20,
        reason: `Image content ("${imageMetadata.alt || imageMetadata.prompt || 'generic desk/pen image'}") is editorially irrelevant to astronomy/night sky topic "${title}". Expected night sky, stars, or celestial observation imagery.`,
        suggestedFocus: ['meteor showers', 'night sky / stars', 'astronomy observation', 'telescope / stargazing'],
      };
    }
  }

  // 2. Culinary / Food & Drink topics
  const isFoodTopic = /\b(sourdough|fermentation|recipe|cooking|olive oil|wine|baking|culinary|chef|ingredients|dining)\b/.test(titleLower);
  if (isFoodTopic) {
    const hasIrrelevantTechSignals = /\b(circuit board|skyscraper|cryptocurrency|server rack|highway|airport|car engine)\b/.test(imageSignals);
    if (hasIrrelevantTechSignals) {
      return {
        valid: false,
        score: 30,
        reason: `Image content is editorially irrelevant to culinary topic "${title}". Expected food, ingredients, or artisan kitchen imagery.`,
        suggestedFocus: ['artisan kitchen', 'culinary ingredients', 'table setting'],
      };
    }
  }

  // 3. Style & Beauty topics (skincare, beauty, hair, tailoring)
  const isBeautyTopic = /\b(skincare|retinoid|serum|ceramide|moisturizer|haircare|fragrance|perfume|makeup)\b/.test(titleLower);
  if (isBeautyTopic) {
    const hasIrrelevantIndustrialSignals = /\b(bulldozer|heavy machinery|airplane cockpit|freeway traffic|cargo ship)\b/.test(imageSignals);
    if (hasIrrelevantIndustrialSignals) {
      return {
        valid: false,
        score: 30,
        reason: `Image content is editorially irrelevant to beauty/skincare topic "${title}". Expected skincare, vanity, or beauty formulation imagery.`,
        suggestedFocus: ['amber glass flacons', 'minimalist vanity', 'botanical skincare texture'],
      };
    }
  }

  // 4. Tech & AI topics
  const isTechTopic = /\b(ai|deepseek|model|quantization|workstation|hardware setup|developer)\b/.test(titleLower);
  if (isTechTopic) {
    const hasIrrelevantLifestyleSignals = /\b(crowded street|pedestrian crosswalk|beach sunset|shopping mall)\b/.test(imageSignals);
    const hasTechSignals = /\b(workstation|keyboard|hardware|terminal|studio|desk|laptop|developer|interface|code)\b/.test(imageSignals);
    if (hasIrrelevantLifestyleSignals && !hasTechSignals) {
      return {
        valid: false,
        score: 30,
        reason: `Image content is editorially irrelevant to technology topic "${title}". Expected clean hardware, workstation, or developer studio setting.`,
        suggestedFocus: ['designer workstation', 'mechanical keyboard', 'developer studio'],
      };
    }
  }

  // 5. Money topics
  const isMoneyTopic = /\b(treasury|yield curve|cash buffer|wealth|sovereign notes|investing)\b/.test(titleLower);
  if (isMoneyTopic) {
    const hasIrrelevantCheesySignals = /\b(flying money|dollar bills falling|gold coins pile|crypto rocket)\b/.test(imageSignals);
    if (hasIrrelevantCheesySignals) {
      return {
        valid: false,
        score: 30,
        reason: `Image content contains clichés irrelevant to strategic money topic "${title}". Expected refined library, architectural study, or leather folio.`,
        suggestedFocus: ['modern architectural library', 'bespoke leather folio', 'analytical notebook'],
      };
    }
  }

  return { valid: true, score: 100 };
}
