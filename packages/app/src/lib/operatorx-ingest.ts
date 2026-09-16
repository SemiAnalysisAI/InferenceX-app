import AdmZip from 'adm-zip';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import { getOperatorXWriteDb } from '@semianalysisai/inferencex-db/connection';
import {
  object,
  readOperatorXBundle,
  type OperatorXBundle,
  type OperatorXRunSummary,
} from '@semianalysisai/inferencex-db/operatorx/reader';
import {
  getOperatorXBundle,
  listOperatorXRuns,
  saveOperatorXBundle,
} from '@semianalysisai/inferencex-db/queries/operatorx';

const BASE = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_RUN_BYTES = 256 * 1024 * 1024;
interface GithubRun {
  id: number;
  name: string;
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
export class OperatorXError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'OperatorXError';
    this.status = status;
  }
}
function validateRun(run: GithubRun): void {
  if (
    run.name !== 'OperatorX Sweep' ||
    run.path !== '.github/workflows/operatorx-sweep.yml' ||
    run.event !== 'workflow_dispatch'
  ) {
    throw new OperatorXError('Not an OperatorX sweep', 404);
  }
  if (run.status !== 'completed') throw new OperatorXError('Run is still in progress', 409);
}
async function githubFetch(suffix: string): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new OperatorXError('GitHub access is not configured', 503);
  const response = await fetch(`${BASE}${suffix}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok)
    throw new OperatorXError(
      'GitHub artifact source unavailable',
      response.status === 404 ? 404 : 502,
    );
  return response;
}
async function githubJson<T>(suffix: string): Promise<T> {
  const response = await githubFetch(suffix);
  return response.json();
}

/** Newest artifact per shard, retaining earlier successful shards in a partial rerun. */
export function selectOperatorXArtifacts(artifacts: Artifact[], runId: string, attempt: number) {
  const selected = new Map<string, { artifact: Artifact; attempt: number }>();
  for (const artifact of artifacts) {
    const match = /^operatorx-shard-(?<run>[0-9]+)-(?<attempt>[0-9]+)-(?<shard>.+)$/u.exec(
      artifact.name,
    )?.groups;
    if (
      !match ||
      match.run !== runId ||
      Number(match.attempt) > attempt ||
      Number(match.attempt) < 1
    )
      continue;
    const prior = selected.get(match.shard);
    if (
      !prior ||
      Number(match.attempt) > prior.attempt ||
      (Number(match.attempt) === prior.attempt && artifact.id > prior.artifact.id)
    ) {
      selected.set(match.shard, { artifact, attempt: Number(match.attempt) });
    }
  }
  return selected;
}
async function artifactDocs(
  artifact: Artifact,
  budget: { remaining: number },
): Promise<Record<string, unknown>> {
  if (artifact.expired) throw new OperatorXError('Artifacts have expired', 404);
  if (artifact.size_in_bytes > MAX_BYTES) throw new OperatorXError('Artifact too large', 502);
  const response = await githubFetch(`/actions/artifacts/${artifact.id}/zip`);
  const reader = response.body?.getReader();
  if (!reader) throw new OperatorXError('Empty artifact response', 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new OperatorXError('Artifact too large', 502);
    }
    chunks.push(part.value);
  }
  const zip = new AdmZip(Buffer.concat(chunks));
  const entries = zip.getEntries();
  const expanded = entries.reduce((sum, entry) => sum + entry.header.size, 0);
  budget.remaining -= expanded;
  if (expanded > MAX_BYTES || budget.remaining < 0)
    throw new OperatorXError('Expanded artifacts too large', 502);
  const docs: Record<string, unknown> = {};
  for (const entry of entries) {
    if (
      !entry.isDirectory &&
      (entry.entryName === 'operatorx-manifest.json' ||
        (entry.entryName.startsWith('results/') && entry.entryName.endsWith('.json')))
    ) {
      docs[entry.entryName] = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(entry.getData()),
      );
    }
  }
  return docs;
}
export async function downloadOperatorXBundle(run: GithubRun): Promise<OperatorXBundle> {
  validateRun(run);
  const artifacts: Artifact[] = [];
  for (let page = 1; ; page++) {
    const payload = await githubJson<{ artifacts: Artifact[]; total_count: number }>(
      `/actions/runs/${run.id}/artifacts?per_page=100&page=${page}`,
    );
    artifacts.push(...payload.artifacts);
    if (payload.artifacts.length === 0 || artifacts.length >= payload.total_count) break;
  }
  const manifest = artifacts
    .filter((a) => a.name === `operatorx-manifest-${run.id}`)
    .sort((a, b) => b.id - a.id)[0];
  if (!manifest) throw new OperatorXError('No OperatorX manifest', 404);
  const budget = { remaining: MAX_RUN_BYTES };
  const manifestDocs = await artifactDocs(manifest, budget);
  const manifestDoc = manifestDocs['operatorx-manifest.json'];
  const selected = selectOperatorXArtifacts(artifacts, String(run.id), run.run_attempt);
  const cells = object(manifestDoc).include;
  if (!Array.isArray(cells)) throw new OperatorXError('Invalid manifest', 502);
  const bundle: OperatorXBundle = {
    run: {
      run_id: String(run.id),
      run_attempt: run.run_attempt,
      source_sha: run.head_sha,
      source_branch: run.head_branch,
      generated_at: run.created_at,
      conclusion: run.conclusion,
    },
    manifest: manifestDoc,
    shards: [],
  };
  for (const cell of cells) {
    const id = String(object(cell).id);
    const shard = selected.get(id);
    if (shard)
      bundle.shards.push({
        id,
        attempt: shard.attempt,
        docs: Object.values(await artifactDocs(shard.artifact, budget)),
      });
  }
  readOperatorXBundle(bundle); // Validate before any persistence.
  return bundle;
}

// Explicit, development-only preview of real downloaded bundles, following the
// existing unofficial-run local artifact preview. Never consulted in production.
function localDirectory(hostname: string): string | null {
  if (
    process.env.NODE_ENV !== 'development' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  )
    return null;
  return process.env.OPERATORX_LOCAL_ARTIFACT_DIR ?? null;
}
const inFlight = new Map<string, Promise<OperatorXBundle>>();
function ensureRun(runId: string): Promise<OperatorXBundle> {
  const existing = inFlight.get(runId);
  if (existing) return existing;
  const work = (async () => {
    const sql = getOperatorXWriteDb();
    const stored = await getOperatorXBundle(sql, runId);
    try {
      const run = await githubJson<GithubRun>(`/actions/runs/${runId}`);
      validateRun(run);
      if (stored && stored.run.run_attempt >= run.run_attempt) return stored;
      const bundle = await downloadOperatorXBundle(run);
      await saveOperatorXBundle(sql, bundle);
      return (await getOperatorXBundle(sql, runId))!;
    } catch (error) {
      if (stored) return stored;
      throw error;
    }
  })().finally(() => inFlight.delete(runId));
  inFlight.set(runId, work);
  return work;
}
export async function readOperatorXRun(runId: string, hostname: string) {
  if (!/^[1-9][0-9]*$/u.test(runId) || !Number.isSafeInteger(Number(runId)))
    throw new OperatorXError('Invalid run ID', 400);
  const directory = localDirectory(hostname);
  if (directory) {
    try {
      const bundle = JSON.parse(
        await readFile(path.join(directory, `${runId}.json`), 'utf8'),
      ) as OperatorXBundle;
      if (bundle.run.run_id !== runId) throw new Error('Local run identity mismatch');
      return readOperatorXBundle(bundle);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new OperatorXError('Not found', 404);
      throw error;
    }
  }
  return readOperatorXBundle(await ensureRun(runId));
}
export async function discoverOperatorXRuns(
  hostname: string,
): Promise<{ runs: OperatorXRunSummary[]; discovery_complete: boolean }> {
  const directory = localDirectory(hostname);
  if (directory) {
    const runs: OperatorXRunSummary[] = [];
    for (const file of await readdir(directory)) {
      if (/^[1-9][0-9]*\.json$/u.test(file)) {
        const dataset = await readOperatorXRun(file.slice(0, -5), hostname);
        runs.push(dataset.run);
      }
    }
    return {
      runs: runs.sort((a, b) => Number(b.run_id) - Number(a.run_id)),
      discovery_complete: true,
    };
  }
  const sql = getOperatorXWriteDb();
  const stored = await listOperatorXRuns(sql);
  const known = new Map(stored.map((run) => [run.run_id, run.run_attempt]));
  let changed = 0;
  let complete = true;
  const since = new Date(Date.now() - 44 * 86400_000).toISOString();
  try {
    for (let page = 1; complete; page++) {
      const payload = await githubJson<{ workflow_runs: GithubRun[] }>(
        `/actions/workflows/operatorx-sweep.yml/runs?status=completed&event=workflow_dispatch&created=${encodeURIComponent(`>=${since}`)}&per_page=100&page=${page}`,
      );
      for (const run of payload.workflow_runs) {
        if ((known.get(String(run.id)) ?? 0) >= run.run_attempt) continue;
        if (changed === 4) {
          complete = false;
          break;
        }
        try {
          await ensureRun(String(run.id));
          changed++;
        } catch (error) {
          if (!(error instanceof OperatorXError && error.status === 404)) throw error;
        }
      }
      if (payload.workflow_runs.length < 100) break;
    }
  } catch (error) {
    if (stored.length === 0 && !changed) throw error;
    // Keep durable data visible during a GitHub outage; avoid a client retry loop.
    console.error('OperatorX discovery failed; serving stored runs', error);
    return { runs: await listOperatorXRuns(sql), discovery_complete: true };
  }
  return { runs: await listOperatorXRuns(sql), discovery_complete: complete };
}
