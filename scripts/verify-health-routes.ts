import fs from 'node:fs';
import path from 'node:path';

const distDir = path.join(process.cwd(), 'dist');

const routes = [
  {
    name: 'Health Topic Index',
    htmlPath: path.join(distDir, 'health', 'index.html'),
    expectedImages: [
      '/editorial/health/morning-sunlight-circadian-routine.webp',
      '/editorial/health/zone-2-easy-cardio-training.webp',
      '/editorial/health/protein-rich-everyday-nutrition.webp',
      '/editorial/health/continuous-glucose-monitor-sensor.webp',
    ],
  },
  {
    name: 'Morning Sunlight Article',
    htmlPath: path.join(distDir, 'health', 'morning-light-circadian-timing-protocol', 'index.html'),
    expectedImages: [
      '/editorial/health/morning-sunlight-circadian-routine.webp',
    ],
  },
  {
    name: 'Zone 2 Cardio Article',
    htmlPath: path.join(distDir, 'health', 'zone-2-mitochondrial-base-training', 'index.html'),
    expectedImages: [
      '/editorial/health/zone-2-easy-cardio-training.webp',
    ],
  },
  {
    name: 'Protein Guide Article',
    htmlPath: path.join(distDir, 'health', 'dietary-protein-distribution-muscle-synthesis', 'index.html'),
    expectedImages: [
      '/editorial/health/protein-rich-everyday-nutrition.webp',
    ],
  },
  {
    name: 'Glucose Monitors Article',
    htmlPath: path.join(distDir, 'health', 'continuous-glucose-monitoring-healthy-adults', 'index.html'),
    expectedImages: [
      '/editorial/health/continuous-glucose-monitor-sensor.webp',
    ],
  },
];

console.log('=== VERIFYING HEALTH ROUTES & BUILT HTML ASSETS ===\n');

let allOk = true;

for (const route of routes) {
  if (!fs.existsSync(route.htmlPath)) {
    console.error(`✗ Missing built file: ${route.htmlPath}`);
    allOk = false;
    continue;
  }

  const html = fs.readFileSync(route.htmlPath, 'utf8');
  console.log(`Checking [${route.name}] (${route.htmlPath})...`);

  for (const expectedImg of route.expectedImages) {
    const present = html.includes(expectedImg);
    const assetOnDisk = fs.existsSync(path.join(distDir, expectedImg.replace(/^\//, '')));
    
    console.log(`  - Expected Image: ${expectedImg}`);
    console.log(`    HTML reference: ${present ? '✓ FOUND' : '✗ MISSING'}`);
    console.log(`    Disk asset in dist: ${assetOnDisk ? '✓ EXISTS' : '✗ MISSING'}`);

    if (!present || !assetOnDisk) {
      allOk = false;
    }
  }
  console.log();
}

if (allOk) {
  console.log('✓ ALL 5 HEALTH ROUTES VERIFIED WITH ACCURATE IMAGE RENDERING AND ASSET RESOLUTION!');
} else {
  console.error('✗ Some verification checks failed.');
  process.exit(1);
}
