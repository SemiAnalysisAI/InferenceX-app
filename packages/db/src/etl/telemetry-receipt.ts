import type { Sql } from './db-utils';
import type { ArtifactMeta, RunMeta } from '../lib/github-artifacts';
import { stablePowerPointIdentity } from './power-publication';
import { gpuMetricsArtifactSuffix } from './gpu-metrics-artifacts';

export interface TelemetryObservation {
  identity: Record<string, unknown>;
  /** Exact selected artifact names, or both allowed sibling names when absent. */
  artifactNames: string[];
  produced: boolean | null;
  error?: string;
}

interface TelemetrySeriesCoverage {
  artifactName: string;
  fileName: string;
  sampleCount: number;
}

export interface TelemetryPointReceipt extends TelemetryObservation {
  key: string;
  benchmarkResultId: number | null;
  series: (TelemetrySeriesCoverage & { id: number })[];
  storage: {
    status: 'complete' | 'incomplete' | 'unknown';
    /** Null means the original artifact inventory was not retained. */
    expectedSeries: TelemetrySeriesCoverage[] | null;
  };
  linkedSeriesIds: number[];
  api: {
    status: 'unknown' | 'readable' | 'failed';
    checkedAt?: string;
    url?: string;
    error?: string;
  };
  reasons: string[];
  recovery: { runId: number; runAttempt: number; artifactNames: string[] };
}

export interface TelemetryReceipt {
  version: 1;
  runId: number;
  runAttempt: number;
  checkedAt: string;
  /** This is attachment coverage for known benchmark points, not a full-sweep verdict. */
  expectedSource: 'benchmark_artifacts' | 'database_benchmarks' | 'unknown';
  /** No complete independent planned matrix is available to this attachment reader. */
  plannedPointCount: null;
  databaseError?: string;
  recoveryError?: string;
  /** Missing on older receipts or when the failed recovery covered the whole run. */
  recoveryArtifactNames?: string[];
  /** The sibling is known, but a download/parse failure prevents identifying its points. */
  expectationErrors?: { benchmarkArtifact: string; artifactNames: string[]; error: string }[];
  points: TelemetryPointReceipt[];
  counts: {
    expectedPoints: number | null;
    producedPoints: number;
    productionUnknownPoints: number;
    storedPoints: number | null;
    linkedPoints: number | null;
    storageUnknownPoints: number;
    /** Actual successful HTTP reads, including readable but incomplete artifacts. */
    apiReadablePoints: number;
    /** Readable, fully stored/linked points with no outstanding corrective-ingest failure. */
    apiCompletePoints: number;
    apiUnknownPoints: number;
    producedArtifacts: number;
    storedSeries: number | null;
    storedSamples: number | null;
  };
}

interface StoredPoint extends Record<string, unknown> {
  id: number;
}

interface StoredSeries {
  id: number;
  artifact_name: string;
  file_name: string;
  sidecars: { seriesInventory?: unknown };
  sample_count: number;
  benchmark_result_ids: number[];
}

function isInventoryEntry(value: unknown): value is { fileName: string; sampleCount: number } {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.fileName === 'string' &&
    typeof entry.sampleCount === 'number' &&
    Number.isSafeInteger(entry.sampleCount) &&
    entry.sampleCount >= 0
  );
}

function seriesCoverageKey(artifact: string, file: string): string {
  return JSON.stringify([artifact, file]);
}

function seriesCoverage(
  series: readonly StoredSeries[],
  reasons: string[],
): TelemetryPointReceipt['storage'] {
  if (series.length === 0) return { status: 'incomplete', expectedSeries: null };
  const expected = new Map<string, TelemetrySeriesCoverage>();
  const inventories = new Map<string, string>();
  let unknown = false;
  for (const entry of series) {
    const inventory = entry.sidecars?.seriesInventory;
    if (!Array.isArray(inventory) || inventory.length === 0 || !inventory.every(isInventoryEntry)) {
      unknown = true;
      continue;
    }
    const signature = JSON.stringify(
      inventory.toSorted((a, b) => a.fileName.localeCompare(b.fileName)),
    );
    const previous = inventories.get(entry.artifact_name);
    if (previous && previous !== signature) unknown = true;
    inventories.set(entry.artifact_name, signature);
    if (!inventory.some((item) => item.fileName === entry.file_name)) unknown = true;
    for (const item of inventory) {
      expected.set(seriesCoverageKey(entry.artifact_name, item.fileName), {
        artifactName: entry.artifact_name,
        ...item,
      });
    }
  }
  const actual = new Map(
    series.map((entry) => [seriesCoverageKey(entry.artifact_name, entry.file_name), entry]),
  );
  const missing = [...expected].some(([name]) => !actual.has(name));
  const wrongSamples = [...expected].some(([name, entry]) => {
    const stored = actual.get(name);
    return stored !== undefined && Number(stored.sample_count) !== entry.sampleCount;
  });
  if (missing) reasons.push('series_coverage_incomplete');
  if (wrongSamples) reasons.push('sample_coverage_incomplete');
  if (unknown) reasons.push('series_inventory_unknown');
  return {
    status:
      missing || wrongSamples || series.some((entry) => Number(entry.sample_count) === 0)
        ? 'incomplete'
        : unknown
          ? 'unknown'
          : 'complete',
    expectedSeries: expected.size > 0 ? [...expected.values()] : null,
  };
}

/** GitHub's run-wide listing also retains artifacts from earlier attempts. */
export function telemetryArtifactsForAttempt(
  artifacts: readonly ArtifactMeta[],
  source: Pick<RunMeta, 'run_attempt' | 'run_started_at'>,
  targetAttempt: number,
): ArtifactMeta[] {
  if (source.run_attempt !== targetAttempt)
    throw new Error(
      `GitHub attempt ${source.run_attempt} differs from target ${targetAttempt}; refusing mixed-attempt telemetry recovery`,
    );
  const start = Date.parse(source.run_started_at ?? '');
  if (!Number.isFinite(start))
    throw new Error('Cannot isolate telemetry artifacts without attempt start time');
  return artifacts.filter((artifact) => Date.parse(artifact.created_at) >= start);
}

/** Count identities, artifacts, series and samples separately; shared series count once. */
export function summarizeTelemetryReceipt(receipt: TelemetryReceipt): TelemetryReceipt {
  const points = receipt.points;
  const series = new Map(points.flatMap((point) => point.series.map((s) => [s.id, s] as const)));
  const complete = points.filter((point) => point.storage?.status === 'complete');
  const linked = complete.filter((point) =>
    point.series.every((s) => point.linkedSeriesIds.includes(s.id)),
  );
  receipt.counts = {
    expectedPoints:
      receipt.expectedSource === 'unknown' || receipt.expectationErrors?.length
        ? null
        : points.length,
    producedPoints: points.filter((p) => p.produced === true).length,
    productionUnknownPoints: points.filter((p) => p.produced === null).length,
    storedPoints: receipt.databaseError ? null : complete.length,
    linkedPoints: receipt.databaseError ? null : linked.length,
    storageUnknownPoints: points.filter(
      (point) => !point.storage || point.storage.status === 'unknown',
    ).length,
    apiReadablePoints: points.filter((p) => p.api.status === 'readable').length,
    apiCompletePoints:
      receipt.databaseError || receipt.recoveryError
        ? 0
        : linked.filter((point) => point.api.status === 'readable' && !point.error).length,
    apiUnknownPoints: points.filter((p) => p.api.status === 'unknown').length,
    producedArtifacts: new Set(
      points.filter((p) => p.produced === true).flatMap((p) => p.artifactNames),
    ).size,
    storedSeries: receipt.databaseError ? null : series.size,
    storedSamples: receipt.databaseError
      ? null
      : [...series.values()].reduce((sum, s) => sum + s.sampleCount, 0),
  };
  return receipt;
}

/** Absent observations name alternative siblings, not two required uploads. */
function coversArtifactScope(
  current: TelemetryObservation,
  previous: TelemetryObservation,
): boolean {
  return (
    previous.artifactNames.length > 0 &&
    previous.artifactNames.every(
      (name) =>
        current.artifactNames.includes(name) ||
        (previous.produced === false &&
          gpuMetricsArtifactSuffix(name) !== null &&
          current.artifactNames.some(
            (candidate) => gpuMetricsArtifactSuffix(candidate) === gpuMetricsArtifactSuffix(name),
          )),
    )
  );
}

/** Read actual persistence/link state, preserving unrelated points on targeted recovery. */
export async function readTelemetryReceipt(
  sql: Sql,
  run: { runId: number; runAttempt: number },
  observations: readonly TelemetryObservation[],
  options: {
    expectedSource?: TelemetryReceipt['expectedSource'];
    previous?: TelemetryReceipt;
    targeted?: boolean;
    /** Mapped identity -> persisted ID, only from the historical resolver's unique fallback. */
    uniqueFallbacks?: ReadonlyMap<string, number>;
  } = {},
): Promise<TelemetryReceipt> {
  const previous = options.previous;
  if (previous && (previous.runId !== run.runId || previous.runAttempt !== run.runAttempt))
    throw new Error('Telemetry receipt run/attempt does not match the recovery target');
  const receipt: TelemetryReceipt = {
    version: 1,
    ...run,
    checkedAt: new Date().toISOString(),
    expectedSource: options.expectedSource ?? previous?.expectedSource ?? 'database_benchmarks',
    plannedPointCount: null,
    points: [],
    counts: {} as TelemetryReceipt['counts'],
  };
  let rows: StoredPoint[] = [];
  let series: StoredSeries[] = [];
  try {
    rows = await sql<StoredPoint[]>`
      select c.*, br.id, br.benchmark_type, br.isl, br.osl, br.conc,
        br.offload_mode, br.recipe_fingerprint
      from benchmark_results br
      join configs c on c.id = br.config_id
      join workflow_runs wr on wr.id = br.workflow_run_id
      where wr.github_run_id = ${run.runId} and wr.run_attempt = ${run.runAttempt}
      order by br.id
    `;
    series = await sql<StoredSeries[]>`
      select s.id, s.artifact_name, s.file_name, s.sidecars,
        (select count(*)::int from gpu_metric_samples x where x.series_id = s.id) as sample_count,
        coalesce((select array_agg(l.benchmark_result_id order by l.benchmark_result_id)
          from benchmark_result_gpu_metrics l
          join benchmark_results br on br.id = l.benchmark_result_id
          where l.series_id = s.id and br.workflow_run_id = s.workflow_run_id), '{}') as benchmark_result_ids
      from gpu_metric_series s join workflow_runs wr on wr.id = s.workflow_run_id
      where wr.github_run_id = ${run.runId} and wr.run_attempt = ${run.runAttempt}
      order by s.id
    `;
  } catch (error) {
    receipt.databaseError = error instanceof Error ? error.message : String(error);
    if (observations.length === 0 && !previous) receipt.expectedSource = 'unknown';
  }
  const stored = new Map(rows.map((row) => [stablePowerPointIdentity(row), row]));
  const storedById = new Map(rows.map((row) => [Number(row.id), row]));
  const prior = new Map(previous?.points.map((point) => [point.key, point]));
  const observed = new Map(
    observations.map((point) => [stablePowerPointIdentity(point.identity), point]),
  );
  for (const [key, id] of options.uniqueFallbacks ?? []) {
    const observation = observed.get(key);
    const row = storedById.get(id);
    if (receipt.databaseError || !observation || !row || stored.has(key)) continue;
    // The resolver allows historical offload drift only; keep every other dimension exact.
    const identity = { ...observation.identity, offload_mode: row.offload_mode };
    const canonicalKey = stablePowerPointIdentity(identity);
    if (canonicalKey !== stablePowerPointIdentity(row)) continue;
    const collision = observed.get(canonicalKey);
    const priorCanonical = prior.get(canonicalKey);
    if (
      (priorCanonical &&
        (priorCanonical.artifactNames.length > 0 || priorCanonical.error) &&
        !coversArtifactScope(observation, priorCanonical)) ||
      (collision &&
        (collision.produced !== observation.produced ||
          collision.error !== observation.error ||
          collision.artifactNames.length !== observation.artifactNames.length ||
          collision.artifactNames.some((name) => !observation.artifactNames.includes(name))))
    ) {
      receipt.expectedSource = 'unknown';
      continue;
    }
    observed.delete(key);
    observed.set(canonicalKey, { ...observation, identity });
    const old = prior.get(key);
    if (old?.benchmarkResultId === null && coversArtifactScope(observation, old)) prior.delete(key);
  }
  const resolvedObservations = [...observed.values()];
  const pendingRecoveryArtifacts = previous?.recoveryArtifactNames?.filter(
    (name) =>
      !resolvedObservations.some(
        (point) => point.produced === true && !point.error && point.artifactNames.includes(name),
      ),
  );
  const successfulKeys = new Set(
    resolvedObservations
      .filter((point) => point.produced === true && !point.error)
      .map((point) => stablePowerPointIdentity(point.identity)),
  );
  const recoveryUnresolved = previous?.recoveryArtifactNames?.length
    ? pendingRecoveryArtifacts?.length
    : options.targeted ||
      resolvedObservations.length === 0 ||
      successfulKeys.size !== resolvedObservations.length ||
      [...prior.values()].some((point) => !successfulKeys.has(point.key));
  Object.assign(receipt, {
    ...(previous?.recoveryError && recoveryUnresolved
      ? {
          recoveryError: previous.recoveryError,
          ...(pendingRecoveryArtifacts ? { recoveryArtifactNames: pendingRecoveryArtifacts } : {}),
        }
      : {}),
    ...(previous?.expectationErrors
      ? {
          expectationErrors: previous.expectationErrors.filter(
            (error) =>
              !resolvedObservations.some((point) =>
                point.artifactNames.some((name) => error.artifactNames.includes(name)),
              ),
          ),
        }
      : {}),
  });
  const keys = new Set([...prior.keys(), ...stored.keys(), ...observed.keys()]);
  for (const key of keys) {
    const old = prior.get(key);
    if (options.targeted && old && !observed.has(key)) {
      receipt.points.push(old);
      continue;
    }
    const row = stored.get(key);
    const benchmarkResultId = row ? Number(row.id) : null;
    const linked = series.filter((s) =>
      s.benchmark_result_ids.map(Number).includes(benchmarkResultId!),
    );
    const observation = observed.get(key) ??
      old ?? {
        identity: row!,
        artifactNames: [...new Set(linked.map((s) => s.artifact_name))],
        produced: linked.length > 0 ? true : null,
      };
    const matching = series.filter((s) => observation.artifactNames.includes(s.artifact_name));
    const reasons: string[] = [];
    if (observation.produced === false) reasons.push('artifact_missing');
    if (observation.produced === null) reasons.push('artifact_pair_unknown');
    if (observation.error) reasons.push('ingest_failed');
    if (receipt.databaseError) reasons.push('database_check_failed');
    else {
      if (benchmarkResultId === null) reasons.push('benchmark_not_stored');
      if (matching.length === 0) reasons.push('series_not_stored');
      else if (matching.some((s) => Number(s.sample_count) === 0)) reasons.push('samples_missing');
      if (matching.some((s) => !linked.includes(s))) reasons.push('point_link_missing');
    }
    const storage: TelemetryPointReceipt['storage'] = receipt.databaseError
      ? { status: 'unknown', expectedSeries: null }
      : seriesCoverage(matching, reasons);
    receipt.points.push({
      identity: observation.identity,
      artifactNames: observation.artifactNames,
      produced: observation.produced,
      ...(observation.error ? { error: observation.error } : {}),
      key,
      benchmarkResultId,
      series: matching.map((s) => ({
        id: Number(s.id),
        artifactName: s.artifact_name,
        fileName: s.file_name,
        sampleCount: Number(s.sample_count),
      })),
      storage,
      linkedSeriesIds: linked.filter((s) => matching.includes(s)).map((s) => Number(s.id)),
      api: { status: 'unknown' },
      reasons,
      recovery: { ...run, artifactNames: observation.artifactNames },
    });
  }
  receipt.points.sort((a, b) => a.key.localeCompare(b.key));
  return summarizeTelemetryReceipt(receipt);
}

/** Only an actual HTTP read advances API status; DB-queryable is not API-readable. */
export async function verifyTelemetryApi(
  receipt: TelemetryReceipt,
  origin: string,
  options: { fetch?: typeof fetch; headers?: HeadersInit } = {},
): Promise<TelemetryReceipt> {
  for (const point of receipt.points) {
    if (point.benchmarkResultId === null) continue;
    const url = new URL('/api/v1/gpu-metrics-point', origin);
    url.searchParams.set('id', String(point.benchmarkResultId));
    const checkedAt = new Date().toISOString();
    try {
      const response = await (options.fetch ?? fetch)(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload?.benchmarkResultId !== point.benchmarkResultId || !Array.isArray(payload.series))
        throw new Error('Point API returned a different identity or invalid series');
      if (point.series.length === 0 || payload.series.length !== point.series.length)
        throw new Error('Point API series set differs from stored telemetry');
      for (const stored of point.series) {
        const actual = payload.series.find((s: { id: number }) => s.id === stored.id);
        if (
          !actual ||
          stored.sampleCount === 0 ||
          actual.sampleCount !== stored.sampleCount ||
          !Array.isArray(actual.data) ||
          actual.data.length !== stored.sampleCount
        )
          throw new Error(`Point API series ${stored.id} sample count differs from storage`);
      }
      point.api = { status: 'readable', checkedAt, url: url.toString() };
    } catch (error) {
      point.api = {
        status: 'failed',
        checkedAt,
        url: url.toString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return summarizeTelemetryReceipt(receipt);
}
