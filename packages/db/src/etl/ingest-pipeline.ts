/**
 * Shared ETL orchestration for the two ingest entry points
 * (`ingest-ci-run.ts` and `ingest-gcs-backup.ts`).
 *
 * Both scripts perform the same three logical stages around the same set of
 * lower-level ETL primitives (mappers, config cache, bulk inserts, skip
 * tracker); they differ only in *where* the artifacts come from and, for the
 * GCS backup, in how the work is scheduled (a two-phase concurrent walk).
 *
 * This module owns the parts that are identical between them:
 *
 *   1. `categorizeArtifacts` — classify a flat list of artifact names
 *      (directory names for the CI run, ZIP filenames for the GCS backup) into
 *      the benchmark / results / stats / eval-agg / eval / changelog / server-log
 *      buckets, using one canonical set of prefix rules.
 *   2. `WorkflowMappedResult` — the canonical intermediate shape both scripts
 *      converge on after mapping one workflow's artifacts to typed rows.
 *   3. `writeMappedWorkflow` — write one mapped workflow result to the DB with
 *      the exact same upserts, ON CONFLICT behaviour, and ordering both scripts
 *      already use (benchmarks + server logs → availability → run stats →
 *      eval rows + samples → changelog). No materialized-view refresh or global
 *      summary lives here; those stay in the entry scripts.
 *
 * The mapping stage itself stays in each script because the IO differs
 * (`fs.readFileSync` + `findJsonFiles` vs. `readZipJson` / `readZipJsonMap`),
 * but the small pure helpers it needs — extracting run-stats rows from a parsed
 * stats dict, deriving availability rows from mapped benchmark rows — live here
 * so both callers share one implementation.
 */

import type postgres from 'postgres';

import type { SkipTracker } from './skip-tracker';
import type { ConfigParams } from './config-cache';
import type { BenchmarkParams } from './benchmark-mapper';
import type { EvalParams } from './eval-mapper';
import { GPU_KEYS } from './normalizers';
import {
  bulkIngestBenchmarkRows,
  bulkIngestRunStats,
  bulkUpsertAvailability,
  insertServerLog,
} from './benchmark-ingest';
import { ingestEvalRow } from './eval-ingest';
import { mapEvalSamples } from './eval-samples-mapper';
import { bulkIngestEvalSamples } from './eval-samples-ingest';
import { ingestChangelogEntries, type ChangelogEntry } from './changelog-ingest';

type Sql = ReturnType<typeof postgres>;

// ── Artifact categorization ─────────────────────────────────────────────────

/**
 * Canonical artifact categories shared by both ingest paths.
 *
 * - `benchmark`   — per-config benchmark result dict(s) (`bmk_*`).
 * - `results`     — compiled benchmark result array(s) (`results_*`), used as a
 *   fallback source when no per-config `bmk_*` artifacts are present.
 * - `stats`       — reliability stats dict (`run-stats_*` / `run_stats_*`).
 * - `evalAgg`     — compiled eval aggregate (`eval_results_all_*`).
 * - `eval`        — per-config eval result (`eval_*`, excluding `eval_results_all_*`).
 * - `changelog`   — changelog metadata (`changelog-metadata_*`).
 * - `serverLog`   — server log text bundle (`server_logs_*`).
 */
export type ArtifactCategory =
  | 'benchmark'
  | 'results'
  | 'stats'
  | 'evalAgg'
  | 'eval'
  | 'changelog'
  | 'serverLog';

/**
 * Classify a single artifact name into one of the shared categories, or `null`
 * when it belongs to none of them.
 *
 * Both scripts feed this the same underlying benchmark-run artifact names — the
 * CI-run script passes artifact *directory* names (from a pre-downloaded /
 * unzipped artifact dir), and the GCS-backup script passes ZIP *filenames*. The
 * two happen to share the exact same prefix vocabulary, so one classifier keeps
 * the dispatch identical.
 *
 * Order matters: `eval_results_all_*` must be tested before the generic `eval_*`
 * so the aggregate artifact is not mis-bucketed as a per-config eval.
 *
 * @param name - An artifact directory name or ZIP filename.
 * @returns The matching {@link ArtifactCategory}, or `null` if unrecognized.
 */
export function categorizeArtifact(name: string): ArtifactCategory | null {
  // Matches both the CI run's aggregate artifact *directory* names
  // (`eval_results_all`, `changelog-metadata`, `run-stats`, `results_bmk` —
  // bare, no id suffix) and the GCS backup's ZIP *filenames* (the same base
  // plus a `_<id>.zip` suffix). `matches(base)` accepts the bare base or the
  // base followed by `_…`, so a ZIP named `<base>_123.zip` and a dir named
  // `<base>` both classify identically without a stray `<base>x` false match.
  //
  // `eval_results_all` is tested before the generic `eval_` so the aggregate is
  // never mis-bucketed as a per-config eval.
  const matches = (base: string) => name === base || name.startsWith(`${base}_`);
  if (name.startsWith('bmk_')) return 'benchmark';
  if (matches('eval_results_all')) return 'evalAgg';
  if (name.startsWith('eval_')) return 'eval';
  if (matches('run-stats') || matches('run_stats')) return 'stats';
  if (matches('changelog-metadata')) return 'changelog';
  if (name.startsWith('server_logs_')) return 'serverLog';
  if (name.startsWith('results_')) return 'results';
  return null;
}

/** An artifact set split into the shared categories, preserving input order. */
export interface CategorizedArtifacts {
  benchmark: string[];
  results: string[];
  stats: string[];
  evalAgg: string[];
  eval: string[];
  changelog: string[];
  serverLog: string[];
}

/**
 * Split a list of artifact names into the shared categories.
 *
 * Names matching none of the known categories are dropped. Input order is
 * preserved within each bucket so callers that rely on stable ordering (e.g.
 * created-at sorting applied afterwards) keep their guarantees.
 *
 * @param names - Artifact directory names or ZIP filenames.
 * @returns A {@link CategorizedArtifacts} with one array per category.
 */
export function categorizeArtifacts(names: readonly string[]): CategorizedArtifacts {
  const out: CategorizedArtifacts = {
    benchmark: [],
    results: [],
    stats: [],
    evalAgg: [],
    eval: [],
    changelog: [],
    serverLog: [],
  };
  for (const name of names) {
    const category = categorizeArtifact(name);
    if (category) out[category].push(name);
  }
  return out;
}

/**
 * Choose the benchmark source list: prefer per-config `bmk_*` artifacts when any
 * exist, otherwise fall back to the compiled `results_*` artifacts.
 *
 * The compiled `results_*` artifacts aggregate all job artifacts (including
 * carried-over ones from prior attempts) with no per-artifact timestamps, so
 * duplicate rows for the same config can appear in arbitrary order and the wrong
 * one can win the within-batch dedup. Individual `bmk_*` artifacts can be sorted
 * by created-at, guaranteeing the latest attempt's result wins — so they're
 * always preferred when present.
 *
 * @param cats - The categorized artifact set.
 * @returns The `benchmark` list if non-empty, else the `results` list.
 */
export function selectBenchmarkSources(cats: CategorizedArtifacts): string[] {
  return cats.benchmark.length > 0 ? cats.benchmark : cats.results;
}

// ── Pure mapping helpers ────────────────────────────────────────────────────

/** One reliability-stats row: success/total counts for a hardware key. */
export interface StatsRow {
  hardware: string;
  nSuccess: number;
  total: number;
}

/**
 * Extract reliability `run_stats` rows from a parsed stats dict.
 *
 * The dict maps a hardware key to `{ n_success, total }`. Only keys in
 * `GPU_KEYS` with numeric `n_success`/`total` are kept; everything else is
 * ignored. Non-object / array inputs yield an empty array.
 *
 * @param data - The parsed stats JSON (dict of hw → `{ n_success, total }`).
 * @returns The extracted {@link StatsRow}s (possibly empty).
 */
export function extractStatsRows(data: unknown): StatsRow[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const rows: StatsRow[] = [];
  for (const [hwKey, stats] of Object.entries(data as Record<string, any>)) {
    if (!GPU_KEYS.has(hwKey)) continue;
    if (typeof stats?.n_success !== 'number' || typeof stats?.total !== 'number') continue;
    rows.push({ hardware: hwKey, nSuccess: stats.n_success, total: stats.total });
  }
  return rows;
}

/** One availability row derived from a successfully-inserted benchmark row. */
export interface AvailabilityRow {
  model: string;
  isl: number;
  osl: number;
  precision: string;
  hardware: string;
  framework: string;
  specMethod: string;
  disagg: boolean;
}

/**
 * Derive an availability row from a mapped benchmark row.
 * Callers push these only for rows that were successfully inserted so
 * availability never advertises a config that failed to persist.
 *
 * @param row - A mapped benchmark row (with its resolved config).
 * @returns The corresponding {@link AvailabilityRow}.
 */
export function toAvailabilityRow(row: BenchmarkParams): AvailabilityRow {
  return {
    model: row.config.model,
    isl: row.isl,
    osl: row.osl,
    precision: row.config.precision,
    hardware: row.config.hardware,
    framework: row.config.framework,
    specMethod: row.config.specMethod,
    disagg: row.config.disagg,
  };
}

// ── Canonical mapped-workflow intermediate ──────────────────────────────────

/** A parsed changelog artifact: its base/head refs and typed entries. */
export interface ParsedChangelog {
  baseRef: string;
  headRef: string;
  entries: ChangelogEntry[];
}

/**
 * One benchmark artifact's mapped rows, ready for config resolution + bulk
 * insert. `serverLogRef` is an opaque handle the caller resolves to log text at
 * write time (a filesystem path for the CI run, a ZIP path for the GCS backup);
 * `undefined` when the artifact has no associated server log.
 */
export interface MappedBenchmarkArtifact {
  /** Human-readable artifact label used in DB-error context strings. */
  label: string;
  rows: BenchmarkParams[];
  serverLogRef?: string;
}

/**
 * Where a mapped eval row came from. The GCS backup treats both origins
 * uniformly, but the CI run reports aggregate rows and per-config rows on
 * separate console lines, so the writer keeps their new-row counts separate.
 */
export type EvalRowSource = 'agg' | 'perConfig';

/** One eval row plus the matching samples JSONL text (null for agg rows). */
export interface MappedEvalRow {
  params: EvalParams;
  samplesText: string | null;
  /** Origin of the row; defaults to `'agg'` when omitted. */
  source?: EvalRowSource;
}

/**
 * The canonical intermediate both scripts converge on after mapping one
 * workflow's artifacts. `writeMappedWorkflow` consumes exactly this.
 */
export interface WorkflowMappedResult {
  bmkArtifacts: MappedBenchmarkArtifact[];
  statsRows: StatsRow[];
  evalRows: MappedEvalRow[];
  changelogs: ParsedChangelog[];
  /** When true, benchmark + stats rows are dropped (the caller may pre-empty them). */
  evalsOnly: boolean;
}

// ── DB write stage ──────────────────────────────────────────────────────────

/** Per-workflow write counts returned by {@link writeMappedWorkflow}. */
export interface WorkflowWriteCounts {
  newBmk: number;
  dupBmk: number;
  newStats: number;
  dupStats: number;
  /** Total new eval rows (`aggEvals + perConfigEvals`). */
  evals: number;
  /** New eval rows from `source: 'agg'` rows. */
  aggEvals: number;
  /** New eval rows from `source: 'perConfig'` rows. */
  perConfigEvals: number;
  evalSamples: number;
  /** Number of eval rows that had at least one new sample inserted. */
  evalSampleFiles: number;
  changelogs: number;
  /** Availability rows built from successfully-inserted benchmark rows. */
  availUpserted: number;
}

/** Services + IO hooks {@link writeMappedWorkflow} needs to persist a workflow. */
export interface WriteMappedWorkflowDeps {
  sql: Sql;
  getOrCreateConfig: (p: ConfigParams) => Promise<number>;
  tracker: SkipTracker;
  /**
   * Resolve a benchmark artifact's `serverLogRef` to its raw server-log text.
   * The CI run reads `server.log` from a filesystem path; the GCS backup reads
   * it out of a ZIP. Returns `null` when unreadable. NUL-byte stripping happens
   * here so both paths share the exact PG-safe cleanup.
   */
  readServerLog: (ref: string) => string | null;
}

function zeroCounts(): WorkflowWriteCounts {
  return {
    newBmk: 0,
    dupBmk: 0,
    newStats: 0,
    dupStats: 0,
    evals: 0,
    aggEvals: 0,
    perConfigEvals: 0,
    evalSamples: 0,
    evalSampleFiles: 0,
    changelogs: 0,
    availUpserted: 0,
  };
}

/**
 * Write one mapped workflow result to the database.
 *
 * This is the shared body of both scripts' DB-write stage. It performs, in this
 * exact order (matching the pre-refactor behaviour of both scripts):
 *
 *   1. Benchmark rows — per artifact: resolve each row's config id, bulk-insert
 *      via `bulkIngestBenchmarkRows` (ON CONFLICT DO UPDATE), and attach the
 *      artifact's server log (if any) to the freshly inserted ids.
 *   2. Availability — one bulk upsert (ON CONFLICT DO NOTHING) built only from
 *      rows that were successfully inserted above.
 *   3. Run stats — one bulk upsert via `bulkIngestRunStats` (ON CONFLICT DO UPDATE).
 *   4. Eval rows — per row: `ingestEvalRow` (ON CONFLICT DO UPDATE), then attach
 *      any per-sample data via `bulkIngestEvalSamples` (ON CONFLICT DO NOTHING).
 *   5. Changelog — per entry group: `ingestChangelogEntries` (ON CONFLICT DO NOTHING).
 *
 * DB errors are recorded on the shared tracker with the same context labels the
 * scripts used, so one bad artifact never aborts the workflow. The workflow-run
 * row itself is created by the caller (it needs script-specific metadata) and
 * passed in as `workflowRunId`; `date` is the workflow's date string.
 *
 * No materialized-view refresh, vacuum, or global summary happens here — those
 * remain in the entry scripts so their exact console output and lifecycle stay
 * byte-for-byte as-is.
 *
 * @returns Per-workflow {@link WorkflowWriteCounts}.
 */
export async function writeMappedWorkflow(
  deps: WriteMappedWorkflowDeps,
  mapped: WorkflowMappedResult,
  workflowRunId: number,
  date: string,
): Promise<WorkflowWriteCounts> {
  const { sql, getOrCreateConfig, tracker, readServerLog } = deps;
  const counts = zeroCounts();

  // ── Benchmark rows ────────────────────────────────────────────────────────
  const inserted: BenchmarkParams[] = [];
  for (const { label, rows, serverLogRef } of mapped.bmkArtifacts) {
    const toInsert: (BenchmarkParams & { configId: number })[] = [];
    for (const row of rows) {
      try {
        const configId = await getOrCreateConfig(row.config);
        toInsert.push({ ...row, configId });
      } catch (error: any) {
        tracker.recordDbError(`config for ${label}`, error);
      }
    }

    if (toInsert.length === 0) continue;

    try {
      const { newCount, dupCount, insertedIds } = await bulkIngestBenchmarkRows(
        sql,
        toInsert,
        workflowRunId,
        date,
      );
      counts.newBmk += newCount;
      counts.dupBmk += dupCount;

      // Only build availability after a successful insert.
      inserted.push(...toInsert);

      if (serverLogRef && insertedIds.length > 0) {
        const serverLog = readServerLog(serverLogRef);
        if (serverLog) {
          try {
            await insertServerLog(sql, insertedIds, serverLog);
          } catch (error: any) {
            tracker.recordDbError(`server_log for ${label}`, error);
          }
        }
      }
    } catch (error: any) {
      tracker.recordDbError(label, error);
    }
  }

  // ── Availability ──────────────────────────────────────────────────────────
  if (inserted.length > 0) {
    const availRows = inserted.map(toAvailabilityRow);
    counts.availUpserted = availRows.length;
    try {
      await bulkUpsertAvailability(sql, availRows, date);
    } catch (error: any) {
      tracker.recordDbError('availability', error);
    }
  }

  // ── Run stats ─────────────────────────────────────────────────────────────
  if (mapped.statsRows.length > 0) {
    try {
      const { newCount, dupCount } = await bulkIngestRunStats(
        sql,
        mapped.statsRows,
        workflowRunId,
        date,
      );
      counts.newStats += newCount;
      counts.dupStats += dupCount;
    } catch (error: any) {
      tracker.recordDbError('run_stats', error);
    }
  }

  // ── Eval rows + samples ───────────────────────────────────────────────────
  for (const { params, samplesText, source } of mapped.evalRows) {
    try {
      const { outcome, id: evalResultId } = await ingestEvalRow(
        sql,
        getOrCreateConfig,
        params,
        workflowRunId,
        date,
      );
      if (outcome === 'new') {
        counts.evals++;
        if (source === 'perConfig') counts.perConfigEvals++;
        else counts.aggEvals++;
      }

      if (samplesText) {
        const samples = mapEvalSamples(samplesText, tracker);
        if (samples.length > 0) {
          const { newCount } = await bulkIngestEvalSamples(sql, evalResultId, samples);
          counts.evalSamples += newCount;
          counts.evalSampleFiles++;
        }
      }
    } catch (error: any) {
      tracker.recordDbError('eval row', error);
    }
  }

  // ── Changelog ─────────────────────────────────────────────────────────────
  for (const { baseRef, headRef, entries } of mapped.changelogs) {
    try {
      const inserted2 = await ingestChangelogEntries(
        sql,
        workflowRunId,
        date,
        baseRef,
        headRef,
        entries,
      );
      counts.changelogs += inserted2;
    } catch (error: any) {
      tracker.recordDbError('changelog', error);
    }
  }

  return counts;
}
