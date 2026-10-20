export const GITHUB_OWNER = 'SemiAnalysisAI';
export const GITHUB_REPO = 'InferenceX';
export const GITHUB_REPO_FULL = `${GITHUB_OWNER}/${GITHUB_REPO}`;

/** Pre-rename repository that still owns old workflow runs. */
const LEGACY_GITHUB_REPO = 'InferenceMAX/InferenceMAX';

const REPO_SLUG = /^[\w.-]+\/[\w.-]+$/u;

type Env = Readonly<Record<string, string | undefined>>;

/** GitHub owner and repository names are case-insensitive; keep the first spelling. */
function uniqueRepos(repos: readonly string[]): string[] {
  const seen = new Set<string>();
  return repos.filter((repo) => {
    const key = repo.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Benchmark source repositories in lookup order: the primary repository, then each
 * `owner/repo` from the comma-separated `INFERENCEX_SOURCE_REPOS`.
 */
export function benchmarkSourceRepos(env: Env = process.env): string[] {
  const configured = (env.INFERENCEX_SOURCE_REPOS ?? '')
    .split(',')
    .map((repo) => repo.trim())
    .filter(Boolean);
  for (const repo of configured) {
    if (!REPO_SLUG.test(repo)) {
      throw new Error(`Invalid repo slug in INFERENCEX_SOURCE_REPOS: ${repo}`);
    }
  }
  return uniqueRepos([GITHUB_REPO_FULL, ...configured]);
}

/** Repositories that may own a workflow run: the benchmark sources, then the legacy repository. */
export function workflowRunRepos(env: Env = process.env): string[] {
  return uniqueRepos([...benchmarkSourceRepos(env), LEGACY_GITHUB_REPO]);
}

export const GITHUB_API_BASE = 'https://api.github.com';

export const GCS_BUCKET_BASE = 'https://storage.googleapis.com/inferencemax-gha-backup';
