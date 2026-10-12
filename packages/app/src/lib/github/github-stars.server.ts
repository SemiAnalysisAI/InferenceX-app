import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

/**
 * Fetch the GitHub star count directly from the GitHub API.
 * Intended for server-side use (layouts, API routes).
 */
export async function fetchStarCount(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.stargazers_count ?? null;
  } catch {
    return null;
  }
}
