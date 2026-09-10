import type {
  StoredArticleFrontmatter,
  StoredArticle,
  ArticleLifecycleStatus,
  PillarSlug,
  ArticleFormat,
  SearchIntent,
  RiskLevel,
} from './types.ts';
import { VALID_PILLARS } from '../types.ts';

/**
 * Valid formats and intents for validation during parsing.
 */
const VALID_FORMATS: ArticleFormat[] = [
  'standard',
  'guide',
  'listicle',
  'deep-dive',
  'dispatch',
  'curation',
];

const VALID_INTENTS: SearchIntent[] = [
  'informational',
  'commercial',
  'navigational',
  'transactional',
  'inspirational',
];

const VALID_RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high'];

const VALID_LIFECYCLE_STATUSES: ArticleLifecycleStatus[] = [
  'DRAFT',
  'REVIEWED',
  'APPROVED',
  'STORED',
  'PUBLISHED',
  'ARCHIVED',
];

/**
 * Serializes frontmatter and content into a canonical UTF-8 Markdown file string with YAML frontmatter.
 *
 * This function is pure and does not mutate the input object.
 */
export function serializeArticle(input: {
  frontmatter: StoredArticleFrontmatter;
  content: string;
}): string {
  const { frontmatter, content } = input;

  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new Error('Frontmatter must be a non-null object.');
  }

  if (typeof content !== 'string') {
    throw new Error('Article content body must be a string.');
  }

  const lines: string[] = ['---'];

  // Required core Astro fields
  lines.push(`title: ${JSON.stringify(frontmatter.title)}`);
  lines.push(`description: ${JSON.stringify(frontmatter.description)}`);
  lines.push(`pubDate: ${JSON.stringify(frontmatter.pubDate)}`);

  if (frontmatter.updatedDate) {
    lines.push(`updatedDate: ${JSON.stringify(frontmatter.updatedDate)}`);
  }

  lines.push(`author: ${JSON.stringify(frontmatter.author || 'LifeMode Editorial')}`);
  lines.push(`tags: ${JSON.stringify(frontmatter.tags || [])}`);
  lines.push(`featured: ${Boolean(frontmatter.featured)}`);
  lines.push(`draft: ${Boolean(frontmatter.draft)}`);

  // Content Engine / Storage fields
  lines.push(`format: ${JSON.stringify(frontmatter.format || 'standard')}`);

  if (frontmatter.topicId) {
    lines.push(`topicId: ${JSON.stringify(frontmatter.topicId)}`);
  }

  if (frontmatter.audience) {
    lines.push(`audience: ${JSON.stringify(frontmatter.audience)}`);
  }

  lines.push(`primaryIntent: ${JSON.stringify(frontmatter.primaryIntent || 'informational')}`);

  if (frontmatter.secondaryIntent) {
    lines.push(`secondaryIntent: ${JSON.stringify(frontmatter.secondaryIntent)}`);
  }

  lines.push(`affiliateIntent: ${Boolean(frontmatter.affiliateIntent)}`);
  lines.push(`riskLevel: ${JSON.stringify(frontmatter.riskLevel || 'low')}`);

  if (Array.isArray(frontmatter.sources) && frontmatter.sources.length > 0) {
    lines.push('sources:');
    for (const source of frontmatter.sources) {
      lines.push(`  - name: ${JSON.stringify(source.name)}`);
      lines.push(`    url: ${JSON.stringify(source.url || '')}`);
    }
  } else {
    lines.push('sources: []');
  }

  if (frontmatter.image) {
    lines.push(`image: ${JSON.stringify(frontmatter.image)}`);
  }

  if (frontmatter.imageAlt) {
    lines.push(`imageAlt: ${JSON.stringify(frontmatter.imageAlt)}`);
  }

  if (frontmatter.imagePrompt) {
    lines.push(`imagePrompt: ${JSON.stringify(frontmatter.imagePrompt)}`);
  }

  if (frontmatter.imageSource) {
    lines.push(`imageSource: ${JSON.stringify(frontmatter.imageSource)}`);
  }

  if (frontmatter.readingTime) {
    lines.push(`readingTime: ${JSON.stringify(frontmatter.readingTime)}`);
  }

  lines.push(`version: ${Number.isInteger(frontmatter.version) ? frontmatter.version : 1}`);
  lines.push(`lifecycleStatus: ${JSON.stringify(frontmatter.lifecycleStatus || 'STORED')}`);

  lines.push('---');
  lines.push('');

  const trimmedBody = content.trim();
  if (trimmedBody.length > 0) {
    lines.push(trimmedBody);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parses raw stored Markdown file content into a typed StoredArticle object.
 *
 * Strict validation ensures malformed files are rejected deterministically.
 */
export function parseArticle(
  rawContent: string,
  pillar: PillarSlug,
  slug: string,
  filePath: string = ''
): StoredArticle {
  if (typeof rawContent !== 'string') {
    throw new Error('Raw article content must be a string.');
  }

  if (!VALID_PILLARS.includes(pillar)) {
    throw new Error(`Unsupported pillar "${pillar}".`);
  }

  const normalized = rawContent.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n')) {
    throw new Error('Malformed article: File must start with "---" YAML frontmatter delimiter.');
  }

  const secondDelimiterIndex = normalized.indexOf('\n---\n', 4);
  if (secondDelimiterIndex === -1) {
    const altDelimiterIndex = normalized.indexOf('\n---', 4);
    if (altDelimiterIndex === -1) {
      throw new Error('Malformed article: Missing closing "---" YAML frontmatter delimiter.');
    }
  }

  const endFrontmatterIndex = normalized.indexOf('\n---', 4);
  const frontmatterBlock = normalized.substring(4, endFrontmatterIndex);
  const markdownBody = normalized.substring(endFrontmatterIndex + 4).replace(/^\n+/, '').trim();

  const parsedData: Record<string, any> = parseSimpleYaml(frontmatterBlock);

  // Validate mandatory fields
  if (!parsedData.title || typeof parsedData.title !== 'string' || !parsedData.title.trim()) {
    throw new Error('Malformed article frontmatter: "title" is required and must be a non-empty string.');
  }

  if (!parsedData.description || typeof parsedData.description !== 'string' || !parsedData.description.trim()) {
    throw new Error('Malformed article frontmatter: "description" is required and must be a non-empty string.');
  }

  if (!parsedData.pubDate || typeof parsedData.pubDate !== 'string') {
    throw new Error('Malformed article frontmatter: "pubDate" is required.');
  }

  const format = (parsedData.format || 'standard') as ArticleFormat;
  if (!VALID_FORMATS.includes(format)) {
    throw new Error(`Malformed article frontmatter: Unsupported format "${parsedData.format}".`);
  }

  const primaryIntent = (parsedData.primaryIntent || 'informational') as SearchIntent;
  if (!VALID_INTENTS.includes(primaryIntent)) {
    throw new Error(`Malformed article frontmatter: Unsupported primaryIntent "${parsedData.primaryIntent}".`);
  }

  const riskLevel = (parsedData.riskLevel || 'low') as RiskLevel;
  if (!VALID_RISK_LEVELS.includes(riskLevel)) {
    throw new Error(`Malformed article frontmatter: Unsupported riskLevel "${parsedData.riskLevel}".`);
  }

  const lifecycleStatus = (parsedData.lifecycleStatus || 'STORED') as ArticleLifecycleStatus;
  if (!VALID_LIFECYCLE_STATUSES.includes(lifecycleStatus)) {
    throw new Error(`Malformed article frontmatter: Unsupported lifecycleStatus "${parsedData.lifecycleStatus}".`);
  }

  const frontmatter: StoredArticleFrontmatter = {
    title: parsedData.title.trim(),
    description: parsedData.description.trim(),
    pubDate: parsedData.pubDate,
    updatedDate: parsedData.updatedDate,
    author: parsedData.author || 'LifeMode Editorial',
    tags: Array.isArray(parsedData.tags) ? parsedData.tags : [],
    featured: Boolean(parsedData.featured),
    draft: Boolean(parsedData.draft),
    format,
    topicId: parsedData.topicId,
    audience: parsedData.audience,
    primaryIntent,
    secondaryIntent: parsedData.secondaryIntent,
    affiliateIntent: Boolean(parsedData.affiliateIntent),
    riskLevel,
    sources: Array.isArray(parsedData.sources)
      ? parsedData.sources.map((s: any) => ({
          name: String(s.name || ''),
          url: String(s.url || ''),
        }))
      : [],
    image: parsedData.image,
    imageAlt: parsedData.imageAlt,
    imagePrompt: parsedData.imagePrompt,
    imageSource: parsedData.imageSource,
    readingTime: parsedData.readingTime,
    version: typeof parsedData.version === 'number' ? parsedData.version : 1,
    lifecycleStatus,
  };

  return {
    identity: {
      topicId: frontmatter.topicId,
      slug,
      pillar,
    },
    pillar,
    slug,
    frontmatter,
    content: markdownBody,
    filePath,
  };
}

/**
 * Simple, deterministic YAML parser tailored for LifeMode article frontmatter.
 * Handles scalars, booleans, numbers, quoted strings, inline arrays, and sources list.
 */
function parseSimpleYaml(yamlString: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlString.split('\n');

  let currentKey: string | null = null;
  let currentList: any[] | null = null;
  let currentObjectInList: Record<string, any> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // List item under an active key (e.g. sources: - name: ...)
    if (rawLine.startsWith('  - ') || rawLine.startsWith('    ')) {
      if (currentKey && currentList) {
        if (rawLine.startsWith('  - ')) {
          const itemContent = rawLine.substring(4).trim();
          if (itemContent.includes(':')) {
            // Nested object item
            currentObjectInList = {};
            currentList.push(currentObjectInList);
            const [k, ...vParts] = itemContent.split(':');
            const val = vParts.join(':').trim();
            currentObjectInList[k.trim()] = parseYamlValue(val);
          } else {
            // Primitive list item
            currentList.push(parseYamlValue(itemContent));
          }
        } else if (rawLine.startsWith('    ') && currentObjectInList) {
          const itemContent = rawLine.substring(4).trim();
          if (itemContent.includes(':')) {
            const [k, ...vParts] = itemContent.split(':');
            const val = vParts.join(':').trim();
            currentObjectInList[k.trim()] = parseYamlValue(val);
          }
        }
        continue;
      }
    }

    // Top-level key: value
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, colonIndex).trim();
    const valuePart = trimmed.substring(colonIndex + 1).trim();

    if (valuePart === '') {
      // Starting a multi-line list or object
      currentKey = key;
      currentList = [];
      result[key] = currentList;
      currentObjectInList = null;
    } else {
      currentKey = null;
      currentList = null;
      currentObjectInList = null;
      result[key] = parseYamlValue(valuePart);
    }
  }

  return result;
}

/**
 * Parses individual YAML scalar or inline array value.
 */
function parseYamlValue(val: string): any {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;

  // Inline array e.g. ["a", "b"] or []
  if (val.startsWith('[') && val.endsWith(']')) {
    try {
      return JSON.parse(val);
    } catch {
      const inner = val.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((s) => parseYamlValue(s.trim()));
    }
  }

  // Quoted string
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    try {
      return JSON.parse(val);
    } catch {
      return val.slice(1, -1);
    }
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(val)) {
    return Number(val);
  }

  return val;
}
