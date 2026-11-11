export type SocialPlatform = 'instagram' | 'x';
export type PublishState = 'scheduled' | 'publishing' | 'published' | 'failed' | 'needs_review' | 'canceled';
export interface SocialAccount {
  id: string; brandId: string; platform: SocialPlatform; providerUserId: string; handle: string;
  mode: 'test' | 'live'; connected: boolean;
}
export interface PublishPayload {
  contentId: string; organizationId: string; account: SocialAccount; caption: string; publishAt: string;
  aiGenerated?: boolean; versionId: string; imageHash: string; approvalSnapshot: string; approvedBy: string; approvedAt: string;
}
export interface PublishJob {
  id: string; payload: PublishPayload; state: PublishState; createdAt: string; startedAt: string | null;
  providerId: string | null; url: string | null; error: string | null; checkpoint: Record<string, string>;
  publishedAt: string | null; postedBy: string | null; manual: boolean;
}
