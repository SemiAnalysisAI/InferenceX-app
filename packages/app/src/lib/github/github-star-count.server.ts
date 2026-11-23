import { unstable_cache } from 'next/cache';
import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

export const GITHUB_REPO_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const GITHUB_STARS_REVALIDATE_SECONDS = 60 * 60;

export interface GitHubStarsResponse {
  stars: number;
}

/**
 * Reads the repository star count with the server token. Unauthenticated browser requests share
 * GitHub's 60-per-hour limit per IP address, so readers on a busy office or VPN address saw no count.
 */
export async function readGitHubStars(): Promise<GitHubStarsResponse> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(GITHUB_REPO_API_URL, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      ...(token && { Authorization: `token ${token}` }),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub repository request failed (${res.status})`);
  const data: { stargazers_count?: unknown } = await res.json();
  const stars = data.stargazers_count;
  if (typeof stars !== 'number' || !Number.isFinite(stars)) {
    throw new TypeError('GitHub repository response has no stargazers_count');
  }
  return { stars };
}

export const getGitHubStars = unstable_cache(readGitHubStars, ['github-stars'], {
  revalidate: GITHUB_STARS_REVALIDATE_SECONDS,
});
