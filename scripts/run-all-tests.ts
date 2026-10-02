import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const testDir = path.resolve(process.cwd(), 'tests');
const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts'));

console.log(`Running ${testFiles.length} test files...`);
const failed: { file: string; error: string }[] = [];
const passed: string[] = [];

for (const f of testFiles) {
  try {
    execSync(`npx tsx --test tests/${f}`, { stdio: 'pipe' });
    passed.push(f);
    console.log(`✓ PASS: ${f}`);
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    failed.push({ file: f, error: stderr || stdout });
    console.error(`✗ FAIL: ${f}`);
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Passed: ${passed.length} / ${testFiles.length}`);
console.log(`Failed: ${failed.length} / ${testFiles.length}`);
if (failed.length > 0) {
  console.log('\nFailed files:');
  for (const item of failed) {
    console.log(`- ${item.file}`);
    console.log(`  Details: ${item.error.slice(0, 300)}...\n`);
  }
}
