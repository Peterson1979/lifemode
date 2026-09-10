import { createHash } from 'node:crypto';
import type { ISocialImageProvider, ImageGenerationRequest, ImageGenerationResult } from '../contracts.ts';
import type { SocialVisualAsset } from '../../types.ts';

export class FixtureSocialImageProvider implements ISocialImageProvider {
  readonly name = 'Fixture Social Image Provider';

  isConfigured(): boolean {
    return true;
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const width = 1080;
    const height = request.format === '1080x1080' ? 1080 : 1350;

    const pillarColors: Record<string, { bg: string; text: string; accent: string }> = {
      life: { bg: '#1c1917', text: '#fafaf9', accent: '#fb7185' },
      travel: { bg: '#0c1a2c', text: '#f0f9ff', accent: '#38bdf8' },
      'tech-ai': { bg: '#13111c', text: '#f5f3ff', accent: '#a78bfa' },
      money: { bg: '#0b1d16', text: '#ecfdf5', accent: '#34d399' },
      wellbeing: { bg: '#1c180a', text: '#fefce8', accent: '#fbbf24' },
      discover: { bg: '#1c120c', text: '#fff7ed', accent: '#fb923c' },
      now: { bg: '#1e0d14', text: '#fff1f2', accent: '#f43f5e' },
    };

    const color = pillarColors[request.pillar] || { bg: '#18181b', text: '#ffffff', accent: '#e4e4e7' };
    const headline = (request.headlineOverlay || 'Intentional Living & Design').replace(/<[^>]+>/g, '');
    const subheadline = (request.subheadlineOverlay || `LIFEMODE ${request.pillar.toUpperCase()}`).toUpperCase();

    // Generate clean, high-resolution SVG layout representation
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color.bg}" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="60%">
      <stop offset="0%" stop-color="${color.accent}" stop-opacity="0.25" />
      <stop offset="100%" stop-color="${color.accent}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGradient)" />
  <circle cx="${width / 2}" cy="${height * 0.35}" r="${width * 0.4}" fill="url(#glow)" />
  
  <!-- Subtle Grid Pattern -->
  <line x1="80" y1="80" x2="${width - 80}" y2="80" stroke="${color.accent}" stroke-opacity="0.2" stroke-width="1" />
  <line x1="80" y1="${height - 80}" x2="${width - 80}" y2="${height - 80}" stroke="${color.accent}" stroke-opacity="0.2" stroke-width="1" />
  
  <!-- Header Branding -->
  <text x="80" y="140" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="900" letter-spacing="4" fill="#ffffff">LIFEMODE</text>
  <text x="${width - 80}" y="140" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" letter-spacing="2" text-anchor="end" fill="${color.accent}">${subheadline}</text>
  
  <!-- Main Editorial Headline -->
  <g transform="translate(80, ${height * 0.55})">
    <text font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="54" font-weight="800" line-height="1.2" fill="#ffffff">
      ${headline}
    </text>
  </g>
  
  <!-- Bottom Brand Footer -->
  <text x="80" y="${height - 120}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="500" fill="#a1a1aa">Read the complete guide on lifemode.com</text>
</svg>`;

    const buffer = Buffer.from(svg, 'utf-8');
    const assetHash = createHash('sha256').update(buffer).digest('hex');

    const asset: SocialVisualAsset = {
      assetId: `asset-${request.topicId}-${request.format}-${assetHash.slice(0, 8)}`,
      format: request.format,
      mimeType: 'image/svg+xml',
      width,
      height,
      assetHash,
      altText: `LifeMode ${request.pillar.toUpperCase()}: ${headline}`,
      headlineOverlay: headline,
      buffer,
      isFixture: true,
    };

    return {
      success: true,
      status: 'SUCCESS',
      asset,
      provider: this.name,
      durationMs: Date.now() - startTime,
    };
  }
}
