import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { buildVisualBrief } from '../src/lib/editorial/visual-brief.ts';
import { validateVisualRelevance, LocalPixelContentAnalyzer } from '../src/lib/editorial/visual-relevance.ts';

const healthDir = path.join(process.cwd(), 'public', 'editorial', 'health');
if (!fs.existsSync(healthDir)) {
  fs.mkdirSync(healthDir, { recursive: true });
}

const assets = [
  {
    artifactSource: 'C:/Users/opeti/.gemini/antigravity-ide/brain/3d18a0f2-7149-4e81-9c25-3a385c738d7b/morning_sunlight_routine_1791188794301.jpg',
    filename: 'morning-sunlight-circadian-routine.webp',
    articleFile: 'src/content/health/morning-light-circadian-timing-protocol.md',
    imagePath: '/editorial/health/morning-sunlight-circadian-routine.webp',
    imageAlt: 'Person stepping outside into morning sunlight holding a warm cup on a wooden porch',
    prompt: 'Person stepping outside onto sunlit porch in morning daylight with coffee mug',
  },
  {
    artifactSource: 'C:/Users/opeti/.gemini/antigravity-ide/brain/3d18a0f2-7149-4e81-9c25-3a385c738d7b/zone2_easy_cardio_1791188810701.jpg',
    filename: 'zone-2-easy-cardio-training.webp',
    articleFile: 'src/content/health/zone-2-mitochondrial-base-training.md',
    imagePath: '/editorial/health/zone-2-easy-cardio-training.webp',
    imageAlt: 'Runner maintaining a steady conversational jogging pace on a sunlit forest trail',
    prompt: 'Runner enjoying steady Zone 2 conversational aerobic jogging along sunlit nature trail',
  },
  {
    artifactSource: 'C:/Users/opeti/.gemini/antigravity-ide/brain/3d18a0f2-7149-4e81-9c25-3a385c738d7b/protein_rich_nutrition_1791188827313.jpg',
    filename: 'protein-rich-everyday-nutrition.webp',
    articleFile: 'src/content/health/dietary-protein-distribution-muscle-synthesis.md',
    imagePath: '/editorial/health/protein-rich-everyday-nutrition.webp',
    imageAlt: 'Balanced protein-rich meal featuring grilled salmon, soft-boiled eggs, edamame, and Greek yogurt on oak table',
    prompt: 'Balanced real-food protein plate with grilled salmon, farm eggs, edamame, and Greek yogurt',
  },
  {
    artifactSource: 'C:/Users/opeti/.gemini/antigravity-ide/brain/3d18a0f2-7149-4e81-9c25-3a385c738d7b/cgm_glucose_tracking_1791188843396.jpg',
    filename: 'continuous-glucose-monitor-sensor.webp',
    articleFile: 'src/content/health/continuous-glucose-monitoring-healthy-adults.md',
    imagePath: '/editorial/health/continuous-glucose-monitor-sensor.webp',
    imageAlt: 'Person wearing a discreet continuous glucose monitor on upper arm checking health data in sunlit kitchen',
    prompt: 'Person wearing continuous glucose monitor biosensor on upper arm reviewing wellness data',
  },
];

async function main() {
  const analyzer = new LocalPixelContentAnalyzer();
  console.log('1. Converting and saving optimized WebP images to public/editorial/health/...\n');

  for (const item of assets) {
    const destPath = path.join(healthDir, item.filename);
    await sharp(item.artifactSource)
      .resize(1200, 675, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(destPath);
    console.log(`✓ Generated ${destPath} (1200x675 webp)`);
  }

  console.log('\n2. Updating article frontmatter in src/content/health/...\n');

  for (const item of assets) {
    const articleFullPath = path.join(process.cwd(), item.articleFile);
    let rawContent = fs.readFileSync(articleFullPath, 'utf8');

    // Add or update image and imageAlt in frontmatter
    if (!rawContent.includes('image:')) {
      rawContent = rawContent.replace(
        /pubDate:[^\n]+\n/,
        (match) => `${match}image: "${item.imagePath}"\nimageAlt: "${item.imageAlt}"\n`
      );
    } else {
      rawContent = rawContent.replace(/image:\s*"[^"]*"/, `image: "${item.imagePath}"`);
      rawContent = rawContent.replace(/imageAlt:\s*"[^"]*"/, `imageAlt: "${item.imageAlt}"`);
    }

    fs.writeFileSync(articleFullPath, rawContent, 'utf8');
    console.log(`✓ Updated ${item.articleFile} -> image: ${item.imagePath}`);
  }

  console.log('\n3. Running Visual Relevance QA on all 4 Health articles...\n');

  let allPassed = true;
  for (const item of assets) {
    const articleFullPath = path.join(process.cwd(), item.articleFile);
    const rawContent = fs.readFileSync(articleFullPath, 'utf8');
    const titleMatch = rawContent.match(/title:\s*"([^"]+)"/);
    const descMatch = rawContent.match(/description:\s*"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : '';
    const description = descMatch ? descMatch[1] : '';

    const article = { title, description, content: rawContent, pillar: 'health' };
    const brief = buildVisualBrief(article, { pillar: 'health' });
    const localImagePath = path.join(process.cwd(), 'public', item.imagePath);
    const imageBuffer = fs.readFileSync(localImagePath);

    const qaResult = await validateVisualRelevance(
      article,
      brief,
      {
        url: item.imagePath,
        alt: item.imageAlt,
        prompt: item.prompt,
        imageBuffer,
        imagePath: localImagePath,
        analyzer,
      }
    );

    console.log(`[${qaResult.relevant ? 'PASS' : 'FAIL'}] "${title}"`);
    console.log(`  Path:       ${item.imagePath}`);
    console.log(`  Confidence: ${qaResult.confidence}`);
    console.log(`  Detected:   ${qaResult.detected_subject}`);
    console.log(`  Reason:     ${qaResult.reason}`);
    if (qaResult.flags.length > 0) {
      console.log(`  Flags:      ${qaResult.flags.join(', ')}`);
      allPassed = false;
    }
    console.log();
  }

  if (allPassed) {
    console.log('✓ ALL 4 HEALTH ARTICLES PASSED RELEVANCE & PIXEL QA!');
  } else {
    console.error('✗ Some articles failed QA.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
