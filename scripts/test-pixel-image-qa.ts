import fs from 'node:fs';
import path from 'node:path';
import { buildVisualBrief } from '../src/lib/editorial/visual-brief.ts';
import { validateVisualRelevance, LocalPixelContentAnalyzer } from '../src/lib/editorial/visual-relevance.ts';
import { parseArticle } from '../src/lib/editorial/storage/serializer.ts';

const pixelAnalyzer = new LocalPixelContentAnalyzer();

const targetFiles = [
  // The 6 specific cases
  'src/content/entertainment/inside-astros-story-spotlight-cultural-impact.md',
  'src/content/entertainment/cricinfo-reveals-how-cricket-fans-shape-pop-culture.md',
  'src/content/entertainment/the-enduring-appeal-of-friendlies.md',
  'src/content/entertainment/why-the-ecuador-south-korea-matchup-keeps-fans-and-critics-talking.md',
  'src/content/entertainment/guardians-magic-number-how-clevelands-playoff-chase-unfolded.md',
  'src/content/entertainment/creative-partnership-oceans-calling-2026.md',
  // All travel articles
  'src/content/travel/fire-weather-watch-what-to-know.md',
  'src/content/travel/inside-netflix-time-travel-series-dark-architecture-culture-slow-exploration.md',
  'src/content/travel/japan-what-to-know.md',
  'src/content/travel/laguna-beach-modern-guide.md',
  'src/content/travel/minimalist-coastal-retreats-architecture-and-secluded-stays.md',
  'src/content/travel/the-quietest-islands-in-the-azores-volcanic-hot-springs-and.md',
  'src/content/travel/travel-weather-what-to-know.md',
  'src/content/travel/weather-nyc-what-to-know.md',
];

async function runPixelImageCheck() {
  console.log(`Auditing pixel-level relevance on ${targetFiles.length} critical and travel articles...\n`);

  let allPassed = true;

  for (const relPath of targetFiles) {
    const fullPath = path.join(process.cwd(), relPath);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const pillar = relPath.split('/')[2] as any;
    const slug = path.basename(relPath, '.md');
    const parsed = parseArticle(raw, pillar, slug, fullPath);

    const article = {
      title: parsed.frontmatter.title,
      description: parsed.frontmatter.description,
      content: parsed.content,
      pillar,
      tags: parsed.frontmatter.tags,
    };

    const brief = buildVisualBrief(article, { pillar });

    // If local file in public/
    let imageBuffer: Buffer | undefined;
    let localImagePath: string | undefined;

    if (parsed.frontmatter.image?.startsWith('/')) {
      localImagePath = path.join(process.cwd(), 'public', parsed.frontmatter.image);
      if (fs.existsSync(localImagePath)) {
        imageBuffer = fs.readFileSync(localImagePath);
      }
    }

    const qaResult = await validateVisualRelevance(
      article,
      brief,
      {
        url: parsed.frontmatter.image,
        alt: parsed.frontmatter.imageAlt,
        prompt: parsed.frontmatter.imagePrompt,
        imageBuffer,
        imagePath: localImagePath,
        analyzer: pixelAnalyzer,
      }
    );

    console.log(`[${qaResult.relevant ? 'PASS' : 'FAIL'}] ${parsed.frontmatter.title}`);
    console.log(`  File:      ${relPath}`);
    console.log(`  Visual:    ${brief.primaryVisualSubject}`);
    console.log(`  Image:     ${parsed.frontmatter.image}`);
    console.log(`  Reason:    ${qaResult.reason}`);
    if (qaResult.flags.length > 0) {
      console.log(`  Flags:     ${qaResult.flags.join(', ')}`);
      allPassed = false;
    }
    console.log('');
  }

  if (allPassed) {
    console.log('✓ ALL 14 CRITICAL AND TRAVEL ARTICLES PASSED PIXEL-LEVEL IMAGE QA!');
  } else {
    console.error('✗ Some articles failed image QA.');
    process.exit(1);
  }
}

runPixelImageCheck().catch((err) => {
  console.error(err);
  process.exit(1);
});
