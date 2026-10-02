import fs from 'node:fs';
import path from 'node:path';

const contentDir = path.join(process.cwd(), 'src/content');
const pillars = fs.readdirSync(contentDir).filter((p) => fs.statSync(path.join(contentDir, p)).isDirectory());

interface ArticleInfo {
  pillar: string;
  slug: string;
  file: string;
  format: string;
  title: string;
  sourcesCount: number;
  sources: Array<{ name: string; url: string }>;
  image?: string;
  isProtected: boolean;
}

const protectedSlugs = new Set([
  'creative-partnership-oceans-calling-2026',
  'inside-astros-story-spotlight-cultural-impact',
  'cricinfo-reveals-how-cricket-fans-shape-pop-culture',
  'the-enduring-appeal-of-friendlies',
  'why-the-ecuador-south-korea-matchup-keeps-fans-and-critics-talking',
  'guardians-magic-number-how-clevelands-playoff-chase-unfolded',
]);

const articles: ArticleInfo[] = [];

for (const p of pillars) {
  const files = fs.readdirSync(path.join(contentDir, p)).filter((f) => f.endsWith('.md'));
  for (const f of files) {
    const raw = fs.readFileSync(path.join(contentDir, p, f), 'utf-8');
    const slug = f.replace(/\.md$/, '');
    const titleMatch = raw.match(/^title:\s*(.*)$/m);
    const formatMatch = raw.match(/^format:\s*(.*)$/m);
    const imageMatch = raw.match(/^image:\s*(.*)$/m);

    const title = titleMatch ? JSON.parse(titleMatch[1].trim()) : slug;
    const format = formatMatch ? JSON.parse(formatMatch[1].trim()) : 'standard';
    const image = imageMatch ? JSON.parse(imageMatch[1].trim()) : undefined;

    // Parse sources
    const sources: Array<{ name: string; url: string }> = [];
    const sourcesBlockMatch = raw.match(/^sources:\s*\n((?:(?:\s+-\s+.*|\s+url:.*|\s+name:.*)\n?)*)/m);
    if (sourcesBlockMatch) {
      const lines = sourcesBlockMatch[1].split('\n');
      let currentSource: { name: string; url: string } | null = null;
      for (const line of lines) {
        const nameM = line.match(/name:\s*(.*)$/);
        const urlM = line.match(/url:\s*(.*)$/);
        if (nameM) {
          if (!currentSource) currentSource = { name: '', url: '' };
          try {
            currentSource.name = JSON.parse(nameM[1].trim());
          } catch {
            currentSource.name = nameM[1].trim();
          }
        }
        if (urlM) {
          if (!currentSource) currentSource = { name: '', url: '' };
          try {
            currentSource.url = JSON.parse(urlM[1].trim());
          } catch {
            currentSource.url = urlM[1].trim();
          }
          sources.push(currentSource);
          currentSource = null;
        }
      }
    }

    articles.push({
      pillar: p,
      slug,
      file: `${p}/${f}`,
      format,
      title,
      sourcesCount: sources.length,
      sources,
      image,
      isProtected: protectedSlugs.has(slug),
    });
  }
}

console.log(`Total Articles Found: ${articles.length}`);
console.log(`Protected (Already Rewritten): ${articles.filter((a) => a.isProtected).length}`);
console.log(`Remaining to Process: ${articles.filter((a) => !a.isProtected).length}`);

const formats: Record<string, number> = {};
const pillarsCount: Record<string, number> = {};

for (const a of articles) {
  formats[a.format] = (formats[a.format] || 0) + 1;
  pillarsCount[a.pillar] = (pillarsCount[a.pillar] || 0) + 1;
}

console.log('\nPillars breakdown:', pillarsCount);
console.log('Formats breakdown:', formats);

// Check if any remaining article has 0 sources
const unsourced = articles.filter((a) => !a.isProtected && a.sourcesCount === 0);
console.log(`\nRemaining articles with 0 sources in YAML: ${unsourced.length}`);
for (const u of unsourced) {
  console.log(`- ${u.file}: "${u.title}"`);
}
