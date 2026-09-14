import type { OwnedProject, ArticleMatchContext, ProjectMatchResult } from './types.ts';
import { OWNED_PROJECTS, getOwnedProjectById } from './config.ts';

/**
 * Normalizes text for clean keyword scanning.
 */
function normalizeText(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluates match relevance for a specific owned project against article context.
 */
export function scoreProjectMatch(
  project: OwnedProject,
  context: ArticleMatchContext
): { score: number; matchedKeywords: string[]; negativeHits: string[] } {
  const normTitle = normalizeText(context.title);
  const normDesc = normalizeText(context.description);
  const normTags = (context.tags || []).map((t) => normalizeText(t));
  const normTopicId = normalizeText(context.topicId);
  const normAudience = normalizeText(context.audience);
  const normPrimaryIntent = normalizeText(context.primaryIntent);
  const normSecondaryIntent = normalizeText(context.secondaryIntent);
  const normBody = normalizeText(context.content);

  const matchedKeywords: string[] = [];
  const negativeHits: string[] = [];

  let rawPoints = 0;

  // 1. Scan Positive Keywords with field-specific weights
  for (const keyword of project.keywords) {
    const normKw = normalizeText(keyword);
    if (!normKw) continue;

    let kwMatched = false;

    // Title match: Highest precision & weight (30 pts)
    if (normTitle.includes(normKw)) {
      rawPoints += 30;
      kwMatched = true;
    }

    // Tag match: Strong editorial signal (25 pts)
    if (normTags.some((tag) => tag === normKw || tag.includes(normKw) || normKw.includes(tag))) {
      rawPoints += 25;
      kwMatched = true;
    }

    // Description match: Secondary context (15 pts)
    if (normDesc.includes(normKw)) {
      rawPoints += 15;
      kwMatched = true;
    }

    // Topic ID / Audience / Intent match (10 pts)
    if (
      normTopicId.includes(normKw) ||
      normAudience.includes(normKw) ||
      normPrimaryIntent.includes(normKw) ||
      normSecondaryIntent.includes(normKw)
    ) {
      rawPoints += 10;
      kwMatched = true;
    }

    // Body content match: Gentle support only if not already matched (5 pts, capped)
    if (!kwMatched && normBody && normBody.includes(normKw)) {
      rawPoints += 5;
      kwMatched = true;
    }

    if (kwMatched) {
      matchedKeywords.push(keyword);
    }
  }

  // 2. Negative Keywords Guard (heavy penalty: -40 pts per hit)
  if (project.negativeKeywords && project.negativeKeywords.length > 0) {
    for (const negKw of project.negativeKeywords) {
      const normNeg = normalizeText(negKw);
      if (!normNeg) continue;

      if (
        normTitle.includes(normNeg) ||
        normTags.some((t) => t.includes(normNeg)) ||
        normDesc.includes(normNeg)
      ) {
        negativeHits.push(negKw);
        rawPoints -= 40;
      }
    }
  }

  // 3. Pillar Alignment Affinity (Soft boost: +10 pts ONLY if at least one keyword was matched)
  const isPillarRelevant = (project.relevantPillars as string[]).includes(String(context.pillar));
  if (isPillarRelevant && matchedKeywords.length > 0) {
    rawPoints += 10;
  }

  // Normalize final score to 0 - 100 range
  const finalScore = Math.max(0, Math.min(100, rawPoints));

  return {
    score: finalScore,
    matchedKeywords,
    negativeHits,
  };
}

/**
 * Deterministically matches an article to the most relevant owned project.
 * Returns null if no project meets the minimum relevance threshold.
 */
export function matchOwnedProject(context: ArticleMatchContext): OwnedProject | null {
  const result = evaluateOwnedProjectMatch(context);
  return result.project;
}

/**
 * Detailed matcher that returns the matched project along with diagnostic score and matched keywords.
 */
export function evaluateOwnedProjectMatch(context: ArticleMatchContext): ProjectMatchResult {
  // 1. Explicit Frontmatter Override Handling
  if (context.targetProject) {
    if (context.targetProject === 'none') {
      return {
        project: null,
        score: 0,
        matchedKeywords: [],
        matchReason: 'Explicitly disabled via frontmatter (targetProject: none)',
      };
    }

    const explicitProject = getOwnedProjectById(context.targetProject);
    if (explicitProject) {
      return {
        project: explicitProject,
        score: 100,
        matchedKeywords: ['[explicit_override]'],
        matchReason: `Explicitly targeted via frontmatter (${context.targetProject})`,
      };
    }
  }

  // 2. Evaluate all configured projects
  const candidates: Array<{
    project: OwnedProject;
    score: number;
    matchedKeywords: string[];
    negativeHits: string[];
  }> = [];

  for (const project of OWNED_PROJECTS) {
    const { score, matchedKeywords, negativeHits } = scoreProjectMatch(project, context);

    if (score >= project.matchThreshold && matchedKeywords.length > 0) {
      candidates.push({
        project,
        score,
        matchedKeywords,
        negativeHits,
      });
    }
  }

  // 3. Safe No-Match Fallback
  if (candidates.length === 0) {
    return {
      project: null,
      score: 0,
      matchedKeywords: [],
      matchReason: 'No owned project met the relevance threshold',
    };
  }

  // 4. Sort by score descending with deterministic tie-breaking
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie-break by number of matched keywords
    if (b.matchedKeywords.length !== a.matchedKeywords.length) {
      return b.matchedKeywords.length - a.matchedKeywords.length;
    }
    // Deterministic alphabetical ID tie-break
    return a.project.id.localeCompare(b.project.id);
  });

  const topMatch = candidates[0];

  return {
    project: topMatch.project,
    score: topMatch.score,
    matchedKeywords: topMatch.matchedKeywords,
    matchReason: `Matched ${topMatch.project.name} (Score: ${topMatch.score}/100, Keywords: ${topMatch.matchedKeywords.slice(0, 3).join(', ')})`,
  };
}
