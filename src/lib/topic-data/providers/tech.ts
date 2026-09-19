import type { PillarSlug } from '../../../config/site.ts';
import type { DataDomain, DataSource, ProviderRequestOptions } from '../types/core.ts';
import type { TechActivityData, TechProjectActivity } from '../types/topics.ts';
import { BaseTopicDataProvider, DataProviderException } from './base.ts';

interface GitHubRawRepo {
  name?: string;
  full_name?: string;
  description?: string;
  language?: string;
  stargazers_count?: number;
  forks_count?: number;
  html_url?: string;
  license?: {
    name?: string;
    spdx_id?: string;
  };
  owner?: {
    login?: string;
  };
}

export class GitHubTechActivityProvider extends BaseTopicDataProvider<TechActivityData> {
  readonly providerId = 'github-tech-activity';
  readonly name = 'GitHub Open Source Ecosystem';
  readonly domain: DataDomain = 'tech_activity';
  readonly defaultPillar: PillarSlug = 'tech-ai';

  readonly source: DataSource = {
    id: 'github',
    name: 'GitHub Open Source Platform',
    url: 'https://github.com',
    attribution: 'Public repository metadata via GitHub REST API',
    license: 'Open Source',
    isOfficial: true,
  };

  protected getEndpointUrl(_options: ProviderRequestOptions): string {
    return 'https://api.github.com/repos/ollama/ollama';
  }

  protected getRequestHeaders(options: ProviderRequestOptions): Record<string, string> {
    const headers = super.getRequestHeaders(options);
    headers['Accept'] = 'application/vnd.github+json';

    const token =
      options.apiKey ||
      (typeof process !== 'undefined' && process.env?.GITHUB_TOKEN) ||
      '';
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  protected extractSourceUpdatedAt(raw: unknown): string | undefined {
    if (raw && typeof raw === 'object' && 'updated_at' in raw) {
      const updatedAt = (raw as { updated_at?: string }).updated_at;
      if (updatedAt) return new Date(updatedAt).toISOString();
    }
    return undefined;
  }

  protected validateAndNormalize(raw: unknown): TechActivityData {
    if (!raw || typeof raw !== 'object') {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'GitHub response is not an object');
    }

    const repo = raw as GitHubRawRepo;
    if (!repo.name || !repo.html_url) {
      throw new DataProviderException('MALFORMED_PAYLOAD', 'GitHub response missing repo name or url');
    }

    const project: TechProjectActivity = {
      repoName: repo.full_name || repo.name,
      displayName: repo.name,
      owner: repo.owner?.login || 'open-source',
      description: repo.description || 'Open source software and AI ecosystem tool',
      language: repo.language || 'Go / C++',
      starsCount: repo.stargazers_count || 0,
      forksCount: repo.forks_count || 0,
      licenseName: repo.license?.spdx_id || repo.license?.name || 'MIT / Open Source',
      url: repo.html_url,
    };

    return {
      projects: [project],
      featuredProject: project,
    };
  }

  protected getTitle(_data: TechActivityData | null): string {
    return 'Open Source AI & Engineering Ecosystem';
  }

  protected getSubtitle(data: TechActivityData | null): string {
    if (data && data.featuredProject) {
      return `Release status and community activity for ${data.featuredProject.repoName}`;
    }
    return 'Verified repository metrics via GitHub API';
  }
}
