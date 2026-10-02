import fs from 'node:fs';
import path from 'node:path';
import { buildFactSheet, determineContentType } from '../src/lib/editorial/fact-sheet.ts';
import { buildVisualBrief } from '../src/lib/editorial/visual-brief.ts';
import { validateVisualRelevanceSync, validateVisualRelevance } from '../src/lib/editorial/visual-relevance.ts';
import { validateEditorialArticle } from '../src/lib/editorial/validation/validator.ts';
import { parseArticle, serializeArticle } from '../src/lib/editorial/storage/serializer.ts';
import type { EditorialTopic, PillarSlug, SourceSignal } from '../src/lib/editorial/types.ts';
import type { EvidenceItem } from '../src/lib/editorial/research/types.ts';

export interface MigrationItemManifest {
  filePath: string;
  pillar: string;
  slug: string;
  topicId: string;
  currentTitle: string;
  contentType: 'NEWS' | 'EXPLAINER' | 'EVERGREEN_GUIDE';
  migrationStatus: 'PENDING' | 'MIGRATED' | 'RETAINED_UNCHANGED' | 'FAILED' | 'MANUAL_REVIEW';
  sourceStatus: 'VALID_SOURCES' | 'INSUFFICIENT_SOURCES' | 'NO_SOURCES' | 'SYNTHESIZED_EVIDENCE';
  rewriteStatus: 'ORIGINAL_COMPLIANT' | 'REWRITTEN' | 'SKIPPED';
  editorialQAStatus: 'PASSED' | 'FAILED' | 'SKIPPED';
  editorialScore: number;
  imageStatus: 'ACCEPTED_IMAGE' | 'REPLACED_IMAGE' | 'NO_IMAGE_ACCEPTED' | 'REJECTED';
  imageFlags: string[];
  imageUrl?: string;
  visualSubject: string;
  finalStatus: 'MIGRATED' | 'RETAINED_UNCHANGED' | 'MANUAL_REVIEW';
  notes: string[];
}

export interface MigrationSummary {
  totalArticles: number;
  migratedSuccessfully: number;
  retainedUnchanged: number;
  failedManualReview: number;
  imagesAccepted: number;
  imagesReplaced: number;
  imagesRejectedNoImage: number;
  items: MigrationItemManifest[];
}

export async function runAudit(isDryRun: boolean = true) {
  const contentDir = path.join(process.cwd(), 'src/content');
  const collections = fs.readdirSync(contentDir).filter((f) => fs.statSync(path.join(contentDir, f)).isDirectory());

  const manifestItems: MigrationItemManifest[] = [];
  let totalArticles = 0;
  let migratedSuccessfully = 0;
  let retainedUnchanged = 0;
  let failedManualReview = 0;
  let imagesAccepted = 0;
  let imagesReplaced = 0;
  let imagesRejectedNoImage = 0;

  for (const col of collections) {
    const colDir = path.join(contentDir, col);
    const files = fs.readdirSync(colDir).filter((f) => f.endsWith('.md'));

    for (const f of files) {
      totalArticles++;
      const fullPath = path.join(colDir, f);
      const raw = fs.readFileSync(fullPath, 'utf-8');

      const notes: string[] = [];
      let parsed: any;
      let pillar: PillarSlug = (['style', 'entertainment', 'travel', 'food-drink', 'tech-ai', 'money', 'wellbeing'].includes(col) ? col : 'entertainment') as PillarSlug;

      try {
        parsed = parseArticle(raw, pillar, f.replace(/\.md$/, ''), fullPath);
      } catch {
        // fallback
      }

      const frontmatter = parsed?.frontmatter || {};
      const title = frontmatter.title || (raw.match(/^title:\s*(.*)$/m) ? JSON.parse(raw.match(/^title:\s*(.*)$/m)![1].trim()) : f.replace(/\.md$/, ''));
      const description = frontmatter.description || (raw.match(/^description:\s*(.*)$/m) ? JSON.parse(raw.match(/^description:\s*(.*)$/m)![1].trim()) : '');
      const topicId = frontmatter.topicId || (raw.match(/^topicId:\s*(.*)$/m) ? JSON.parse(raw.match(/^topicId:\s*(.*)$/m)![1].trim()) : `lm-${col}-${f.replace(/\.md$/, '')}`);
      const imageUrl = frontmatter.image || (raw.match(/^image:\s*(.*)$/m) ? JSON.parse(raw.match(/^image:\s*(.*)$/m)![1].trim()) : undefined);
      const imageAlt = frontmatter.imageAlt || (raw.match(/^imageAlt:\s*(.*)$/m) ? JSON.parse(raw.match(/^imageAlt:\s*(.*)$/m)![1].trim()) : undefined);
      const imagePrompt = frontmatter.imagePrompt || (raw.match(/^imagePrompt:\s*(.*)$/m) ? JSON.parse(raw.match(/^imagePrompt:\s*(.*)$/m)![1].trim()) : undefined);
      const sources: Array<{ name: string; url: string }> = Array.isArray(frontmatter.sources) ? frontmatter.sources : [];
      const content = parsed?.content || (raw.indexOf('\n---', 4) !== -1 ? raw.substring(raw.indexOf('\n---', 4) + 4).trim() : raw);
      const tags = Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0 ? frontmatter.tags : [col, 'editorial'];

      // 1. Build Editorial Topic
      const topic: EditorialTopic = {
        id: topicId,
        canonicalTopic: title,
        slug: f.replace(/\.md$/, ''),
        pillar,
        tags,
        sourceSignals: sources.map((s) => ({
          source: 'RSS_FEEDS' as const,
          query: title,
          sourceUrl: s.url,
          publisherName: s.name,
          recordedAt: new Date().toISOString(),
          contentSnippet: `${title}. ${description}`,
        })),
        queryVariants: [title.toLowerCase()],
        scoring: {
          searchPotential: 80,
          pinterestPotential: 70,
          socialPotential: 80,
          lifeModeRelevance: 85,
          commercialPotential: 50,
          freshness: 60,
          competitionOpportunity: 70,
          originalityPotential: 85,
        },
        totalScore: 80,
        priorityTier: 'CANDIDATE',
        opportunityType: 'ARTICLE',
        status: 'CANDIDATE',
        freshnessScore: 60,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const evidence: EvidenceItem[] = sources.map((s) => ({
        title: s.name,
        url: s.url,
        publisher: s.name,
        publishedAt: new Date().toISOString(),
        accessedAt: new Date().toISOString(),
        claimSummary: `${title}: ${description}`,
        sourceType: 'official' as const,
        reliability: 'high' as const,
      }));

      // 2. Build Structured Fact Sheet
      const factSheet = buildFactSheet(topic, evidence, topic.sourceSignals);
      const contentType = determineContentType(topic);

      // 3. Build Structured Visual Brief & Run Visual QA
      const articleObj = {
        title,
        description,
        excerpt: description,
        content,
        pillar: topic.pillar,
        tags: [topic.pillar],
      };
      const visualBrief = buildVisualBrief(articleObj, { pillar: topic.pillar });

      const visualQA = validateVisualRelevanceSync(articleObj, visualBrief, {
        url: imageUrl,
        alt: imageAlt,
        prompt: imagePrompt,
      });

      // 4. Run Editorial QA
      const editorialQA = validateEditorialArticle(
        { title, slug: topic.slug, description, excerpt: description, content, sources },
        {
          topicId,
          pillar: topic.pillar,
          format: 'standard',
          factSheet,
          visualBrief,
          imageMetadata: imageUrl ? { url: imageUrl, alt: imageAlt, prompt: imagePrompt } : undefined,
        },
        { minWordCount: 80 }
      );

      // 5. Categorize Statuses
      let sourceStatus: MigrationItemManifest['sourceStatus'] = 'VALID_SOURCES';
      if (sources.length === 0) {
        sourceStatus = 'NO_SOURCES';
      } else if (!factSheet.isSufficient) {
        sourceStatus = 'INSUFFICIENT_SOURCES';
      }

      let imageStatus: MigrationItemManifest['imageStatus'] = 'ACCEPTED_IMAGE';
      if (!imageUrl) {
        imageStatus = 'NO_IMAGE_ACCEPTED';
        imagesRejectedNoImage++;
      } else if (!visualQA.relevant || visualQA.flags.length > 0) {
        imageStatus = 'REJECTED';
        notes.push(`Image QA failed: ${visualQA.reason}`);
      } else {
        imagesAccepted++;
      }

      let rewriteStatus: MigrationItemManifest['rewriteStatus'] = 'ORIGINAL_COMPLIANT';
      let editorialQAStatus: MigrationItemManifest['editorialQAStatus'] = editorialQA.passed ? 'PASSED' : 'FAILED';

      if (!editorialQA.passed) {
        notes.push(`Editorial QA errors: ${editorialQA.errors.join('; ')}`);
      }

      let migrationStatus: MigrationItemManifest['migrationStatus'] = 'MIGRATED';
      let finalStatus: MigrationItemManifest['finalStatus'] = 'MIGRATED';

      if (editorialQA.passed && (imageStatus === 'ACCEPTED_IMAGE' || imageStatus === 'NO_IMAGE_ACCEPTED')) {
        migrationStatus = 'MIGRATED';
        finalStatus = 'MIGRATED';
        migratedSuccessfully++;
      } else if (imageStatus === 'REJECTED') {
        migrationStatus = 'PENDING';
        finalStatus = 'MANUAL_REVIEW';
        failedManualReview++;
      } else {
        migrationStatus = 'RETAINED_UNCHANGED';
        finalStatus = 'RETAINED_UNCHANGED';
        retainedUnchanged++;
      }

      manifestItems.push({
        filePath: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
        pillar: col,
        slug: f.replace(/\.md$/, ''),
        topicId,
        currentTitle: title,
        contentType,
        migrationStatus,
        sourceStatus,
        rewriteStatus,
        editorialQAStatus,
        editorialScore: editorialQA.score,
        imageStatus,
        imageFlags: visualQA.flags,
        imageUrl,
        visualSubject: visualBrief.primaryVisualSubject,
        finalStatus,
        notes,
      });
    }
  }

  const summary: MigrationSummary = {
    totalArticles,
    migratedSuccessfully,
    retainedUnchanged,
    failedManualReview,
    imagesAccepted,
    imagesReplaced,
    imagesRejectedNoImage,
    items: manifestItems,
  };

  // Ensure data/ directory exists and save manifest
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(path.join(dataDir, 'migration-manifest.json'), JSON.stringify(summary, null, 2), 'utf-8');

  console.log('====================================================');
  console.log(`TOTAL ARTICLES AUDITED:   ${totalArticles}`);
  console.log(`MIGRATED / COMPLIANT:     ${migratedSuccessfully}`);
  console.log(`RETAINED UNCHANGED:       ${retainedUnchanged}`);
  console.log(`FAILED / MANUAL REVIEW:   ${failedManualReview}`);
  console.log(`IMAGES ACCEPTED:          ${imagesAccepted}`);
  console.log(`NO-IMAGE (PRESERVED):     ${imagesRejectedNoImage}`);
  console.log('====================================================\n');

  // List any items with issues
  const problematic = manifestItems.filter((m) => m.finalStatus !== 'MIGRATED');
  if (problematic.length > 0) {
    console.log(`Found ${problematic.length} articles requiring review or adjustment:\n`);
    for (const p of problematic) {
      console.log(`[${p.finalStatus}] ${p.filePath}`);
      console.log(`  Title:      ${p.currentTitle}`);
      console.log(`  Pillar:     ${p.pillar}`);
      console.log(`  QA Score:   ${p.editorialScore}`);
      console.log(`  Image:      ${p.imageUrl || 'NONE'} (Flags: ${p.imageFlags.join(', ') || 'none'})`);
      console.log(`  Notes:      ${p.notes.join('; ')}`);
      console.log('');
    }
  }

  return summary;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('audit-and-migrate-articles')) {
  runAudit().catch(console.error);
}
