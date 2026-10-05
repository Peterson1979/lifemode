const BASE_URL = 'http://localhost:4321';

async function fetchUrl(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url);
  const text = await res.text();
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text,
    url
  };
}

const routesToTest = [
  { name: '1. Homepage', path: '/' },
  { name: '5. /health', path: '/health' },
  { name: '6. /wealth', path: '/wealth' },
  { name: '7. /home', path: '/home' },
  { name: '8. /life', path: '/life' },
  { name: '9. /tech-ai', path: '/tech-ai' },
  { name: '10. /tools', path: '/tools' },
  { name: '11. Food & Drink Article', path: '/food-drink/artisan-seeded-sourdough-bread' },
  { name: '12. Guide', path: '/food-kitchen/how-to-clean-cast-iron-pan' },
  { name: '13. Checklist', path: '/checklists/kitchen-deep-clean-checklist' },
  { name: '14. Life Hacks', path: '/life-hacks' },
  { name: '15. Search JSON', path: '/search.json' },
  { name: 'Legacy /food-drink hub', path: '/food-drink' },
  { name: 'Legacy /guides hub', path: '/guides' },
  { name: 'Legacy /checklists hub', path: '/checklists' },
  { name: 'Legacy category /food-kitchen', path: '/food-kitchen' },
  { name: 'Topic Data API /api/topic-data.json?pillar=tech-ai', path: '/api/topic-data.json?pillar=tech-ai' },
  { name: 'Topic Data API /api/topic-data.json?pillar=health', path: '/api/topic-data.json?pillar=health' },
  { name: 'Topic Data API /api/topic-data.json?pillar=wealth', path: '/api/topic-data.json?pillar=wealth' },
  { name: 'Topic Data API /api/topic-data.json?pillar=money', path: '/api/topic-data.json?pillar=money' },
];

async function runVerification() {
  console.log('=== STARTING FOCUSED PHASE 1 VERIFICATION ===\n');
  const results = [];

  for (const route of routesToTest) {
    try {
      const res = await fetchUrl(route.path);
      const isHtml = res.headers['content-type']?.includes('text/html');
      const isJson = res.headers['content-type']?.includes('application/json');

      const issues = [];

      if (res.status !== 200) {
        issues.push(`HTTP Status ${res.status}`);
      }

      if (isHtml) {
        // Check for raw unescaped template tags or Astro errors
        if (res.text.includes('undefined') && (res.text.includes('class="undefined"') || res.text.includes('href="undefined"'))) {
          issues.push('Found "undefined" attribute in HTML');
        }
        if (res.text.includes('NaN')) {
          issues.push('Found "NaN" in rendered HTML');
        }
        if (res.text.includes('[object Object]')) {
          issues.push('Found "[object Object]" rendered in HTML');
        }
        // Check for basic HTML completeness
        if (!res.text.includes('<!DOCTYPE html>') && !res.text.includes('<html')) {
          issues.push('Missing DOCTYPE or <html> tag');
        }
        if (!res.text.includes('</html>')) {
          issues.push('Unclosed </html> tag');
        }
      }

      if (isJson) {
        try {
          const parsed = JSON.parse(res.text);
          if (route.path === '/search.json') {
            if (!Array.isArray(parsed) || parsed.length === 0) {
              issues.push('Search index JSON is empty or not an array');
            } else {
              console.log(`  [INFO] Search index has ${parsed.length} indexed documents.`);
            }
          }
        } catch (e) {
          issues.push(`Failed to parse JSON: ${e.message}`);
        }
      }

      results.push({
        ...route,
        status: res.status,
        issues,
        htmlLength: res.text.length
      });

      console.log(`${issues.length === 0 ? '✅ PASS' : '❌ FAIL'}: ${route.name} (${route.path}) -> ${res.status} [${res.text.length} bytes]`);
      if (issues.length > 0) {
        issues.forEach(iss => console.log(`   ⚠️  Issue: ${iss}`));
      }
    } catch (err) {
      console.log(`❌ ERROR: ${route.name} (${route.path}) -> ${err.message}`);
      results.push({
        ...route,
        status: 0,
        issues: [err.message]
      });
    }
  }

  console.log('\n=== VERIFYING ASSETS & IMAGES ===');
  const assetPaths = [
    '/assets/branding/lifemode-logo.webp',
    '/assets/projects/aizodiac_logo.png',
    '/assets/projects/dreamly_ai_logo.png',
    '/assets/projects/getaiset_logo.png'
  ];

  for (const asset of assetPaths) {
    try {
      const res = await fetchUrl(asset);
      if (res.status === 200) {
        console.log(`✅ PASS: Asset ${asset} exists (${res.headers['content-type']}, ${res.text.length} bytes)`);
      } else {
        console.log(`❌ FAIL: Asset ${asset} returned HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`❌ ERROR: Asset ${asset} fetch failed: ${e.message}`);
    }
  }

  console.log('\n=== COMPLETED ROUTE CHECKS ===');
}

runVerification().catch(console.error);
