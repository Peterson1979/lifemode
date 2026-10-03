import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROTECTED_SIX = [
  'creative-partnership-oceans-calling-2026',
  'inside-astros-story-spotlight-cultural-impact',
  'cricinfo-reveals-how-cricket-fans-shape-pop-culture',
  'the-enduring-appeal-of-friendlies',
  'why-the-ecuador-south-korea-matchup-keeps-fans-and-critics-talking',
  'guardians-magic-number-how-clevelands-playoff-chase-unfolded',
];

const FORBIDDEN_FIXTURE_PHRASES = [
  'has drawn attention across the modern cultural landscape',
  'This development underscores ongoing structural and tactical shifts within the domain',
  'within a broader lifestyle and industry framework provides essential clarity',
  'observers should monitor verified milestones and official communications',
  'Staying grounded in documented evidence ensures an accurate perspective while filtering out unsubstantiated speculation',
  'Key confirmed benchmarks include: Dates: 2026-10-01',
];

function isFixture(raw: string): boolean {
  for (const phrase of FORBIDDEN_FIXTURE_PHRASES) {
    if (raw.includes(phrase)) return true;
  }
  if (/\w+\*\*\s+\(Reported by/i.test(raw)) return true;
  return false;
}

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

async function reconcile() {
  const contentRoot = path.resolve(process.cwd(), 'src', 'content');
  const manifestPath = path.resolve(process.cwd(), 'data', 'article-rewrite-migration.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const files = findMarkdownFiles(contentRoot);
  console.log(`Total Markdown Files in src/content: ${files.length}`);

  // Inspect pillars
  const filesByPillar: Record<string, string[]> = {};
  for (const f of files) {
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
    const pillar = rel.split('/')[2];
    filesByPillar[pillar] = filesByPillar[pillar] || [];
    filesByPillar[pillar].push(rel);
  }
  console.log('Files by pillar:', Object.fromEntries(Object.entries(filesByPillar).map(([k, v]) => [k, v.length])));

  // Manifest articles
  const manifestMap = new Map<string, any>();
  for (const [key, item] of Object.entries(manifest.articles as Record<string, any>)) {
    const rel = (item.filePath || item.relativePath || key).replace(/\\/g, '/');
    manifestMap.set(rel, item);
  }
  console.log(`Manifest contains ${manifestMap.size} articles.`);

  // Check which files on disk are in manifest
  const onDiskInManifest: string[] = [];
  const onDiskNotInManifest: string[] = [];
  for (const f of files) {
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
    if (manifestMap.has(rel)) {
      onDiskInManifest.push(rel);
    } else {
      onDiskNotInManifest.push(rel);
    }
  }
  console.log(`On disk and in manifest: ${onDiskInManifest.length}`);
  console.log(`On disk NOT in manifest: ${onDiskNotInManifest.length}`);
  if (onDiskNotInManifest.length > 0) {
    console.log('Not in manifest:', onDiskNotInManifest);
  }

  // Classify all manifest articles
  let protectedBaselineCount = 0;
  let acceptedUnchangedCount = 0;
  let genuinelyRegeneratedCount = 0;
  let remainingFixtureCount = 0;
  let manualReviewCount = 0;

  const regeneratedSlugs: string[] = [];
  const remainingFixtureSlugs: { rel: string; slug: string; pillar: string }[] = [];
  const acceptedUnchangedSlugs: string[] = [];

  for (const [rel, item] of manifestMap.entries()) {
    const full = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(full)) {
      console.warn(`File in manifest does not exist on disk: ${rel}`);
      continue;
    }
    const slug = item.slug || path.basename(rel, '.md');
    const raw = fs.readFileSync(full, 'utf-8');
    const fixture = isFixture(raw);

    if (PROTECTED_SIX.includes(slug) || item.isProtectedSix) {
      protectedBaselineCount++;
    } else if (fixture) {
      remainingFixtureCount++;
      remainingFixtureSlugs.push({ rel, slug, pillar: item.pillar });
    } else {
      // It is not fixture and not protected
      // Check if it was regenerated during correction or was one of the 24 accepted unchanged
      if (item.notes && item.notes.some((n: string) => n.includes('Groq LLM') || n.includes('Genuinely rewritten'))) {
        genuinelyRegeneratedCount++;
        regeneratedSlugs.push(slug);
      } else if (item.finalStatus === 'COMPLETED' && item.bodyChanged) {
        genuinelyRegeneratedCount++;
        regeneratedSlugs.push(slug);
      } else {
        acceptedUnchangedCount++;
        acceptedUnchangedSlugs.push(slug);
      }
    }
  }

  console.log('\n=== RECONCILIATION SUMMARY ===');
  console.log(`Protected Baseline Articles: ${protectedBaselineCount}`);
  console.log(`Accepted Unchanged Articles: ${acceptedUnchangedCount}`);
  console.log(`Genuinely Regenerated Targets: ${genuinelyRegeneratedCount}`);
  console.log(`Remaining Fixture Targets: ${remainingFixtureCount}`);
  console.log(`Total Targets (Regenerated + Remaining): ${genuinelyRegeneratedCount + remainingFixtureCount}`);
  console.log(`Total Manifest Articles: ${protectedBaselineCount + acceptedUnchangedCount + genuinelyRegeneratedCount + remainingFixtureCount}`);

  console.log('\nRemaining Fixture Targets to Regenerate:');
  for (const t of remainingFixtureSlugs) {
    console.log(`- [${t.pillar}] ${t.slug} (${t.rel})`);
  }
}

reconcile().catch(console.error);
