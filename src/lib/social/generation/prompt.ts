import type { SocialBrief } from '../types.ts';

/**
 * Builds the AI generation prompt for producing structured platform-aware social content.
 */
export function buildSocialGenerationPrompt(brief: SocialBrief): string {
  const evidenceBlock =
    brief.evidence && brief.evidence.length > 0
      ? `EVIDENCE & SOURCE REFERENCES:\n${brief.evidence
          .map((e) => `- ${e.title} (${e.publisher || 'Verified Source'}): ${e.url}`)
          .join('\n')}`
      : 'EVIDENCE: No explicit external evidence required for this cultural/design topic.';

  return `You are the Senior Social Media Director for LifeMode, a global contemporary English-language lifestyle publication.

Generate high-signal, traffic-driving, platform-adapted social media copy and a visual concept based strictly on the authoritative published LifeMode article provided below.

--- AUTHORITATIVE PUBLISHED ARTICLE ---
Topic ID: ${brief.topicId}
Pillar: ${brief.pillar.toUpperCase()}
Article Title: "${brief.articleTitle || brief.canonicalTopic}"
Article Description: "${brief.articleDescription || brief.coreConcept}"
Canonical Article URL: ${brief.destinationUrl}
Target Audience: ${brief.targetAudience}
Target Platforms: ${brief.targetPlatforms.join(', ')}
Recommended Visual Format: ${brief.visualGuidelines.recommendedFormat}
Visual Aesthetic: ${brief.visualGuidelines.aestheticStyle}
Suggested Hashtags: ${brief.hashtagsHint.join(' ')}

${evidenceBlock}

--- EDITORIAL & BRAND STANDARDS ---
1. Brand Spelling: The brand name is strictly "LifeMode" (capital L, capital M, single word). NEVER use "Life Mode", "Lifemode", or "LifeMode Media".
2. Voice: Smart, curious, contemporary, calm, useful, global English written for ordinary LifeMode readers.
3. Language: Strictly global English. NEVER output Hungarian or other non-English phrases.
4. Traffic-Oriented Copy:
   - Facebook: Include a strong, truthful article hook, concise body context, and a direct CTA pointing to the full article URL.
   - Instagram: Deliver captivating visual storytelling and an honest CTA directing users to the link in bio (do NOT claim caption links are clickable; do NOT hardcode domains in caption body).
   - Pinterest: Deliver SEO-optimized title and description loaded with relevant article keywords to drive continuous discovery and traffic to the article URL.
5. Integrity & Article-Driven Standard:
   - All social copy must be strictly article-driven, derived solely from the authoritative published LifeMode article provided above.
   - NEVER inject external live API telemetry, market tickers, or unrelated third-party data.
   - No sensational clickbait, no exaggerated or fabricated claims, no made-up statistics not found in the article data.
6. Style & Beauty Positioning:
   - Strictly non-promotional editorial tone. No "buy this now", affiliate ad language, fake expertise, or influencer clichés.
   - Explore fashion trends, tactile tailoring, everyday outfit formulas, skincare rituals, ingredient science, haircare, and fragrance culture with accessible elegance.
7. Visual First: The visual concept must describe an aesthetically stunning, calm editorial photograph or 3D architectural scene.
8. Image Text Overlay: Short, legible, punchy headline only (max 6-8 words). NEVER paragraphs or internal metadata.

--- OUTPUT REQUIREMENTS ---
You MUST respond with valid JSON adhering to this exact schema (do NOT include markdown code fences or conversational text):
{
  "topicId": "${brief.topicId}",
  "pillar": "${brief.pillar}",
  "concept": "Summary of the core social takeaway",
  "hook": "Compelling single-sentence hook",
  "title": "${(brief.articleTitle || brief.canonicalTopic).replace(/"/g, '\\"')}",
  "shortCaption": "Clean, high-impact caption for Instagram/Facebook feed (150-350 characters)",
  "extendedCaption": "In-depth editorial caption providing context, practical insights, and takeaways from the article (400-800 characters)",
  "callToAction": "Explore the complete dispatch on LifeMode.",
  "hashtags": ["#LifeMode", "#${brief.pillar.replace('-', '')}", ...],
  "visualConcept": "Detailed description of the image composition, lighting, subject matter, and color palette",
  "imageText": {
    "headline": "Short punchy headline (max 7 words)",
    "subheadline": "Optional brief subtitle (max 5 words)"
  },
  "targetPlatforms": ${JSON.stringify(brief.targetPlatforms)},
  "sourceReferences": [
    ${(brief.evidence || []).map((e) => `{"name": "${e.publisher || e.title}", "url": "${e.url}"}`).join(', ')}
  ],
  "destinationUrl": "${brief.destinationUrl}"
}`;
}
