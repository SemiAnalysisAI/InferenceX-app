import { NextResponse } from 'next/server';

interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
}

const FRAMEWORK_REPOS: Record<string, { owner: string; repo: string }> = {
  vllm: { owner: 'vllm-project', repo: 'vllm' },
  sglang: { owner: 'sgl-project', repo: 'sglang' },
};

async function fetchLatestRelease(owner: string, repo: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
    },
    next: { revalidate: 60 * 60 }, // 1 hour
  });

  if (!res.ok) return null;

  const releases: GitHubRelease[] = await res.json();
  const latest = releases.find((r) => !r.prerelease && !r.draft);
  return latest?.tag_name ?? null;
}

export async function GET() {
  try {
    const entries = await Promise.all(
      Object.entries(FRAMEWORK_REPOS).map(async ([framework, { owner, repo }]) => {
        const tag = await fetchLatestRelease(owner, repo);
        return [framework, tag] as const;
      }),
    );

    const result: Record<string, string | null> = Object.fromEntries(entries);

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
