import fs from 'node:fs';
import path from 'node:path';
import { buildVisualBrief } from '../src/lib/editorial/visual-brief.ts';
import { validateVisualRelevance, LocalPixelContentAnalyzer } from '../src/lib/editorial/visual-relevance.ts';
import { parseArticle } from '../src/lib/editorial/storage/serializer.ts';

const pixelAnalyzer = new LocalPixelContentAnalyzer();

const targetFiles = [
  // Preserved food-drink articles or legacy targets if present
  'src/content/food-drink/artisan-seeded-sourdough-bread.md',
  'src/content/food-drink/fresh-guacamole.md',
  'src/content/food-drink/rustic-potato-leek-soup.md',
];

async function runPixelImageCheck() {
  const existingFiles = targetFiles.filter((f) => fs.existsSync(path.join(process.cwd(), f)));
  if (existingFiles.length === 0) {
    console.log('No targets to audit, skipping.');
    return;
  }

  console.log(`Auditing pixel-level relevance on ${existingFiles.length} articles...\n`);

  let allPassed = true;

  for (const relPath of existingFiles) {
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
    console.log('✓ ALL ARTICLES PASSED PIXEL-LEVEL IMAGE QA!');
  } else {
    console.error('✗ Some articles failed image QA.');
    process.exit(1);
  }
}

runPixelImageCheck().catch((err) => {
  console.error(err);
  process.exit(1);
});
