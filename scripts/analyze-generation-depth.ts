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

const contentRoot = path.resolve(process.cwd(), 'src', 'content');
const files = findMarkdownFiles(contentRoot);

const summary: Record<string, any[]> = {};

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf-8');
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const pillar = rel.split('/')[2];
  const slug = path.basename(file, path.extname(file));

  const words = raw.split(/\s+/).length;
  const isFixturePattern = raw.includes('has drawn attention across the modern cultural landscape') ||
    raw.includes('An Intentional Journey Blueprint') ||
    raw.includes('Confirmed Facts & Key Developments\n\n');
  
  if (!summary[pillar]) summary[pillar] = [];
  summary[pillar].push({
    file: rel,
    slug,
    words,
    isFixturePattern
  });
}

console.log('=== BREAKDOWN BY PILLAR ===');
for (const [pillar, arts] of Object.entries(summary)) {
  const fixtureCount = arts.filter(a => a.isFixturePattern).length;
  const realCount = arts.length - fixtureCount;
  const avgWords = Math.round(arts.reduce((acc, a) => acc + a.words, 0) / arts.length);
  console.log(`${pillar}: total=${arts.length}, realLLM=${realCount}, fixtureTemplate=${fixtureCount}, avgWords=${avgWords}`);
}
