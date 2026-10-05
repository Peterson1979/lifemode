import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const publicEditorial = path.join(process.cwd(), 'public', 'editorial');
const wealthDir = path.join(publicEditorial, 'wealth');
const lifeDir = path.join(publicEditorial, 'life');
const techDir = path.join(publicEditorial, 'tech-ai');

for (const d of [wealthDir, lifeDir, techDir]) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

const brainBase = 'C:\\Users\\opeti\\.gemini\\antigravity-ide\\brain\\5c05e161-ee77-479c-a8d7-95d81a179355';

// 1. Process Wealth Images
const wealthMap = [
  { src: 'b2b_microservice_desk_1791199827259.jpg', dest: 'b2b-micro-service-workstation.webp' },
  { src: 'digital_template_workspace_1791199844886.jpg', dest: 'digital-templates-spreadsheet-system.webp' },
  { src: 'freelance_retainer_desk_1791199861170.jpg', dest: 'freelance-retainer-contract-planning.webp' },
  { src: 'newsletter_curation_desk_1791199876929.jpg', dest: 'newsletter-curation-analytics.webp' },
  { src: 'ecommerce_apparel_studio_1791199900156.jpg', dest: 'selective-ecommerce-product-mockup.webp' },
];

console.log('1. Converting Wealth images...');
for (const item of wealthMap) {
  const srcPath = path.join(brainBase, item.src);
  const destPath = path.join(wealthDir, item.dest);
  await sharp(srcPath)
    .resize(1200, 675, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(destPath);
  console.log(`✓ Created ${destPath}`);
}

// 2. Process Life Images
const lifeMap = [
  { src: 'capsule_wardrobe_rack_1791199917868.jpg', dest: 'minimal-capsule-wardrobe-rack.webp' },
  { src: 'organized_entryway_system_1791199935824.jpg', dest: 'organized-entryway-daily-system.webp' },
  { src: 'minimalist_deep_work_1791199958909.jpg', dest: 'minimalist-deep-work-desk.webp' },
  { src: 'regional_market_travel_1791199979400.jpg', dest: 'regional-market-culinary-travel.webp' },
];

console.log('\n2. Converting Life images...');
for (const item of lifeMap) {
  const srcPath = path.join(brainBase, item.src);
  const destPath = path.join(lifeDir, item.dest);
  await sharp(srcPath)
    .resize(1200, 675, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(destPath);
  console.log(`✓ Created ${destPath}`);
}

// 3. Generate Tech & AI Editorial Visuals
console.log('\n3. Building Tech & AI Editorial Images...');

const techAiBg = path.join(process.cwd(), 'public', 'social', 'backgrounds', 'tech-ai.jpg');

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

const techAiCards = [
  {
    dest: 'ai-tools-evaluation-workspace.webp',
    title: 'AI Tools &amp; LLM Evaluation',
    subtitle: 'ChatGPT vs Claude Benchmarking &amp; Tool Selection',
    icon: '🤖',
    accent: '#7c3aed',
    tags: ['MODEL COMPARISON', 'TOKEN ECONOMICS', 'BENCHMARKING']
  },
  {
    dest: 'ai-automation-workflow-diagram.webp',
    title: 'Reliable AI Automations &amp; Webhooks',
    subtitle: 'Production Event Pipelines, Parsers &amp; Webhook Architecture',
    icon: '⚡',
    accent: '#8b5cf6',
    tags: ['WEBHOOKS', 'DOCUMENT PARSERS', 'EVENT BUS']
  },
  {
    dest: 'prompt-engineering-code-schema.webp',
    title: 'Deterministic Prompt Engineering',
    subtitle: 'Structured JSON Schemas, System Roles &amp; Few-Shot Reliability',
    icon: '🎯',
    accent: '#6366f1',
    tags: ['STRUCTURED SCHEMAS', 'SYSTEM ROLES', 'ZERO DRIFT']
  },
  {
    dest: 'ai-research-agent-architecture.webp',
    title: 'Practical AI Research Agents',
    subtitle: 'Automated Briefs, Niche Research &amp; Client Deliverable Pipelines',
    icon: '💡',
    accent: '#a855f7',
    tags: ['AUTONOMOUS AGENTS', 'NICHE BRIEFS', 'CLIENT PIPELINE']
  },
  {
    dest: 'ai-learning-upskilling-roadmap.webp',
    title: 'Structured AI Learning Roadmap',
    subtitle: 'From Foundations to Production AI Engineering in 2026',
    icon: '📚',
    accent: '#9333ea',
    tags: ['CURRICULUM 2026', 'SKILL PATHS', 'CAREER EXPANSION']
  },
];

for (const card of techAiCards) {
  const destPath = path.join(techDir, card.dest);
  
  const svgOverlay = `
  <svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="darkGrad_${card.dest}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f0728" stop-opacity="0.92"/>
        <stop offset="50%" stop-color="#180b3d" stop-opacity="0.88"/>
        <stop offset="100%" stop-color="#0a051b" stop-opacity="0.95"/>
      </linearGradient>
      <linearGradient id="accentGrad_${card.dest}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${card.accent}"/>
        <stop offset="100%" stop-color="#c084fc"/>
      </linearGradient>
      <filter id="cardShadow_${card.dest}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="24" flood-color="#000000" flood-opacity="0.6"/>
      </filter>
      <linearGradient id="cardBg_${card.dest}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04"/>
      </linearGradient>
    </defs>
    
    <!-- Background Dimmer & Theme Tint -->
    <rect width="1200" height="675" fill="url(#darkGrad_${card.dest})"/>
    
    <!-- Decorative Grid / Circuit Pattern -->
    <g opacity="0.15" stroke="#a855f7" stroke-width="1">
      <line x1="100" y1="0" x2="100" y2="675"/>
      <line x1="300" y1="0" x2="300" y2="675"/>
      <line x1="600" y1="0" x2="600" y2="675"/>
      <line x1="900" y1="0" x2="900" y2="675"/>
      <line x1="1100" y1="0" x2="1100" y2="675"/>
      <line x1="0" y1="135" x2="1200" y2="135"/>
      <line x1="0" y1="270" x2="1200" y2="270"/>
      <line x1="0" y1="405" x2="1200" y2="405"/>
      <line x1="0" y1="540" x2="1200" y2="540"/>
    </g>

    <!-- Glassmorphic Central Feature Card -->
    <rect x="80" y="80" width="1040" height="515" rx="24" fill="url(#cardBg_${card.dest})" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1.5" filter="url(#cardShadow_${card.dest})"/>
    
    <!-- Category Pill Badge -->
    <rect x="130" y="130" width="230" height="42" rx="21" fill="rgba(124, 58, 237, 0.25)" stroke="${card.accent}" stroke-width="1.5"/>
    <text x="155" y="157" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#e9d5ff" letter-spacing="1.5">LIFEMODE TECH &amp; AI</text>
    
    <!-- Main Title -->
    <text x="130" y="240" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="800" fill="#ffffff" letter-spacing="-0.5">${card.title}</text>
    
    <!-- Subtitle -->
    <text x="130" y="295" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="400" fill="#cbd5e1">${card.subtitle}</text>
    
    <!-- Tags Container -->
    <g transform="translate(130, 470)">
      ${card.tags.map((t, idx) => `
        <g transform="translate(${idx * 210}, 0)">
          <rect width="190" height="38" rx="8" fill="rgba(255, 255, 255, 0.07)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1"/>
          <circle cx="20" cy="19" r="4" fill="${card.accent}"/>
          <text x="36" y="24" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#f8fafc" letter-spacing="1">${escapeXml(t)}</text>
        </g>
      `).join('')}
    </g>

    <!-- Visual Watermark Icon Graphic -->
    <g transform="translate(930, 140)">
      <circle cx="80" cy="80" r="75" fill="rgba(124, 58, 237, 0.15)" stroke="url(#accentGrad_${card.dest})" stroke-width="2"/>
      <text x="80" y="105" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="68" text-anchor="middle">${card.icon}</text>
    </g>
  </svg>
  `;

  await sharp(techAiBg)
    .resize(1200, 675, { fit: 'cover' })
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      }
    ])
    .webp({ quality: 85 })
    .toFile(destPath);

  console.log(`✓ Created ${destPath}`);
}

console.log('\nAll 14 editorial images successfully processed and written to disk!');
