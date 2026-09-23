import type { PillarSlug } from '../../config/site.ts';
import {
  PILLAR_IMAGE_STYLES,
  GLOBAL_IMAGE_GUIDELINES,
  EDITORIAL_ASPECT_RATIOS,
} from '../../config/images.ts';
import { isPersonTopic, getPersonImageDirectives } from './person-policy.ts';

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
  if (p === 'discover') return 'culture';
  if (p === 'now') return 'culture';
  const valid: PillarSlug[] = ['style', 'travel', 'food-drink', 'tech-ai', 'money', 'wellbeing', 'culture'];
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

  const keyConcepts: string[] = [];
  const relevantObjects: string[] = [];
  const relevantEnvironments: string[] = [];
  const visualMetaphors: string[] = [];
  const contextualAvoid: string[] = [];

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

    case 'culture': {
      keyConcepts.push('contemporary culture', 'architectural proportions', 'curated design', 'material craftsmanship');
      relevantObjects.push('sculptural design objects', 'curated art monographs', 'mid-century timber chair', 'linen-bound books', 'gallery installations');
      relevantEnvironments.push('sun-drenched modern art gallery', 'architectural library with natural skylights', 'minimalist design atelier');
      visualMetaphors.push('timeless restraint', 'museum aesthetic', 'cultural depth');
      contextualAvoid.push(
        'generic business stock photography',
        'unrelated street crowds',
        'commercial advertising banners',
        'cluttered retail spaces'
      );
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
 * and enforces category-aware negative constraints.
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
