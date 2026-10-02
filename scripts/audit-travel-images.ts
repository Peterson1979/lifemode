import fs from 'node:fs';
import path from 'node:path';
import { buildVisualBrief } from '../src/lib/editorial/visual-brief.ts';
import { validateVisualRelevanceSync } from '../src/lib/editorial/visual-relevance.ts';

const dir = path.join(process.cwd(), 'src/content/travel');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

console.log(`Found ${files.length} travel articles to review.\n`);

for (const f of files) {
  const content = fs.readFileSync(path.join(dir, f), 'utf-8');
  const titleMatch = content.match(/^title:\s*(.*)$/m);
  const descMatch = content.match(/^description:\s*(.*)$/m);
  const imageMatch = content.match(/^image:\s*(.*)$/m);
  const altMatch = content.match(/^imageAlt:\s*(.*)$/m);
  const promptMatch = content.match(/^imagePrompt:\s*(.*)$/m);

  const title = titleMatch ? JSON.parse(titleMatch[1]) : '';
  const description = descMatch ? JSON.parse(descMatch[1]) : '';
  const image = imageMatch ? JSON.parse(imageMatch[1]) : undefined;
  const alt = altMatch ? JSON.parse(altMatch[1]) : undefined;
  const prompt = promptMatch ? JSON.parse(promptMatch[1]) : undefined;

  const article = { title, description, content, pillar: 'travel' as const, tags: ['travel'] };
  const brief = buildVisualBrief(article, { pillar: 'travel' });
  const result = validateVisualRelevanceSync(article, brief, { url: image, alt, prompt });

  console.log('====================================================');
  console.log(`File:            ${f}`);
  console.log(`Title:           ${title}`);
  console.log(`Expected:        ${brief.primaryEntity}`);
  console.log(`Visual Subject:  ${brief.primaryVisualSubject}`);
  console.log(`Current Image:   ${image || 'NONE'}`);
  console.log(`QA Result:       ${result.relevant ? 'PASS' : 'FAIL'} (Confidence: ${result.confidence})`);
  if (!result.relevant || result.flags.length > 0) {
    console.log(`Flags:           ${result.flags.join(', ')}`);
    console.log(`Reason:          ${result.reason}`);
  }
}
