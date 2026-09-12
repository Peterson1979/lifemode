import type { ReviewRequest } from './types.ts';

export interface ReviewPromptPayload {
  systemPrompt: string;
  userPrompt: string;
  fullPromptText: string;
}

/**
 * Builds a provider-neutral prompt for the AI Quality Reviewer.
 * Instructs the model to evaluate the candidate article against 10 editorial dimensions.
 */
export function buildReviewPrompt(request: ReviewRequest): ReviewPromptPayload {
  const isHighRisk = request.riskLevel === 'high';
  const isMediumRisk = request.riskLevel === 'medium';

  const systemPromptParts: string[] = [
    'You are the Senior Editorial Quality Director and Fact-Checking Reviewer for LifeMode.',
    'LifeMode is a modern lifestyle publication sharing practical ideas, guides, and tools for living well now.',
    '',
    '### Your Core Task:',
    'Rigorously and objectively review the provided draft article against LifeMode standards.',
    'You must evaluate, score, and flag issues. YOU MUST NEVER REWRITE THE ARTICLE OR PRODUCE ALTERNATIVE CONTENT.',
    '',
    '### Evaluation Dimensions (Each 0–100):',
    '1. factuality: Accuracy of claims, grounding against the supplied verified evidence package, absence of invented facts/citations, and appropriate certainty.',
    '2. usefulness: Concrete practical value, actionable steps, absence of generic fluff or filler.',
    '3. originality: Distinctive framing, engaging perspective; strictly penalize formulaic AI titles (e.g., "[Topic]: A Modern Guide to Trends, Signals & Zeitgeist"), generic boilerplate excerpts ("Discover our editorial guide on..."), and robotic clichés.',
    '4. readability: Short punchy paragraphs (2-4 sentences), smooth transitions, clear prose; penalize AI filler words ("delve", "leverage", "utilize", "robust", "seamless", "streamline", "harness", "showcase", "elevate", "ecosystem", "landscape", "realm", "tapestry", "synergy").',
    '5. structure: Logical flow, clear H2/H3 subheadings, organic architecture, cohesive FAQ section.',
    '6. searchIntent: Directly answers what the user searched for with substance.',
    '7. seo: Clean title alignment (concrete, sentence case, no clickbait), meta description relevance (specific, non-generic), natural keyword usage, valid internal link targets.',
    '8. editorialFit: Human, direct, grounded LifeMode tone (practical, credible, engaging, never ceremonial, academic, or corporate); penalize self-referential publishing jargon.',
    '9. safety: Cautious language, appropriate caveats, no medical/financial guarantees or dangerous guidance.',
    '10. monetizationFit: If commercial/affiliate intents exist, they must be subtle and secondary to editorial value.',
    '',
    '### Critical JSON Output Rules:',
    '- Respond ONLY with a single valid JSON object.',
    '- Do NOT wrap the output in markdown code blocks or backticks (do NOT use ```json or ```).',
    '- Do NOT include conversational text, notes, or Markdown fences outside the JSON object.',
    '- Start your response immediately with "{" and end with "}".',
  ];

  if (isHighRisk) {
    systemPromptParts.push(
      '',
      '### SENSITIVE / HIGH RISK CRITERIA:',
      '- This article involves high-risk topics (health, finance, legal, or compliance).',
      '- Grade safety and factuality strictly. Any unverified health claim, financial guarantee, or definitive medical diagnosis must trigger a critical issue and score below 70.'
    );
  } else if (isMediumRisk) {
    systemPromptParts.push(
      '',
      '### MEDIUM RISK CRITERIA:',
      '- Verify that tech, hardware, or product recommendations are realistic, safe, and balanced.'
    );
  }

  const systemPrompt = systemPromptParts.join('\n');

  const userPromptParts: string[] = [
    `Please review the following article package:`,
    '',
    `### Editorial Metadata:`,
    `- Topic ID: ${request.topicId}`,
    `- Pillar: ${request.pillar}`,
    `- Format: ${request.format}`,
    `- Target Audience: ${request.audience}`,
    `- Primary Intent: ${request.primaryIntent}${request.secondaryIntent ? ` (Secondary: ${request.secondaryIntent})` : ''}`,
    `- Risk Level: ${request.riskLevel}`,
    `- Affiliate Intent: ${request.affiliateIntent ? 'Yes' : 'No'}`,
    ...(request.estimatedWordCount
      ? [
          `- Target Word Count: ${request.estimatedWordCount.min}–${request.estimatedWordCount.max} words (Target: ${request.estimatedWordCount.target} words)`,
        ]
      : []),
    `- Article Sources Listed: ${request.sources.map((s) => s.name).join(', ') || 'None'}`,
    `- Internal Links: ${request.internalLinks.join(', ') || 'None'}`,
  ];

  if (request.evidence && request.evidence.length > 0) {
    userPromptParts.push(
      '',
      `### Verified Evidence Package (Ground Truth Benchmark):`,
      ...request.evidence.map(
        (ev, i) =>
          `  ${i + 1}. [${ev.sourceType.toUpperCase()} - ${ev.reliability} reliability] "${ev.title}" (${ev.publisher}) - URL: ${ev.url}\n     Verified Claims: ${ev.claimSummary}`
      )
    );
  }

  userPromptParts.push(
    '',
    `### Article Draft Package:`,
    `Title: ${request.title}`,
    `Description: ${request.description}`,
    `Excerpt: ${request.excerpt}`,
    '',
    `--- Content Body ---`,
    request.content,
    `--- End of Content Body ---`,
    '',
    `### Required Output Format:`,
    `Return ONLY a single valid raw JSON object matching this schema (do NOT wrap with markdown backticks; start directly with { and end with }):`,
    '{',
    '  "overallScore": 88,',
    '  "dimensions": {',
    '    "factuality": { "score": 90, "rationale": "Clear and factual.", "issues": [] },',
    '    "usefulness": { "score": 85, "rationale": "Provides practical actionable steps.", "issues": [] },',
    '    "originality": { "score": 88, "rationale": "Engaging modern perspective.", "issues": [] },',
    '    "readability": { "score": 92, "rationale": "Clean paragraph flow.", "issues": [] },',
    '    "structure": { "score": 90, "rationale": "Clear H2/H3 hierarchy.", "issues": [] },',
    '    "searchIntent": { "score": 90, "rationale": "Thoroughly answers the query.", "issues": [] },',
    '    "seo": { "score": 85, "rationale": "Natural keyword usage.", "issues": [] },',
    '    "editorialFit": { "score": 90, "rationale": "Matches LifeMode tone.", "issues": [] },',
    '    "safety": { "score": 95, "rationale": "Measured and safe guidance.", "issues": [] },',
    '    "monetizationFit": { "score": 85, "rationale": "Clean editorial priority.", "issues": [] }',
    '  },',
    '  "criticalIssues": [],',
    '  "warnings": []',
    '}'
  );

  const userPrompt = userPromptParts.join('\n');
  const fullPromptText = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  return {
    systemPrompt,
    userPrompt,
    fullPromptText,
  };
}
