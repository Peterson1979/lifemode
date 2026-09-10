import type { ISocialReviewProvider, SocialReviewRequest } from '../contracts.ts';
import type { SocialReviewResult } from '../../types.ts';

export class FixtureSocialReviewProvider implements ISocialReviewProvider {
  readonly name = 'Fixture Social Review Provider';
  private verdict: 'PASS' | 'REVISE' | 'REJECT';
  private score: number;

  constructor(options: { verdict?: 'PASS' | 'REVISE' | 'REJECT'; score?: number } = {}) {
    this.verdict = options.verdict || 'PASS';
    this.score = options.score ?? (this.verdict === 'PASS' ? 92 : this.verdict === 'REVISE' ? 70 : 45);
  }

  async reviewSocialContent(_request: SocialReviewRequest): Promise<SocialReviewResult> {
    return {
      passed: this.verdict === 'PASS' && this.score >= 80,
      score: this.score,
      verdict: this.verdict,
      feedback: {
        brandAlignment: this.score,
        readability: this.score,
        factuality: this.score,
        safety: 95,
        platformSuitability: this.score,
        notes: `Fixture social review outcome: ${this.verdict}`,
      },
    };
  }
}
