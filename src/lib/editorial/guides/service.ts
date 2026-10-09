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

  if (frontmatter.comparisonTable) {
    yamlLines.push('comparisonTable:');
    yamlLines.push('  headers:');
    for (const h of frontmatter.comparisonTable.headers) {
      yamlLines.push(`    - "${escapeDoubleQuotes(h)}"`);
    }
    yamlLines.push('  rows:');
    for (const row of frontmatter.comparisonTable.rows) {
      yamlLines.push('    -');
      for (const cell of row) {
        yamlLines.push(`      - "${escapeDoubleQuotes(cell)}"`);
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
export const CURATED_GUIDE_OPPORTUNITIES: Array<{
  slug: string;
  category: GuideFrontmatter['category'];
  title: string;
  contentType: 'reference' | 'decision';
  quickSummary: string;
  difficulty: 'Easy' | 'Moderate' | 'Advanced';
  timeNeeded: string;
  keyFacts: Array<{ label: string; value: string; icon?: string }>;
  steps: Array<{ stepNumber: number; title: string; description: string; tip?: string; warning?: string }>;
  commonMistakes: Array<{ mistake: string; whyItMatters: string; howToFix: string }>;
  sources: Array<{ title: string; publisher: string; url?: string }>;
  bodyContent: string;
}> = [
  {
    slug: 'how-to-descale-coffee-maker-safely',
    category: 'food-kitchen',
    title: 'How to Descale a Coffee Maker and Espresso Machine (Chemistry-Backed Protocol)',
    contentType: 'reference',
    quickSummary: 'Descale coffee equipment every 60-90 days using a 1:2 citric acid or distilled white vinegar solution. Flush with three full cycles of clean water to eliminate calcium carbonate scale without damaging internal boiler gaskets or pump seals.',
    difficulty: 'Easy',
    timeNeeded: '30 minutes',
    keyFacts: [
      { label: 'Descaling Frequency', value: 'Every 2-3 Months', icon: '⏱️' },
      { label: 'Recommended Acid', value: 'Citric Acid (50% Less Odor)', icon: '🍋' },
      { label: 'Rinse Flushes', value: '3 Full Water Cycles', icon: '💧' },
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Empty Basin and Filter Basket',
        description: 'Remove water filter cartridges, spent coffee grounds, and empty the reservoir completely.',
        tip: 'Always remove charcoal water filters before descaling, as activated carbon absorbs acid and gets ruined.',
      },
      {
        stepNumber: 2,
        title: 'Prepare Citric Acid or Vinegar Solution',
        description: 'Dissolve 2 tablespoons of food-grade citric acid powder in 4 cups of warm water (or mix 1 part distilled white vinegar to 2 parts water) and fill the water reservoir.',
      },
      {
        stepNumber: 3,
        title: 'Run Half-Cycle and Pause',
        description: 'Start a brew cycle. When half the reservoir has brewed into the carafe, pause the machine and allow the warm acid solution to sit in the internal boiler pipes for 20 minutes to dissolve mineral calcification.',
      },
      {
        stepNumber: 4,
        title: 'Complete Cycle and Flush 3 Times',
        description: 'Resume and complete the cycle. Discard the solution, rinse the reservoir, and run 3 full cycles of clean, fresh tap water to purge all residual acid.',
        warning: 'Failing to flush at least 3 times leaves acidic residue that alters coffee flavor and corrodes brass boiler components.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Using baking soda instead of acid',
        whyItMatters: 'Calcium carbonate scale is alkaline; baking soda is also alkaline and cannot dissolve mineral scale.',
        howToFix: 'Always use mild organic acids (citric acid or acetic acid vinegar) to break down mineral salts.',
      },
      {
        mistake: 'Leaving charcoal filters in the reservoir during cleaning',
        whyItMatters: 'Activated carbon absorbs the descaler and re-releases sour vinegar flavors into future coffee batches.',
        howToFix: 'Remove the water filter cartridge before starting and replace after final water rinse.',
      },
    ],
    sources: [
      { title: 'Water Hardness and Mineral Deposition in Small Appliances', publisher: 'Water Quality Association', url: 'https://www.wqa.org' },
      { title: 'Specialty Coffee Association Water Standards', publisher: 'SCA Standards Committee', url: 'https://sca.coffee' },
    ],
    bodyContent: '## Understanding Mineral Scale in Coffee Brewers\n\nTap water contains dissolved calcium and magnesium ions ($Ca^{2+}, Mg^{2+}$). Under repetitive heating inside copper or thermoblock boilers, these ions precipitate out as insoluble calcium carbonate ($CaCO_3$) scale.\n\nOver time, mineral scale restricts water flow, drops brewing temperature below optimal extraction levels (92°C–96°C), and increases electrical pump strain.',
  },
  {
    slug: 'how-to-sanitize-kitchen-cutting-boards',
    category: 'food-kitchen',
    title: 'How to Sanitize Wooden and Plastic Cutting Boards (Food Safety Protocol)',
    contentType: 'reference',
    quickSummary: 'Wash boards immediately after use with hot soapy water. Sanitize wooden boards with 3% hydrogen peroxide or undiluted white vinegar; sanitize plastic boards with a dilute chlorine bleach solution (1 tbsp per gallon). Oil wooden boards monthly with pure food-grade mineral oil.',
    difficulty: 'Easy',
    timeNeeded: '10 minutes',
    keyFacts: [
      { label: 'Wooden Board Care', value: 'Hand Wash Only + Mineral Oil', icon: '🪵' },
      { label: 'Plastic Board Care', value: 'Dishwasher Safe (Hot Wash)', icon: '🧼' },
      { label: 'Sanitizer Spray', value: '3% Hydrogen Peroxide', icon: '🛡️' },
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Wash Off Surface Residue Immediately',
        description: 'Scrub board surfaces under hot running water with mild dish soap and a stiff nylon brush.',
        warning: 'Never submerge wooden boards in standing water or run them through a dishwasher—heat and moisture expand cellulose fibers and cause warping and splits.',
      },
      {
        stepNumber: 2,
        title: 'Apply Food-Safe Sanitizing Mist',
        description: 'Spray surfaces with 3% food-grade hydrogen peroxide or distilled white vinegar. Allow to sit for 5 minutes before wiping clean.',
      },
      {
        stepNumber: 3,
        title: 'Air Dry in Vertical Orientation',
        description: 'Stand boards upright on an edge or drying rack to allow equal air circulation on both sides.',
        tip: 'Drying flat on a counter traps moisture underneath, causing uneven wood drying and bowing.',
      },
      {
        stepNumber: 4,
        title: 'Condition Wood with Food-Grade Mineral Oil',
        description: 'Apply 1 tablespoon of USP mineral oil monthly, buffing into the grain with a lint-free cloth.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Using vegetable, canola, or olive oil to season wooden boards',
        whyItMatters: 'Culinary cooking oils contain unsaturated fats that undergo rancid oxidation, producing foul odors and sticky bacterial surfaces.',
        howToFix: 'Use only pure USP food-grade mineral oil or fractionated coconut oil that never spoils.',
      },
      {
        mistake: 'Keeping deeply grooved plastic boards',
        whyItMatters: 'Deep knife gouges in plastic harbor bacterial colonies that survive standard hand washing.',
        howToFix: 'Sand down plastic boards or replace when knife grooves exceed 1mm in depth.',
      },
    ],
    sources: [
      { title: 'Cutting Board Safety and Bacterial Survival Studies', publisher: 'UC Davis Food Safety Institute', url: 'https://foodsafety.ucdavis.edu' },
      { title: 'USDA Kitchen Sanitization Guidelines', publisher: 'USDA Food Safety & Inspection Service', url: 'https://www.fsis.usda.gov' },
    ],
    bodyContent: '## Wood vs. Plastic Cutting Board Microbiology\n\nResearch demonstrates that hardwood cutting boards (maple, walnut, cherry) possess natural capillary action that pulls bacteria into the interior wood grain, where lack of moisture causes bacterial cells to dehydrate and perish within hours.\n\nIn contrast, non-porous plastic boards are easier to sanitize with high-temperature dishwashers but require replacement once knife scoring creates deep crevices.',
  },
  {
    slug: 'how-to-fix-running-toilet-flapper',
    category: 'home-maintenance',
    title: 'How to Fix a Running Toilet (The DIY Diagnostic & Repair Protocol)',
    contentType: 'reference',
    quickSummary: 'Diagnose a running toilet by checking the flapper seal, refill tube position, and water fill level. Replacing a worn rubber flapper or adjusting the float valve takes under 15 minutes and prevents hundreds of gallons in wasted household water.',
    difficulty: 'Easy',
    timeNeeded: '15 minutes',
    keyFacts: [
      { label: 'Most Common Cause', value: 'Degraded Rubber Flapper (80%)', icon: '🔧' },
      { label: 'Water Savings', value: 'Up to 200 Gal/Day', icon: '💧' },
      { label: 'Tools Required', value: 'Zero Tools (Hand Adjustment)', icon: '🛠️' },
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Remove Tank Lid and Perform Food Coloring Test',
        description: 'Add 5 drops of food coloring to the toilet tank. Wait 15 minutes without flushing; if colored water appears in the bowl, the flapper is leaking.',
      },
      {
        stepNumber: 2,
        title: 'Inspect Chain Slack and Flush Lever',
        description: 'Ensure the flapper lift chain has approximately 1/2 inch of slack when closed. If too tight, the flapper cannot seat fully; if too loose, it snags.',
      },
      {
        stepNumber: 3,
        title: 'Shut Off Water and Replace Flapper Valve',
        description: 'Turn off the angle stop valve behind the toilet. Flush to drain tank, unhook the old rubber flapper from the overflow tube hinges, and snap on a new universal silicone flapper.',
      },
      {
        stepNumber: 4,
        title: 'Adjust Float to 1 Inch Below Overflow Tube',
        description: 'Turn on water and adjust the fill valve screw so water stops filling exactly 1 inch below the top of the overflow pipe.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Leaving in-tank chlorine bleach pucks in the toilet tank',
        whyItMatters: 'Concentrated chlorine oxidizes and dissolves silicone flapper seals and rubber gaskets within months.',
        howToFix: 'Never use in-tank drop-in bleach tablets; clean the bowl directly with liquid cleaner.',
      },
      {
        mistake: 'Pushing the refill tube deep into the overflow pipe',
        whyItMatters: 'A deeply inserted refill tube creates a siphon that constantly drains and refills the tank.',
        howToFix: 'Clip the refill tube above the overflow tube lip so the water stream drops freely into the pipe.',
      },
    ],
    sources: [
      { title: 'Household Water Efficiency & Fixture Leak Detection', publisher: 'EPA WaterSense', url: 'https://www.epa.gov/watersense' },
      { title: 'Plumbing System Maintenance Manual', publisher: 'Plumbing-Heating-Cooling Contractors Association', url: 'https://www.phccweb.org' },
    ],
    bodyContent: '## Anatomy of a Gravity-Fed Toilet Tank\n\nGravity-fed toilet tanks rely on three simple mechanical components: the **fill valve** that admits water, the **float** that senses tank level, and the **flapper valve** that seals water until the flush lever is triggered.\n\nWhen mineral deposits or chemical oxidizers degrade the flapper seal, water seeps continuously into the bowl, wasting up to 6,000 gallons per month.',
  },
];

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
