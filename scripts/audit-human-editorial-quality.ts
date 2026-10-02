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

export interface ArticleAuditResult {
  filePath: string;
  relativePath: string;
  pillar: string;
  slug: string;
  title: string;
  description: string;
  wordCount: number;
  headingsCount: number;
  headings: string[];
  faqCount: number;
  isProtected: boolean;
  contentType: string;
  hasSource: boolean;
  sourceUrl?: string;
  hasRecipeProvenance: boolean;
  image?: string;
  imageAlt?: string;
  originalBodyHash: string;
  finalBodyHash: string;
  bodyChanged: boolean;
  cliches: string[];
  introMatches: string[];
  conclusionMatches: string[];
  internalLeaks: string[];
  findings: string[];
  severity: 'PASS' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  firstParagraph: string;
  lastParagraph: string;
}

export async function runAudit() {
  const contentRoot = path.resolve(process.cwd(), 'src', 'content');
  const manifestPath = path.resolve(process.cwd(), 'data', 'article-rewrite-migration.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const files = findMarkdownFiles(contentRoot);
  const results: ArticleAuditResult[] = [];

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
    const faqs = (body.match(/^#{3,4}\s+(?:Q:|What|How|Why|Where|When|Is|Can|Should|Do).+\?$/gim) || []);
    const faqCount = faqs.length;

    const cliches: string[] = [];
    for (const pat of AI_CLICHE_WORDS) {
      if (pat.test(body)) {
        cliches.push(pat.source.replace(/\\b/g, ''));
      }
    }

    const paragraphs = body.split(/\n\s*\n/).filter(p => !p.startsWith('#') && p.trim().length > 0);
    const firstParagraph = paragraphs[0] || '';
    const introMatches: string[] = [];
    for (const pat of AI_INTRO_PATTERNS) {
      if (pat.test(firstParagraph.trim())) {
        introMatches.push(pat.source);
      }
    }

    const lastParagraph = paragraphs[paragraphs.length - 1] || '';
    const conclusionMatches: string[] = [];
    for (const pat of AI_CONCLUSION_PATTERNS) {
      if (pat.test(lastParagraph.trim())) {
        conclusionMatches.push(pat.source);
      }
    }

    const internalLeaks: string[] = [];
    for (const pat of INTERNAL_LEAK_PATTERNS) {
      if (pat.test(raw)) {
        internalLeaks.push(pat.source);
      }
    }

    const findings: string[] = [];
    let severity: 'PASS' | 'MINOR' | 'MAJOR' | 'CRITICAL' = 'PASS';

    // 1. Check body hash change
    if (!isProtected && !bodyChanged) {
      findings.push('Non-protected article body was not changed from original');
      severity = 'CRITICAL';
    }

    // 2. Check internal leaks
    if (internalLeaks.length > 0) {
      findings.push(`Internal terminology leaked: ${internalLeaks.join(', ')}`);
      severity = 'CRITICAL';
    }

    // 3. Check word count
    if (wordCount < 500) {
      findings.push(`Severely short word count: ${wordCount} words`);
      severity = 'MAJOR';
    } else if (wordCount < 800 && data.format !== 'recipe') {
      findings.push(`Short word count: ${wordCount} words`);
      if (severity === 'PASS') severity = 'MINOR';
    }

    // 4. Check heading structure
    if (headingsCount < 2) {
      findings.push(`Poor section structure: only ${headingsCount} headings`);
      if (severity === 'PASS') severity = 'MINOR';
    }

    // 5. Check AI intro / conclusion clichés
    if (introMatches.length > 0) {
      findings.push(`Generic AI intro pattern matched: ${introMatches.join(', ')}`);
      if (severity === 'PASS') severity = 'MINOR';
    }
    if (conclusionMatches.length > 0) {
      findings.push(`Generic AI conclusion pattern matched: ${conclusionMatches.join(', ')}`);
      if (severity === 'PASS') severity = 'MINOR';
    }
    if (cliches.length >= 3) {
      findings.push(`Multiple AI cliché words detected: ${cliches.join(', ')}`);
      if (severity === 'PASS') severity = 'MINOR';
    }

    // 6. Check Recipe Provenance
    const isRecipe = data.format === 'recipe' || pillar === 'food-drink' && (data.recipeYield || data.ingredients || data.source);
    let hasRecipeProvenance = false;
    if (isRecipe) {
      const hasSrc = !!data.source || !!data.sourceUrl || !!data.originalRecipeId;
      hasRecipeProvenance = hasSrc;
      if (!hasSrc) {
        findings.push('Recipe missing source provenance metadata');
        severity = 'MAJOR';
      }
    }

    // 7. Check Title
    const title = data.title || '';
    if (!title || title.trim().length < 5) {
      findings.push('Missing or invalid title in frontmatter');
      severity = 'MAJOR';
    }

    // 8. Check Image metadata
    const imagePath = data.image;
    const imageAlt = data.imageAlt;
    if (imagePath && !imageAlt) {
      findings.push('Image provided without alt text');
      if (severity === 'PASS') severity = 'MINOR';
    }

    // 9. Check Person Entity in Title vs Text
    if (title.includes('Who is') || title.includes('Who Is')) {
      const entity = title.replace(/who is/i, '').replace(/[\?:]/g, '').trim();
      if (entity && !body.toLowerCase().includes(entity.toLowerCase())) {
        findings.push(`Title mentions person/entity "${entity}" but body does not discuss them`);
        severity = 'MAJOR';
      }
    }

    results.push({
      filePath: file,
      relativePath: rel,
      pillar,
      slug,
      title,
      description: data.description || '',
      wordCount,
      headingsCount,
      headings,
      faqCount,
      isProtected,
      contentType: data.contentType || (manifestItem ? manifestItem.contentType : 'UNKNOWN'),
      hasSource: !!data.sources || !!data.sourceUrl || !!data.source,
      sourceUrl: data.sourceUrl || (Array.isArray(data.sources) ? data.sources[0]?.url : undefined),
      hasRecipeProvenance,
      image: imagePath,
      imageAlt,
      originalBodyHash,
      finalBodyHash,
      bodyChanged,
      cliches,
      introMatches,
      conclusionMatches,
      internalLeaks,
      findings,
      severity,
      firstParagraph,
      lastParagraph,
    });
  }

  // Summary by pillar
  const pillarMap: Record<string, { total: number; pass: number; minor: number; major: number; critical: number }> = {};
  for (const r of results) {
    if (!pillarMap[r.pillar]) {
      pillarMap[r.pillar] = { total: 0, pass: 0, minor: 0, major: 0, critical: 0 };
    }
    pillarMap[r.pillar].total++;
    pillarMap[r.pillar][r.severity.toLowerCase() as 'pass' | 'minor' | 'major' | 'critical']++;
  }

  const overall = {
    total: results.length,
    pass: results.filter(r => r.severity === 'PASS').length,
    minor: results.filter(r => r.severity === 'MINOR').length,
    major: results.filter(r => r.severity === 'MAJOR').length,
    critical: results.filter(r => r.severity === 'CRITICAL').length,
  };

  const output = {
    overall,
    byPillar: pillarMap,
    flaggedArticles: results.filter(r => r.severity !== 'PASS').map(r => ({
      pillar: r.pillar,
      slug: r.slug,
      title: r.title,
      severity: r.severity,
      findings: r.findings,
      wordCount: r.wordCount,
      headingsCount: r.headingsCount,
    })),
    pillarSampleBreakdown: Object.keys(pillarMap).map(p => {
      const pArts = results.filter(r => r.pillar === p);
      return {
        pillar: p,
        count: pArts.length,
        samples: pArts.slice(0, 3).map(a => ({
          slug: a.slug,
          title: a.title,
          wordCount: a.wordCount,
          headings: a.headings.slice(0, 4),
          severity: a.severity,
          findings: a.findings,
          firstSentence: a.firstParagraph.slice(0, 150),
          lastSentence: a.lastParagraph.slice(0, 150)
        }))
      };
    })
  };

  console.log(JSON.stringify(output, null, 2));
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
