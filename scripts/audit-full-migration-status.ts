import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArticle } from '../src/lib/editorial/storage/serializer.ts';

const PROTECTED_SIX = [
  'creative-partnership-oceans-calling-2026',
  'inside-astros-story-spotlight-cultural-impact',
  'cricinfo-reveals-how-cricket-fans-shape-pop-culture',
  'the-enduring-appeal-of-friendlies',
  'why-the-ecuador-south-korea-matchup-keeps-fans-and-critics-talking',
  'guardians-magic-number-how-clevelands-playoff-chase-unfolded',
];

const FORBIDDEN_SLUGS = [
  'boston-college-vs-virginia-tech',
  'virginia-tech-vs-boston-college',
  'delta-flight-2311',
  'delta-porto-flight',
  'eliezer-alfonzo-what-to-know',
  'blake-lively-a-modern-guide-to-trends-signals-zeitgeist',
  'cynthia-klitbo-habits',
  'josh-hartnett-a-modern-guide-to-trends-signals-zeitgeist',
  'ted-cruz-modern-guide-trends-signals-zeitgeist',
  'tommy-mcmillen-what-you-should-know',
];

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

function extractBody(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n');
  const secondIndex = normalized.indexOf('\n---\n', 4);
  if (secondIndex !== -1) {
    return normalized.substring(secondIndex + 5).trim();
  }
  const altIndex = normalized.indexOf('\n---', 4);
  if (altIndex !== -1) {
    return normalized.substring(altIndex + 4).trim();
  }
  return normalized.trim();
}

function findMarkdownFiles(dir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

async function audit() {
  const contentRoot = path.resolve(process.cwd(), 'src', 'content');
  const manifestPath = path.resolve(process.cwd(), 'data', 'article-rewrite-migration.json');

  const files = findMarkdownFiles(contentRoot);
  const totalArticles = files.length;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const manifestMap = new Map<string, any>();
  const manifestArticles = Object.values(manifest.articles) as any[];
  for (const item of manifestArticles) {
    const p = item.filePath || item.relativePath;
    manifestMap.set(p.replace(/\\/g, '/'), item);
  }

  let genuinelyRewritten = 0;
  let protectedBaselineCount = 0;
  let unchangedNonProtected = 0;
  let generationCallsExecuted = 0;
  let completedCount = 0;
  let failedCount = 0;
  let manualReviewCount = 0;

  let imageRetained = 0;
  let imageReplaced = 0;
  let imageNoImage = 0;
  let imageRejected = 0;

  let editorialQAPassed = 0;
  let editorialQAFailed = 0;
  let imageQAPassed = 0;
  let imageQAFailed = 0;

  const unchangedList: string[] = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const slug = path.basename(file, '.md');
    const rawContent = fs.readFileSync(file, 'utf-8');
    const body = extractBody(rawContent);
    const bodyHash = sha256(body);

    const mItem = manifestMap.get(rel);
    const isProtected = PROTECTED_SIX.includes(slug) || (mItem && mItem.isProtectedSix);

    if (isProtected) {
      protectedBaselineCount++;
    }

    if (mItem) {
      if (mItem.generationExecuted) generationCallsExecuted++;
      if (mItem.finalStatus === 'COMPLETED') completedCount++;
      if (mItem.finalStatus === 'FAILED') failedCount++;
      if (mItem.finalStatus === 'MANUAL_REVIEW') manualReviewCount++;

      if (mItem.editorialQA === 'PASS') editorialQAPassed++;
      else editorialQAFailed++;

      if (mItem.imageQA === 'PASS') imageQAPassed++;
      else imageQAFailed++;

      if (mItem.imageStatus === 'RETAINED') imageRetained++;
      else if (mItem.imageStatus === 'REPLACED') imageReplaced++;
      else if (mItem.imageStatus === 'NO_IMAGE' || mItem.imageStatus === 'REJECTED') imageNoImage++;

      if (!isProtected) {
        if (mItem.originalBodyHash !== mItem.finalBodyHash && bodyHash === mItem.finalBodyHash) {
          genuinelyRewritten++;
        } else {
          unchangedNonProtected++;
          unchangedList.push(rel);
        }
      }
    } else {
      if (!isProtected) {
        unchangedNonProtected++;
        unchangedList.push(rel);
      }
    }
  }

  // Check forbidden files
  const forbiddenFound: string[] = [];
  for (const file of files) {
    const slug = path.basename(file, '.md');
    if (FORBIDDEN_SLUGS.includes(slug)) {
      forbiddenFound.push(file);
    }
  }

  // Check recipe provenance
  const foodDir = path.join(contentRoot, 'food-drink');
  const foodFiles = fs.readdirSync(foodDir).filter(f => f.endsWith('.md'));
  const recipeProvenanceIssues: string[] = [];
  let recipesCount = 0;

  for (const f of foodFiles) {
    const raw = fs.readFileSync(path.join(foodDir, f), 'utf-8');
    if (raw.includes('ingredients:') || raw.includes('originalRecipeId:')) {
      recipesCount++;
      const hasSource = raw.includes('source:');
      const hasSourceUrl = raw.includes('sourceUrl:');
      const hasIngredients = raw.includes('ingredients:');
      const hasDirections = raw.includes('directions:');
      if (!hasSource || !hasSourceUrl || !hasIngredients || !hasDirections) {
        recipeProvenanceIssues.push(`${f}: missing essential recipe provenance or directions`);
      }
    }
  }

  const report = {
    totalArticlesOnDisk: totalArticles,
    manifestTotal: manifestArticles.length,
    protectedBaselineCount,
    genuinelyRewritten,
    unchangedNonProtected,
    unchangedList,
    generationCallsExecuted,
    completedCount,
    failedCount,
    manualReviewCount,
    imageRetained,
    imageReplaced,
    imageNoImage,
    imageRejected,
    editorialQAPassed,
    editorialQAFailed,
    imageQAPassed,
    imageQAFailed,
    forbiddenFound,
    recipesCount,
    recipeProvenanceIssues,
  };

  console.log(JSON.stringify(report, null, 2));
}

audit().catch(console.error);
