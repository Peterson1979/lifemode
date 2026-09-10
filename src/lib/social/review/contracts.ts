import type { SocialReviewResult, GeneratedSocialContent, SocialBrief } from '../types.ts';

export interface SocialReviewRequest {
  brief: SocialBrief;
  content: GeneratedSocialContent;
}

export interface ISocialReviewProvider {
  readonly name: string;
  reviewSocialContent(request: SocialReviewRequest): Promise<SocialReviewResult>;
}
