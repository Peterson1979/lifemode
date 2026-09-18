import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import type { PillarSlug, SocialImageFormat } from '../types.ts';

export interface PillarVisualTheme {
  displayName: string;
  accentColor: string;
  accentBg: string;
}

export const PILLAR_VISUAL_THEMES: Record<PillarSlug, PillarVisualTheme> = {
  life: {
    displayName: 'LIFE',
    accentColor: '#FB7185', // Rose
    accentBg: 'rgba(251, 113, 133, 0.2)',
  },
  travel: {
    displayName: 'TRAVEL',
    accentColor: '#38BDF8', // Sky
    accentBg: 'rgba(56, 189, 248, 0.2)',
  },
  'food-drink': {
    displayName: 'FOOD & DRINK',
    accentColor: '#EA580C', // Terracotta Ochre
    accentBg: 'rgba(234, 88, 12, 0.2)',
  },
  'tech-ai': {
    displayName: 'TECH & AI',
    accentColor: '#A78BFA', // Violet
    accentBg: 'rgba(167, 139, 250, 0.2)',
  },
  money: {
    displayName: 'MONEY',
    accentColor: '#34D399', // Emerald
    accentBg: 'rgba(52, 211, 153, 0.2)',
  },
  wellbeing: {
    displayName: 'WELLBEING',
    accentColor: '#FBBF24', // Amber
    accentBg: 'rgba(251, 191, 36, 0.2)',
  },
  discover: {
    displayName: 'DISCOVER',
    accentColor: '#FB923C', // Orange
    accentBg: 'rgba(251, 146, 60, 0.2)',
  },
  now: {
    displayName: 'NOW',
    accentColor: '#F43F5E', // Crimson
    accentBg: 'rgba(244, 63, 94, 0.2)',
  },
};

export const PILLAR_BACKGROUND_FILES: Record<PillarSlug, string> = {
  life: 'public/social/backgrounds/life.jpg',
  travel: 'public/social/backgrounds/travel.jpg',
  'food-drink': 'public/social/backgrounds/food-drink.jpg',
  'tech-ai': 'public/social/backgrounds/tech-ai.jpg',
  money: 'public/social/backgrounds/money.jpg',
  wellbeing: 'public/social/backgrounds/wellbeing.jpg',
  discover: 'public/social/backgrounds/discover.jpg',
  now: 'public/social/backgrounds/now.jpg',
};

/**
 * Resolves and reads a local image file buffer from disk, testing public asset directories and relative paths.
 */
export async function loadLocalImage(imagePath: string, baseDir = process.cwd()): Promise<Buffer | null> {
  const cleanRel = imagePath.replace(/^[/\\]+/, '');
  const candidatePaths = [
    path.resolve(baseDir, 'public', cleanRel),
    path.resolve(baseDir, cleanRel),
    path.resolve(baseDir, imagePath),
    imagePath,
  ];

  for (const candidate of candidatePaths) {
    try {
      const buf = await fs.readFile(candidate);
      if (buf && buf.length > 0) {
        return buf;
      }
    } catch {
      // Continue searching next candidate
    }
  }
  return null;
}

/**
 * Resolves the absolute path to a pillar-specific background image.
 */
export function resolvePillarBackgroundPath(pillar: PillarSlug, baseDir = process.cwd()): string {
  const relPath = PILLAR_BACKGROUND_FILES[pillar] || PILLAR_BACKGROUND_FILES.life;
  return path.resolve(baseDir, relPath);
}

/**
 * XML / SVG special characters escaper.
 */
export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface TitleLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  startY: number;
}

/**
 * Deterministically calculates title typography, word wrapping, and vertical positioning
 * to ensure that titles of any length never overflow the card boundaries.
 */
export function computeTitleLayout(rawTitle: string, maxBoxWidth = 860, maxBoxHeight = 240): TitleLayout {
  const cleanTitle = rawTitle.replace(/\s+/g, ' ').trim();
  const charCount = cleanTitle.length;

  let fontSize = 48;
  let lineHeight = 60;

  if (charCount <= 35) {
    fontSize = 48;
    lineHeight = 60;
  } else if (charCount <= 65) {
    fontSize = 40;
    lineHeight = 50;
  } else if (charCount <= 100) {
    fontSize = 34;
    lineHeight = 42;
  } else {
    fontSize = 28;
    lineHeight = 36;
  }

  // Calculate maximum characters per line using standard bold sans-serif ratio
  const maxLineChars = Math.max(12, Math.floor(maxBoxWidth / (fontSize * 0.58)));
  const maxLines = Math.max(1, Math.floor(maxBoxHeight / lineHeight));

  const words = cleanTitle.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxLineChars) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  // If wrapped lines exceed max lines, clamp to maxLines with word-boundary ellipsis
  if (lines.length > maxLines) {
    const clamped = lines.slice(0, maxLines);
    let lastLine = clamped[maxLines - 1];
    while (lastLine.length + 3 > maxLineChars && lastLine.length > 3) {
      lastLine = lastLine.slice(0, -1);
    }
    clamped[maxLines - 1] = lastLine.trim() + '...';
    
    // Vertical centering offset
    const totalTextHeight = clamped.length * lineHeight;
    const startY = 890 + Math.max(0, Math.floor((maxBoxHeight - totalTextHeight) / 2));
    return { lines: clamped, fontSize, lineHeight, startY };
  }

  const totalTextHeight = lines.length * lineHeight;
  const startY = 890 + Math.max(0, Math.floor((maxBoxHeight - totalTextHeight) / 2));
  return { lines, fontSize, lineHeight, startY };
}

export interface ComposeSocialCardOptions {
  topicId: string;
  pillar: PillarSlug;
  format?: SocialImageFormat;
  title: string;
  articleImage?: string | Buffer | Uint8Array;
  headlineOverlay?: string;
  subheadlineOverlay?: string;
  ctaText?: string;
  customFetch?: typeof fetch;
  baseDir?: string;
}

/**
 * Composes a high-contrast, perfectly framed 1080x1350 LifeMode social card.
 *
 * Visual Layering:
 * 1. Pillar-specific background image (public/social/backgrounds/<pillar>.jpg)
 * 2. Vignette & contrast backdrop
 * 3. Article hero image frame (940x600, rounded corners, subtle border)
 * 4. LifeMode upper-left branding with pill contrast backing
 * 5. Pillar upper-right badge with pill contrast backing & accent dot
 * 6. Dedicated lower-mid title overlay card ensuring 100% legibility on light/dark backgrounds
 * 7. Bottom CTA footer bar
 */
export async function composeSocialCard(options: ComposeSocialCardOptions): Promise<Buffer> {
  const width = 1080;
  const height = options.format === '1080x1080' ? 1080 : 1350;
  const pillar = options.pillar || 'life';
  const theme = PILLAR_VISUAL_THEMES[pillar] || PILLAR_VISUAL_THEMES.life;
  const ctaText = options.ctaText || 'Read the complete guide on lifemode.life';
  const title = options.title || options.headlineOverlay || 'Intentional Living & Design';

  // 1. Resolve & load pillar background
  const bgPath = resolvePillarBackgroundPath(pillar, options.baseDir);
  let backgroundBuffer: Buffer;
  try {
    backgroundBuffer = await sharp(bgPath)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .toBuffer();
  } catch {
    // Graceful fallback if background file cannot be accessed
    backgroundBuffer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 9, g: 9, b: 11, alpha: 1 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  // 2. Prepare article hero image (Width: 940, Height: 600)
  const heroWidth = 940;
  const heroHeight = 600;
  let heroImageBuffer: Buffer | null = null;

  if (options.articleImage) {
    try {
      let rawImageBuffer: Buffer | null = null;

      if (Buffer.isBuffer(options.articleImage) || options.articleImage instanceof Uint8Array) {
        rawImageBuffer = Buffer.from(options.articleImage);
      } else if (typeof options.articleImage === 'string') {
        const imageSource = options.articleImage.trim();
        if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
          // If the URL points to lifemode.life canonical site, try local file first for speed and resilience
          if (imageSource.startsWith('https://lifemode.life/') || imageSource.startsWith('http://lifemode.life/')) {
            try {
              const urlPath = new URL(imageSource).pathname;
              rawImageBuffer = await loadLocalImage(urlPath, options.baseDir);
            } catch {
              // Fallback to network fetch below
            }
          }

          if (!rawImageBuffer) {
            const fetchImpl = options.customFetch || globalThis.fetch.bind(globalThis);
            const response = await fetchImpl(imageSource, {
              signal: AbortSignal.timeout(5000),
            });
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              rawImageBuffer = Buffer.from(arrayBuffer);
            }
          }
        } else {
          // Local file path or web root-relative path (e.g., /editorial/food/cooking-with-lentils.webp)
          rawImageBuffer = await loadLocalImage(imageSource, options.baseDir);
        }
      }

      if (rawImageBuffer && rawImageBuffer.length > 0) {
        // Create rounded corner mask for the hero image
        const roundedCornerMask = Buffer.from(
          `<svg width="${heroWidth}" height="${heroHeight}">
            <rect x="0" y="0" width="${heroWidth}" height="${heroHeight}" rx="24" ry="24" fill="#ffffff"/>
          </svg>`
        );

        heroImageBuffer = await sharp(rawImageBuffer)
          .resize(heroWidth, heroHeight, { fit: 'cover', position: 'center' })
          .composite([{ input: roundedCornerMask, blend: 'dest-in' }])
          .png()
          .toBuffer();
      }
    } catch {
      // If fetching/reading hero image fails, heroImageBuffer remains null for stylized fallback
      heroImageBuffer = null;
    }
  }

  // If no hero image is available, generate a stylized hero visual container
  if (!heroImageBuffer) {
    const fallbackHeroSvg = `
      <svg width="${heroWidth}" height="${heroHeight}" viewBox="0 0 ${heroWidth} ${heroHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="heroFallbackGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#18181b" stop-opacity="0.95" />
            <stop offset="100%" stop-color="#09090b" stop-opacity="0.98" />
          </linearGradient>
          <radialGradient id="heroGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stop-color="${theme.accentColor}" stop-opacity="0.25" />
            <stop offset="100%" stop-color="${theme.accentColor}" stop-opacity="0" />
          </radialGradient>
        </defs>
        <rect width="${heroWidth}" height="${heroHeight}" rx="24" fill="url(#heroFallbackGrad)" />
        <circle cx="${heroWidth / 2}" cy="${heroHeight / 2}" r="${heroWidth * 0.35}" fill="url(#heroGlow)" />
        
        <!-- Architectural Grid Motif -->
        <line x1="80" y1="120" x2="${heroWidth - 80}" y2="120" stroke="${theme.accentColor}" stroke-opacity="0.15" stroke-width="1.5" />
        <line x1="80" y1="${heroHeight - 120}" x2="${heroWidth - 80}" y2="${heroHeight - 120}" stroke="${theme.accentColor}" stroke-opacity="0.15" stroke-width="1.5" />
        <circle cx="${heroWidth / 2}" cy="${heroHeight / 2}" r="64" fill="none" stroke="${theme.accentColor}" stroke-opacity="0.3" stroke-width="2" />
        <circle cx="${heroWidth / 2}" cy="${heroHeight / 2}" r="12" fill="${theme.accentColor}" fill-opacity="0.6" />
      </svg>
    `;
    heroImageBuffer = await sharp(Buffer.from(fallbackHeroSvg))
      .png()
      .toBuffer();
  }

  // 3. Compute Title Layout & Line Wrapping
  const titleLayout = computeTitleLayout(title, 860, 240);

  // 4. Build Primary SVG Overlay (Header branding, pillar badge, title card, CTA)
  const titleLinesSvg = titleLayout.lines
    .map((line, idx) => {
      const lineY = titleLayout.startY + idx * titleLayout.lineHeight;
      return `<text x="110" y="${lineY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="${titleLayout.fontSize}" font-weight="800" fill="#ffffff">${escapeXml(line)}</text>`;
    })
    .join('\n');

  const overlaySvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.45" />
          <stop offset="40%" stop-color="#000000" stop-opacity="0.15" />
          <stop offset="70%" stop-color="#000000" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.85" />
        </linearGradient>
        <linearGradient id="titleCardBackdrop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0e0e12" stop-opacity="0.90" />
          <stop offset="100%" stop-color="#07070a" stop-opacity="0.96" />
        </linearGradient>
      </defs>

      <!-- Full-card ambient vignette for background depth -->
      <rect width="${width}" height="${height}" fill="url(#vignette)" />

      <!-- Top Header Zone: LifeMode Branding (Upper-Left) -->
      <g transform="translate(70, 75)">
        <rect width="210" height="54" rx="16" fill="#0a0a0e" fill-opacity="0.75" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1.5" />
        <text x="24" y="36" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="900" letter-spacing="4" fill="#ffffff">LIFEMODE</text>
      </g>

      <!-- Top Header Zone: Pillar Label & Accent Indicator (Upper-Right) -->
      <g transform="translate(770, 75)">
        <rect width="240" height="54" rx="16" fill="#0a0a0e" fill-opacity="0.75" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1.5" />
        <circle cx="28" cy="27" r="6" fill="${theme.accentColor}" />
        <text x="46" y="35" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="2.5" fill="${theme.accentColor}">${escapeXml(theme.displayName)}</text>
      </g>

      <!-- Hero Image Outer Border Frame (X: 70, Y: 160, W: 940, H: 600) -->
      <rect x="70" y="160" width="940" height="600" rx="24" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2" />

      <!-- Dedicated Title Overlay Card (X: 70, Y: 785, W: 940, H: 395) -->
      <rect x="70" y="785" width="940" height="395" rx="24" fill="url(#titleCardBackdrop)" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.5" />
      
      <!-- Category Eyebrow & Accent Bar -->
      <text x="110" y="842" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="3" fill="${theme.accentColor}">LIFEMODE ${escapeXml(theme.displayName)}</text>
      <rect x="110" y="856" width="48" height="3" rx="1.5" fill="${theme.accentColor}" />

      <!-- Rendered Wrapped Title Lines -->
      ${titleLinesSvg}

      <!-- Bottom Standard CTA Footer Bar (X: 70, Y: 1205, W: 940, H: 64) -->
      <g transform="translate(70, 1205)">
        <rect width="940" height="64" rx="32" fill="#0a0a0e" fill-opacity="0.80" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.2" />
        <text x="40" y="39" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="19" font-weight="600" fill="#d4d4d8">${escapeXml(ctaText)}</text>
        <text x="900" y="39" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="19" font-weight="800" letter-spacing="1" fill="${theme.accentColor}">lifemode.life &#x2192;</text>
      </g>
    </svg>
  `;

  const overlayBuffer = Buffer.from(overlaySvg, 'utf-8');

  // 5. Composite Layers: Base Background + Hero Image + Overlay Frame/Text
  const composites: OverlayOptions[] = [
    {
      input: heroImageBuffer,
      top: 160,
      left: 70,
    },
    {
      input: overlayBuffer,
      top: 0,
      left: 0,
    },
  ];

  const finalJpegBuffer = await sharp(backgroundBuffer)
    .composite(composites)
    .jpeg({
      quality: 90,
      progressive: true,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer();

  return finalJpegBuffer;
}
