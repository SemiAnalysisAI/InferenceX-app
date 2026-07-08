import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDatasetFromNeutral,
  buildRunSummary,
  collectiveXAvailabilityReason,
  collectiveXLatestUrl,
  collectiveXRunUrl,
  collectiveXRunsUrl,
  fetchCollectiveXByRunId,
  fetchCollectiveXLatest,
  fetchCollectiveXRuns,
  parseCollectiveXDataset,
  parseCollectiveXDatasetText,
  parseCollectiveXRuns,
} from './reader';
import {
  buildDataset,
  makeCollectiveXDataset,
  makeCollectiveXSeries,
  makeRawMatrix,
  makeRawShard,
  makeRawTerminal,
  makeRunMeta,
} from './test-fixture';

const IMAGE_DIGEST = `sha256:${'a'.repeat(64)}`;
const SQUASH_SHA256 = 'b'.repeat(64);
const SOURCE_SHA = 'c'.repeat(40);

function fakeResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Neutral → view assembly
// ---------------------------------------------------------------------------
describe('CollectiveX neutral → view assembly', () => {
  it('assembles a schema-valid view dataset from matrix + shard docs', () => {
    const dataset = makeCollectiveXDataset();
    expect(dataset.format).toBe('collectivex.view.v1');
    expect(dataset.schema_version).toBe(1);
    // Two measured series (nccl-ep EP8 scale-up + deepep EP16 scale-out).
    expect(dataset.series).toHaveLength(2);
    // Four requested coverage rows: two measured, one unsupported terminal, one pending.
    expect(dataset.coverage).toHaveLength(4);
  });

  it('counts terminal dispositions across the run envelope', () => {
    const { run } = makeCollectiveXDataset();
    expect(run.requested_cases).toBe(4);
    expect(run.measured_cases).toBe(2);
    expect(run.unsupported_cases).toBe(1);
    expect(run.failed_cases).toBe(0);
    // terminal = every non-pending case (2 measured + 1 unsupported).
    expect(run.terminal_cases).toBe(3);
    expect(run.covered_skus).toEqual(['b300-sxm', 'h200-dgxc', 'mi355x-oam']);
  });

  it('counts measured, terminal, and requested points', () => {
    const { run } = makeCollectiveXDataset();
    // Two measured series × two token rows each.
    expect(run.measured_points).toBe(4);
    // measured (4) + unsupported ladder (128, 256).
    expect(run.terminal_points).toBe(6);
    // measured (4) + unsupported (2) + pending (2).
    expect(run.requested_points).toBe(8);
  });

  it('emits one attempt per measured shard and none for an id-less terminal doc', () => {
    const dataset = makeCollectiveXDataset();
    expect(dataset.attempts).toHaveLength(2);
    expect(dataset.attempts.every((attempt) => attempt.outcome === 'success')).toBe(true);
    // Both success shards share one GHA run+attempt, so one allocation.
    expect(dataset.run.allocation_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Neutral field synthesis (series_id, allocation_id, evidence, build, anomalies)
// ---------------------------------------------------------------------------
describe('CollectiveX neutral field synthesis', () => {
  it('derives series id, allocation id, and evidence id when omitted', () => {
    const dataset = buildDataset({ shards: [makeRawShard({ runId: '208', runAttempt: '2' })] });
    const series = dataset.series[0];
    // No series_id emitted → series key falls back to case_id.
    expect(series.series_id).toBe('h200-dgxc-nccl-ep-deepseek-v3-normal-decode-ep8-uniform');
    expect(series.allocation_ids).toEqual(['alloc-208-2']);
    expect(series.points[0].evidence_ids).toEqual([`ev-${series.points[0].point_id}`]);
  });

  it('folds provenance into the build and defaults combine quant mode to none', () => {
    const series = makeCollectiveXSeries();
    expect(series.build.image_digest).toBe(IMAGE_DIGEST);
    expect(series.build.source_sha).toBe(SOURCE_SHA);
    expect(series.build.squash_sha256).toBe(SQUASH_SHA256);
    expect(series.workload.workload_id).toBe('deepseek-v3');
    expect(series.workload.combine_precision.quant_mode).toBe('none');
  });

  it('slugifies string and object anomalies into reason ids', () => {
    const series = makeCollectiveXSeries({
      rows: [{ anomalies: [{ type: 'Correctness_Drift' }, 'kernel-timeout'] }],
    });
    expect(series.points[0].anomalies).toEqual(['correctness-drift', 'kernel-timeout']);
  });

  it('passes legacy promotion-era identity fields through unchanged', () => {
    const series = makeCollectiveXSeries({ legacyIdentity: true });
    expect(series.series_id).toBe(`cxseries-v1-${'d'.repeat(64)}`);
    expect(series.allocation_ids).toEqual([`cxalloc-v1-${'e'.repeat(64)}`]);
  });
});

// ---------------------------------------------------------------------------
// Component mapping (host-staging zero bytes, unavailable components)
// ---------------------------------------------------------------------------
describe('CollectiveX component mapping', () => {
  it('maps a measured host-staging component with zero logical bytes to a zero rate', () => {
    const series = makeCollectiveXSeries({ rows: [{ stageZeroBytes: true }] });
    const stage = series.points[0].components.stage;
    expect(stage).not.toBeNull();
    expect(stage?.byte_provenance?.total_logical_bytes).toBe(0);
    expect(stage?.total_logical_data_rate_gbps_at_latency_percentile?.p50).toBe(0);
    // Latency stays strictly positive even when the rate collapses to zero.
    expect(stage?.latency_us.p50).toBeGreaterThan(0);
  });

  it('drops an unavailable component to null', () => {
    const series = makeCollectiveXSeries({ rows: [{ stageUnavailable: true }] });
    expect(series.points[0].components.stage).toBeNull();
    expect(series.points[0].components.dispatch).not.toBeNull();
  });

  it('derives isolated_sum with no byte accounting', () => {
    const series = makeCollectiveXSeries();
    const isolated = series.points[0].components.isolated_sum;
    expect(isolated?.origin).toBe('derived');
    expect(isolated?.byte_provenance).toBeNull();
    expect(isolated?.activation_data_rate_gbps_at_latency_percentile).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Terminal / pending coverage
// ---------------------------------------------------------------------------
describe('CollectiveX terminal coverage', () => {
  it('records an unsupported terminal outcome with a reason', () => {
    const dataset = makeCollectiveXDataset();
    const unsupported = dataset.coverage.find((row) => row.sku === 'b300-sxm');
    expect(unsupported?.outcome).toBe('unsupported');
    expect(unsupported?.reason).toBe('capability-gate');
    expect(unsupported?.points.every((point) => point.terminal_status === 'unsupported')).toBe(
      true,
    );
  });

  it('records a pending case for a requested case with no shard or terminal doc', () => {
    const dataset = makeCollectiveXDataset();
    const pending = dataset.coverage.find((row) => row.sku === 'mi355x-oam');
    expect(pending?.outcome).toBe('pending');
    expect(pending?.selected_attempt_id).toBeNull();
    expect(pending?.attempt_ids).toEqual([]);
  });

  it('emits a terminal attempt when the doc carries full-format ids', () => {
    const caseId = 'h100-dgxc-nccl-ep-deepseek-v3-normal-decode-ep8-uniform';
    const terminal = makeRawTerminal({
      caseId,
      sku: 'h100-dgxc',
      status: 'failed',
      withAttempt: true,
    });
    const dataset = buildDataset({
      shards: [],
      terminals: [terminal],
      requestedCases: [
        {
          caseId,
          sku: 'h100-dgxc',
          disposition: 'runnable',
          case: (
            makeRawShard({ caseId, sku: 'h100-dgxc' }).identity as {
              case_factors: { case: Record<string, unknown> };
            }
          ).case_factors.case,
        },
      ],
    });
    expect(dataset.attempts).toHaveLength(1);
    expect(dataset.attempts[0].outcome).toBe('failed');
    expect(dataset.coverage[0].outcome).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// Run summary
// ---------------------------------------------------------------------------
describe('CollectiveX run summary', () => {
  it('projects the case-level terminal counts', () => {
    const summary = buildRunSummary(makeCollectiveXDataset());
    expect(summary.run_id).toBe('160');
    expect(summary.terminal_counts).toEqual({ measured: 2, unsupported: 1, failed: 0 });
    expect(summary.covered_skus).toEqual(['b300-sxm', 'h200-dgxc', 'mi355x-oam']);
  });
});

// ---------------------------------------------------------------------------
// Raw ingest rejections
// ---------------------------------------------------------------------------
describe('CollectiveX raw ingest rejections', () => {
  it('rejects a matrix doc with the wrong format', () => {
    expect(() => buildDatasetFromNeutral({ format: 'nope' }, [], makeRunMeta())).toThrow(/matrix/);
  });

  it('rejects a shard doc missing a required section', () => {
    const shard = makeRawShard();
    delete (shard as Record<string, unknown>).topology;
    const matrix = makeRawMatrix([]);
    expect(() => buildDatasetFromNeutral(matrix, [shard], makeRunMeta())).toThrow(/shard/);
  });

  it('ignores raw docs whose format is neither ep nor terminal', () => {
    const dataset = buildDatasetFromNeutral(
      makeRawMatrix([]),
      [{ format: 'collectivex.samples.v1' }],
      makeRunMeta(),
    );
    expect(dataset.series).toHaveLength(0);
    expect(dataset.coverage).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// View dataset parsing
// ---------------------------------------------------------------------------
describe('CollectiveX view dataset parsing', () => {
  it('accepts a well-formed view dataset', () => {
    const dataset = makeCollectiveXDataset();
    expect(parseCollectiveXDataset(dataset).run.run_id).toBe('160');
  });

  it('rejects an unknown top-level field', () => {
    const dataset = { ...makeCollectiveXDataset(), surprise: true };
    expect(() => parseCollectiveXDataset(dataset)).toThrow(/contains unknown field surprise/);
  });

  it('rejects duplicate JSON keys before schema validation', () => {
    expect(() => parseCollectiveXDatasetText('{"format":"a","format":"b"}')).toThrow(
      /contains duplicate key format/,
    );
  });

  it('rejects text that is not valid JSON', () => {
    expect(() => parseCollectiveXDatasetText('{ not json')).toThrow(/not valid JSON/);
  });
});

// ---------------------------------------------------------------------------
// Runs listing parsing
// ---------------------------------------------------------------------------
function runsListing(version = 1) {
  return {
    format: 'collectivex.runs.v1' as const,
    version,
    runs: [buildRunSummary(makeCollectiveXDataset())],
  };
}

describe('CollectiveX runs listing parsing', () => {
  it('accepts a well-formed runs listing for the requested version', () => {
    const runs = parseCollectiveXRuns(runsListing(1), 1);
    expect(runs.runs).toHaveLength(1);
    expect(runs.runs[0].run_id).toBe('160');
  });

  it('rejects a version mismatch', () => {
    expect(() => parseCollectiveXRuns(runsListing(2), 1)).toThrow(
      /does not match the requested version/,
    );
  });

  it('rejects a duplicate run id', () => {
    const listing = runsListing(1);
    listing.runs = [listing.runs[0], listing.runs[0]];
    expect(() => parseCollectiveXRuns(listing, 1)).toThrow(/contains duplicate run 160/);
  });
});

// ---------------------------------------------------------------------------
// Client fetch helpers
// ---------------------------------------------------------------------------
describe('CollectiveX fetch helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the latest view dataset with no-store caching', async () => {
    fetchMock.mockResolvedValue(fakeResponse(JSON.stringify(makeCollectiveXDataset())));
    const resolved = await fetchCollectiveXLatest();
    expect(resolved.run_id).toBe('160');
    expect(fetchMock).toHaveBeenCalledWith(
      collectiveXLatestUrl(1),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('fetches a run-scoped dataset with force-cache caching', async () => {
    fetchMock.mockResolvedValue(fakeResponse(JSON.stringify(makeCollectiveXDataset())));
    await fetchCollectiveXByRunId(1, '160');
    expect(fetchMock).toHaveBeenCalledWith(
      collectiveXRunUrl(1, '160'),
      expect.objectContaining({ cache: 'force-cache' }),
    );
  });

  it('rejects a non-integer run id before fetching', async () => {
    await expect(fetchCollectiveXByRunId(1, 'latest')).rejects.toThrow(/positive integer/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 503 to a source-unavailable reason', async () => {
    fetchMock.mockResolvedValue(fakeResponse('', 503));
    const captured = await fetchCollectiveXLatest().catch((error: unknown) => error);
    expect(collectiveXAvailabilityReason(captured)).toBe('source-unavailable');
  });

  it('maps a 404 to a runs-unavailable reason', async () => {
    fetchMock.mockResolvedValue(fakeResponse('', 404));
    const captured = await fetchCollectiveXRuns().catch((error: unknown) => error);
    expect(collectiveXAvailabilityReason(captured)).toBe('runs-unavailable');
  });

  it('fetches and parses the runs listing', async () => {
    fetchMock.mockResolvedValue(fakeResponse(JSON.stringify(runsListing(1))));
    const runs = await fetchCollectiveXRuns();
    expect(runs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      collectiveXRunsUrl(1),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
