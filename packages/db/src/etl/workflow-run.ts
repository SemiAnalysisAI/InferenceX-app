import type postgres from 'postgres';

import {
  benchmarkSourceRepos,
  GITHUB_API_BASE,
  LEGACY_GITHUB_REPO,
} from '@semianalysisai/inferencex-constants';

import { CONCLUSION_OVERRIDES, isRunAttemptPurged } from './run-overrides.js';

type Sql = ReturnType<typeof postgres>;

export interface GithubPullRequestRef {
  number: number;
  htmlUrl: string;
}

export interface GithubRunInfo {
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  runStartedAt: string | null;
  headSha: string | null;
  headBranch: string | null;
  headCommitMessage: string | null;
  runAttempt: number | null;
  pullRequests: GithubPullRequestRef[];
}

export function createWorkflowRunServices(
  sql: Sql,
  githubToken?: string,
  repos: readonly string[] = [...benchmarkSourceRepos(), LEGACY_GITHUB_REPO],
) {
  const workflowRunCache = new Map<string, number>();
  const githubRunCache = new Map<number, GithubRunInfo | null>();

  async function fetchGithubRun(runId: number): Promise<GithubRunInfo | null> {
    if (githubRunCache.has(runId)) return githubRunCache.get(runId)!;
    if (!githubToken) {
      githubRunCache.set(runId, null);
      return null;
    }

    try {
      let resp: Response | null = null;
      for (const repo of repos) {
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
      const repoHtmlUrl = String(d.repository?.html_url ?? '');
      const pullRequests: GithubPullRequestRef[] = Array.isArray(d.pull_requests)
        ? d.pull_requests
            .map((pr: Record<string, any>): GithubPullRequestRef | null => {
              const num = typeof pr?.number === 'number' ? pr.number : null;
              if (num === null || !repoHtmlUrl) return null;
              return { number: num, htmlUrl: `${repoHtmlUrl}/pull/${num}` };
            })
            .filter((pr: GithubPullRequestRef | null): pr is GithubPullRequestRef => pr !== null)
        : [];
      const info: GithubRunInfo = {
        name: String(d.name ?? ''),
        status: String(d.status ?? 'completed'),
        conclusion: d.conclusion ? String(d.conclusion) : null,
        htmlUrl: String(d.html_url ?? ''),
        createdAt: String(d.created_at ?? ''),
        runStartedAt: d.run_started_at ? String(d.run_started_at) : null,
        headSha: d.head_sha ? String(d.head_sha) : null,
        headBranch: d.head_branch ? String(d.head_branch) : null,
        headCommitMessage: d.head_commit?.message ? String(d.head_commit.message) : null,
        runAttempt: typeof d.run_attempt === 'number' ? d.run_attempt : null,
        pullRequests,
      };
      githubRunCache.set(runId, info);
      return info;
    } catch (error: any) {
      console.warn(`  [WARN] GitHub API run ${runId}: ${error.message}`);
      githubRunCache.set(runId, null);
      return null;
    }
  }

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
    appendOnly?: boolean;
    ghInfo?: GithubRunInfo | null;
  }): Promise<number | null> {
    const attempt = params.runAttempt ?? params.ghInfo?.runAttempt ?? 0;
    if (isRunAttemptPurged(params.githubRunId, attempt)) return null;

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
    const appendOnly = params.appendOnly ?? false;

    const [row] = await sql`
      insert into workflow_runs (
        github_run_id, run_attempt, name, status, conclusion,
        head_sha, head_branch, html_url, created_at, run_started_at, date, append_only
      ) values (
        ${params.githubRunId}, ${attempt}, ${name},
        ${status}, ${conclusion},
        ${headSha}, ${headBranch}, ${htmlUrl},
        ${createdAt}::timestamptz, ${runStartedAt}::timestamptz, ${params.date}::date,
        ${appendOnly}
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
        head_branch    = excluded.head_branch,
        append_only    = excluded.append_only
      returning id
    `;

    workflowRunCache.set(cacheKey, row.id);
    return row.id;
  }

  return { fetchGithubRun, getOrCreateWorkflowRun };
}
