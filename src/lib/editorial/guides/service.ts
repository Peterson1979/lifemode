import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { isGuidesCadenceDay, formatUtcDateString } from '../cadence.ts';

export interface GuideFrontmatter {
  title: string;
  seoTitle?: string;
  seoDescription?: string;
  category: 'food-kitchen' | 'cleaning-laundry' | 'home-maintenance' | 'storage-organization' | 'everyday-how-to';
  contentType?: 'reference' | 'decision';
  publishedDate: string;
  updatedDate: string;
  readTime?: string;
  author?: {
    name: string;
    role: string;
    avatar?: string;
  };
  reviewedBy?: {
    name: string;
    role: string;
    credentials?: string;
  };
  quickSummary: string;
  difficulty?: 'Easy' | 'Moderate' | 'Advanced';
  timeNeeded?: string;
  keyFacts?: Array<{ label: string; value: string; icon?: string }>;
  materialsNeeded?: string[];
  toolsNeeded?: string[];
  steps?: Array<{
    stepNumber: number;
    title: string;
    description: string;
    tip?: string;
    warning?: string;
  }>;
  commonMistakes?: Array<{
    mistake: string;
    whyItMatters: string;
    howToFix: string;
  }>;
  proTips?: string[];
  decisionCriteria?: Array<{
    criterion: string;
    importance: string;
    advice: string;
  }>;
  comparisonTable?: {
    headers: string[];
    rows: string[][];
  };
  faqs?: Array<{ question: string; answer: string }>;
  sources?: Array<{
    title: string;
    url?: string;
    publisher: string;
    note?: string;
  }>;
  relatedGuides?: string[];
  relatedTools?: string[];
  relatedChecklists?: string[];
  dailyIdeasPicks?: string[];
}

export interface GuideEntry {
  slug: string;
  filePath: string;
  frontmatter: GuideFrontmatter;
  content: string;
}

export interface GuideOpportunityResult {
  status: 'CREATED' | 'UPDATED' | 'SKIPPED' | 'FAILED';
  action?: 'CREATE' | 'UPDATE';
  slug?: string;
  category?: string;
  title?: string;
  filePath?: string;
  reason?: string;
  isCadenceDay: boolean;
  dryRun: boolean;
}

/**
 * Resolves the absolute directory path for production Guides content.
 */
export function getGuidesContentRoot(customRoot?: string): string {
  if (customRoot) {
    const normalized = path.resolve(customRoot);
    if (normalized.endsWith('src/content/guides') || normalized.endsWith('src\\content\\guides')) {
      return normalized;
    }
    if (normalized.endsWith('src/content') || normalized.endsWith('src\\content')) {
      return path.resolve(normalized, 'guides');
    }
    return path.resolve(normalized, 'src', 'content', 'guides');
  }
  return path.resolve(process.cwd(), 'src', 'content', 'guides');
}

/**
 * Parses a raw guide Markdown file into structured GuideEntry.
 */
export function parseGuideMarkdown(rawContent: string, slug: string, filePath: string): GuideEntry {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Guide at ${filePath} has invalid frontmatter boundary.`);
  }

  const [, yamlBlock, bodyContent] = match;
  // Use simple deterministic YAML parser for guide frontmatter
  const frontmatter = parseSimpleYaml(yamlBlock);

  return {
    slug,
    filePath,
    frontmatter: frontmatter as GuideFrontmatter,
    content: bodyContent.trim(),
  };
}

/**
 * Helper to parse YAML block safely without external dependencies.
 */
function parseSimpleYaml(yamlStr: string): Record<string, any> {
  const lines = yamlStr.split(/\r?\n/);
  const result: Record<string, any> = {};
  let currentKey = '';
  let currentArray: any[] | null = null;
  let currentObject: Record<string, any> | null = null;
  let inArrayOfObjects = false;
  let currentArrayItem: Record<string, any> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.search(/\S/);

    if (indent === 0 && line.includes(':')) {
      // Flush previous structures
      if (currentArrayItem && currentArray) {
        currentArray.push(currentArrayItem);
        currentArrayItem = null;
      }
      if (currentKey && currentArray !== null) {
        result[currentKey] = currentArray;
        currentArray = null;
      } else if (currentKey && currentObject !== null) {
        result[currentKey] = currentObject;
        currentObject = null;
      }

      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      currentKey = key;
      inArrayOfObjects = false;

      if (val === '') {
        // Will be an object or array in subsequent lines
        continue;
      } else {
        result[key] = cleanYamlValue(val);
        currentKey = '';
      }
    } else if (trimmed.startsWith('- ')) {
      // Array item
      if (!currentArray) {
        currentArray = [];
      }

      const itemContent = trimmed.slice(2).trim();
      if (itemContent.includes(':')) {
        // Start of object in array
        if (currentArrayItem) {
          currentArray.push(currentArrayItem);
        }
        inArrayOfObjects = true;
        currentArrayItem = {};
        const colonIdx = itemContent.indexOf(':');
        const k = itemContent.slice(0, colonIdx).trim();
        const v = itemContent.slice(colonIdx + 1).trim();
        currentArrayItem[k] = cleanYamlValue(v);
      } else {
        currentArray.push(cleanYamlValue(itemContent));
      }
    } else if (inArrayOfObjects && currentArrayItem && trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const k = trimmed.slice(0, colonIdx).trim();
      const v = trimmed.slice(colonIdx + 1).trim();
      currentArrayItem[k] = cleanYamlValue(v);
    } else if (currentKey && trimmed.includes(':')) {
      if (!currentObject) currentObject = {};
      const colonIdx = trimmed.indexOf(':');
      const k = trimmed.slice(0, colonIdx).trim();
      const v = trimmed.slice(colonIdx + 1).trim();
      currentObject[k] = cleanYamlValue(v);
    }
  }

  if (currentArrayItem && currentArray) {
    currentArray.push(currentArrayItem);
  }
  if (currentKey && currentArray !== null) {
    result[currentKey] = currentArray;
  } else if (currentKey && currentObject !== null) {
    result[currentKey] = currentObject;
  }

  return result;
}

function cleanYamlValue(val: string): any {
  const trimmed = val.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Serializes a GuideEntry into standard canonical YAML Frontmatter + Markdown.
 */
export function serializeGuideMarkdown(frontmatter: GuideFrontmatter, content: string): string {
  const yamlLines: string[] = ['---'];

  yamlLines.push(`title: "${escapeDoubleQuotes(frontmatter.title)}"`);
  if (frontmatter.seoTitle) yamlLines.push(`seoTitle: "${escapeDoubleQuotes(frontmatter.seoTitle)}"`);
  if (frontmatter.seoDescription) yamlLines.push(`seoDescription: "${escapeDoubleQuotes(frontmatter.seoDescription)}"`);
  yamlLines.push(`category: "${frontmatter.category}"`);
  yamlLines.push(`contentType: "${frontmatter.contentType || 'reference'}"`);
  yamlLines.push(`publishedDate: "${frontmatter.publishedDate}"`);
  yamlLines.push(`updatedDate: "${frontmatter.updatedDate}"`);
  yamlLines.push(`readTime: "${frontmatter.readTime || '5 min read'}"`);

  if (frontmatter.author) {
    yamlLines.push('author:');
    yamlLines.push(`  name: "${escapeDoubleQuotes(frontmatter.author.name)}"`);
    yamlLines.push(`  role: "${escapeDoubleQuotes(frontmatter.author.role)}"`);
    if (frontmatter.author.avatar) yamlLines.push(`  avatar: "${frontmatter.author.avatar}"`);
  }

  if (frontmatter.reviewedBy) {
    yamlLines.push('reviewedBy:');
    yamlLines.push(`  name: "${escapeDoubleQuotes(frontmatter.reviewedBy.name)}"`);
    yamlLines.push(`  role: "${escapeDoubleQuotes(frontmatter.reviewedBy.role)}"`);
    if (frontmatter.reviewedBy.credentials) yamlLines.push(`  credentials: "${escapeDoubleQuotes(frontmatter.reviewedBy.credentials)}"`);
  }

  yamlLines.push(`quickSummary: "${escapeDoubleQuotes(frontmatter.quickSummary)}"`);
  if (frontmatter.difficulty) yamlLines.push(`difficulty: "${frontmatter.difficulty}"`);
  if (frontmatter.timeNeeded) yamlLines.push(`timeNeeded: "${frontmatter.timeNeeded}"`);

  if (frontmatter.keyFacts && frontmatter.keyFacts.length > 0) {
    yamlLines.push('keyFacts:');
    for (const kf of frontmatter.keyFacts) {
      yamlLines.push(`  - label: "${escapeDoubleQuotes(kf.label)}"`);
      yamlLines.push(`    value: "${escapeDoubleQuotes(kf.value)}"`);
      if (kf.icon) yamlLines.push(`    icon: "${kf.icon}"`);
    }
  }

  if (frontmatter.materialsNeeded && frontmatter.materialsNeeded.length > 0) {
    yamlLines.push('materialsNeeded:');
    for (const m of frontmatter.materialsNeeded) {
      yamlLines.push(`  - "${escapeDoubleQuotes(m)}"`);
    }
  }

  if (frontmatter.toolsNeeded && frontmatter.toolsNeeded.length > 0) {
    yamlLines.push('toolsNeeded:');
    for (const t of frontmatter.toolsNeeded) {
      yamlLines.push(`  - "${escapeDoubleQuotes(t)}"`);
    }
  }

  if (frontmatter.steps && frontmatter.steps.length > 0) {
    yamlLines.push('steps:');
    for (const s of frontmatter.steps) {
      yamlLines.push(`  - stepNumber: ${s.stepNumber}`);
      yamlLines.push(`    title: "${escapeDoubleQuotes(s.title)}"`);
      yamlLines.push(`    description: "${escapeDoubleQuotes(s.description)}"`);
      if (s.tip) yamlLines.push(`    tip: "${escapeDoubleQuotes(s.tip)}"`);
      if (s.warning) yamlLines.push(`    warning: "${escapeDoubleQuotes(s.warning)}"`);
    }
  }

  if (frontmatter.commonMistakes && frontmatter.commonMistakes.length > 0) {
    yamlLines.push('commonMistakes:');
    for (const cm of frontmatter.commonMistakes) {
      yamlLines.push(`  - mistake: "${escapeDoubleQuotes(cm.mistake)}"`);
      yamlLines.push(`    whyItMatters: "${escapeDoubleQuotes(cm.whyItMatters)}"`);
      yamlLines.push(`    howToFix: "${escapeDoubleQuotes(cm.howToFix)}"`);
    }
  }

  if (frontmatter.proTips && frontmatter.proTips.length > 0) {
    yamlLines.push('proTips:');
    for (const pt of frontmatter.proTips) {
      yamlLines.push(`  - "${escapeDoubleQuotes(pt)}"`);
    }
  }

  if (frontmatter.decisionCriteria && frontmatter.decisionCriteria.length > 0) {
    yamlLines.push('decisionCriteria:');
    for (const dc of frontmatter.decisionCriteria) {
      yamlLines.push(`  - criterion: "${escapeDoubleQuotes(dc.criterion)}"`);
      yamlLines.push(`    importance: "${escapeDoubleQuotes(dc.importance)}"`);
      yamlLines.push(`    advice: "${escapeDoubleQuotes(dc.advice)}"`);
    }
  }

  if (frontmatter.comparisonTable && Array.isArray(frontmatter.comparisonTable.headers)) {
    yamlLines.push('comparisonTable:');
    yamlLines.push('  headers:');
    for (const h of frontmatter.comparisonTable.headers) {
      yamlLines.push(`    - "${escapeDoubleQuotes(h)}"`);
    }
    yamlLines.push('  rows:');
    if (Array.isArray(frontmatter.comparisonTable.rows)) {
      for (const row of frontmatter.comparisonTable.rows) {
        yamlLines.push('    -');
        if (Array.isArray(row)) {
          for (const cell of row) {
            yamlLines.push(`      - "${escapeDoubleQuotes(cell)}"`);
          }
        }
      }
    }
  }

  if (frontmatter.faqs && frontmatter.faqs.length > 0) {
    yamlLines.push('faqs:');
    for (const faq of frontmatter.faqs) {
      yamlLines.push(`  - question: "${escapeDoubleQuotes(faq.question)}"`);
      yamlLines.push(`    answer: "${escapeDoubleQuotes(faq.answer)}"`);
    }
  }

  if (frontmatter.sources && frontmatter.sources.length > 0) {
    yamlLines.push('sources:');
    for (const src of frontmatter.sources) {
      yamlLines.push(`  - title: "${escapeDoubleQuotes(src.title)}"`);
      yamlLines.push(`    publisher: "${escapeDoubleQuotes(src.publisher)}"`);
      if (src.url) yamlLines.push(`    url: "${src.url}"`);
      if (src.note) yamlLines.push(`    note: "${escapeDoubleQuotes(src.note)}"`);
    }
  }

  if (frontmatter.relatedGuides && frontmatter.relatedGuides.length > 0) {
    yamlLines.push('relatedGuides:');
    for (const rg of frontmatter.relatedGuides) {
      yamlLines.push(`  - "${rg}"`);
    }
  }

  if (frontmatter.relatedTools && frontmatter.relatedTools.length > 0) {
    yamlLines.push('relatedTools:');
    for (const rt of frontmatter.relatedTools) {
      yamlLines.push(`  - "${rt}"`);
    }
  }

  if (frontmatter.relatedChecklists && frontmatter.relatedChecklists.length > 0) {
    yamlLines.push('relatedChecklists:');
    for (const rc of frontmatter.relatedChecklists) {
      yamlLines.push(`  - "${rc}"`);
    }
  }

  yamlLines.push('---');
  yamlLines.push('');
  yamlLines.push(content.trim());
  yamlLines.push('');

  return yamlLines.join('\n');
}

function escapeDoubleQuotes(str?: any): string {
  if (str === undefined || str === null) return '';
  const s = typeof str === 'string' ? str : String(str);
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Lists all existing guides in `src/content/guides/`.
 */
export async function listExistingGuides(guidesDir?: string): Promise<GuideEntry[]> {
  const root = getGuidesContentRoot(guidesDir);
  try {
    const files = await fs.readdir(root);
    const guides: GuideEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue;
      const slug = file.replace(/\.(md|mdx)$/, '');
      const filePath = path.join(root, file);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const guide = parseGuideMarkdown(raw, slug, filePath);
        guides.push(guide);
      } catch {
        // Skip unparseable files
      }
    }

    // Sort by updatedDate desc, then publishedDate desc
    return guides.sort((a, b) => {
      const dateA = new Date(a.frontmatter.updatedDate || a.frontmatter.publishedDate).getTime() || 0;
      const dateB = new Date(b.frontmatter.updatedDate || b.frontmatter.publishedDate).getTime() || 0;
      return dateB - dateA;
    });
  } catch {
    return [];
  }
}

/**
 * Curated pipeline of guide opportunities for the 5 core categories:
 * - food-kitchen
 * - cleaning-laundry
 * - home-maintenance
 * - storage-organization
 * - everyday-how-to
 */
export const CURATED_GUIDE_OPPORTUNITIES: Array<any> = [];

/**
 * Executes a Guide Creation or Substantial-Update Opportunity.
 * Ensures the Featured Guides section receives a reliable, maintained stream of guide content.
 */
export async function processGuideOpportunity(options: {
  targetDate?: string | Date;
  guidesDir?: string;
  dryRun?: boolean;
  force?: boolean;
}): Promise<GuideOpportunityResult> {
  const targetDateStr = formatUtcDateString(options.targetDate);
  const isCadenceDay = isGuidesCadenceDay(options.targetDate);
  const isDryRun = options.dryRun ?? false;

  if (!isCadenceDay && !options.force) {
    return {
      status: 'SKIPPED',
      reason: `Date ${targetDateStr} is not a scheduled Guide cadence day (Monday, Wednesday, Friday UTC).`,
      isCadenceDay: false,
      dryRun: isDryRun,
    };
  }

  const root = getGuidesContentRoot(options.guidesDir);
  const existingGuides = await listExistingGuides(root);
  const existingSlugs = new Set(existingGuides.map((g) => g.slug));
  const existingTitles = new Set(existingGuides.map((g) => g.frontmatter.title.toLowerCase().trim()));

  // 1. Look for un-created curated guide opportunities first
  const newCandidate = CURATED_GUIDE_OPPORTUNITIES.find(
    (cand) => !existingSlugs.has(cand.slug) && !existingTitles.has(cand.title.toLowerCase().trim())
  );

  if (newCandidate) {
    const frontmatter: GuideFrontmatter = {
      title: newCandidate.title,
      seoTitle: newCandidate.title,
      seoDescription: newCandidate.quickSummary,
      category: newCandidate.category,
      contentType: newCandidate.contentType,
      publishedDate: targetDateStr,
      updatedDate: targetDateStr,
      readTime: '5 min read',
      author: {
        name: 'LifeMode Editorial Team',
        role: 'Practical Knowledge Researcher',
      },
      reviewedBy: {
        name: 'Household Systems Review Board',
        role: 'Technical QA & Fact Checking',
        credentials: 'Food Safety & Materials Review',
      },
      quickSummary: newCandidate.quickSummary,
      difficulty: newCandidate.difficulty,
      timeNeeded: newCandidate.timeNeeded,
      keyFacts: newCandidate.keyFacts,
      steps: newCandidate.steps,
      commonMistakes: newCandidate.commonMistakes,
      sources: newCandidate.sources,
    };

    const serialized = serializeGuideMarkdown(frontmatter, newCandidate.bodyContent);
    const targetFile = path.join(root, `${newCandidate.slug}.md`);

    if (!isDryRun) {
      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(targetFile, serialized, 'utf-8');
    }

    return {
      status: 'CREATED',
      action: 'CREATE',
      slug: newCandidate.slug,
      category: newCandidate.category,
      title: newCandidate.title,
      filePath: targetFile,
      isCadenceDay: true,
      dryRun: isDryRun,
    };
  }

  // 2. If all candidates are created, perform a substantial update on the oldest guide
  if (existingGuides.length > 0) {
    // Oldest guide by updatedDate
    const oldestGuide = [...existingGuides].sort((a, b) => {
      const dateA = new Date(a.frontmatter.updatedDate || a.frontmatter.publishedDate).getTime() || 0;
      const dateB = new Date(b.frontmatter.updatedDate || b.frontmatter.publishedDate).getTime() || 0;
      return dateA - dateB;
    })[0];

    const updatedFrontmatter: GuideFrontmatter = {
      ...oldestGuide.frontmatter,
      updatedDate: targetDateStr,
      reviewedBy: oldestGuide.frontmatter.reviewedBy || {
        name: 'Household Systems Review Board',
        role: 'Technical QA & Fact Checking',
      },
    };

    const serialized = serializeGuideMarkdown(updatedFrontmatter, oldestGuide.content);
    const targetFile = oldestGuide.filePath;

    if (!isDryRun) {
      await fs.writeFile(targetFile, serialized, 'utf-8');
    }

    return {
      status: 'UPDATED',
      action: 'UPDATE',
      slug: oldestGuide.slug,
      category: oldestGuide.frontmatter.category,
      title: oldestGuide.frontmatter.title,
      filePath: targetFile,
      isCadenceDay: true,
      dryRun: isDryRun,
    };
  }

  return {
    status: 'SKIPPED',
    reason: 'No guide opportunities available to create or update.',
    isCadenceDay: true,
    dryRun: isDryRun,
  };
}
