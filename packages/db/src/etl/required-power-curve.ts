import fs from 'node:fs';
import path from 'node:path';
import {
  benchmarkCurveScope,
  type BenchmarkCurveInput,
} from '@semianalysisai/inferencex-constants';
import type { DbClient } from '../connection';
import type { Sql } from './db-utils';
import { REQUIRED_POWER_MANIFEST } from '../lib/ci-artifact-preparation';
import { mapBenchmarkRow, type BenchmarkParams } from './benchmark-mapper';
import { configCacheKey, type ConfigParams } from './config-cache';
import { benchmarkPublicationIdentity, stablePowerPointIdentity } from './power-publication';
import {
  assertRequiredPowerPointsRetained,
  verifyRequiredPowerArtifacts,
  type RequiredPowerSource,
} from './required-power-publication';
import {
  applyBenchmarkPointBackfill,
  isBenchmarkPointPurged,
  recordBackfilledPointIdentity,
} from './run-overrides';
import { createSkipTracker } from './skip-tracker';

export interface CurvePoint {
  identity: Record<string, unknown>;
  image: string | null;
  workflowRunId: number;
  githubRunId: number;
  runAttempt: number;
  date: string;
  runStartedAt: string | null;
  appendOnly: boolean;
}
export interface CurveReplacement {
  curve_scope: string;
  previous_snapshot_workflow_run_id: number;
  removed_point_identities: string[];
}
export interface CurvePublication {
  mode: 'incremental' | 'replacement';
  replacement_scope: CurveReplacement[];
}

function scope(point: CurvePoint): string {
  return benchmarkCurveScope(point.identity as unknown as BenchmarkCurveInput);
}

/** Mirrors migration 014: latest attempt, scope-level snapshots and same-image append chains. */
export function publishedCurve(points: readonly CurvePoint[]): Map<string, CurvePoint[]> {
  const latestAttempts = new Map<number, number>();
  for (const point of points)
    latestAttempts.set(
      point.githubRunId,
      Math.max(latestAttempts.get(point.githubRunId) ?? 0, point.runAttempt),
    );
  const scopes = new Map<string, Map<string, CurvePoint[]>>();
  for (const point of points) {
    if (point.runAttempt !== latestAttempts.get(point.githubRunId)) continue;
    const key = scope(point);
    const runs = scopes.get(key) ?? new Map<string, CurvePoint[]>();
    const runDate = JSON.stringify([point.workflowRunId, point.date]);
    runs.set(runDate, [...(runs.get(runDate) ?? []), point]);
    scopes.set(key, runs);
  }
  const result = new Map<string, CurvePoint[]>();
  for (const [key, runs] of scopes) {
    const ranked = [...runs.values()].sort(
      (a, b) =>
        b[0].date.localeCompare(a[0].date) ||
        (b[0].runStartedAt ? Date.parse(b[0].runStartedAt) : -Infinity) -
          (a[0].runStartedAt ? Date.parse(a[0].runStartedAt) : -Infinity) ||
        b[0].workflowRunId - a[0].workflowRunId,
    );
    const rootImage = ranked[0][0].image;
    const uniformImage = (rows: CurvePoint[]) =>
      rootImage !== null && rows.every((row) => row.image === rootImage);
    const selected = new Map<string, CurvePoint>();
    for (let index = 0; index < ranked.length; index++) {
      const current = ranked[index];
      // SQL groups run/date for ranking, then joins every point in that run/scope.
      for (const point of [...runs.values()]
        .flat()
        .filter((candidate) => candidate.workflowRunId === current[0].workflowRunId)) {
        const id = stablePowerPointIdentity(point.identity);
        if (!selected.has(id)) selected.set(id, point);
      }
      if (
        !current[0].appendOnly ||
        !uniformImage(current) ||
        !ranked[index + 1] ||
        !uniformImage(ranked[index + 1])
      )
        break;
    }
    result.set(key, [...selected.values()]);
  }
  return result;
}

function canonical(entries: CurveReplacement[]): string {
  return JSON.stringify(
    entries
      .map((entry) => {
        if (
          typeof entry.curve_scope !== 'string' ||
          !Number.isSafeInteger(entry.previous_snapshot_workflow_run_id) ||
          !Array.isArray(entry.removed_point_identities) ||
          entry.removed_point_identities.some((id) => typeof id !== 'string')
        )
          throw new Error('Required power: invalid exact replacement scope');
        return { ...entry, removed_point_identities: [...entry.removed_point_identities].sort() };
      })
      .sort((a, b) => a.curve_scope.localeCompare(b.curve_scope)),
  );
}

/** Exact lost identities bind any destructive authorization to one observed snapshot. */
export function assertCurvePreserved(
  existing: readonly CurvePoint[],
  proposed: readonly CurvePoint[],
  publication: CurvePublication,
): void {
  if (
    !publication ||
    !['incremental', 'replacement'].includes(publication.mode) ||
    !Array.isArray(publication.replacement_scope)
  )
    throw new Error('Required power: invalid curve publication policy');
  const before = publishedCurve(existing);
  const after = publishedCurve(proposed);
  const losses: CurveReplacement[] = [];
  for (const [key, oldPoints] of before) {
    const next = new Set(
      (after.get(key) ?? []).map((point) => stablePowerPointIdentity(point.identity)),
    );
    const removed = oldPoints
      .map((point) => stablePowerPointIdentity(point.identity))
      .filter((identity) => !next.has(identity))
      .sort();
    if (removed.length > 0)
      losses.push({
        curve_scope: key,
        previous_snapshot_workflow_run_id: oldPoints[0].workflowRunId,
        removed_point_identities: removed,
      });
  }
  if (publication.mode === 'incremental' && publication.replacement_scope.length > 0)
    throw new Error('Required power: incremental publication cannot authorize replacement');
  if (
    (losses.length > 0 && publication.mode !== 'replacement') ||
    canonical(losses) !== canonical(publication.replacement_scope)
  )
    throw new Error(
      `Required power: publication would shrink the existing curve; exact replacement_scope required: ${JSON.stringify(losses)}`,
    );
}

/** Read-only preflight; no config/workflow upsert, migration, or materialized-view refresh. */
export async function preflightRequiredPowerCurves(
  sql: DbClient | Sql,
  root: string,
  source: RequiredPowerSource,
  options: { date: string; runStartedAt: string | null; appendOnly: boolean },
): Promise<void> {
  const required = verifyRequiredPowerArtifacts(root, source);
  if (required.length === 0) return;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, REQUIRED_POWER_MANIFEST, 'sweep_manifest.json'), 'utf8'),
  );
  const configs = await sql`SELECT * FROM configs`;
  const configIds = new Map(
    configs.map((row) => [
      configCacheKey({
        hardware: row.hardware,
        framework: row.framework,
        model: row.model,
        precision: row.precision,
        specMethod: row.spec_method,
        disagg: row.disagg,
        isMultinode: row.is_multinode,
        prefillTp: row.prefill_tp,
        prefillEp: row.prefill_ep,
        prefillDpAttn: row.prefill_dp_attention,
        prefillNumWorkers: row.prefill_num_workers,
        decodeTp: row.decode_tp,
        decodeEp: row.decode_ep,
        decodeDpAttn: row.decode_dp_attention,
        decodeNumWorkers: row.decode_num_workers,
        numPrefillGpu: row.num_prefill_gpu,
        numDecodeGpu: row.num_decode_gpu,
      } as ConfigParams),
      Number(row.id),
    ]),
  );
  const incoming = new Map<string, BenchmarkParams>();
  const backfilled = new Map<string, string>();
  for (const name of fs.readdirSync(root)) {
    if (
      (!name.startsWith('bmk_') && !name.startsWith('results_')) ||
      !fs.statSync(path.join(root, name)).isDirectory()
    )
      continue;
    for (const file of fs
      .readdirSync(path.join(root, name))
      .filter((candidateName) => candidateName.endsWith('.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(root, name, file), 'utf8'));
      for (const raw of Array.isArray(data) ? data : [data]) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const mapped = mapBenchmarkRow(raw, createSkipTracker(), undefined, source.runId);
        if (!mapped) continue;
        // A config not present yet cannot match a config-id-scoped purge/backfill.
        const point = { ...mapped, configId: configIds.get(configCacheKey(mapped.config)) ?? -1 };
        if (isBenchmarkPointPurged(source.runId, source.runAttempt, point)) continue;
        const applied = applyBenchmarkPointBackfill(source.runId, source.runAttempt, point);
        recordBackfilledPointIdentity(backfilled, applied.sourceIdentity, applied.desiredIdentity);
        incoming.set(
          stablePowerPointIdentity(benchmarkPublicationIdentity(applied.point)),
          applied.point,
        );
      }
    }
  }
  assertRequiredPowerPointsRetained(required, [...incoming.values()]);
  const models = [...new Set([...incoming.values()].map((point) => point.config.model))];
  const rows = await sql`
    SELECT c.*, br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode,
      br.recipe_fingerprint, br.image, br.date::text AS point_date,
      wr.id AS workflow_run_id, wr.github_run_id, wr.run_attempt,
      wr.run_started_at::text, wr.append_only
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE br.error IS NULL AND (c.model = ANY(${models}) OR wr.github_run_id = ${source.runId})`;
  const stored = rows.map((row): CurvePoint => ({
    identity: row,
    image: row.image as string | null,
    workflowRunId: Number(row.workflow_run_id),
    githubRunId: Number(row.github_run_id),
    runAttempt: Number(row.run_attempt),
    date: String(row.point_date),
    runStartedAt: row.run_started_at as string | null,
    appendOnly: Boolean(row.append_only),
  }));
  const attempts =
    await sql`SELECT id, run_attempt FROM workflow_runs WHERE github_run_id = ${source.runId}`;
  const sameAttempt = attempts.find((row) => Number(row.run_attempt) === source.runAttempt);
  // New serial IDs sort after stored IDs. A concurrent ingest is outside this pure preflight boundary.
  const workflowRunId = sameAttempt ? Number(sameAttempt.id) : Number.MAX_SAFE_INTEGER;
  const newPoints = [...incoming.values()].map((point): CurvePoint => ({
    identity: benchmarkPublicationIdentity(point),
    image: point.image,
    workflowRunId,
    githubRunId: source.runId,
    runAttempt: source.runAttempt,
    date:
      stored.find(
        (existing) =>
          existing.workflowRunId === workflowRunId &&
          stablePowerPointIdentity(existing.identity) ===
            stablePowerPointIdentity(benchmarkPublicationIdentity(point)),
      )?.date ?? options.date,
    runStartedAt: options.runStartedAt,
    appendOnly: options.appendOnly,
  }));
  const touched = new Set(
    [...newPoints, ...stored.filter((point) => point.githubRunId === source.runId)].map(scope),
  );
  const existing = stored.filter((point) => touched.has(scope(point)));
  const maxAttempt = Math.max(source.runAttempt, ...attempts.map((row) => Number(row.run_attempt)));
  const changedIds = new Set(newPoints.map((point) => stablePowerPointIdentity(point.identity)));
  const proposed = existing
    .filter(
      (point) =>
        point.githubRunId !== source.runId ||
        (point.runAttempt === maxAttempt &&
          (source.runAttempt !== maxAttempt ||
            !changedIds.has(stablePowerPointIdentity(point.identity)))),
    )
    .map((point) =>
      point.githubRunId === source.runId && point.runAttempt === source.runAttempt
        ? { ...point, runStartedAt: options.runStartedAt, appendOnly: options.appendOnly }
        : point,
    );
  if (source.runAttempt === maxAttempt) proposed.push(...newPoints);
  assertCurvePreserved(existing, proposed, manifest.publication);
}
