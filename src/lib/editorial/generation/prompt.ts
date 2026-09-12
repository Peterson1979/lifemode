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
      'LifeMode publishes useful, curious, smart, human, and practical ideas for living well now.',
      'Tone: Direct, credible, human, observant, grounded, and engaging. Never academic, corporate, or self-important.',
      '',
      '### Editorial Revision Directives:',
      '1. Your mission is to revise and polish an existing draft article based on editorial quality review feedback.',
      '2. Address and resolve all identified review issues, warnings, and dimension weaknesses.',
      '3. Maintain Full Article Depth: Do not compress, abbreviate, or shorten sections into superficial summaries to fix issues. Maintain the complete, substantive article structure.',
      '4. Word Count Targets: Aim directly for the TARGET WORD COUNT (~' + revTargetWords + ' words). The draft must strictly meet or exceed the ABSOLUTE MINIMUM ACCEPTABLE WORD COUNT (' + revMinWords + ' words).',
      '5. Section-by-Section Substance: Ensure every major H2 section remains fully developed with 2–4 substantive paragraphs providing practical, high-signal value.',
      '6. Factuality & Evidence: Remove unverified claims, overconfident assertions, invented facts, or fabricated statistics. Qualify emerging trends with measured, thoughtful phrasing.',
      '7. Safety & Quality: Ensure all advice is responsible, context-aware, and safe. Do not fabricate sources.',
      '8. Human Editorial Writing Standards (Strictly Enforced):',
      '   - Specificity over abstraction: Use concrete nouns, verbs, facts, examples, places, tools, and observations.',
      '   - Direct openings: Start directly with the subject. Never open with generic filler about modern life, changing times, or "in today\'s fast-paced world".',
      '   - Zero rhetorical formulas: Avoid template clichés such as "It isn\'t just X; it\'s Y", "X is more than just Y", "This is where X comes in", "Whether you\'re X or Y...", "As we navigate...", "At the intersection of...", "Here\'s why...", "Let\'s dive into...".',
      '   - Zero corporate/AI buzzwords: Avoid "delve", "leverage", "utilize", "robust", "seamless", "streamline", "harness", "showcase", "elevate", "ecosystem", "landscape", "realm", "tapestry", "synergy".',
      '   - No artificial sophistication or inflated voice: Never make simple subjects sound grandiose or ceremonial.',
      '   - Natural titles & excerpts: Titles must describe the actual subject in natural sentence case without formulaic constructions like "A Modern Guide to...". Excerpts must state what the article actually covers without generic filler.',
      '   - Sentence variety & clean punctuation: Avoid monotonous paragraph structures and unnecessary em-dash-heavy prose.',
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
    'LifeMode publishes useful, curious, smart, human, and practical ideas for living well now.',
    'Tone: Direct, credible, human, observant, grounded, and engaging. Never ceremonial, academic, corporate, or self-important.',
    '',
    '### Strict Editorial Guidelines:',
    '1. Complete Article Requirement: Deliver a complete, comprehensive, publication-ready article — never a brief summary, outline, or concise overview.',
    '2. Section-by-Section Depth: Substantively develop every major section under clear Markdown ## (H2) and ### (H3) headings with multiple rich, informative paragraphs (at least 2–4 substantive paragraphs per major section).',
    '3. Substantive Introduction & Conclusion: Craft an engaging, immersive opening that gets straight to the subject, and a thoughtful, actionable conclusion synthesizing long-term lifestyle habits.',
    '4. Natural Editorial Prose & Zero Filler (Human Writing Quality Rules):',
    '   A. Specificity over abstraction: Prefer concrete nouns, verbs, facts, examples, places, products, tools, actions, and observations over vague concepts.',
    '   B. Direct openings: Begin directly with the subject. Never open with generic filler about modern life, changing times, today\'s fast-paced world, or the importance of the topic.',
    '   C. No predictable rhetorical formulas: Avoid template structures such as:',
    '      - "It isn\'t just X; it\'s Y."',
    '      - "X is more than just Y."',
    '      - "This is where X comes in."',
    '      - "Whether you\'re X or Y..."',
    '      - "In today\'s fast-paced world..."',
    '      - "As we navigate..."',
    '      - "From X to Y..."',
    '      - "At the intersection of..."',
    '      - "Here\'s why..."',
    '      - "Let\'s dive into..."',
    '   D. No artificial sophistication: Do not make simple subjects sound profound, philosophical, or grandiose.',
    '   E. No inflated editorial voice: LifeMode sounds informed and confident, not academic, corporate, or self-important.',
    '   F. Sentence variety: Vary sentence lengths and rhythms naturally. Avoid repetitive cadence.',
    '   G. Avoid repetitive article architecture: Build an organic structure tailored to the actual topic.',
    '   H. Title and heading casing: Use natural sentence case for headings and titles.',
    '   I. Clean punctuation: Avoid unnecessary em-dash-heavy prose.',
    '   J. Professional polish: The writing must read as if a skilled human editor carefully crafted every line.',
    '5. Title Craftsmanship Rules:',
    '   - Describe the actual subject concretely and give the reader a genuine reason to read.',
    '   - Avoid formulaic constructions such as "[Topic]: A Modern Guide to Trends, Signals & Zeitgeist" or "A Modern Guide to...".',
    '   - Avoid three-part formulaic sub-phrases (e.g. "Trends, Signals & Zeitgeist", "Wealth, Strategy & Freedom").',
    '   - Avoid promotional language, clickbait, or artificial editorial terminology.',
    '   - Use sentence case unless a proper noun requires capitalization.',
    '6. Excerpt & Description Rules:',
    '   - Excerpts must tell the reader specifically what the article is about.',
    '   - Never use boilerplate introductions like "Discover our editorial guide on...", "Explore key principles...", "curated perspectives for modern living", "In today\'s...", or "When it comes to...".',
    '   - Avoid corporate and AI filler words: "delve", "leverage", "utilize", "robust", "seamless", "streamline", "harness", "showcase", "elevate", "ecosystem", "landscape", "realm", "tapestry", "synergy".',
    '7. Factuality & Evidence Grounding: Ground all specific facts, statistics, venue details, and technical capabilities in the verified evidence supplied. Never hallucinate fake URLs, citations, or unverified claims. Use the provided evidence sources in your sources array.',
    '8. Search & Reader Intent: Satisfy primary search intent and reader curiosity with practical, high-value takeaways.',
    '9. JSON Schema Conformance: The full, unabbreviated Markdown article body must be provided in the "content" field. Do not compress or truncate content to fit JSON.',
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
    `- Title Angle (Guidance): "${request.titleAngle}"`,
    `- Topic ID: ${request.topicId}`,
    `- Pillar: ${request.pillar}`,
    `- Editorial Format: ${request.format}`,
    `- Target Audience: ${request.audience}`,
    `- Primary Intent: ${request.primaryIntent}${request.secondaryIntent ? ` (Secondary: ${request.secondaryIntent})` : ''}`,
    `- Primary Keyword: "${request.searchTargets.primaryKeyword}"`,
    '',
    `### Headline & Excerpt Instructions:`,
    `- Craft a specific, natural, human headline for "title" describing the actual subject in sentence case. Do NOT blindly copy formulaic patterns or use "A Modern Guide to...".`,
    `- Craft a clear, direct, informative "description" (120-160 characters) and "excerpt" explaining what the article actually covers without boilerplate filler.`,
    '',
    `### Article Length & Depth Specifications:`,
    `- TARGET WORD COUNT: Approximately ${targetWords} words (Aim directly for this target word count; do not aim for the lower boundary).`,
    `- ABSOLUTE MINIMUM ACCEPTABLE WORD COUNT: ${minWords} words (A draft significantly below this hard minimum is incomplete and invalid).`,
    `- Target Word Count Range: ${minWords}–${maxWords} words.`,
    '',
    `### Internal Structural & Length Allocation Plan:`,
    `Before generating the JSON payload, mentally plan and allocate the ~${targetWords} words across the entire article:`,
    `- Introduction (~15% / ~${Math.round(targetWords * 0.15)} words): Frame the context directly and present the core practical thesis without generic preamble.`,
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
