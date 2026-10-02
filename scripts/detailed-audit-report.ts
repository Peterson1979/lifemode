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

const AI_INTRO_PATTERNS = [
  /^in today'?s (?:fast-paced|ever-evolving|digital|modern|interconnected|world)/i,
  /^in an era (?:of|where|characterized)/i,
  /^whether you(?:'re| are) a/i,
  /^as the (?:world|landscape|industry|season|sun)/i,
  /^in recent years,?/i,
  /^it'?s no secret that/i,
  /^when it comes to/i,
  /^navigating the/i,
  /^in the fast-paced world/i,
  /^in a world where/i,
  /^look no further than/i,
  /^dive into/i,
  /^delve into/i,
];

const AI_CONCLUSION_PATTERNS = [
  /^in conclusion/i,
  /^to sum up/i,
  /^all in all/i,
  /^at the end of the day/i,
  /^to wrap up/i,
  /^in summary/i,
];

const AI_CLICHE_WORDS = [
  /\btapestry\b/i,
  /\btestament to\b/i,
  /\bbeacon of\b/i,
  /\bsymphony of\b/i,
  /\bdelve\b/i,
  /\bgame-changer\b/i,
  /\bhustle and bustle\b/i,
  /\bnestled in\b/i,
  /\bembark on a journey\b/i,
  /\bplethora\b/i,
  /\bveritable\b/i,
];

const INTERNAL_LEAK_PATTERNS = [
  /daily editorial/i,
  /editorial channels/i,
  /companion tools/i,
  /channel archive/i,
  /showing \d+ curated/i,
  /ai router/i,
  /fact sheet/i,
  /factual boundary/i,
  /brief v2/i,
  /generation request/i,
  /fixture provider/i,
  /system prompt/i,
];

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

function parseFrontmatterAndBody(raw: string): { frontmatterRaw: string; body: string; data: Record<string, any> } {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatterRaw: '', body: normalized.trim(), data: {} };
  }
  const secondIndex = normalized.indexOf('\n---\n', 4);
  const endIdx = secondIndex !== -1 ? secondIndex : normalized.indexOf('\n---', 4);
  if (endIdx === -1) {
    return { frontmatterRaw: '', body: normalized.trim(), data: {} };
  }
  const fm = normalized.substring(4, endIdx);
  const body = normalized.substring(endIdx + (secondIndex !== -1 ? 5 : 4)).trim();

  const data: Record<string, any> = {};
  const lines = fm.split('\n');
  let currentKey = '';
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ') && currentKey && inArray) {
      const val = trimmed.substring(2).trim().replace(/^['"]|['"]$/g, '');
      data[currentKey].push(val);
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim();
      let val = line.substring(colonIdx + 1).trim();
      currentKey = key;
      if (val === '') {
        inArray = true;
        data[key] = [];
      } else {
        inArray = false;
        if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
          val = val.slice(1, -1);
        } else if (val === 'true') val = true as any;
        else if (val === 'false') val = false as any;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val) as any;
        data[key] = val;
      }
    }
  }

  return { frontmatterRaw: fm, body, data };
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

async function run() {
  const contentRoot = path.resolve(process.cwd(), 'src', 'content');
  const manifestPath = path.resolve(process.cwd(), 'data', 'article-rewrite-migration.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const files = findMarkdownFiles(contentRoot);
  const items: any[] = [];

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const parts = rel.split('/');
    const pillar = parts[2];
    const slug = path.basename(file, path.extname(file));
    const isProtected = PROTECTED_SIX.includes(slug);

    const raw = fs.readFileSync(file, 'utf-8');
    const { frontmatterRaw, body, data } = parseFrontmatterAndBody(raw);
    const bodyHash = sha256(body);

    const manifestItem = Object.values(manifest.articles).find(
      (a: any) => (a.filePath && a.filePath.replace(/\\/g, '/') === rel) || (a.relativePath && a.relativePath.replace(/\\/g, '/') === rel) || a.slug === slug
    ) as any;

    const originalBodyHash = manifestItem ? manifestItem.originalBodyHash : '';
    const finalBodyHash = manifestItem ? manifestItem.finalBodyHash : bodyHash;
    const bodyChanged = isProtected || (originalBodyHash !== '' && originalBodyHash !== bodyHash);

    const words = body.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    const rawHeadings = (body.match(/^#{2,4}\s+.+$/gm) || []);
    const headings = rawHeadings.map(h => h.replace(/^#{2,4}\s+/, '').trim());
    const headingsCount = headings.length;

    const paragraphs = body.split(/\n\s*\n/).filter(p => !p.startsWith('#') && p.trim().length > 0);
    const firstParagraph = paragraphs[0] || '';
    const lastParagraph = paragraphs[paragraphs.length - 1] || '';

    const issues: { type: string; desc: string; severity: 'MINOR' | 'MAJOR' | 'CRITICAL' }[] = [];

    // Title / slug raw phrase check (e.g., "Navigating Fire weather watch: what to know: An Intentional Journey Blueprint")
    const title = data.title || '';
    if (title.includes(': what to know:') || title.includes(': a modern guide to trends signals zeitgeist') || title.includes(': What to Know:')) {
      issues.push({
        type: 'UNNATURAL_TITLE',
        desc: `Formulaic / repetitive colon title structure: "${title}"`,
        severity: 'MAJOR'
      });
    }

    // Repeated slug in opening paragraph
    if (firstParagraph.toLowerCase().includes(slug.replace(/-/g, ' ').toLowerCase() + ' has drawn attention across the modern cultural landscape')) {
      issues.push({
        type: 'FIXTURE_BOILERPLATE',
        desc: 'Opening sentence uses synthetic fixture placeholder text ("drawn attention across the modern cultural landscape")',
        severity: 'MAJOR'
      });
    }

    // Generic AI intro pattern
    for (const pat of AI_INTRO_PATTERNS) {
      if (pat.test(firstParagraph.trim())) {
        issues.push({
          type: 'GENERIC_AI_INTRO',
          desc: `Intro starts with generic pattern: ${pat.source}`,
          severity: 'MINOR'
        });
      }
    }

    // Generic AI conclusion pattern
    for (const pat of AI_CONCLUSION_PATTERNS) {
      if (pat.test(lastParagraph.trim())) {
        issues.push({
          type: 'GENERIC_AI_CONCLUSION',
          desc: `Conclusion starts with generic pattern: ${pat.source}`,
          severity: 'MINOR'
        });
      }
    }

    // Internal leak
    for (const pat of INTERNAL_LEAK_PATTERNS) {
      if (pat.test(raw)) {
        issues.push({
          type: 'INTERNAL_LEAK',
          desc: `Internal terminology leaked in markdown: ${pat.source}`,
          severity: 'CRITICAL'
        });
      }
    }

    // Thinness
    if (wordCount < 500) {
      issues.push({
        type: 'THIN_CONTENT',
        desc: `Article word count is severely low (${wordCount} words)`,
        severity: 'MAJOR'
      });
    } else if (wordCount < 700 && data.format !== 'recipe') {
      issues.push({
        type: 'SHORT_CONTENT',
        desc: `Article word count is relatively short (${wordCount} words)`,
        severity: 'MINOR'
      });
    }

    // Headings
    if (headingsCount < 2) {
      issues.push({
        type: 'WEAK_STRUCTURE',
        desc: `Only ${headingsCount} headings in article`,
        severity: 'MINOR'
      });
    }

    // Missing image alt
    if (data.image && !data.imageAlt) {
      issues.push({
        type: 'MISSING_IMAGE_ALT',
        desc: 'Frontmatter specifies image without imageAlt',
        severity: 'MINOR'
      });
    }

    // Protected baseline check
    if (isProtected && !bodyChanged) {
      // expected for protected
    } else if (!isProtected && !bodyChanged) {
      issues.push({
        type: 'BODY_UNCHANGED',
        desc: 'Non-protected article body was unchanged from original',
        severity: 'CRITICAL'
      });
    }

    // Overall severity for this article
    let maxSev: 'PASS' | 'MINOR' | 'MAJOR' | 'CRITICAL' = 'PASS';
    for (const iss of issues) {
      if (iss.severity === 'CRITICAL') {
        maxSev = 'CRITICAL';
        break;
      }
      if (iss.severity === 'MAJOR') {
        maxSev = 'MAJOR';
      } else if (iss.severity === 'MINOR' && maxSev === 'PASS') {
        maxSev = 'MINOR';
      }
    }

    items.push({
      pillar,
      filename: path.basename(file),
      relativePath: rel,
      slug,
      title,
      isProtected,
      wordCount,
      headingsCount,
      headings,
      firstParagraph,
      lastParagraph,
      issues,
      severity: maxSev,
    });
  }

  // Print summary
  const pillars = Array.from(new Set(items.map(i => i.pillar))).sort();
  console.log('=== OVERALL STATS ===');
  console.log(`Total Articles: ${items.length}`);
  console.log(`PASS: ${items.filter(i => i.severity === 'PASS').length}`);
  console.log(`MINOR: ${items.filter(i => i.severity === 'MINOR').length}`);
  console.log(`MAJOR: ${items.filter(i => i.severity === 'MAJOR').length}`);
  console.log(`CRITICAL: ${items.filter(i => i.severity === 'CRITICAL').length}`);

  console.log('\n=== BY PILLAR ===');
  console.log('| Pillar | Articles | Pass | Minor | Major | Critical |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const p of pillars) {
    const pItems = items.filter(i => i.pillar === p);
    const pass = pItems.filter(i => i.severity === 'PASS').length;
    const minor = pItems.filter(i => i.severity === 'MINOR').length;
    const major = pItems.filter(i => i.severity === 'MAJOR').length;
    const critical = pItems.filter(i => i.severity === 'CRITICAL').length;
    console.log(`| ${p} | ${pItems.length} | ${pass} | ${minor} | ${major} | ${critical} |`);
  }

  console.log('\n=== MAJOR / CRITICAL ISSUES ===');
  const majorCritical = items.filter(i => i.severity === 'MAJOR' || i.severity === 'CRITICAL');
  for (const item of majorCritical) {
    console.log(`\n- [${item.severity}] ${item.pillar}/${item.filename}`);
    console.log(`  Title: "${item.title}"`);
    console.log(`  Word count: ${item.wordCount}, Headings: ${item.headingsCount}`);
    for (const iss of item.issues) {
      console.log(`  Issue: [${iss.severity}] ${iss.type} - ${iss.desc}`);
    }
    console.log(`  First 120 chars: "${item.firstParagraph.slice(0, 120)}..."`);
  }

  console.log('\n=== MINOR ISSUES (SAMPLE) ===');
  const minorItems = items.filter(i => i.severity === 'MINOR');
  for (const item of minorItems.slice(0, 15)) {
    console.log(`- [MINOR] ${item.pillar}/${item.filename}: ${item.issues.map((iss: any) => iss.type).join(', ')}`);
  }
}

run().catch(console.error);
