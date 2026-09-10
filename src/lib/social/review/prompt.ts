import type { SocialReviewRequest } from './contracts.ts';

export function buildSocialReviewPrompt(request: SocialReviewRequest): string {
  const { brief, content } = request;

  const evidenceBlock =
    brief.evidence && brief.evidence.length > 0
      ? `VERIFIED SOURCE EVIDENCE:\n${brief.evidence
          .map((e) => `- ${e.title} (${e.publisher || 'Verified Source'}): ${e.url}`)
          .join('\n')}`
      : 'EVIDENCE: No explicit empirical evidence required for this cultural topic.';

  return `You are the Lead Editorial Quality Reviewer for LifeMode.
Conduct a rigorous quality review of the following generated social media package.

--- ORIGINAL BRIEF ---
Topic: "${brief.canonicalTopic}"
Pillar: ${brief.pillar.toUpperCase()}
Audience: ${brief.targetAudience}
Target Platforms: ${brief.targetPlatforms.join(', ')}

${evidenceBlock}

--- GENERATED SOCIAL PACKAGE ---
Title: ${content.title}
Concept: ${content.concept}
Hook: ${content.hook}
Short Caption: ${content.shortCaption}
Extended Caption: ${content.extendedCaption || 'N/A'}
Call to Action: ${content.callToAction}
Hashtags: ${content.hashtags.join(' ')}
Visual Concept: ${content.visualConcept}
Image Text: "${content.imageText?.headline || ''}" (Subtitle: "${content.imageText?.subheadline || ''}")
Target Platforms: ${content.targetPlatforms.join(', ')}

--- REVIEW RUBRIC (0 to 100 per dimension) ---
1. Brand Alignment: Strictly uses "LifeMode" (never "Life Mode" or "Lifemode"), calm, curious, smart, contemporary tone.
2. Readability: Clear typography, natural global English, crisp pacing, no jargon or filler.
3. Factuality: Consistent with evidence package, no fabricated stats, claims, or false quotes.
4. Safety: No sensational guarantees, medical claims, or deceptive urgency.
5. Platform Suitability: Optimized for Facebook, Instagram, and Pinterest formats.

--- PASS / REVISE / REJECT THRESHOLDS ---
- PASS: Score >= 80 across all dimensions.
- REVISE: Score 60-79 (minor corrections needed in caption or hashtags).
- REJECT: Score < 60 or critical brand violation / fake claims.

--- OUTPUT INSTRUCTIONS ---
Respond ONLY with valid JSON conforming to this schema (no markdown fences, no conversational prose):
{
  "passed": true,
  "score": 90,
  "verdict": "PASS",
  "feedback": {
    "brandAlignment": 95,
    "readability": 90,
    "factuality": 90,
    "safety": 95,
    "platformSuitability": 90,
    "notes": "Clear, elegant social copy aligned with LifeMode editorial principles."
  },
  "revisedContent": null
}`;
}
