import {
  compareVersions,
  parseVersion,
  type Version,
} from '@/components/latest-image/latest-image-utils';
import type { FrameworkRelease, FrameworkReleases } from '@/lib/api/api';
import { NextResponse } from 'next/server';

interface GitHubRelease {
  tag_name: string;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
}

const FRAMEWORK_REPOS: Record<string, { owner: string; repo: string }> = {
  vllm: { owner: 'vllm-project', repo: 'vllm' },
  sglang: { owner: 'sgl-project', repo: 'sglang' },
};

async function fetchLatestRelease(owner: string, repo: string): Promise<FrameworkRelease | null> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
    },
    next: { revalidate: 60 * 60 }, // 1 hour
  });

  if (!res.ok) return null;

  const releases: GitHubRelease[] = await res.json();
  let latest: FrameworkRelease | null = null;
  let latestVersion: Version | null = null;
  for (const release of releases) {
    const version = parseVersion(release.tag_name);
    if (release.prerelease || release.draft || !release.published_at || !version) continue;
    if (latestVersion && compareVersions(version, latestVersion) <= 0) continue;
    latest = { tag: release.tag_name, publishedAt: release.published_at };
    latestVersion = version;
  }
  return latest;
}

export async function GET() {
  try {
    const entries = await Promise.all(
      Object.entries(FRAMEWORK_REPOS).map(async ([framework, { owner, repo }]) => {
        const release = await fetchLatestRelease(owner, repo);
        return [framework, release] as const;
      }),
    );

    const result: FrameworkReleases = Object.fromEntries(entries);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('Error fetching framework releases:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
