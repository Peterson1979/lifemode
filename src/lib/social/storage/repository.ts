import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { PillarSlug, SocialManifestEntry, SocialPlatform } from '../types.ts';

export interface ISocialHistoryRepository {
  loadHistory(): Promise<SocialManifestEntry[]>;
  saveHistory(history: SocialManifestEntry[]): Promise<void>;
  recordEntry(entry: SocialManifestEntry): Promise<void>;
  isTopicRecentlyPublished(topicId: string, withinDays?: number): Promise<boolean>;
  isPillarRecentlyPublished(pillar: PillarSlug, withinDays?: number, referenceDate?: Date | string): Promise<boolean>;
  isPlatformPublished(topicId: string, platform: SocialPlatform): Promise<boolean>;
  isContentDuplicate(contentHash: string): Promise<boolean>;
  isAssetDuplicate(assetHash: string): Promise<boolean>;
}

/**
 * Computes a deterministic SHA-256 hash for content or asset.
 */
export function hashString(content: string): string {
  return createHash('sha256').update(content.trim().toLowerCase()).digest('hex');
}

/**
 * Creates a deterministic idempotency key for a topic, platform, and content combination.
 */
export function createIdempotencyKey(topicId: string, platform: SocialPlatform, contentHash: string): string {
  const shortHash = contentHash.slice(0, 12);
  return `lm-soc-${topicId}-${platform}-${shortHash}`;
}

export class FilesystemSocialHistoryRepository implements ISocialHistoryRepository {
  private historyPath: string;

  constructor(storageDir: string = 'data/social') {
    const resolvedDir = resolve(process.cwd(), storageDir);
    this.historyPath = join(resolvedDir, 'history.json');
  }

  async loadHistory(): Promise<SocialManifestEntry[]> {
    try {
      const data = await readFile(this.historyPath, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async saveHistory(history: SocialManifestEntry[]): Promise<void> {
    await mkdir(dirname(this.historyPath), { recursive: true });
    const formatted = JSON.stringify(history, null, 2);
    await writeFile(this.historyPath, formatted, 'utf-8');
  }

  async recordEntry(entry: SocialManifestEntry): Promise<void> {
    const current = await this.loadHistory();
    const index = current.findIndex(
      (item) => item.idempotencyKey === entry.idempotencyKey || item.topicId === entry.topicId
    );

    if (index >= 0) {
      const existing = current[index];
      const mergedPlatformResults: Partial<Record<SocialPlatform, any>> = {
        ...existing.platformResults,
      };

      // Merge each platform result, ensuring existing PUBLISHED statuses cannot be downgraded
      for (const [p, res] of Object.entries(entry.platformResults) as [SocialPlatform, any][]) {
        if (!res) continue;
        const existingRes = existing.platformResults?.[p];
        if (existingRes?.status === 'PUBLISHED' && res.status !== 'PUBLISHED') {
          // Keep existing PUBLISHED status
          mergedPlatformResults[p] = existingRes;
        } else {
          mergedPlatformResults[p] = res;
        }
      }

      const anyPublished = Object.values(mergedPlatformResults).some((r) => r?.status === 'PUBLISHED');
      const allTargetPublished =
        entry.targetPlatforms.length > 0 &&
        entry.targetPlatforms.every((p) => mergedPlatformResults[p]?.status === 'PUBLISHED');

      current[index] = {
        ...existing,
        ...entry,
        platformResults: mergedPlatformResults,
        overallStatus: allTargetPublished ? 'COMPLETED' : anyPublished ? 'PARTIAL' : entry.overallStatus,
        updatedAt: new Date().toISOString(),
      };
    } else {
      current.push(entry);
    }

    await this.saveHistory(current);
  }

  async isTopicRecentlyPublished(topicId: string, withinDays: number = 14): Promise<boolean> {
    const history = await this.loadHistory();
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    const normalizedTarget = topicId.trim().toLowerCase();

    return history.some((item) => {
      const matchTopicId = item.topicId && item.topicId.trim().toLowerCase() === normalizedTarget;
      if (!matchTopicId) return false;
      const itemTime = new Date(item.updatedAt || item.createdAt).getTime();
      const allTargetPublished =
        item.targetPlatforms.length > 0 &&
        item.targetPlatforms.every((p) => item.platformResults?.[p]?.status === 'PUBLISHED');
      const anyPublished = Object.values(item.platformResults || {}).some((r) => r?.status === 'PUBLISHED');
      return itemTime >= cutoff && (item.overallStatus === 'COMPLETED' || allTargetPublished || anyPublished);
    });
  }

  async isPillarRecentlyPublished(
    pillar: PillarSlug,
    withinDays: number = 14,
    referenceDate?: Date | string
  ): Promise<boolean> {
    const history = await this.loadHistory();
    const refTime = referenceDate ? new Date(referenceDate).getTime() : Date.now();
    const cutoff = refTime - withinDays * 24 * 60 * 60 * 1000;

    return history.some((item) => {
      if (item.pillar !== pillar) return false;
      const itemTime = new Date(item.updatedAt || item.createdAt).getTime();
      if (isNaN(itemTime)) return false;
      if (itemTime < cutoff || itemTime > refTime + 60000) return false;

      const allTargetPublished =
        item.targetPlatforms &&
        item.targetPlatforms.length > 0 &&
        item.targetPlatforms.every((p) => item.platformResults?.[p]?.status === 'PUBLISHED');
      const anyPublished = Object.values(item.platformResults || {}).some((r) => r?.status === 'PUBLISHED');
      const completedStatus = item.overallStatus === 'COMPLETED' || item.overallStatus === 'PARTIAL';

      return completedStatus || allTargetPublished || anyPublished;
    });
  }

  async isPlatformPublished(topicId: string, platform: SocialPlatform): Promise<boolean> {
    const history = await this.loadHistory();
    const normalizedTarget = topicId.trim().toLowerCase();
    return history.some((item) => {
      const matchTopicId = item.topicId && item.topicId.trim().toLowerCase() === normalizedTarget;
      if (!matchTopicId) return false;
      const res = item.platformResults?.[platform];
      return res && res.status === 'PUBLISHED';
    });
  }

  async isContentDuplicate(contentHash: string): Promise<boolean> {
    const history = await this.loadHistory();
    return history.some((item) => item.contentHash === contentHash);
  }

  async isAssetDuplicate(assetHash: string): Promise<boolean> {
    const history = await this.loadHistory();
    return history.some((item) => item.assetHash === assetHash);
  }
}
