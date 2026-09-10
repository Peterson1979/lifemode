import type { PillarSlug } from '../../config/site.ts';
import {
  PILLAR_IMAGE_STYLES,
  GLOBAL_IMAGE_GUIDELINES,
  EDITORIAL_ASPECT_RATIOS,
} from '../../config/images.ts';

export interface ImagePromptInput {
  title: string;
  description: string;
  pillar: PillarSlug | string;
  tags?: string[];
  format?: string;
  aspectRatio?: 'hero' | 'card' | 'socialStory' | 'socialSquare';
}

export interface EditorialImagePromptResult {
  prompt: string;
  negativePrompt: string;
  recommendedAspectRatio: string;
  altText: string;
  visualTheme: string;
}

/**
 * Extracts key visual concepts and themes from article title and description.
 */
function extractSubjectKeywords(title: string, description: string, tags: string[] = []): string {
  const cleanTitle = title
    .replace(/[^\w\s-]/g, '')
    .trim();

  const primaryTags = tags
    .filter((t) => !['editorial', 'standard', 'guide', 'article'].includes(t.toLowerCase()))
    .slice(0, 3)
    .join(', ');

  const contextSnippet = description
    ? description.split('.')[0]?.replace(/[^\w\s-]/g, '').trim()
    : '';

  const subjectParts = [cleanTitle];
  if (contextSnippet && contextSnippet.length > 10 && contextSnippet !== cleanTitle) {
    subjectParts.push(contextSnippet);
  }
  if (primaryTags) {
    subjectParts.push(primaryTags);
  }

  return subjectParts.join(' — ');
}

/**
 * Generates a structured editorial photography prompt for AI image generators (e.g. Imagen 3, Midjourney, Flux).
 *
 * Ensures realistic, high-end magazine aesthetics (Kinfolk, Cereal, Monocle, Wallpaper)
 * tailored to the LifeMode pillar visual identity.
 */
export function generateEditorialImagePrompt(
  input: ImagePromptInput
): EditorialImagePromptResult {
  const pillarKey = (input.pillar.toLowerCase() as PillarSlug);
  const pillarStyle = PILLAR_IMAGE_STYLES[pillarKey] || PILLAR_IMAGE_STYLES.life;
  const ratioKey = input.aspectRatio || 'hero';
  const recommendedAspectRatio = EDITORIAL_ASPECT_RATIOS[ratioKey] || EDITORIAL_ASPECT_RATIOS.hero;

  const subjectFocus = extractSubjectKeywords(input.title, input.description, input.tags);

  // Pick suitable visual motifs from pillar style
  const motifs = pillarStyle.visualMotifs.slice(0, 2).join(', ');

  // Compose the high-end editorial photography prompt
  const promptParts: string[] = [
    `Editorial photography for high-end lifestyle magazine LifeMode.`,
    `Subject: ${subjectFocus}.`,
    `Atmosphere & Theme: ${pillarStyle.theme}, ${pillarStyle.mood} mood.`,
    `Visual Elements: ${motifs}.`,
    `Lighting: ${pillarStyle.lighting}.`,
    `Camera & Composition: Shot on ${pillarStyle.cameraLens}, 35mm film grain texture, natural depth of field, authentic candid framing, generous negative space, warm organic color grading.`,
    `Aesthetic: Contemporary documentary lifestyle photography, warm neutral palette, tactile textures, completely realistic, no artificial digital artifacts.`,
  ];

  const fullPrompt = promptParts.join(' ');
  const negativePrompt = GLOBAL_IMAGE_GUIDELINES.negativePromptRules.join(', ');

  const altText = `${input.title} — editorial photography exploring ${pillarStyle.theme.toLowerCase()}`;

  return {
    prompt: fullPrompt,
    negativePrompt,
    recommendedAspectRatio,
    altText,
    visualTheme: pillarStyle.theme,
  };
}
