/**
 * Workflow run cache + GitHub API enrichment.
 * `createWorkflowRunServices(sql, githubToken?)` returns `fetchGithubRun` and
 * `getOrCreateWorkflowRun`.
 */

import postgres from 'postgres';

import { GITHUB_API_BASE, GITHUB_REPOS } from '@semianalysisai/inferencex-constants';

import { CONCLUSION_OVERRIDES, PURGED_RUNS } from './run-overrides.js';

type Sql = ReturnType<typeof postgres>;

export interface GithubRunInfo {
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  runStartedAt: string | null;
  headSha: string | null;
  headBranch: string | null;
  runAttempt: number | null;
}

/**
 * Create workflow-run DB services with an in-memory cache.
 * Both `fetchGithubRun` and `getOrCreateWorkflowRun` are memoized so that
 * repeated calls for the same run ID within one ingest session hit the cache
 * rather than making extra network or DB round-trips.
 *
 * @param sql - Active `postgres` connection used for upserts.
 * @param githubToken - Optional GitHub PAT used to enrich runs via the API.
 *   When omitted, `fetchGithubRun` always returns `null`.
 * @returns An object with `fetchGithubRun` and `getOrCreateWorkflowRun`.
 */
export function createWorkflowRunServices(sql: Sql, githubToken?: string) {
  const workflowRunCache = new Map<string, number>();
  const githubRunCache = new Map<number, GithubRunInfo | null>();

  /**
   * Fetch metadata for a GitHub Actions run from the API.
   * Tries each repo in `GITHUB_REPOS` in order, stopping at the first 200 response.
   * Results (including `null` for 404s or network failures) are cached in memory.
   *
   * @param runId - Numeric GitHub Actions run ID.
   * @returns A `GithubRunInfo` object if the run was found, or `null` on 404,
   *   network error, or when no `githubToken` was provided.
   */
  async function fetchGithubRun(runId: number): Promise<GithubRunInfo | null> {
    if (githubRunCache.has(runId)) return githubRunCache.get(runId)!;
    if (!githubToken) {
      githubRunCache.set(runId, null);
      return null;
    }

    try {
      let resp: Response | null = null;
      for (const repo of GITHUB_REPOS) {
        resp = await fetch(`${GITHUB_API_BASE}/repos/${repo}/actions/runs/${runId}`, {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github+json',
          },
        });
        if (resp.ok) break;
        if (resp.status !== 404) {
          console.warn(
            `  [WARN] GitHub API run ${runId} (${repo}): ${resp.status} ${resp.statusText}`,
          );
        }
      }
      if (!resp || !resp.ok) {
        githubRunCache.set(runId, null);
        return null;
      }
      const d = (await resp.json()) as Record<string, any>;
      const info: GithubRunInfo = {
        name: String(d.name ?? ''),
        status: String(d.status ?? 'completed'),
        conclusion: d.conclusion ? String(d.conclusion) : null,
        htmlUrl: String(d.html_url ?? ''),
        createdAt: String(d.created_at ?? ''),
        runStartedAt: d.run_started_at ? String(d.run_started_at) : null,
        headSha: d.head_sha ? String(d.head_sha) : null,
        headBranch: d.head_branch ? String(d.head_branch) : null,
        runAttempt: typeof d.run_attempt === 'number' ? d.run_attempt : null,
      };
      githubRunCache.set(runId, info);
      return info;
    } catch (err: any) {
      console.warn(`  [WARN] GitHub API run ${runId}: ${err.message}`);
      githubRunCache.set(runId, null);
      return null;
    }
  }

  /**
   * Upsert a `workflow_runs` row and return its DB id.
   * Fields from `ghInfo` (if provided) take precedence over the inline params,
   * allowing the GCS backup script to enrich rows with live GitHub API data
   * while the CI script supplies all fields directly from environment variables.
   * The result is cached so subsequent calls for the same run skip the upsert.
   *
   * @param params.githubRunId - Numeric GitHub Actions run ID.
   * @param params.name - Workflow run display name.
   * @param params.date - ISO date string (`YYYY-MM-DD`) associated with this run.
   * @param params.headBranch - Git branch name, if known.
   * @param params.headSha - Git commit SHA, if known.
   * @param params.createdAt - ISO timestamp when the run was created.
   * @param params.status - Run status string (e.g. `'completed'`).
   * @param params.conclusion - Run conclusion string (e.g. `'success'`), or `null`.
   * @param params.htmlUrl - URL to the run on GitHub, if known.
   * @param params.runStartedAt - ISO timestamp when the run actually started, if known.
   * @param params.ghInfo - Optional pre-fetched GitHub API data; fields here
   *   override the corresponding inline params when present.
   * @returns The `workflow_runs.id` primary key for this run.
   */
  async function getOrCreateWorkflowRun(params: {
    githubRunId: number;
    runAttempt?: number;
    name: string;
    date: string;
    headBranch?: string | null;
    headSha?: string | null;
    createdAt: string;
    status?: string;
    conclusion?: string | null;
    htmlUrl?: string | null;
    runStartedAt?: string | null;
    ghInfo?: GithubRunInfo | null;
  }): Promise<number | null> {
    if (PURGED_RUNS.has(params.githubRunId)) return null;

    const attempt = params.runAttempt ?? params.ghInfo?.runAttempt ?? 0;
    const cacheKey = `${params.githubRunId}:${attempt}`;
    if (workflowRunCache.has(cacheKey)) return workflowRunCache.get(cacheKey)!;

    const gh = params.ghInfo;
    const name = gh?.name || params.name;
    const status = gh?.status ?? params.status ?? null;
    const conclusion =
      CONCLUSION_OVERRIDES.get(params.githubRunId) ?? gh?.conclusion ?? params.conclusion ?? null;
    const htmlUrl = gh?.htmlUrl || params.htmlUrl || null;
    const createdAt = gh?.createdAt || params.createdAt;
    const runStartedAt = gh?.runStartedAt ?? params.runStartedAt ?? null;
    const headSha = gh?.headSha ?? params.headSha ?? null;
    const headBranch = gh?.headBranch ?? params.headBranch ?? null;

    const [row] = await sql`
      insert into workflow_runs (
        github_run_id, run_attempt, name, status, conclusion,
        head_sha, head_branch, html_url, created_at, run_started_at, date
      ) values (
        ${params.githubRunId}, ${attempt}, ${name},
        ${status}, ${conclusion},
        ${headSha}, ${headBranch}, ${htmlUrl},
        ${createdAt}::timestamptz, ${runStartedAt}::timestamptz, ${params.date}::date
      )
      on conflict (github_run_id, run_attempt)
      do update set
        name           = excluded.name,
        status         = excluded.status,
        conclusion     = excluded.conclusion,
        html_url       = excluded.html_url,
        created_at     = excluded.created_at,
        run_started_at = excluded.run_started_at,
        head_sha       = excluded.head_sha,
        head_branch    = excluded.head_branch
      returning id
    `;

    workflowRunCache.set(cacheKey, row.id);
    return row.id;
  }

  return { fetchGithubRun, getOrCreateWorkflowRun };
}
