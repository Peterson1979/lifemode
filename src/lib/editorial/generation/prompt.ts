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

    const revTargetWords = request.estimatedWordCount?.target || 1200;
    const revMinWords = request.estimatedWordCount?.min || 800;
    const revMaxWords = request.estimatedWordCount?.max || 1600;

    const systemPromptParts: string[] = [
      'You are a senior editorial writer and editor for LifeMode, a contemporary lifestyle publication.',
      'LifeMode publishes useful, curious, smart, contemporary, and intentional editorial content.',
      'Tone: Editorial, sophisticated yet accessible, human, practical, and highly engaging.',
      '',
      '### Editorial Revision Directives:',
      '1. Your mission is to revise and polish an existing draft article based on editorial quality review feedback.',
      '2. Address and resolve all identified review issues, warnings, and dimension weaknesses.',
      '3. Maintain Full Article Depth: Do not compress, abbreviate, or shorten sections into superficial summaries to fix issues. Maintain the complete, substantive article structure.',
      '4. Word Count Targets: Aim directly for the TARGET WORD COUNT (~' + revTargetWords + ' words). The draft must strictly meet or exceed the ABSOLUTE MINIMUM ACCEPTABLE WORD COUNT (' + revMinWords + ' words).',
      '5. Section-by-Section Substance: Ensure every major H2 section remains fully developed with 2–4 substantive paragraphs providing practical, high-signal value.',
      '6. Factuality & Evidence: Remove unverified claims, overconfident assertions, invented facts, or fabricated statistics. Qualify emerging trends with measured, thoughtful phrasing.',
      '7. Safety & Quality: Ensure all advice is responsible, context-aware, and safe. Do not fabricate sources.',
      '8. Natural Editorial Prose & Zero Filler: Never use repetitive padding or circular fluff; ensure every sentence provides genuine editorial value.',
      '9. Do NOT blindly rewrite everything from scratch; preserve strong, high-signal sections while surgically repairing weaknesses.',
      '10. Deliver a complete, publishable article package strictly conforming to the required JSON schema.',
      '',
      '### Critical JSON Output Rules:',
      '- Respond ONLY with a single valid JSON object.',
      '- Do NOT wrap the output in markdown code blocks or backticks (do NOT use ```json or ```).',
      '- Do NOT include any conversational preamble, commentary, or postamble.',
      '- Start your response immediately with "{" and end with "}".',
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
      '',
      `### Article Length & Depth Specifications:`,
      `- TARGET WORD COUNT: Approximately ${revTargetWords} words (Aim directly for this target).`,
      `- ABSOLUTE MINIMUM ACCEPTABLE WORD COUNT: ${revMinWords} words (A draft below this hard minimum is incomplete and invalid).`,
      `- Target Word Count Range: ${revMinWords}–${revMaxWords} words.`,
      '',
      `### AI Quality Review Evaluation (Score: ${reviewRes.overallScore}/100 - Decision: ${reviewRes.decision}):`,
    ];

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

    if (request.evidence && request.evidence.length > 0) {
      userPromptParts.push(
        '',
        `### Verified Research Evidence (Grounding Sources):`,
        ...request.evidence.map(
          (ev, i) =>
            `  ${i + 1}. [${ev.sourceType.toUpperCase()} - ${ev.reliability} reliability] "${ev.title}" (${ev.publisher})\n     URL: ${ev.url}\n     Verified Facts: ${ev.claimSummary}`
        )
      );
    } else if (request.requiredSources && request.requiredSources.length > 0) {
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
      `Provide the complete, revised structured JSON object matching this schema (do NOT wrap with markdown backticks; start directly with { and end with }):`,
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

  // Standard First-Pass Generation System Prompt
  const systemPromptParts: string[] = [
    'You are an expert editorial writer and researcher for LifeMode, a contemporary lifestyle publication.',
    'LifeMode publishes useful, curious, smart, contemporary, and intentional editorial content.',
    'Tone: Editorial, sophisticated yet accessible, human, practical, and highly engaging.',
    '',
    '### Strict Editorial Guidelines:',
    '1. Complete Article Requirement: Deliver a complete, comprehensive, publication-ready article — never a brief summary, outline, or concise overview.',
    '2. Section-by-Section Depth: Substantively develop every major section under clear Markdown ## (H2) and ### (H3) headings with multiple rich, informative paragraphs (at least 2–4 substantive paragraphs per major section).',
    '3. Substantive Introduction & Conclusion: Craft an engaging, immersive introduction establishing the context and core dilemma, and a thoughtful, actionable conclusion synthesizing long-term lifestyle habits.',
    '4. Natural Editorial Prose & Zero Filler: Write high-signal, engaging prose. Never pad with repetitive filler, circular phrasing, or fluffy platitudes. Expansion must come from deep explanations, concrete steps, and practical nuances.',
    '5. Factuality & Evidence Grounding: Ground all specific facts, statistics, venue details, and technical capabilities in the verified evidence supplied. Never hallucinate fake URLs, citations, or unverified claims. Use the provided evidence sources in your sources array.',
    '6. Search & Reader Intent: Satisfy primary search intent and reader curiosity with practical, high-value takeaways and aesthetic intentionality.',
    '7. JSON Schema Conformance: The full, unabbreviated Markdown article body must be provided in the "content" field. Do not compress or truncate content to fit JSON.',
    '',
    '### Critical JSON Output Rules:',
    '- Respond ONLY with a single valid JSON object.',
    '- Do NOT wrap the output in markdown code blocks or backticks (do NOT use ```json or ```).',
    '- Do NOT include any conversational preamble, commentary, or postamble.',
    '- Start your response immediately with "{" and end with "}".',
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

  const targetWords = request.estimatedWordCount?.target || 1200;
  const minWords = request.estimatedWordCount?.min || 800;
  const maxWords = request.estimatedWordCount?.max || 1600;
  const numOutlineSections = request.outlineSections?.length || 3;
  const coreWordsTarget = Math.round(targetWords * 0.7);
  const wordsPerSection = Math.round(coreWordsTarget / Math.max(1, numOutlineSections));

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
    '',
    `### Article Length & Depth Specifications:`,
    `- TARGET WORD COUNT: Approximately ${targetWords} words (Aim directly for this target word count; do not aim for the lower boundary).`,
    `- ABSOLUTE MINIMUM ACCEPTABLE WORD COUNT: ${minWords} words (A draft significantly below this hard minimum is incomplete and invalid).`,
    `- Target Word Count Range: ${minWords}–${maxWords} words.`,
    '',
    `### Internal Structural & Length Allocation Plan:`,
    `Before generating the JSON payload, mentally plan and allocate the ~${targetWords} words across the entire article:`,
    `- Introduction (~15% / ~${Math.round(targetWords * 0.15)} words): Frame the lifestyle context, the modern dilemma, and the central editorial thesis.`,
    `- Core Major Sections (~70% / ~${coreWordsTarget} words total across ${numOutlineSections} sections, ~${wordsPerSection} words each): Thoroughly develop each section with multiple detailed paragraphs, concrete methodologies, specific nuances, and practical advice under H2 and H3 headings.`,
    `- Conclusion & Practical Takeaways (~15% / ~${Math.round(targetWords * 0.15)} words): Synthesize the insights into enduring lifestyle practices and actionable takeaways.`,
    `- FAQ Section: Include 2–4 detailed, practical Q&As answering high-intent reader questions.`,
    `Important: Do NOT output these planning notes. Execute this mental structure directly into the full Markdown text inside the "content" field.`,
  ];

  if (request.evidence && request.evidence.length > 0) {
    userPromptParts.push(
      '',
      `### Verified Research Evidence & Factual Grounding:`,
      `The following verified evidence items were retrieved during editorial research. Factual claims, dates, venue specifics, technical specifications, and statistics MUST be grounded in this evidence:`,
      ...request.evidence.map(
        (ev, i) =>
          `  ${i + 1}. [${ev.sourceType.toUpperCase()} - ${ev.reliability} reliability] "${ev.title}" (${ev.publisher})\n     URL: ${ev.url}\n     Verified Facts: ${ev.claimSummary}`
      ),
      '',
      `Evidence Directives:`,
      `- Use the verified sources above to populate the "sources" array in your JSON output.`,
      `- Do NOT fabricate citations or external sources not supported by this evidence.`,
      `- If a specific claim or detail is not supported by the evidence, omit or phrase it cautiously rather than guessing.`
    );
  } else if (request.requiredSources && request.requiredSources.length > 0) {
    userPromptParts.push(
      '',
      `### Supplied Sources (Use only these for citations):`,
      ...request.requiredSources.map(
        (s) => `- ${s.name}${s.url ? ` (${s.url})` : ''} [${s.citationType || 'authority'}]`
      )
    );
  }

  if (request.searchTargets.secondaryKeywords?.length) {
    userPromptParts.push('', `- Secondary Keywords: ${request.searchTargets.secondaryKeywords.join(', ')}`);
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

  if (request.internalLinks && request.internalLinks.length > 0) {
    userPromptParts.push(
      `- Relevant Internal Link Targets: ${request.internalLinks.join(', ')}`
    );
  }

  if (request.outlineSections && request.outlineSections.length > 0) {
    userPromptParts.push('', `### Outline & Major Section Development:`, 'Fully develop each of the following sections with substantive paragraphs and actionable depth:');
    for (const section of request.outlineSections) {
      userPromptParts.push(`- ## ${section.heading}`);
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
    `Provide a structured JSON object conforming to the following structure (do NOT wrap with markdown backticks; start directly with { and end with }):`,
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
