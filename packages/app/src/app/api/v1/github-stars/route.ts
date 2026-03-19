import { NextResponse } from 'next/server';

import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

export async function GET() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
      },
      next: { revalidate: 60 * 60 }, // 1 hour
    });

    if (!res.ok) {
      return NextResponse.json({ error: `GitHub API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(
      { owner: GITHUB_OWNER, repo: GITHUB_REPO, stars: data.stargazers_count },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=7200',
        },
      },
    );
  } catch (error) {
    console.error('Error fetching GitHub stars:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
