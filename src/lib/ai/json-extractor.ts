/**
 * Robust JSON Extractor and Parser for AI Provider Responses.
 *
 * Handles common LLM JSON output quirks:
 * - Markdown code fences (```json ... ``` or ``` ... ```)
 * - Preamble / postamble conversational text
 * - Trailing commas before closing braces/brackets
 * - Control characters in string literals
 */

/**
 * Strips common JSON formatting flaws such as trailing commas before closing braces/brackets,
 * and escapes raw unescaped newlines/tabs inside string literals.
 */
function sanitizeJsonCandidate(jsonStr: string): string {
  const s = jsonStr
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')
    // Remove non-printable control characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

  let inString = false;
  let escape = false;
  let result = '';

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (escape) {
      escape = false;
      result += char;
      continue;
    }
    if (char === '\\') {
      escape = true;
      result += char;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    if (inString) {
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Repairs unclosed strings, brackets, and braces in truncated JSON objects.
 */
function repairTruncatedJson(str: string): string {
  let s = str.trim();
  const firstBrace = s.indexOf('{');
  if (firstBrace === -1) return s;
  s = s.slice(firstBrace);

  let inString = false;
  let escape = false;
  let openBraces = 0;
  let openBrackets = 0;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces = Math.max(0, openBraces - 1);
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets = Math.max(0, openBrackets - 1);
    }
  }

  if (inString) {
    s += '"';
  }

  // Remove trailing comma or incomplete key-value fragment
  s = s.replace(/,\s*$/, '');

  while (openBrackets > 0) {
    s += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    s += '}';
    openBraces--;
  }

  return s;
}

export interface JsonExtractorOptions {
  allowRepair?: boolean;
}

/**
 * Robustly extracts and parses JSON from raw LLM output.
 *
 * @param rawText The raw text output from an AI model.
 * @param options Optional configuration (e.g. allowRepair).
 * @returns The parsed JavaScript object or array.
 * @throws Error if no valid JSON structure could be extracted or parsed.
 */
export function extractAndParseJson<T = any>(rawText: string, options?: JsonExtractorOptions): T {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Cannot parse JSON from empty or non-string input');
  }

  const trimmed = rawText.trim();

  // 1. Fast path: Direct JSON.parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to extraction strategies
  }

  // 2. Extract from Markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(trimmed)) !== null) {
    const candidate = match[1]?.trim();
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch {
        try {
          return JSON.parse(sanitizeJsonCandidate(candidate));
        } catch {
          // Try next match or strategy
        }
      }
    }
  }

  // 3. Extract outermost JSON object { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const objectCandidate = trimmed.slice(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(objectCandidate);
    } catch {
      try {
        return JSON.parse(sanitizeJsonCandidate(objectCandidate));
      } catch {
        // Continue
      }
    }
  }

  // 4. Extract outermost JSON array [ ... ]
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const arrayCandidate = trimmed.slice(firstBracket, lastBracket + 1).trim();
    try {
      return JSON.parse(arrayCandidate);
    } catch {
      try {
        return JSON.parse(sanitizeJsonCandidate(arrayCandidate));
      } catch {
        // Continue
      }
    }
  }

  // 5. Attempt repair on truncated JSON structure if explicitly allowed
  if (options?.allowRepair) {
    try {
      const repaired = repairTruncatedJson(trimmed);
      return JSON.parse(sanitizeJsonCandidate(repaired));
    } catch {
      // Continue to final attempt
    }
  }

  // 6. Final attempt: sanitized whole trimmed string
  try {
    return JSON.parse(sanitizeJsonCandidate(trimmed));
  } catch (finalErr: any) {
    throw new Error(`Failed to extract valid JSON from model response: ${finalErr.message}`);
  }
}
