import fs from 'node:fs';
import path from 'node:path';

function findMarkdownFiles(dir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findMarkdownFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
      results.push(full);
    }
  }
  return results;
}

const PROTECTED_SIX = [
  'creative-partnership-oceans-calling-2026',
  'inside-astros-story-spotlight-cultural-impact',
  'cricinfo-reveals-how-cricket-fans-shape-pop-culture',
  'the-enduring-appeal-of-friendlies',
  'why-the-ecuador-south-korea-matchup-keeps-fans-and-critics-talking',
  'guardians-magic-number-how-clevelands-playoff-chase-unfolded',
];

const contentRoot = path.resolve(process.cwd(), 'src', 'content');
const files = findMarkdownFiles(contentRoot);

const targets: Array<{ pillar: string; file: string; slug: string; relPath: string }> = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const parts = rel.split('/');
  const pillar = parts[2];
  const slug = path.basename(file, path.extname(file));

  if (PROTECTED_SIX.includes(slug)) continue;

  const raw = fs.readFileSync(file, 'utf-8');
  const isFixturePattern = raw.includes('has drawn attention across the modern cultural landscape') ||
    raw.includes('This development underscores ongoing structural and tactical shifts within the domain') ||
    raw.includes('Examining ') && raw.includes('within a broader lifestyle and industry framework provides essential clarity') ||
    raw.includes('As ') && raw.includes('continues to develop, observers should monitor verified milestones') ||
    /\w+\*\*\s+\(Reported by/i.test(raw);

  if (isFixturePattern) {
    targets.push({ pillar, file: path.basename(file), slug, relPath: rel });
  }
}

console.log(`Identified ${targets.length} fixture-generated targets to regenerate:`);
console.log(JSON.stringify(targets, null, 2));
