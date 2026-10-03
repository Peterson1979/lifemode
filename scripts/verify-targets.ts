import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve(process.cwd(), 'data', 'article-rewrite-migration.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

const PROTECTED_SIX = new Set([
  'creative-partnership-oceans-calling-2026',
  'inside-astros-story-spotlight-cultural-impact',
  'cricinfo-reveals-how-cricket-fans-shape-pop-culture',
  'the-enduring-appeal-of-friendlies',
  'why-the-ecuador-south-korea-matchup-keeps-fans-and-critics-talking',
  'guardians-magic-number-how-clevelands-playoff-chase-unfolded',
]);

const FIXTURE_PATTERNS = [
  'has drawn attention across the modern cultural landscape',
  'This development underscores ongoing structural and tactical shifts within the domain',
  'within a broader lifestyle and industry framework provides essential clarity',
  'observers should monitor verified milestones and official communications',
  'Staying grounded in documented evidence ensures an accurate perspective while filtering out unsubstantiated speculation',
  'Key confirmed benchmarks include: Dates: 2026-10-01',
  'Examining ',
];

function checkFixture(raw: string): { isFixture: boolean; match?: string } {
  if (raw.includes('has drawn attention across the modern cultural landscape')) {
    return { isFixture: true, match: 'has drawn attention across the modern cultural landscape' };
  }
  if (raw.includes('This development underscores ongoing structural and tactical shifts within the domain')) {
    return { isFixture: true, match: 'This development underscores ongoing structural and tactical shifts' };
  }
  if (raw.includes('within a broader lifestyle and industry framework provides essential clarity')) {
    return { isFixture: true, match: 'within a broader lifestyle and industry framework' };
  }
  if (raw.includes('observers should monitor verified milestones')) {
    return { isFixture: true, match: 'observers should monitor verified milestones' };
  }
  if (raw.includes('Staying grounded in documented evidence ensures an accurate perspective')) {
    return { isFixture: true, match: 'Staying grounded in documented evidence' };
  }
  if (/\w+\*\*\s+\(Reported by/i.test(raw)) {
    return { isFixture: true, match: 'Truncated citation (** (Reported by)' };
  }
  return { isFixture: false };
}

const manifestEntries = Object.entries(manifest.articles as Record<string, any>);
console.log(`Checking ${manifestEntries.length} manifest articles against disk...\n`);

const fixtureList: any[] = [];
const protectedList: any[] = [];
const genuineList: any[] = [];
const unchangedAcceptedList: any[] = [];

for (const [key, item] of manifestEntries) {
  const filePath = (item.filePath || item.relativePath || key).replace(/\\/g, '/');
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`ERROR: File does not exist: ${filePath}`);
    continue;
  }

  const raw = fs.readFileSync(fullPath, 'utf-8');
  const slug = item.slug || path.basename(filePath, '.md');
  const { isFixture: isFix, match } = checkFixture(raw);

  if (PROTECTED_SIX.has(slug)) {
    protectedList.push({ filePath, slug, pillar: item.pillar });
  } else if (isFix) {
    fixtureList.push({ filePath, slug, pillar: item.pillar, match, finalStatus: item.finalStatus });
  } else {
    const isRegenerated = (item.notes && item.notes.some((n: string) => n.includes('Groq LLM') || n.includes('Rewritten via groq') || n.includes('Genuinely rewritten'))) ||
      item.bodyChanged;
    if (isRegenerated) {
      genuineList.push({ filePath, slug, pillar: item.pillar, notes: item.notes });
    } else {
      unchangedAcceptedList.push({ filePath, slug, pillar: item.pillar });
    }
  }
}

console.log(`========================================`);
console.log(`Protected Baseline (6): ${protectedList.length}`);
console.log(`Accepted Unchanged (24 baseline): ${unchangedAcceptedList.length}`);
console.log(`Genuinely Regenerated Targets: ${genuineList.length}`);
console.log(`Remaining Fixture Targets: ${fixtureList.length}`);
console.log(`Total Targets in this run: ${genuineList.length + fixtureList.length}`);
console.log(`Total Corpus Articles: ${protectedList.length + unchangedAcceptedList.length + genuineList.length + fixtureList.length}`);
console.log(`========================================\n`);

console.log(`--- REMAINING FIXTURE TARGETS (${fixtureList.length}) ---`);
for (let i = 0; i < fixtureList.length; i++) {
  const f = fixtureList[i];
  console.log(`${i + 1}. [${f.pillar}] ${f.slug} | Match: ${f.match} | Status: ${f.finalStatus}`);
}
