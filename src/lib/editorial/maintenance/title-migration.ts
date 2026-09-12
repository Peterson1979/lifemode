import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import { FORMULAIC_TITLE_PATTERNS, validateTitle } from '../quality.ts';
import { VALID_PILLARS, type PillarSlug } from '../types.ts';
import { parseArticle, serializeArticle } from '../storage/serializer.ts';

/**
 * Curated, high-quality human replacement titles for existing articles with formulaic titles.
 * Mapped deterministically by pillar and slug to ensure exact editorial alignment.
 */
export const EXISTING_TITLE_REPLACEMENTS: Record<string, string> = {
  // Wellbeing
  'wellbeing/morning-sunlight-and-adenosine-clearing-a-simple-protocol-fo':
    'Morning sunlight and adenosine: a simple protocol for morning clarity',
  'wellbeing/army-fitness-test-modern-guide':
    'What the Army Combat Fitness Test teaches us about functional strength',

  // Travel
  'travel/the-quietest-islands-in-the-azores-volcanic-hot-springs-and':
    'The quietest islands in the Azores: hot springs, volcanic trails, and solitary coastlines',
  'travel/minimalist-coastal-retreats-architecture-and-secluded-stays':
    'Minimalist coastal retreats: secluded architecture across the Mediterranean',
  'travel/delta-flight-2311-rapid-descent-a-modern-guide-to-destinatio':
    'What happened aboard Delta Flight 2311: understanding rapid emergency descents',
  'travel/laguna-beach-modern-guide':
    'Laguna Beach: a modern blueprint for intentional coastal travel',

  // Tech & AI
  'tech-ai/running-sovereign-local-ai-models-privacy-hardware-setups-an':
    'Running local AI models: hardware setups, privacy benefits, and everyday workflows',
  'tech-ai/running-sovereign-local-ai-models-privacy-hardware-setup':
    'A practical setup for running sovereign AI models locally',

  // Now
  'now/pakistan-vs-england-modern-guide-trends-signals-zeitgeist':
    'Pakistan vs England: what cultural contrasts reveal about intentional living',
  'now/vaccinations-modern-guide-trends-signals-zeitgeist':
    'The changing conversation around seasonal vaccinations',
  'now/the-counter-culture-of-friction-why-people-are-intentionally':
    'The counter-culture of friction: why people are intentionally slowing down tech use',
  'now/the-analog-turn-why-high-signal-professionals-are-embracing':
    'The analog turn: why high-signal professionals are returning to tactile tools',
  'now/the-2026-cultural-shift-toward-digital-intentionality':
    'The cultural shift toward digital intentionality',
  'now/ted-cruz-modern-guide-trends-signals-zeitgeist':
    'Ted Cruz and the rise of direct-to-listener political broadcasting',
  'now/josh-hartnett-a-modern-guide-to-trends-signals-zeitgeist':
    'Josh Hartnett and the art of the deliberate career reset',
  'now/fire-weather-watch-a-modern-guide-to-trends-signals-zeitgeis':
    'What a fire weather watch actually means for your neighborhood',
  'now/downdetector-guide-2026':
    'How Downdetector spots outages before official status pages admit them',
  'now/deepseek-v41-flash-a-modern-guide-to-trends-signals-zeitgeis':
    'DeepSeek V4.1 Flash: what high-speed inference means for daily developer workflows',
  'now/cable-tv-a-modern-guide-to-trends-signals-zeitgeist':
    'Why cable TV is not disappearing as fast as predicted',
  'now/blake-lively-a-modern-guide-to-trends-signals-zeitgeist':
    'Blake Lively and the modern playbook of celebrity brand ownership',

  // Life
  'life/the-contemplative-workspace-acoustic-comfort-natural-wood-an':
    'Designing a contemplative workspace with acoustic warmth and natural wood',

  // Discover
  'discover/japanese-minka-renovation-blending-historic-timber-with-mode':
    'Inside a Japanese minka renovation that blends historic timber with modern minimalism',
  'discover/curated-monograph-curation-timeless-design-and-photography-v':
    'Building a personal library of design and architecture monographs',
};

export interface TitleAuditResult {
  articleId: string;
  pillar: PillarSlug;
  slug: string;
  filePath: string;
  currentTitle: string;
  isFormulaic: boolean;
  proposedTitle?: string;
  updated: boolean;
}

export interface TitleMigrationReport {
  totalScanned: number;
  formulaicCount: number;
  correctedCount: number;
  results: TitleAuditResult[];
}

/**
 * Cleans a formulaic title dynamically if not explicitly in the static mapping table.
 */
export function cleanFormulaicTitle(currentTitle: string): string {
  let cleaned = currentTitle
    .replace(/:\s*A\s+Modern\s+Guide\s+to\s+.*$/i, '')
    .replace(/–\s*A\s+Modern\s+Guide\s+to\s+.*$/i, '')
    .replace(/-\s*A\s+Modern\s+Guide\s+to\s+.*$/i, '')
    .replace(/\s*A\s+Modern\s+Guide\s+to\s+.*$/i, '')
    .trim();

  if (cleaned.length < 15) {
    cleaned = currentTitle;
  }
  return cleaned;
}

/**
 * Audits all articles in the content repository and optionally migrates formulaic titles.
 */
export async function auditAndMigrateTitles(options: {
  contentRoot?: string;
  dryRun?: boolean;
}): Promise<TitleMigrationReport> {
  const contentRoot = resolve(options.contentRoot || join(process.cwd(), 'src', 'content'));
  const results: TitleAuditResult[] = [];
  let formulaicCount = 0;
  let correctedCount = 0;
  let totalScanned = 0;

  for (const pillar of VALID_PILLARS) {
    const pillarDir = join(contentRoot, pillar);
    let files: string[] = [];
    try {
      files = await fs.readdir(pillarDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue;
      if (file.startsWith('welcome-to-')) continue; // Ignore starter stubs

      const slug = file.replace(/\.(md|mdx)$/, '');
      const articleId = `${pillar}/${slug}`;
      const filePath = join(pillarDir, file);
      totalScanned++;

      try {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const parsed = parseArticle(rawContent, pillar, slug, filePath);
        const currentTitle = parsed.frontmatter.title || '';

        const isFormulaic = FORMULAIC_TITLE_PATTERNS.some((pattern) =>
          pattern.test(currentTitle)
        );

        if (isFormulaic) {
          formulaicCount++;
          const proposedTitle =
            EXISTING_TITLE_REPLACEMENTS[articleId] || cleanFormulaicTitle(currentTitle);

          let updated = false;
          if (!options.dryRun && proposedTitle && proposedTitle !== currentTitle) {
            parsed.frontmatter.title = proposedTitle;
            const updatedRaw = serializeArticle(parsed);
            await fs.writeFile(filePath, updatedRaw, 'utf-8');
            updated = true;
            correctedCount++;
          }

          results.push({
            articleId,
            pillar,
            slug,
            filePath,
            currentTitle,
            isFormulaic: true,
            proposedTitle,
            updated,
          });
        } else {
          results.push({
            articleId,
            pillar,
            slug,
            filePath,
            currentTitle,
            isFormulaic: false,
            updated: false,
          });
        }
      } catch (err) {
        console.error(`Error processing ${articleId}:`, err);
      }
    }
  }

  return {
    totalScanned,
    formulaicCount,
    correctedCount,
    results,
  };
}
