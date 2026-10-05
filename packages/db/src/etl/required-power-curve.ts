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
import { configCacheKey, loadConfigIds } from './config-cache';
import { benchmarkPublicationIdentity, stablePowerPointIdentity } from './power-publication';
import {
  assertRequiredPowerPointsRetained,
  verifyRequiredPowerArtifacts,
  type RequiredPowerSource,
} from './required-power-publication';
import { planBenchmarkPoint } from './run-overrides';
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
    const byRun = new Map<number, CurvePoint[]>();
    for (const group of runs.values())
      for (const point of group)
        byRun.set(point.workflowRunId, [...(byRun.get(point.workflowRunId) ?? []), point]);
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
      for (const point of byRun.get(current[0].workflowRunId) ?? []) {
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

/**
 * Every error-free point of these models' latest run attempts, plus this run's
 * own points, read from base tables so a stale materialized view cannot hide a
 * loss. These rows are the TypeScript projection's only input.
 */
export async function loadStoredCurvePoints(
  sql: DbClient | Sql,
  models: readonly string[],
  githubRunId: number,
): Promise<CurvePoint[]> {
  const rows = await sql`
    SELECT c.*, br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode,
      br.recipe_fingerprint, br.image, br.date::text AS point_date,
      wr.id AS workflow_run_id, wr.github_run_id, wr.run_attempt,
      wr.run_started_at::text, wr.append_only
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE br.error IS NULL AND (c.model = ANY(${models}) OR wr.github_run_id = ${githubRunId})`;
  return rows.map((row): CurvePoint => ({
    identity: row,
    image: row.image as string | null,
    workflowRunId: Number(row.workflow_run_id),
    githubRunId: Number(row.github_run_id),
    runAttempt: Number(row.run_attempt),
    date: String(row.point_date),
    runStartedAt: row.run_started_at as string | null,
    appendOnly: Boolean(row.append_only),
  }));
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
  const configIds = await loadConfigIds(sql);
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
        // A config not present yet cannot match an id-keyed purge; backfills
        // match by config dimensions and still apply.
        const point = { ...mapped, configId: configIds.get(configCacheKey(mapped.config)) ?? -1 };
        const plan = planBenchmarkPoint(
          { githubRunId: source.runId, runAttempt: source.runAttempt },
          point,
          backfilled,
        );
        if (plan.kind === 'purged') continue;
        incoming.set(
          stablePowerPointIdentity(benchmarkPublicationIdentity(plan.point)),
          plan.point,
        );
      }
    }
  }
  assertRequiredPowerPointsRetained(required, [...incoming.values()], 'before_write');
  const models = [...new Set([...incoming.values()].map((point) => point.config.model))];
  const stored = await loadStoredCurvePoints(sql, models, source.runId);
  const attemptRows =
    await sql`SELECT id, run_attempt FROM workflow_runs WHERE github_run_id = ${source.runId}`;
  const attempts = attemptRows.map((row) => ({
    id: Number(row.id),
    runAttempt: Number(row.run_attempt),
  }));
  const { existing, proposed } = projectProposedCurve({
    stored,
    attempts,
    incoming: [...incoming.values()].map((point) => ({
      identity: benchmarkPublicationIdentity(point),
      image: point.image,
    })),
    source,
    ...options,
  });
  assertCurvePreserved(existing, proposed, manifest.publication);
}

export interface CurveProjectionInput {
  /** Base-table points of the touched models and of this run (`loadStoredCurvePoints`). */
  stored: readonly CurvePoint[];
  /** Every stored workflow row of this GitHub run, any attempt. */
  attempts: readonly { id: number; runAttempt: number }[];
  /** The run's planned points as publication identities. */
  incoming: readonly { identity: Record<string, unknown>; image: string | null }[];
  source: { runId: number; runAttempt: number };
  date: string;
  runStartedAt: string | null;
  appendOnly: boolean;
}

/**
 * The curves this ingest would publish, as the SQL owner would see them after
 * the write: this attempt's points replace its own earlier rows; a newer
 * attempt supersedes every stored point of the run; an attempt older than a
 * stored one publishes nothing. `existing` is the same scopes before the write.
 */
export function projectProposedCurve(input: CurveProjectionInput): {
  existing: CurvePoint[];
  proposed: CurvePoint[];
} {
  const { stored, attempts, source } = input;
  const sameAttempt = attempts.find((row) => row.runAttempt === source.runAttempt);
  // New serial IDs sort after stored IDs. A concurrent ingest is outside this pure preflight boundary.
  const workflowRunId = sameAttempt ? sameAttempt.id : Number.MAX_SAFE_INTEGER;
  // The upsert never changes `date`, so a re-ingested point keeps its stored date.
  const storedDates = new Map(
    stored
      .filter((point) => point.workflowRunId === workflowRunId)
      .map((point) => [stablePowerPointIdentity(point.identity), point.date]),
  );
  const newPoints = input.incoming.map(({ identity, image }): CurvePoint => ({
    identity,
    image,
    workflowRunId,
    githubRunId: source.runId,
    runAttempt: source.runAttempt,
    date: storedDates.get(stablePowerPointIdentity(identity)) ?? input.date,
    runStartedAt: input.runStartedAt,
    appendOnly: input.appendOnly,
  }));
  const touched = new Set(
    [...newPoints, ...stored.filter((point) => point.githubRunId === source.runId)].map(scope),
  );
  const existing = stored.filter((point) => touched.has(scope(point)));
  const maxAttempt = Math.max(source.runAttempt, ...attempts.map((row) => row.runAttempt));
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
        ? { ...point, runStartedAt: input.runStartedAt, appendOnly: input.appendOnly }
        : point,
    );
  if (source.runAttempt === maxAttempt) proposed.push(...newPoints);
  return { existing, proposed };
}
