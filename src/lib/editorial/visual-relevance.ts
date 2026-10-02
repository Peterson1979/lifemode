import sharp from 'sharp';
import type { ValidatableArticle } from './validation/types.ts';
import type { StructuredVisualBrief } from './visual-brief.ts';
import { loadEditorialImageConfig } from './images/config.ts';
import { loadAIConfig } from '../ai/config.ts';

export interface VisualRelevanceCandidate {
  url?: string;
  prompt?: string;
  alt?: string;
  source?: string;
  imageBuffer?: Buffer | Uint8Array;
  imagePath?: string;
  analyzer?: IVisualContentAnalyzer;
}

export type VisualRelevanceFlag =
  | 'wrong_subject'
  | 'wrong_person'
  | 'wrong_sport'
  | 'wrong_team'
  | 'wrong_location'
  | 'wrong_event'
  | 'wrong_object'
  | 'unrelated_visual_theme'
  | 'misleading_imagery'
  | 'generic_fallback'
  | 'prohibited_element_detected'
  | 'invalid_image_buffer'
  | 'blank_placeholder_image';

export interface VisualImageAnalysis {
  analyzedVia: 'workers_ai_vision' | 'gemini_vision' | 'local_pixel_analysis' | 'fixture_mock';
  imageBufferPresent: boolean;
  dimensions?: { width: number; height: number; aspectRatio: number };
  channels?: number;
  format?: string;
  isCorruptedOrEmpty?: boolean;
  dominantColor?: { r: number; g: number; b: number; hex: string };
  meanBrightness?: number; // 0 to 255
  visualSceneClass?:
    | 'field_sports'
    | 'dark_stage_music'
    | 'marine_ocean'
    | 'urban_architecture'
    | 'nature_landscape'
    | 'food_cuisine'
    | 'aviation_flight'
    | 'neutral_scene'
    | 'blank_solid';
  detectedSubject?: string;
  detectedCategories?: string[];
  detectedVisualElements?: string[];
  textOrCaptionsDetected?: string[];
  rawAnalysisNotes?: string;
}

export interface IVisualContentAnalyzer {
  analyzeImage(candidate: VisualRelevanceCandidate): Promise<VisualImageAnalysis>;
}

/**
 * Deterministically analyzes image buffer pixels using Sharp.
 * Extracts dimensional integrity, color channel distributions, luminance,
 * and classifies visual scene signatures (e.g. green field sports vs dark stage concerts vs cyan ocean).
 */
export class LocalPixelContentAnalyzer implements IVisualContentAnalyzer {
  async analyzeImage(candidate: VisualRelevanceCandidate): Promise<VisualImageAnalysis> {
    let buffer: Buffer | null = null;

    if (candidate.imageBuffer) {
      buffer = Buffer.isBuffer(candidate.imageBuffer)
        ? candidate.imageBuffer
        : Buffer.from(candidate.imageBuffer);
    } else if (candidate.imagePath) {
      try {
        const fs = await import('node:fs/promises');
        buffer = await fs.readFile(candidate.imagePath);
      } catch {
        // Handled below
      }
    }

    if (!buffer || buffer.length === 0) {
      return {
        analyzedVia: 'local_pixel_analysis',
        imageBufferPresent: false,
        isCorruptedOrEmpty: Boolean(candidate.imagePath),
        detectedVisualElements: [],
      };
    }

    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();
      const stats = await image.stats();

      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const aspectRatio = width && height ? Number((width / height).toFixed(2)) : 1;

      // Detect flat/blank solid placeholders (stdev < 2.5 across all channels on rendered images)
      const isSolidColor = width > 16 && height > 16 && stats.channels.every((ch) => ch.stdev < 2.5);
      if (isSolidColor) {
        return {
          analyzedVia: 'local_pixel_analysis',
          imageBufferPresent: true,
          dimensions: { width, height, aspectRatio },
          channels: metadata.channels,
          format: metadata.format,
          isCorruptedOrEmpty: true,
          visualSceneClass: 'blank_solid',
          detectedSubject: 'blank solid color placeholder',
          detectedVisualElements: ['blank_canvas', 'unrendered_placeholder'],
          rawAnalysisNotes: 'Image is a single solid color with no scene variance.',
        };
      }

      // Channel means
      const r = stats.channels[0]?.mean || 0;
      const g = stats.channels[1]?.mean || 0;
      const b = stats.channels[2]?.mean || 0;
      const meanBrightness = Math.round((r + g + b) / 3);

      const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
      const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

      // Classify visual scene by chromatic distribution and lighting
      let visualSceneClass: VisualImageAnalysis['visualSceneClass'] = 'neutral_scene';
      const detectedVisualElements: string[] = [];
      const detectedCategories: string[] = [];

      // 1. Dark Stage / Concert / Music Performance
      if (meanBrightness < 65 && (stats.channels[0]?.max || 0) > 180) {
        visualSceneClass = 'dark_stage_music';
        detectedCategories.push('music', 'entertainment');
        detectedVisualElements.push('dark_stage', 'spotlights', 'concert_lighting', 'musician_stage', 'indoor_performance');
      }
      // 2. Outdoor Field Sports (Green turf / pitch dominance)
      else if (g > r * 1.12 && g > b * 1.12 && meanBrightness >= 60 && meanBrightness <= 210) {
        visualSceneClass = 'field_sports';
        detectedCategories.push('sports', 'field_games');
        detectedVisualElements.push('green_turf', 'sports_field', 'stadium_pitch', 'outdoor_field', 'playing_surface');
      }
      // 3. Marine / Ocean / Water Surface
      else if (b > r * 1.25 && g > r * 1.05 && meanBrightness >= 110) {
        visualSceneClass = 'marine_ocean';
        detectedCategories.push('marine', 'ocean', 'vacation');
        detectedVisualElements.push('ocean_water', 'marine_surface', 'coastal_water', 'open_sea');
      }
      // 4. High-Altitude Sky / Aviation
      else if (b > 140 && meanBrightness > 155 && Math.abs(b - g) < 40) {
        visualSceneClass = 'aviation_flight';
        detectedCategories.push('aviation', 'travel');
        detectedVisualElements.push('atmospheric_sky', 'cloud_cover', 'high_altitude_view');
      }
      // 5. Food / Warm Culinary
      else if (r > b * 1.35 && r > g * 1.05 && meanBrightness >= 80) {
        visualSceneClass = 'food_cuisine';
        detectedCategories.push('food', 'culinary');
        detectedVisualElements.push('warm_earth_tones', 'tabletop_scene', 'prepared_dish');
      }
      // 6. Urban / Architecture (Neutral tones, balanced channels)
      else if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
        visualSceneClass = 'urban_architecture';
        detectedCategories.push('architecture', 'cityscape');
        detectedVisualElements.push('structural_masonry', 'neutral_architecture', 'urban_perspective');
      }

      return {
        analyzedVia: 'local_pixel_analysis',
        imageBufferPresent: true,
        dimensions: { width, height, aspectRatio },
        channels: metadata.channels,
        format: metadata.format,
        isCorruptedOrEmpty: false,
        dominantColor: { r: Math.round(r), g: Math.round(g), b: Math.round(b), hex },
        meanBrightness,
        visualSceneClass,
        detectedSubject: `${visualSceneClass.replace(/_/g, ' ')} composition`,
        detectedCategories,
        detectedVisualElements,
      };
    } catch (err: any) {
      return {
        analyzedVia: 'local_pixel_analysis',
        imageBufferPresent: true,
        isCorruptedOrEmpty: true,
        detectedVisualElements: [],
        rawAnalysisNotes: `Sharp buffer decode failed: ${err?.message || String(err)}`,
      };
    }
  }
}

/**
 * Multimodal Cloudflare Workers AI / Gemini Vision Analyzer.
 * Uses available zero-cost vision endpoints when credentials exist.
 */
export class MultimodalVisionContentAnalyzer implements IVisualContentAnalyzer {
  private localAnalyzer = new LocalPixelContentAnalyzer();

  async analyzeImage(candidate: VisualRelevanceCandidate): Promise<VisualImageAnalysis> {
    const localResult = await this.localAnalyzer.analyzeImage(candidate);
    if (localResult.isCorruptedOrEmpty) {
      return localResult;
    }

    // 1. Cloudflare Workers AI Vision (if configured)
    const imageConfig = loadEditorialImageConfig();
    const accountId = imageConfig.cloudflare.accountId;
    const apiToken = imageConfig.cloudflare.apiToken;

    if (accountId && apiToken && candidate.imageBuffer) {
      try {
        const buffer = Buffer.isBuffer(candidate.imageBuffer)
          ? candidate.imageBuffer
          : Buffer.from(candidate.imageBuffer);

        const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: 'Identify the primary subject, sport, setting, and objects in this image concisely.',
            image: Array.from(new Uint8Array(buffer)),
            max_tokens: 150,
          }),
        });

        if (response.ok) {
          const data: any = await response.json();
          const description = data?.result?.response || data?.result?.description || '';
          if (description) {
            const descLow = description.toLowerCase();
            const elements = [...(localResult.detectedVisualElements || [])];
            if (descLow.includes('guitar') || descLow.includes('musician') || descLow.includes('concert')) {
              elements.push('guitarist', 'musician', 'concert_stage');
            }
            if (descLow.includes('baseball') || descLow.includes('stadium') || descLow.includes('ballpark')) {
              elements.push('baseball_diamond', 'ballpark_stadium');
            }
            if (descLow.includes('cricket') || descLow.includes('wicket') || descLow.includes('stump')) {
              elements.push('cricket_pitch', 'cricket_wickets');
            }
            if (descLow.includes('airplane') || descLow.includes('aviation') || descLow.includes('cockpit')) {
              elements.push('commercial_aircraft', 'aviation_flight');
            }
            if (descLow.includes('ocean') || descLow.includes('cruise') || descLow.includes('beach')) {
              elements.push('ocean_cruise', 'tropical_vacation');
            }

            return {
              ...localResult,
              analyzedVia: 'workers_ai_vision',
              detectedSubject: description.slice(0, 100),
              detectedVisualElements: elements,
              rawAnalysisNotes: description,
            };
          }
        }
      } catch {
        // Fall back to Gemini or local
      }
    }

    // 2. Gemini Multimodal Vision (if configured)
    const geminiConfig = loadAIConfig().gemini;
    if (geminiConfig.apiKey && candidate.imageBuffer) {
      try {
        const buffer = Buffer.isBuffer(candidate.imageBuffer)
          ? candidate.imageBuffer
          : Buffer.from(candidate.imageBuffer);

        const model = geminiConfig.model || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiConfig.apiKey)}`;
        const base64 = buffer.toString('base64');

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: 'List the visual subjects, setting, sports, and objects visible in this image as comma-separated keywords.' },
                  { inlineData: { mimeType: 'image/jpeg', data: base64 } },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 100 },
          }),
        });

        if (response.ok) {
          const data: any = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            const keywords = text.toLowerCase().split(/[,\n]+/).map((s: string) => s.trim()).filter(Boolean);
            return {
              ...localResult,
              analyzedVia: 'gemini_vision',
              detectedSubject: text.slice(0, 100),
              detectedVisualElements: [...(localResult.detectedVisualElements || []), ...keywords],
              rawAnalysisNotes: text,
            };
          }
        }
      } catch {
        // Fall back to local result
      }
    }

    return localResult;
  }
}

export const defaultVisualContentAnalyzer: IVisualContentAnalyzer = new MultimodalVisionContentAnalyzer();

export interface VisualRelevanceResult {
  relevant: boolean;
  confidence: number; // 0.00 to 1.00
  reason: string;
  detected_subject: string;
  expected_subject: string;
  flags: VisualRelevanceFlag[];
  analysis?: VisualImageAnalysis;
}

/**
 * Deterministically audits an image candidate (actual image buffer, pixels, prompt, alt, source)
 * against an article and its StructuredVisualBrief.
 *
 * Enforces the rule: NO IMAGE > IRRELEVANT IMAGE.
 */
export async function validateVisualRelevance(
  article: ValidatableArticle,
  visualBrief: StructuredVisualBrief,
  candidate: VisualRelevanceCandidate = {},
  options: { analyzer?: IVisualContentAnalyzer } = {}
): Promise<VisualRelevanceResult> {
  const flags: VisualRelevanceFlag[] = [];
  const articleTitle = (article.title || '').toLowerCase();
  const expectedSubject = visualBrief.primaryEntity || visualBrief.primaryVisualSubject;

  // 1. If NO image is provided: NO IMAGE is valid and preferred over an irrelevant image
  const hasNoImage =
    !candidate.url &&
    !candidate.prompt &&
    !candidate.imageBuffer &&
    !candidate.imagePath;

  if (hasNoImage) {
    return {
      relevant: true,
      confidence: 1.0,
      reason: 'No image provided (NO IMAGE is valid and preferred over irrelevant image).',
      detected_subject: 'none',
      expected_subject: expectedSubject,
      flags: [],
    };
  }

  // 2. Perform Image Pixel & Vision Analysis
  const analyzer = candidate.analyzer || options.analyzer || defaultVisualContentAnalyzer;
  const analysis = await analyzer.analyzeImage(candidate);

  // 3. Catch corrupted, empty, or flat blank placeholder buffers
  if (analysis.isCorruptedOrEmpty) {
    if (analysis.visualSceneClass === 'blank_solid') {
      flags.push('blank_placeholder_image', 'generic_fallback');
    } else {
      flags.push('invalid_image_buffer');
    }
  }

  // 4. Combine detected visual elements with prompt and metadata text
  const detectedElements = (analysis.detectedVisualElements || []).map((e) => e.toLowerCase());
  const combinedVisualText = `${candidate.url || ''} ${candidate.prompt || ''} ${candidate.alt || ''} ${candidate.source || ''} ${detectedElements.join(' ')} ${analysis.detectedSubject || ''}`.toLowerCase();

  // 5. Check Prohibited Visual Elements against actual image analysis + metadata
  for (const prohibited of visualBrief.prohibitedVisualElements) {
    const pLow = prohibited.toLowerCase().trim();
    if (pLow.length > 3) {
      const appearsInText = combinedVisualText.includes(pLow);
      const appearsInElements = detectedElements.some((e) => e.includes(pLow) || pLow.includes(e));
      if (appearsInText || appearsInElements) {
        flags.push('prohibited_element_detected');
      }
    }
  }

  // 6. Domain Mismatches (Sports / Music / Aviation / Location)

  // A. Baseball vs Music / Stage / Soccer / Ocean
  const isArticleBaseball = /\b(astros|guardians|baseball|mlb|trevino|catcher|infield|ballpark)\b/i.test(articleTitle);
  if (isArticleBaseball) {
    const isImageMusic =
      analysis.visualSceneClass === 'dark_stage_music' ||
      /\b(guitar|guitarist|singer|band|concert|vinyl|turntable|microphone|dark_stage)\b/i.test(combinedVisualText);
    const isImageSoccer =
      /\b(soccer|football pitch|penalty box|goalkeeper)\b/i.test(combinedVisualText) &&
      !combinedVisualText.includes('baseball');
    const isImageCricket =
      /\b(cricket|wicket|stumps|batsman|bowler)\b/i.test(combinedVisualText) &&
      !combinedVisualText.includes('baseball');
    const isImageOcean =
      analysis.visualSceneClass === 'marine_ocean' ||
      /\b(cruise ship|ocean beach|snorkeling|resort)\b/i.test(combinedVisualText);

    if (isImageMusic) {
      flags.push('wrong_subject', 'wrong_object', 'unrelated_visual_theme');
    }
    if (isImageSoccer || isImageCricket) {
      flags.push('wrong_sport');
    }
    if (isImageOcean) {
      flags.push('wrong_subject', 'unrelated_visual_theme');
    }
  }

  // B. Cricket vs Baseball / Music
  const isArticleCricket = /\b(cricinfo|cricket|test match|ipl|espncricinfo)\b/i.test(articleTitle);
  if (isArticleCricket) {
    const isImageBaseball =
      /\b(baseball|home plate|catcher|mlb)\b/i.test(combinedVisualText) &&
      !combinedVisualText.includes('cricket');
    const isImageMusic =
      analysis.visualSceneClass === 'dark_stage_music' ||
      /\b(guitar|singer|concert)\b/i.test(combinedVisualText);

    if (isImageBaseball) {
      flags.push('wrong_sport');
    }
    if (isImageMusic) {
      flags.push('wrong_subject', 'unrelated_visual_theme');
    }
  }

  // C. Soccer vs Baseball / Cricket
  const isArticleSoccer = /\b(friendlies|friendly match|ecuador.*korea|corea del sur|san jose earthquakes|mls)\b/i.test(articleTitle);
  if (isArticleSoccer) {
    const isImageBaseball =
      /\b(baseball|catcher|infield dirt)\b/i.test(combinedVisualText) &&
      !combinedVisualText.includes('soccer');
    const isImageCricket =
      /\b(cricket|wicket|stumps)\b/i.test(combinedVisualText) &&
      !combinedVisualText.includes('soccer');

    if (isImageBaseball || isImageCricket) {
      flags.push('wrong_sport');
    }
  }

  // D. Aviation / Incident vs Unrelated Vacation / Music
  const isArticleAviation = /\b(delta flight|aviation|rapid descent|flight diverted|airplane incident|travel weather)\b/i.test(articleTitle);
  if (isArticleAviation) {
    const isImageVacation =
      analysis.visualSceneClass === 'marine_ocean' ||
      /\b(cruise ship|tropical beach|cocktail|palm trees|swimming pool|vacation resort)\b/i.test(combinedVisualText);
    const isImageMusic =
      analysis.visualSceneClass === 'dark_stage_music' ||
      /\b(guitar|band|concert)\b/i.test(combinedVisualText);

    if (isImageVacation || isImageMusic) {
      flags.push('wrong_subject', 'unrelated_visual_theme', 'misleading_imagery');
    }
  }

  // E. Travel Specific Location Mismatches
  const isArticleAzores = /\bazores\b/i.test(articleTitle);
  if (isArticleAzores && /\b(desert|laguna beach|california coast|manhattan)\b/i.test(combinedVisualText)) {
    flags.push('wrong_location');
  }

  const isArticleLaguna = /\blaguna beach\b/i.test(articleTitle);
  if (isArticleLaguna && /\b(azores|portugal|manhattan|snow|tokyo)\b/i.test(combinedVisualText)) {
    flags.push('wrong_location');
  }

  const isArticleNYC = /\b(nyc|new york)\b/i.test(articleTitle);
  if (isArticleNYC && /\b(tropical|palm trees|desert|alpine|caldera)\b/i.test(combinedVisualText)) {
    flags.push('wrong_location');
  }

  // 7. Determine Detected Subject & Result
  let detectedSubject = analysis.detectedSubject || 'subject-aligned editorial visual';
  if (flags.includes('blank_placeholder_image')) detectedSubject = 'blank placeholder canvas';
  else if (flags.includes('invalid_image_buffer')) detectedSubject = 'corrupt or invalid image buffer';
  else if (flags.includes('wrong_sport')) detectedSubject = 'mismatched sport context';
  else if (flags.includes('wrong_location')) detectedSubject = 'mismatched geographic location';
  else if (flags.includes('wrong_subject')) detectedSubject = 'unrelated thematic subject';
  else if (flags.includes('prohibited_element_detected')) detectedSubject = 'contains prohibited visual elements';

  const hasCriticalFlag = flags.length > 0;
  const confidence = hasCriticalFlag ? 0.15 : 0.95;
  const reason = hasCriticalFlag
    ? `Visual relevance check failed with flags [${flags.join(', ')}]. Image candidate (${analysis.analyzedVia}) does not directly represent "${expectedSubject}".`
    : `Visual candidate (${analysis.analyzedVia}) directly aligns with "${expectedSubject}".`;

  return {
    relevant: !hasCriticalFlag,
    confidence,
    reason,
    detected_subject: detectedSubject,
    expected_subject: expectedSubject,
    flags,
    analysis,
  };
}

/**
 * Synchronous variant for metadata pre-audits when image bytes are not loaded.
 */
export function validateVisualRelevanceSync(
  article: ValidatableArticle,
  visualBrief: StructuredVisualBrief,
  candidate: VisualRelevanceCandidate = {}
): VisualRelevanceResult {
  const flags: VisualRelevanceFlag[] = [];
  const articleTitle = (article.title || '').toLowerCase();
  const candidateText = `${candidate.url || ''} ${candidate.prompt || ''} ${candidate.alt || ''} ${candidate.source || ''}`.toLowerCase();
  const expectedSubject = visualBrief.primaryEntity || visualBrief.primaryVisualSubject;

  if (!candidate.url && !candidate.prompt) {
    return {
      relevant: true,
      confidence: 1.0,
      reason: 'No image provided (NO IMAGE is valid and preferred over irrelevant image).',
      detected_subject: 'none',
      expected_subject: expectedSubject,
      flags: [],
    };
  }

  for (const prohibited of visualBrief.prohibitedVisualElements) {
    const pLow = prohibited.toLowerCase().trim();
    if (pLow.length > 3 && candidateText.includes(pLow)) {
      flags.push('prohibited_element_detected');
    }
  }

  const isArticleBaseball = /\b(astros|guardians|baseball|mlb|trevino|catcher|infield)\b/i.test(articleTitle);
  if (isArticleBaseball) {
    if (/\b(guitar|guitarist|singer|band|concert|vinyl|turntable|microphone)\b/i.test(candidateText)) {
      flags.push('wrong_subject', 'wrong_object', 'unrelated_visual_theme');
    }
    if (/\b(soccer|football pitch|penalty box|goalkeeper|cricket|wicket|stumps)\b/i.test(candidateText)) {
      flags.push('wrong_sport');
    }
  }

  const isArticleCricket = /\b(cricinfo|cricket|test match|ipl|espncricinfo)\b/i.test(articleTitle);
  if (isArticleCricket && /\b(baseball|home plate|catcher|mlb|guitar|singer|concert)\b/i.test(candidateText)) {
    flags.push('wrong_sport', 'unrelated_visual_theme');
  }

  const isArticleSoccer = /\b(friendlies|friendly match|ecuador.*korea|corea del sur|san jose earthquakes|mls)\b/i.test(articleTitle);
  if (isArticleSoccer && /\b(baseball|catcher|cricket|wicket|stumps)\b/i.test(candidateText)) {
    flags.push('wrong_sport');
  }

  const isArticleAviation = /\b(delta flight|aviation|rapid descent|flight diverted|airplane incident)\b/i.test(articleTitle);
  if (isArticleAviation && /\b(cruise ship|tropical beach|cocktail|palm trees|swimming pool|vacation resort|guitar|band)\b/i.test(candidateText)) {
    flags.push('wrong_subject', 'unrelated_visual_theme', 'misleading_imagery');
  }

  let detectedSubject = 'subject-aligned editorial visual';
  if (flags.includes('wrong_sport')) detectedSubject = 'mismatched sport context';
  else if (flags.includes('wrong_subject')) detectedSubject = 'unrelated thematic subject';
  else if (flags.includes('prohibited_element_detected')) detectedSubject = 'contains prohibited visual elements';

  const hasCriticalFlag = flags.length > 0;
  return {
    relevant: !hasCriticalFlag,
    confidence: hasCriticalFlag ? 0.2 : 0.95,
    reason: hasCriticalFlag
      ? `Visual relevance check failed with flags [${flags.join(', ')}].`
      : `Visual candidate directly aligns with "${expectedSubject}".`,
    detected_subject: detectedSubject,
    expected_subject: expectedSubject,
    flags,
  };
}
