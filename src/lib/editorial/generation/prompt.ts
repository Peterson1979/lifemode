import type { GenerationRequest } from './types.ts';

/**
 * Structured prompt representation supporting both unified prompt strings
 * and split system/user prompt architectures.
 */
export interface GenerationPromptPayload {
  systemPrompt: string;
  userPrompt: string;
  fullPromptText: string;
}

/**
 * Builds a provider-neutral prompt payload from a GenerationRequest.
 * Enforces editorial excellence, safety, and structured output expectations.
 */
export function buildGenerationPrompt(request: GenerationRequest): GenerationPromptPayload {
  const isHighRisk = request.riskLevel === 'high';
  const isMediumRisk = request.riskLevel === 'medium';

  // If this is an editorial revision request, build a focused revision prompt
  if (request.revisionContext) {
    const revCtx = request.revisionContext;
    const reviewRes = revCtx.reviewResult;
    const origArt = revCtx.originalArticle;

    const systemPromptParts: string[] = [
      'You are a senior editorial writer and editor for LifeMode, a contemporary lifestyle publication.',
      'LifeMode publishes useful, curious, smart, contemporary, and intentional editorial content.',
      'Tone: Editorial, sophisticated yet accessible, human, practical, and highly engaging.',
      '',
      '### Editorial Revision Directives:',
      '1. Your mission is to revise and polish an existing draft article based on editorial quality review feedback.',
      '2. Address and resolve all identified review issues, warnings, and dimension weaknesses.',
      '3. Maintain the core topic angle, audience intent, structural flow, and required word count.',
      '4. Factuality & Evidence: Remove unverified claims, overconfident assertions, invented facts, or fabricated statistics. Qualify emerging trends with measured, thoughtful phrasing.',
      '5. Safety & Quality: Ensure all advice is responsible, context-aware, and safe. Do not fabricate sources.',
      '6. Do NOT blindly rewrite everything from scratch; preserve strong, high-signal sections while surgically repairing weaknesses.',
      '7. Deliver a complete, publishable article package strictly conforming to the required JSON schema.',
    ];

    if (isHighRisk) {
      systemPromptParts.push(
        '',
        '### HIGH RISK REVISION PROTOCOL:',
        '- Ensure all statements are strictly measured, safe, and supported by established consensus.',
        '- Include appropriate professional consultation caveats where applicable.'
      );
    }

    const systemPrompt = systemPromptParts.join('\n');

    const userPromptParts: string[] = [
      `Revise the existing article draft for the following topic based on editorial quality review feedback:`,
      '',
      `### Topic Specifications:`,
      `- Title Angle: "${request.titleAngle}"`,
      `- Topic ID: ${request.topicId}`,
      `- Pillar: ${request.pillar}`,
      `- Editorial Format: ${request.format}`,
      `- Target Audience: ${request.audience}`,
      `- Primary Intent: ${request.primaryIntent}${request.secondaryIntent ? ` (Secondary: ${request.secondaryIntent})` : ''}`,
      `- Primary Keyword: "${request.searchTargets.primaryKeyword}"`,
    ];

    if (request.estimatedWordCount) {
      userPromptParts.push(
        `- Target Word Count Range: ${request.estimatedWordCount.min}–${request.estimatedWordCount.max} words (Target: ${request.estimatedWordCount.target} words)`
      );
    }

    userPromptParts.push(
      '',
      `### AI Quality Review Evaluation (Score: ${reviewRes.overallScore}/100 - Decision: ${reviewRes.decision}):`
    );

    if (reviewRes.dimensions) {
      userPromptParts.push(`- Dimension Scores & Feedback:`);
      for (const [dimKey, dimVal] of Object.entries(reviewRes.dimensions)) {
        const issuesStr = dimVal.issues && dimVal.issues.length > 0 ? ` [Issues: ${dimVal.issues.join('; ')}]` : '';
        userPromptParts.push(`  * ${dimKey}: ${dimVal.score}/100 - ${dimVal.rationale}${issuesStr}`);
      }
    }

    if (reviewRes.criticalIssues && reviewRes.criticalIssues.length > 0) {
      userPromptParts.push('', `### Critical Issues to Resolve:`, ...reviewRes.criticalIssues.map((ci) => `- ${ci}`));
    }

    if (reviewRes.warnings && reviewRes.warnings.length > 0) {
      userPromptParts.push('', `### Reviewer Warnings & Recommendations:`, ...reviewRes.warnings.map((w) => `- ${w}`));
    }

    if (request.requiredSources && request.requiredSources.length > 0) {
      userPromptParts.push(
        '',
        `### Supplied Sources (Use only these for citations):`,
        ...request.requiredSources.map(
          (s) => `- ${s.name}${s.url ? ` (${s.url})` : ''} [${s.citationType || 'authority'}]`
        )
      );
    }

    userPromptParts.push(
      '',
      `### Original Draft Content to Revise:`,
      `- Original Title: "${origArt.title}"`,
      `- Original Description: "${origArt.description}"`,
      `- Original Excerpt: "${origArt.excerpt}"`,
      '',
      `Original Content Body:`,
      origArt.content,
      '',
      `### Required Output Format:`,
      `Provide the complete, revised structured JSON object matching this schema:`,
      '```json',
      '{',
      '  "title": "Polished Article Title",',
      '  "slug": "url-friendly-slug",',
      '  "description": "Engaging meta description (120-160 characters)",',
      '  "excerpt": "Compelling editorial excerpt for card previews",',
      '  "content": "Full revised Markdown article content with ## and ### headings",',
      '  "faq": [',
      '    { "question": "Relevant question?", "answer": "Clear, informative answer." }',
      '  ],',
      '  "sources": [',
      '    { "name": "Source Name", "url": "https://..." }',
      '  ],',
      '  "internalLinks": ["/pillar/related-article"],',
      '  "affiliateIntents": ["category or product mention"],',
      '  "socialHooks": ["Short punchy hook for social posts"]',
      '}',
      '```'
    );

    const userPrompt = userPromptParts.join('\n');
    const fullPromptText = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    return {
      systemPrompt,
      userPrompt,
      fullPromptText,
    };
  }

  // Standard First-Pass Generation System Prompt
  const systemPromptParts: string[] = [
    'You are an expert editorial writer and researcher for LifeMode, a contemporary lifestyle publication.',
    'LifeMode publishes useful, curious, smart, contemporary, and intentional editorial content.',
    'Tone: Editorial, sophisticated yet accessible, human, practical, and highly engaging.',
    '',
    '### Strict Editorial Guidelines:',
    '1. Write original, insightful, high-signal content with actionable substance.',
    '2. Avoid generic fluff, corporate jargon, robotic phrasing, and repetitive conclusions.',
    '3. Structure the article with clear H2 and H3 subheadings for effortless readability.',
    '4. Use short, focused paragraphs (2-4 sentences max per paragraph).',
    '5. Satisfy both user search intent and aesthetic curiosity.',
    '6. Never hallucinate or invent fake URLs, studies, statistics, or external citations.',
    '7. Only cite real, authoritative sources explicitly provided in the request.',
  ];

  if (isHighRisk) {
    systemPromptParts.push(
      '',
      '### SENSITIVE TOPIC / HIGH RISK PROTOCOL:',
      '- This topic touches upon high-risk domains (health, finance, compliance, or safety).',
      '- Use strictly cautious, measured, and evidence-supported language.',
      '- Explicitly avoid making definitive medical, legal, or guaranteed financial claims.',
      '- Prioritize established consensus, practical lifestyle protocols, and consult-a-professional caveats.'
    );
  } else if (isMediumRisk) {
    systemPromptParts.push(
      '',
      '### MEDIUM RISK PROTOCOL:',
      '- Exercise journalistic diligence and avoid speculative or unverified claims.',
      '- Keep recommendations realistic, measured, and safe.'
    );
  }

  const systemPrompt = systemPromptParts.join('\n');

  // User instructions detailing the specific topic parameters
  const userPromptParts: string[] = [
    `Generate a complete, publishable editorial article package for the following topic:`,
    '',
    `### Topic Specifications:`,
    `- Title Angle: "${request.titleAngle}"`,
    `- Topic ID: ${request.topicId}`,
    `- Pillar: ${request.pillar}`,
    `- Editorial Format: ${request.format}`,
    `- Target Audience: ${request.audience}`,
    `- Primary Intent: ${request.primaryIntent}${request.secondaryIntent ? ` (Secondary: ${request.secondaryIntent})` : ''}`,
    `- Primary Keyword: "${request.searchTargets.primaryKeyword}"`,
  ];

  if (request.estimatedWordCount) {
    userPromptParts.push(
      `- Target Word Count: ${request.estimatedWordCount.min}–${request.estimatedWordCount.max} words (Target: ${request.estimatedWordCount.target} words)`
    );
  }

  if (request.searchTargets.secondaryKeywords?.length) {
    userPromptParts.push(`- Secondary Keywords: ${request.searchTargets.secondaryKeywords.join(', ')}`);
  }

  if (request.pinterestAngle) {
    userPromptParts.push(
      `- Visual & Aesthetic Angle: ${request.pinterestAngle.visualTheme || 'Contemporary lifestyle'}`,
      `- Pinterest Angle: ${request.pinterestAngle.pinTitleAngle || request.titleAngle}`
    );
  }

  if (request.socialAngle) {
    userPromptParts.push(
      `- Social Hook Concept: ${request.socialAngle.hookAngle || 'Modern perspective'}`
    );
  }

  if (request.requiredSources && request.requiredSources.length > 0) {
    userPromptParts.push(
      '',
      `### Supplied Sources (Use only these for citations):`,
      ...request.requiredSources.map(
        (s) => `- ${s.name}${s.url ? ` (${s.url})` : ''} [${s.citationType || 'authority'}]`
      )
    );
  }

  if (request.internalLinks && request.internalLinks.length > 0) {
    userPromptParts.push(
      `- Relevant Internal Link Targets: ${request.internalLinks.join(', ')}`
    );
  }

  if (request.outlineSections && request.outlineSections.length > 0) {
    userPromptParts.push('', `### Suggested Outline Sections:`);
    for (const section of request.outlineSections) {
      userPromptParts.push(`- ${section.heading}`);
      if (section.keyPoints?.length) {
        for (const kp of section.keyPoints) {
          userPromptParts.push(`  * ${kp}`);
        }
      }
    }
  }

  if (request.contentInstructions) {
    userPromptParts.push('', `### Specific Content Instructions:`, request.contentInstructions);
  }

  userPromptParts.push(
    '',
    `### Required Output Format:`,
    `Provide a structured JSON object conforming to the following structure:`,
    '```json',
    '{',
    '  "title": "Article Title",',
    '  "slug": "url-friendly-slug",',
    '  "description": "Engaging meta description (120-160 characters)",',
    '  "excerpt": "Compelling editorial excerpt for card previews",',
    '  "content": "Full Markdown article content with ## and ### headings",',
    '  "faq": [',
    '    { "question": "Relevant question?", "answer": "Clear, informative answer." }',
    '  ],',
    '  "sources": [',
    '    { "name": "Source Name", "url": "https://..." }',
    '  ],',
    '  "internalLinks": ["/pillar/related-article"],',
    '  "affiliateIntents": ["category or product mention"],',
    '  "socialHooks": ["Short punchy hook for social posts"]',
    '}',
    '```'
  );

  const userPrompt = userPromptParts.join('\n');
  const fullPromptText = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  return {
    systemPrompt,
    userPrompt,
    fullPromptText,
  };
}
