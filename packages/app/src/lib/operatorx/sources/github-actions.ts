/**
 * OperatorX runs straight from GitHub Actions: completed workflow_dispatch runs of
 * operatorx-sweep.yml on any branch, read from their uploaded artifacts. GitHub keeps
 * artifacts for 14 days; older runs are listed as unavailable.
 */
import AdmZip from 'adm-zip';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import {
  type OperatorXRawBundle,
  type OperatorXRunMeta,
  type OperatorXRunRef,
  planFromManifest,
} from '@semianalysisai/inferencex-db/operatorx/bundle';

import { type OperatorXSource, OperatorXSourceError } from '../source';

const WORKFLOW = 'operatorx-sweep.yml';
const WORKFLOW_PATH = `.github/workflows/${WORKFLOW}`;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_RUN_BYTES = 512 * 1024 * 1024;
const LIST_PAGES = 3; // up to 300 runs
const MANIFEST_CONCURRENCY = 8;

/** Result documents; counter CSVs and logs stay in the artifact. */
function keepResult(name: string): boolean {
  return (
    name.startsWith('results/') && !name.startsWith('results/counters/') && name.endsWith('.json')
  );
}

interface GithubRun {
  id: number;
  path: string;
  event: string;
  status: string;
  run_attempt: number;
  head_sha: string;
  head_branch: string | null;
  created_at: string;
  conclusion: string | null;
}
interface Artifact {
  id: number;
  name: string;
  expired: boolean;
  size_in_bytes: number;
}

export interface GithubActionsSourceOptions {
  token: string;
  repo?: string;
}

export class GithubActionsSource implements OperatorXSource {
  readonly name = 'github-actions';
  private readonly base: string;
  private readonly token: string;
  /** Manifests never change for a (run, attempt); keep them for the process lifetime. */
  private readonly manifests = new Map<string, Promise<unknown | null>>();

  constructor(options: GithubActionsSourceOptions) {
    this.token = options.token;
    this.base = `${GITHUB_API_BASE}/repos/${options.repo ?? `${GITHUB_OWNER}/${GITHUB_REPO}`}`;
  }

  private async fetch(suffix: string): Promise<Response> {
    const response = await fetch(`${this.base}${suffix}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) {
      // GitHub answers 403 both for missing permission and for an exhausted rate limit;
      // its message and the remaining quota say which.
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const detail = typeof body?.message === 'string' ? `: ${body.message.slice(0, 160)}` : '';
      const remaining = response.headers.get('x-ratelimit-remaining');
      throw new OperatorXSourceError(
        `GitHub request failed (${response.status}${detail}${remaining === null ? '' : `, rate limit remaining ${remaining}`})`,
        response.status === 404 ? 404 : 502,
      );
    }
    return response;
  }

  private async json<T>(suffix: string): Promise<T> {
    const response = await this.fetch(suffix);
    return response.json() as Promise<T>;
  }

  private static meta(run: GithubRun): OperatorXRunMeta {
    return {
      run_id: String(run.id),
      run_attempt: run.run_attempt,
      source_sha: run.head_sha,
      source_branch: run.head_branch,
      generated_at: run.created_at,
      conclusion: run.conclusion,
    };
  }

  private async artifacts(runId: string): Promise<Artifact[]> {
    const out: Artifact[] = [];
    for (let page = 1; ; page++) {
      const payload = await this.json<{ artifacts: Artifact[]; total_count: number }>(
        `/actions/runs/${runId}/artifacts?per_page=100&page=${page}`,
      );
      out.push(...payload.artifacts);
      if (payload.artifacts.length === 0 || out.length >= payload.total_count) return out;
    }
  }

  /** JSON documents in an artifact zip whose entry name passes `keep`. */
  private async artifactDocs(
    artifact: Artifact,
    keep: (name: string) => boolean,
    budget: { remaining: number },
  ): Promise<Map<string, unknown>> {
    if (artifact.expired) throw new OperatorXSourceError('Artifacts have expired', 410);
    if (artifact.size_in_bytes > MAX_ARTIFACT_BYTES)
      throw new OperatorXSourceError(`Artifact ${artifact.name} is too large`, 502);
    const response = await this.fetch(`/actions/artifacts/${artifact.id}/zip`);
    const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
    const docs = new Map<string, unknown>();
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !keep(entry.entryName)) continue;
      budget.remaining -= entry.header.size;
      if (budget.remaining < 0) throw new OperatorXSourceError('Run artifacts are too large', 502);
      docs.set(
        entry.entryName,
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entry.getData())),
      );
    }
    return docs;
  }

  private manifest(run: GithubRun, artifacts?: Artifact[]): Promise<unknown | null> {
    const key = `${run.id}:${run.run_attempt}`;
    let pending = this.manifests.get(key);
    if (!pending) {
      pending = (async () => {
        const list = artifacts ?? (await this.artifacts(String(run.id)));
        const artifact = list
          .filter((a) => a.name === `operatorx-manifest-${run.id}`)
          .sort((a, b) => b.id - a.id)[0];
        if (!artifact || artifact.expired) return null;
        const docs = await this.artifactDocs(artifact, (n) => n === 'operatorx-manifest.json', {
          remaining: MAX_ARTIFACT_BYTES,
        });
        return docs.get('operatorx-manifest.json') ?? null;
      })().catch((error: unknown) => {
        this.manifests.delete(key); // retry transient failures on the next list
        throw error;
      });
      this.manifests.set(key, pending);
    }
    return pending;
  }

  async listRuns(): Promise<OperatorXRunRef[]> {
    const runs: GithubRun[] = [];
    for (let page = 1; page <= LIST_PAGES; page++) {
      const payload = await this.json<{ workflow_runs: GithubRun[] }>(
        `/actions/workflows/${WORKFLOW}/runs?status=completed&event=workflow_dispatch&per_page=100&page=${page}`,
      );
      runs.push(...payload.workflow_runs.filter((r) => r.path === WORKFLOW_PATH));
      if (payload.workflow_runs.length < 100) break;
    }
    const refs: OperatorXRunRef[] = Array.from({ length: runs.length });
    let next = 0;
    const worker = async () => {
      while (next < runs.length) {
        const i = next++;
        const run = runs[i];
        const ref: OperatorXRunRef = GithubActionsSource.meta(run);
        try {
          const manifest = await this.manifest(run);
          if (manifest === null) ref.unavailable = 'Artifacts expired or missing';
          else ref.plan = planFromManifest(manifest) ?? undefined;
        } catch (error) {
          ref.unavailable = error instanceof Error ? error.message : 'Unavailable';
        }
        refs[i] = ref;
      }
    };
    await Promise.all(Array.from({ length: MANIFEST_CONCURRENCY }, worker));
    return refs;
  }

  async getBundle(runId: string): Promise<OperatorXRawBundle> {
    if (!/^[1-9][0-9]*$/u.test(runId)) throw new OperatorXSourceError('Invalid run ID', 400);
    const run = await this.json<GithubRun>(`/actions/runs/${runId}`);
    if (run.path !== WORKFLOW_PATH || run.event !== 'workflow_dispatch')
      throw new OperatorXSourceError('Not an OperatorX sweep run', 404);
    if (run.status !== 'completed') throw new OperatorXSourceError('Run is still in progress', 409);
    const artifacts = await this.artifacts(runId);
    const manifest = await this.manifest(run, artifacts);
    if (manifest === null) throw new OperatorXSourceError('Artifacts expired or missing', 410);

    // newest artifact per shard (a partial rerun keeps earlier attempts' shards)
    const shards = new Map<string, { artifact: Artifact; attempt: number }>();
    for (const artifact of artifacts) {
      const m = /^operatorx-shard-(?<run>\d+)-(?<attempt>\d+)-(?<shard>.+)$/u.exec(artifact.name);
      if (!m || m.groups!.run !== runId || Number(m.groups!.attempt) > run.run_attempt) continue;
      const prior = shards.get(m.groups!.shard);
      if (
        !prior ||
        Number(m.groups!.attempt) > prior.attempt ||
        (Number(m.groups!.attempt) === prior.attempt && artifact.id > prior.artifact.id)
      )
        shards.set(m.groups!.shard, { artifact, attempt: Number(m.groups!.attempt) });
    }
    const budget = { remaining: MAX_RUN_BYTES };
    const bundle: OperatorXRawBundle = { run: GithubActionsSource.meta(run), manifest, shards: [] };
    for (const [id, { artifact, attempt }] of shards) {
      const docs = await this.artifactDocs(artifact, keepResult, budget);
      bundle.shards.push({ id, attempt, docs: [...docs.values()] });
    }
    return bundle;
  }
}
