import fs from 'node:fs';
import path from 'node:path';
import { buildVisualBrief } from '../src/lib/editorial/visual-brief.ts';
import { validateVisualRelevanceSync } from '../src/lib/editorial/visual-relevance.ts';

interface TravelImageSpec {
  file: string;
  image: string;
  imageAlt: string;
  imagePrompt: string;
}

const travelImageSpecs: TravelImageSpec[] = [
  {
    file: 'fire-weather-watch-what-to-know.md',
    image: 'https://images.unsplash.com/photo-1508873696983-2df57046475a?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Fire weather watch — arid golden grassland hills under high-wind atmospheric sky',
    imagePrompt: 'Editorial landscape of dry golden grassland hills under high-wind atmospheric sky, meteorological weather station in distance, stark natural light',
  },
  {
    file: 'inside-netflix-time-travel-series-dark-architecture-culture-slow-exploration.md',
    image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Dark series architecture — misty German pine forest with modernist pavilion in fog',
    imagePrompt: 'Moody dense pine forest with architectural concrete modernist pavilion in deep fog, cinematic cold tones, quiet solitary path',
  },
  {
    file: 'japan-what-to-know.md',
    image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Japan travel — quiet traditional wooden architecture along serene cobblestone alley',
    imagePrompt: 'Quiet traditional Japanese wooden architecture along serene cobblestone alley, morning mist, subtle modern design harmony',
  },
  {
    file: 'laguna-beach-modern-guide.md',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Laguna Beach — coastal sandstone bluffs and Pacific ocean cove at golden hour',
    imagePrompt: 'Laguna Beach coastal bluffs at golden hour, Pacific ocean swells meeting architectural sandstone coves, calm minimalist coastal atmosphere',
  },
  {
    file: 'minimalist-coastal-retreats-architecture-and-secluded-stays.md',
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Minimalist Mediterranean retreats — secluded stone villa overlooking calm deep blue sea',
    imagePrompt: 'Secluded Mediterranean stone villa with minimalist geometric lines overlooking calm deep blue sea, natural limestone terraces, soft warm daylight',
  },
  {
    file: 'the-quietest-islands-in-the-azores-volcanic-hot-springs-and.md',
    image: 'https://images.unsplash.com/photo-1589556264800-08ae9e129a8c?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'The Azores — volcanic hot springs and lush green caldera along solitary Atlantic coastline',
    imagePrompt: 'Atmospheric volcanic hot springs and lush green caldera in the Azores, solitary Atlantic coastline cliffs, morning sea mist',
  },
  {
    file: 'travel-weather-what-to-know.md',
    image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Travel weather — commercial aircraft wing and atmospheric cloud layers in flight',
    imagePrompt: 'Commercial passenger aircraft wing cruising above atmospheric cloud layers during weather transition, calm golden hour horizon',
  },
  {
    file: 'weather-nyc-what-to-know.md',
    image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'NYC weather — Manhattan skyline under dramatic atmospheric storm clouds with rain reflections',
    imagePrompt: 'Editorial architectural view of Manhattan skyline under dramatic atmospheric storm clouds, clean rain reflections on urban street pavement, muted cinematic palette',
  },
];

const dir = path.join(process.cwd(), 'src/content/travel');

console.log('Updating Travel article images with verified visual briefs...\n');

for (const spec of travelImageSpecs) {
  const filePath = path.join(dir, spec.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`File ${spec.file} does not exist, skipping.`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // Replace or add image, imageAlt, imagePrompt
  if (/^image:\s*.*$/m.test(content)) {
    content = content.replace(/^image:\s*.*$/m, `image: ${JSON.stringify(spec.image)}`);
  } else {
    content = content.replace(/^---\n/, `---\nimage: ${JSON.stringify(spec.image)}\n`);
  }

  if (/^imageAlt:\s*.*$/m.test(content)) {
    content = content.replace(/^imageAlt:\s*.*$/m, `imageAlt: ${JSON.stringify(spec.imageAlt)}`);
  } else {
    content = content.replace(/^image:\s*.*$/m, `image: ${JSON.stringify(spec.image)}\nimageAlt: ${JSON.stringify(spec.imageAlt)}`);
  }

  if (/^imagePrompt:\s*.*$/m.test(content)) {
    content = content.replace(/^imagePrompt:\s*.*$/m, `imagePrompt: ${JSON.stringify(spec.imagePrompt)}`);
  } else {
    content = content.replace(/^imageAlt:\s*.*$/m, `imageAlt: ${JSON.stringify(spec.imageAlt)}\nimagePrompt: ${JSON.stringify(spec.imagePrompt)}`);
  }

  fs.writeFileSync(filePath, content, 'utf-8');

  // Verify visual QA
  const titleMatch = content.match(/^title:\s*(.*)$/m);
  const descMatch = content.match(/^description:\s*(.*)$/m);
  const title = titleMatch ? JSON.parse(titleMatch[1]) : '';
  const description = descMatch ? JSON.parse(descMatch[1]) : '';

  const article = { title, description, content, pillar: 'travel' as const, tags: ['travel'] };
  const brief = buildVisualBrief(article, { pillar: 'travel' });
  const result = validateVisualRelevanceSync(article, brief, { url: spec.image, alt: spec.imageAlt, prompt: spec.imagePrompt });

  console.log(`[UPDATED] ${spec.file}`);
  console.log(`  Title:      ${title}`);
  console.log(`  QA Result:  ${result.relevant ? 'PASS' : 'FAIL'} (Confidence: ${result.confidence})`);
  console.log(`  Image:      ${spec.image}\n`);
}
