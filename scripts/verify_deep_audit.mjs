import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function startStaticServer(distDir) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
  };

  const server = http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, BASE_URL);
      let pathname = decodeURIComponent(parsedUrl.pathname);

      let filePath = path.join(distDir, pathname);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath)) {
        // Check if pathname + .html exists
        if (fs.existsSync(filePath + '.html')) {
          filePath = filePath + '.html';
        } else if (fs.existsSync(path.join(distDir, pathname, 'index.html'))) {
          filePath = path.join(distDir, pathname, 'index.html');
        }
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Error: ${err.message}`);
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', () => {
      resolve(server);
    });
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        resolve(null); // Port already in use, external server running
      } else {
        reject(e);
      }
    });
  });
}

async function fetchPage(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url);
  const text = await res.text();
  return {
    path,
    url,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text,
  };
}

function extractMatches(html, regex) {
  const matches = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    matches.push(match);
  }
  return matches;
}

async function runDeepAudit() {
  const distDir = path.resolve(process.cwd(), 'dist');
  const server = await startStaticServer(distDir);
  try {
  console.log('====================================================');
  console.log(' LIFEMODE PHASE 1 DEEP VERIFICATION & AUDIT');
  console.log('====================================================\n');

  const pagesToCheck = [
    { id: '1', name: 'Homepage', path: '/' },
    { id: '2 & 3', name: 'Header & Navigation (Desktop + Mobile)', path: '/' },
    { id: '4', name: 'Footer', path: '/' },
    { id: '5', name: 'Health Hub', path: '/health' },
    { id: '6', name: 'Wealth Hub', path: '/wealth' },
    { id: '7', name: 'Home Hub', path: '/home' },
    { id: '8', name: 'Life Hub', path: '/life' },
    { id: '9', name: 'Tech & AI Hub', path: '/tech-ai' },
    { id: '10', name: 'Tools Hub', path: '/tools' },
    { id: '11', name: 'Food & Kitchen Decision Guide', path: '/food-kitchen/cookware-material-decision-guide' },
    { id: '12', name: 'Guide Page', path: '/food-kitchen/how-to-clean-cast-iron-pan' },
    { id: '13', name: 'Checklist Page', path: '/checklists/kitchen-deep-clean-checklist' },
    { id: '14', name: 'Life Hacks Hub', path: '/life-hacks' },
    { id: '15', name: 'Search Modal / Index', path: '/search.json' },
    { id: '16', name: 'About Page (Ecosystem/Owned Promo)', path: '/about' },
  ];

  const allLinks = new Set();
  const allImages = new Set();
  const auditReport = [];

  for (const item of pagesToCheck) {
    console.log(`\n--- Inspecting [${item.id}] ${item.name} (${item.path}) ---`);
    const page = await fetchPage(item.path);
    const issues = [];
    const html = page.text;

    if (page.status !== 200) {
      issues.push(`HTTP Status ${page.status}`);
    }

    if (item.path === '/search.json') {
      try {
        const json = JSON.parse(html);
        if (!Array.isArray(json) || json.length === 0) {
          issues.push('Search index JSON is empty or not an array');
        } else {
          console.log(`  ✓ Search JSON valid: ${json.length} items indexed across all pillars.`);
          const sample = json[0];
          if (!sample.title || !sample.url || !sample.category) {
            issues.push(`Search item missing required fields: ${JSON.stringify(sample)}`);
          }
        }
      } catch (e) {
        issues.push(`JSON parse error: ${e.message}`);
      }
      auditReport.push({ ...item, issues });
      continue;
    }

    // 1. Check <title> and meta description
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : null;

    if (!title) issues.push('Missing <title> tag');
    if (!metaDesc) issues.push('Missing meta description');
    console.log(`  ✓ Title: "${title?.substring(0, 60)}..."`);

    // 2. Check Header Navigation
    const navDesktopSection = html.match(/<nav class="nav-desktop"[^>]*>([\s\S]*?)<\/nav>/i);
    if (!navDesktopSection) {
      issues.push('Desktop navigation <nav class="nav-desktop"> not found');
    } else {
      const desktopLinks = extractMatches(navDesktopSection[1], /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi);
      const expectedPillars = ['/health', '/wealth', '/home', '/life', '/tech-ai', '/tools'];
      const foundHrefs = desktopLinks.map(m => m[1]);
      console.log(`  ✓ Desktop Nav Links (${desktopLinks.length}): ${foundHrefs.join(', ')}`);

      if (desktopLinks.length !== 6) {
        issues.push(`Expected 6 desktop nav items, found ${desktopLinks.length}`);
      }
      for (const ep of expectedPillars) {
        if (!foundHrefs.includes(ep)) {
          issues.push(`Missing desktop nav link for ${ep}`);
        }
      }

      // Check active state
      if (expectedPillars.includes(item.path)) {
        const activeMatch = navDesktopSection[1].match(/<a[^>]*href=["']([^"']*)["'][^>]*class=["'][^"']*active[^"']*["']/i);
        if (!activeMatch) {
          issues.push(`Active nav class missing on ${item.path}`);
        } else if (activeMatch[1] !== item.path) {
          issues.push(`Active nav mismatch: expected ${item.path}, got ${activeMatch[1]}`);
        } else {
          console.log(`  ✓ Active nav state verified: ${activeMatch[1]}`);
        }
      }
    }

    // 3. Mobile Navigation Drawer
    const mobileDrawer = html.match(/<details class="mobile-nav-details"[\s\S]*?<\/details>/i);
    if (!mobileDrawer) {
      issues.push('Mobile nav drawer <details class="mobile-nav-details"> missing');
    } else {
      const mobileLinks = extractMatches(mobileDrawer[0], /<a\s+[^>]*href=["']([^"']*)["'][^>]*class=["'][^"']*mobile-nav-link[^"']*["']|<a\s+[^>]*class=["'][^"']*mobile-nav-link[^"']*["'][^>]*href=["']([^"']*)["']/gi);
      const mobileHrefs = mobileLinks.map(m => m[1] || m[2]);
      console.log(`  ✓ Mobile Nav Drawer Links (${mobileHrefs.length}): ${mobileHrefs.join(', ')}`);
      if (mobileHrefs.length < 7) { // Home + 6 pillars = 7
        issues.push(`Expected at least 7 mobile nav links, found ${mobileHrefs.length}`);
      }
    }

    // 4. Header Brand Logo
    const brandLogoMatch = html.match(/<img\s+[^>]*class=["'][^"']*brand-logo-img[^"']*["']|<img\s+[^>]*src=["'][^"']*branding\/lifemode-logo[^"']*["']/i);
    if (!brandLogoMatch) {
      issues.push('Brand logo img (.brand-logo-img) missing');
    } else {
      const srcMatch = brandLogoMatch[0].match(/src=["']([^"']*)["']/i) || html.match(/src=["'](\/assets\/branding\/lifemode-logo\.webp)["']/i);
      const logoSrc = srcMatch ? srcMatch[1] : '/assets/branding/lifemode-logo.webp';
      allImages.add(logoSrc);
      console.log(`  ✓ Brand logo found: ${logoSrc}`);
    }

    // 5. Check Footer
    const footerMatch = html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/i);
    if (!footerMatch) {
      issues.push('Site footer missing');
    } else {
      const footerLinks = extractMatches(footerMatch[0], /<a[^>]*href=["']([^"']*)["']/gi);
      console.log(`  ✓ Footer present with ${footerLinks.length} navigation links`);
    }

    // 6. Check Search Modal
    const hasSearchModal = html.includes('id="search-modal"');
    const hasSearchBtn = html.includes('id="open-search-btn"');
    if (!hasSearchModal) issues.push('Search modal markup (#search-modal) missing');
    if (!hasSearchBtn) issues.push('Search button (#open-search-btn) missing');

    // 7. Check for raw unescaped template artifacts
    if (html.includes('undefined') && (html.includes('class="undefined"') || html.includes('href="undefined"') || html.includes('src="undefined"'))) {
      issues.push('Found "undefined" attribute value in rendered HTML');
    }
    if (html.includes('[object Object]')) {
      issues.push('Found "[object Object]" rendered in HTML');
    }

    // 8. Extract all links and images
    const linkMatches = extractMatches(html, /<a[^>]*href=["']([^"']*)["']/gi);
    linkMatches.forEach(m => {
      const href = m[1];
      if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('javascript:')) {
        allLinks.add(href);
      }
    });

    const imgMatches = extractMatches(html, /<img[^>]*src=["']([^"']*)["']/gi);
    imgMatches.forEach(m => {
      const src = m[1];
      if (src && !src.startsWith('data:')) {
        allImages.add(src);
      }
    });

    // 9. Topic Intelligence Section on pillar pages
    if (['/health', '/wealth', '/home', '/life', '/tech-ai'].includes(item.path)) {
      const hasTopicData = html.includes('class="topic-data-section"') || html.includes('data-pillar=');
      if (!hasTopicData) {
        issues.push(`Topic Intelligence section missing on ${item.name}`);
      } else {
        const pillarMatch = html.match(/data-pillar=["']([^"']*)["']/i);
        console.log(`  ✓ Topic Intelligence Section active (pillar="${pillarMatch ? pillarMatch[1] : 'unknown'}")`);
      }
    }

    // 10. Check specific elements on article / guide / checklist / life-hacks / about
    if (item.id === '11') {
      const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
      console.log(`  ✓ Food & Drink Article <h1>: "${h1Match ? h1Match[1].trim() : 'NONE'}"`);
      if (!h1Match) issues.push('Article <h1> missing');
    }

    if (item.id === '12') {
      const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
      console.log(`  ✓ Guide <h1>: "${h1Match ? h1Match[1].trim() : 'NONE'}"`);
      if (!h1Match) issues.push('Guide <h1> missing');
    }

    if (item.id === '13') {
      const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
      console.log(`  ✓ Checklist <h1>: "${h1Match ? h1Match[1].trim() : 'NONE'}"`);
      if (!h1Match) issues.push('Checklist <h1> missing');
    }

    if (item.id === '14') {
      const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
      console.log(`  ✓ Life Hacks <h1>: "${h1Match ? h1Match[1].trim() : 'NONE'}"`);
      if (!h1Match) issues.push('Life Hacks <h1> missing');
    }

    if (item.id === '16') {
      console.log(`  ✓ About / Ecosystem Page loaded.`);
    }

    auditReport.push({ ...item, issues });
    if (issues.length === 0) {
      console.log(`  ==> RESULT: ✅ PASS`);
    } else {
      console.log(`  ==> RESULT: ❌ FAIL (${issues.length} issues)`);
      issues.forEach(iss => console.log(`      - ${iss}`));
    }
  }

  // Verify internal links
  console.log('\n====================================================');
  console.log(` VERIFYING ALL COLLECTED INTERNAL LINKS (${allLinks.size} total)`);
  console.log('====================================================');

  const internalLinks = Array.from(allLinks).filter(l => l.startsWith('/') && !l.startsWith('//'));
  console.log(`Testing ${internalLinks.length} unique internal links...`);

  let brokenLinks = [];
  for (const link of internalLinks) {
    try {
      const cleanLink = link.split('#')[0];
      const res = await fetch(`${BASE_URL}${cleanLink}`);
      if (res.status >= 400) {
        console.log(`  ❌ BROKEN LINK: ${link} -> HTTP ${res.status}`);
        brokenLinks.push({ link, status: res.status });
      }
    } catch (e) {
      console.log(`  ❌ LINK FETCH ERROR: ${link} -> ${e.message}`);
      brokenLinks.push({ link, error: e.message });
    }
  }
  if (brokenLinks.length === 0) {
    console.log(`  ✅ All ${internalLinks.length} internal links returned HTTP 200 OK!`);
  }

  // Verify internal images
  console.log('\n====================================================');
  console.log(` VERIFYING ALL COLLECTED IMAGE ASSETS (${allImages.size} total)`);
  console.log('====================================================');

  const internalImages = Array.from(allImages).filter(src => src.startsWith('/') && !src.startsWith('//'));
  console.log(`Testing ${internalImages.length} unique internal image assets...`);

  let brokenImages = [];
  for (const img of internalImages) {
    try {
      const res = await fetch(`${BASE_URL}${img}`);
      if (res.status !== 200) {
        console.log(`  ❌ BROKEN IMAGE: ${img} -> HTTP ${res.status}`);
        brokenImages.push({ img, status: res.status });
      }
    } catch (e) {
      console.log(`  ❌ IMAGE FETCH ERROR: ${img} -> ${e.message}`);
      brokenImages.push({ img, error: e.message });
    }
  }
  if (brokenImages.length === 0) {
    console.log(`  ✅ All ${internalImages.length} image assets returned HTTP 200 OK!`);
  }

  console.log('\n====================================================');
  console.log(' FINAL AUDIT SUMMARY');
  console.log('====================================================');
  const failedPages = auditReport.filter(r => r.issues && r.issues.length > 0);
  if (failedPages.length === 0 && brokenLinks.length === 0 && brokenImages.length === 0) {
    console.log('🎉 OVERALL STATUS: ALL 16 ITEMS PASSED WITH 0 ISSUES!');
  } else {
    console.log(`⚠️ OVERALL STATUS: ${failedPages.length} pages failed, ${brokenLinks.length} broken links, ${brokenImages.length} broken images.`);
  }
  } finally {
    if (server) {
      server.close();
    }
  }
}

runDeepAudit().catch(console.error);
