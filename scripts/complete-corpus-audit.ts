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

interface ArticleDetail {
  pillar: string;
  filename: string;
  slug: string;
  title: string;
  wordCount: number;
  isProtected: boolean;
  classification: 'PASS' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  reasons: string[];
}

const details: ArticleDetail[] = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const parts = rel.split('/');
  const pillar = parts[2];
  const slug = path.basename(file, path.extname(file));
  const isProtected = PROTECTED_SIX.includes(slug);

  const raw = fs.readFileSync(file, 'utf-8');
  const words = raw.split(/\s+/).filter(Boolean).length;

  const hasFixtureBoilerplate = raw.includes('has drawn attention across the modern cultural landscape') ||
    raw.includes('This development underscores ongoing structural and tactical shifts within the domain') ||
    raw.includes('Examining ') && raw.includes('within a broader lifestyle and industry framework provides essential clarity') ||
    raw.includes('As ') && raw.includes('continues to develop, observers should monitor verified milestones');
  
  const hasTruncatedSentence = /\w+\*\*\s+\(Reported by/i.test(raw) || /\w+\.\.\s*##/i.test(raw);
  const hasMalformedTitle = /:\s*what to know:\s*/i.test(raw) || /:\s*a modern guide to trends signals zeitgeist/i.test(raw);
  const missingAlt = /image:\s*['"]?https?:\/\/[^\n]+(?!\n\s*imageAlt:)/.test(raw) && !raw.includes('imageAlt:');

  const reasons: string[] = [];
  let classification: 'PASS' | 'MINOR' | 'MAJOR' | 'CRITICAL' = 'PASS';

  if (hasFixtureBoilerplate) {
    reasons.push('Contains synthetic fixture template boilerplate (generic cultural landscape / structural shifts text)');
    classification = 'MAJOR';
  }
  if (hasTruncatedSentence) {
    reasons.push('Contains cut-off / truncated sentence in body (e.g. truncated markdown token before citation)');
    classification = 'MAJOR';
  }
  if (hasMalformedTitle) {
    reasons.push('Title contains unformatted raw prompt / slug colon concatenations');
    classification = 'MAJOR';
  }
  if (words < 500 && !raw.includes('ingredients:')) {
    reasons.push(`Severely low word count (${words} words)`);
    classification = 'MAJOR';
  }

  if (classification === 'PASS') {
    if (missingAlt) {
      reasons.push('Missing explicit imageAlt in frontmatter');
      classification = 'MINOR';
    }
    if (words < 700 && !raw.includes('ingredients:')) {
      reasons.push(`Relatively concise word count (${words} words)`);
      classification = 'MINOR';
    }
  }

  details.push({
    pillar,
    filename: path.basename(file),
    slug,
    title: (raw.match(/title:\s*["']?([^"'\n]+)["']?/) || [])[1] || slug,
    wordCount: words,
    isProtected,
    classification,
    reasons
  });
}

console.log('=== COMPLETE CORPUS AUDIT SUMMARY ===');
const total = details.length;
const pass = details.filter(d => d.classification === 'PASS').length;
const minor = details.filter(d => d.classification === 'MINOR').length;
const major = details.filter(d => d.classification === 'MAJOR').length;
const critical = details.filter(d => d.classification === 'CRITICAL').length;

console.log(`Total Articles: ${total}`);
console.log(`PASS: ${pass}`);
console.log(`MINOR: ${minor}`);
console.log(`MAJOR: ${major}`);
console.log(`CRITICAL: ${critical}`);

console.log('\n=== BY PILLAR TABLE ===');
const pillars = Array.from(new Set(details.map(d => d.pillar))).sort();
for (const p of pillars) {
  const pList = details.filter(d => d.pillar === p);
  const pPass = pList.filter(d => d.classification === 'PASS').length;
  const pMinor = pList.filter(d => d.classification === 'MINOR').length;
  const pMajor = pList.filter(d => d.classification === 'MAJOR').length;
  const pCrit = pList.filter(d => d.classification === 'CRITICAL').length;
  console.log(`| ${p} | ${pList.length} | ${pPass} | ${pMinor} | ${pMajor} | ${pCrit} |`);
}

console.log('\n=== LIST OF ALL MAJOR CLASSIFIED ARTICLES ===');
for (const item of details.filter(d => d.classification === 'MAJOR')) {
  console.log(`- [${item.pillar}] ${item.filename} | Title: "${item.title}" | Words: ${item.wordCount}`);
  for (const r of item.reasons) console.log(`    * ${r}`);
}

console.log('\n=== LIST OF ALL MINOR CLASSIFIED ARTICLES ===');
for (const item of details.filter(d => d.classification === 'MINOR')) {
  console.log(`- [${item.pillar}] ${item.filename} | Title: "${item.title}" | Words: ${item.wordCount}`);
  for (const r of item.reasons) console.log(`    * ${r}`);
}

console.log('\n=== LIST OF ALL PASS CLASSIFIED ARTICLES ===');
for (const item of details.filter(d => d.classification === 'PASS')) {
  console.log(`- [${item.pillar}] ${item.filename} | Title: "${item.title}" | Words: ${item.wordCount}`);
}
