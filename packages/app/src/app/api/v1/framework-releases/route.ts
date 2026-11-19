import { GET as latestImages } from '@/app/api/v1/latest-images/route';
import {
  baseFramework,
  compareVersions,
  isActiveImageRow,
  nightlyCommit,
  parseVersion,
  type Version,
} from '@/components/latest-image/latest-image-utils';
import type {
  CommitStatus,
  FrameworkRelease,
  FrameworkReleases,
  LatestImageRow,
} from '@/lib/api/api';
import { readResponse, sourceRequest } from '@/lib/views-api/source';
import { type NextRequest, NextResponse } from 'next/server';

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

const githubHeaders = () => ({
  Accept: 'application/vnd.github.v3+json',
  ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
});

async function fetchLatestRelease(
  owner: string,
  repo: string,
): Promise<Omit<FrameworkRelease, 'commits'> | null> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`, {
    headers: githubHeaders(),
    next: { revalidate: 60 * 60 }, // 1 hour
  });

  if (!res.ok) return null;

  const releases: GitHubRelease[] = await res.json();
  let latest: Omit<FrameworkRelease, 'commits'> | null = null;
  let latestVersion: Version | null = null;
  for (const release of releases) {
    // Engine releases only; sglang also publishes `gateway-v…` router releases.
    const version = /^v\d/.test(release.tag_name) ? parseVersion(release.tag_name) : null;
    if (release.prerelease || release.draft || !release.published_at || !version) continue;
    if (latestVersion && compareVersions(version, latestVersion) <= 0) continue;
    latest = { tag: release.tag_name, publishedAt: release.published_at };
    latestVersion = version;
  }
  return latest;
}

/** Ancestry of each benchmarked nightly commit relative to the release tag. */
async function fetchCommitStatuses(
  owner: string,
  repo: string,
  tag: string,
  commits: readonly string[],
): Promise<Record<string, CommitStatus>> {
  const entries = await Promise.all(
    commits.map(async (commit) => {
      // Page 2 of one commit keeps the status but drops the multi-megabyte diff.
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/compare/${tag}...${commit}?per_page=1&page=2`,
        { headers: githubHeaders(), next: { revalidate: 24 * 60 * 60 } },
      );
      if (!res.ok) return null;
      const { status } = (await res.json()) as { status: CommitStatus };
      return [commit, status] as const;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

export async function GET(request: NextRequest) {
  try {
    const rows = await readResponse<LatestImageRow[]>(
      await latestImages(sourceRequest(request, '/api/v1/latest-images')),
    );
    const images = rows.filter(isActiveImageRow);
    const entries = await Promise.all(
      Object.entries(FRAMEWORK_REPOS).map(async ([framework, { owner, repo }]) => {
        const release = await fetchLatestRelease(owner, repo);
        if (!release) return [framework, null] as const;
        const commits = new Set<string>();
        for (const row of images) {
          const commit = baseFramework(row.framework) === framework && nightlyCommit(row.image);
          if (commit) commits.add(commit);
        }
        const statuses = await fetchCommitStatuses(owner, repo, release.tag, [...commits]);
        return [framework, { ...release, commits: statuses }] as const;
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
