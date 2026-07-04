import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION } from './etl/compute-request-timeline.js';
import { STATS_VERSION } from './queries/agentic-shared.js';
import type * as JsonProvider from './json-provider.js';

/**
 * Fixture-backed parity tests for the PR348 dump-mode mirrors added to
 * json-provider.ts: the 6 agentic per-point queries + the 4 dataset queries.
 *
 * The store is a lazy singleton keyed off DUMP_DIR, so we write a small dump
 * directory, point DUMP_DIR at it, and dynamically import the module once.
 *
 * Coverage per mirror:
 *  - fast path: precomputed JSONB (aggregate_stats / chart_series /
 *    request_timeline) at the CURRENT version is served verbatim.
 *  - blob fallback: a STALE version forces a re-derive from the (dumped) blob
 *    using the same pure helper the SQL path uses.
 *  - bytea round-trip: blobs are stored as {type:'Buffer',data:[…]} (what
 *    dump-db emits) and must gunzip cleanly.
 */

/** Encode a Buffer the way dump-db.ts does (Buffer.prototype.toJSON()). */
function byteaJson(buf: Buffer): { type: 'Buffer'; data: number[] } {
  return { type: 'Buffer', data: [...buf] };
}

// A tiny profiling-phase profile_export.jsonl with two conversations/turns so
// extractIslOsl / computeDerivedFromBlob / computeRequestTimeline all produce
// non-empty output.
const PROFILE_JSONL = [
  JSON.stringify({
    metadata: {
      benchmark_phase: 'profiling',
      conversation_id: 'convA',
      turn_index: 0,
      worker_id: 'w0',
      credit_issued_ns: 1_000_000_000,
      request_start_ns: 1_000_000_000,
      request_ack_ns: 1_050_000_000,
      request_end_ns: 1_500_000_000,
    },
    metrics: {
      input_sequence_length: { value: 1000 },
      output_sequence_length: { value: 200 },
      time_to_first_token: { value: 50 },
      request_latency: { value: 500 },
    },
  }),
  JSON.stringify({
    metadata: {
      benchmark_phase: 'profiling',
      conversation_id: 'convB',
      turn_index: 0,
      worker_id: 'w1',
      credit_issued_ns: 2_000_000_000,
      request_start_ns: 2_000_000_000,
      request_ack_ns: 2_040_000_000,
      request_end_ns: 2_800_000_000,
    },
    metrics: {
      input_sequence_length: { value: 2000 },
      output_sequence_length: { value: 400 },
      time_to_first_token: { value: 40 },
      request_latency: { value: 800 },
    },
  }),
].join('\n');

// A minimal server_metrics_json with one KV-cache gauge series so
// extractServerMetricSamples / computeChartSeries yield a value.
const SERVER_JSON = JSON.stringify({
  metrics: {
    'vllm:kv_cache_usage_perc': {
      series: [
        {
          labels: { engine: '0' },
          timeslices: [
            { start_ns: 0, avg: 0.4 },
            { start_ns: 1_000_000_000, avg: 0.6 },
          ],
        },
      ],
    },
  },
});

const PROFILE_GZ = gzipSync(Buffer.from(PROFILE_JSONL, 'utf8'));
const SERVER_GZ = gzipSync(Buffer.from(SERVER_JSON, 'utf8'));

// Precomputed JSONB payloads at the CURRENT versions (fast path).
const CURRENT_AGG_STATS = {
  version: STATS_VERSION,
  isl: { mean: 1500, p50: 1500, p75: 1750, p90: 1900, p99: 1990, n: 2 },
  osl: { mean: 300, p50: 300, p75: 350, p90: 380, p99: 398, n: 2 },
  kvCacheUtil: { mean: 0.5, p50: 0.5, p75: 0.55, p90: 0.58, p99: 0.6, n: 2 },
  prefixCacheHitRate: null,
  normalizedSessionTimeS: 0.65,
  p90PrefillTpsPerUser: 42,
  normalizedE2e400: { mean: 0.5, p50: 0.5, p75: 0.7, p90: 0.9, p99: 0.99, n: 2 },
};

const CURRENT_TIMELINE = {
  version: REQUEST_TIMELINE_VERSION,
  startNs: 0,
  endNs: 1_000_000,
  durationS: 0.001,
  requests: [
    {
      cid: 'convA',
      ti: 0,
      wid: 'w0',
      ad: 0,
      phase: 'profiling',
      credit: 0,
      start: 0,
      ack: 5,
      end: 500,
      ttftMs: 50,
      tpotMs: null,
      isl: 1000,
      osl: 200,
      cancelled: false,
    },
  ],
};

let jp: typeof JsonProvider;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'infx-pr348-'));

  // configs / workflow_runs / benchmark_results — enough for the agentic mirrors.
  writeFileSync(
    join(dir, 'configs.json'),
    JSON.stringify([
      {
        id: 1,
        hardware: 'h100',
        framework: 'vllm',
        model: 'testm',
        precision: 'fp8',
        spec_method: 'none',
        disagg: false,
        is_multinode: false,
        prefill_tp: 1,
        prefill_ep: 1,
        prefill_dp_attention: false,
        prefill_num_workers: 1,
        decode_tp: 2,
        decode_ep: 1,
        decode_dp_attention: false,
        decode_num_workers: 1,
        num_prefill_gpu: 0,
        num_decode_gpu: 8,
      },
      {
        id: 2,
        hardware: 'h100',
        framework: 'vllm',
        model: 'testm',
        precision: 'fp8',
        spec_method: 'none',
        disagg: false,
        is_multinode: false,
        prefill_tp: 1,
        prefill_ep: 1,
        prefill_dp_attention: false,
        prefill_num_workers: 1,
        decode_tp: 4,
        decode_ep: 1,
        decode_dp_attention: false,
        decode_num_workers: 1,
        num_prefill_gpu: 0,
        num_decode_gpu: 8,
      },
    ]),
  );
  writeFileSync(
    join(dir, 'workflow_runs.json'),
    JSON.stringify([
      {
        id: 10,
        github_run_id: 555,
        run_attempt: 1,
        name: 'run 555',
        status: 'completed',
        conclusion: 'success',
        head_sha: 'sha',
        head_branch: 'main',
        html_url: 'https://github.com/x/runs/555',
        created_at: '2026-06-14T04:00:00Z',
        run_started_at: '2026-06-14T04:00:00Z',
        date: '2026-06-14',
      },
    ]),
  );
  // id 1 → trace_replay 100 (fast-path stats + timeline). id 2 → trace_replay 200
  // (STALE stats + timeline → forces blob fallback). id 3 has no trace_replay.
  writeFileSync(
    join(dir, 'benchmark_results.json'),
    JSON.stringify([
      {
        id: 1,
        workflow_run_id: 10,
        config_id: 1,
        benchmark_type: 'agentic_traces',
        date: '2026-06-14',
        isl: null,
        osl: null,
        conc: 16,
        offload_mode: 'off',
        image: null,
        metrics: {
          tput_per_gpu: 123,
          total_requests_completed: 200,
          server_gpu_cache_hit_rate: 0.5,
        },
        error: null,
        server_log_id: null,
        trace_replay_id: 100,
      },
      {
        id: 2,
        workflow_run_id: 10,
        config_id: 2,
        benchmark_type: 'agentic_traces',
        date: '2026-06-14',
        isl: null,
        osl: null,
        conc: 32,
        offload_mode: 'on',
        image: null,
        metrics: { tput_per_gpu: 456, num_requests_total: 180 },
        error: null,
        server_log_id: null,
        trace_replay_id: 200,
      },
      {
        id: 3,
        workflow_run_id: 10,
        config_id: 1,
        benchmark_type: 'agentic_traces',
        date: '2026-06-14',
        isl: null,
        osl: null,
        conc: 8,
        offload_mode: 'off',
        image: null,
        metrics: {},
        error: null,
        server_log_id: null,
        trace_replay_id: null,
      },
    ]),
  );

  // agentic_trace_replay: 100 = current JSONB, 200 = stale JSONB (force blob).
  writeFileSync(
    join(dir, 'agentic_trace_replay.json'),
    JSON.stringify([
      {
        id: 100,
        profile_export_jsonl_gz: byteaJson(PROFILE_GZ),
        profile_export_uncompressed_size: PROFILE_JSONL.length,
        server_metrics_csv: null,
        server_metrics_csv_size: null,
        server_metrics_json_gz: byteaJson(SERVER_GZ),
        server_metrics_json_uncompressed_size: SERVER_JSON.length,
        aggregate_stats: CURRENT_AGG_STATS,
        chart_series: null, // no current chart_series → trace-server-metrics uses blob
        request_timeline: CURRENT_TIMELINE,
        created_at: '2026-06-14T04:00:00Z',
      },
      {
        id: 200,
        profile_export_jsonl_gz: byteaJson(PROFILE_GZ),
        profile_export_uncompressed_size: PROFILE_JSONL.length,
        server_metrics_csv: null,
        server_metrics_csv_size: null,
        server_metrics_json_gz: byteaJson(SERVER_GZ),
        server_metrics_json_uncompressed_size: SERVER_JSON.length,
        aggregate_stats: { version: 1 }, // stale → force profile-blob fallback
        chart_series: { version: 1 }, // stale → force server-blob fallback
        request_timeline: { version: 1 }, // stale → force profile-blob fallback
        created_at: '2026-06-14T04:00:00Z',
      },
    ]),
  );

  // Datasets fixtures.
  writeFileSync(
    join(dir, 'datasets.json'),
    JSON.stringify([
      {
        id: 'org/ds-new',
        slug: 'ds-new',
        label: 'DS New',
        variant: 'full',
        description: 'newest',
        hf_url: null,
        license: null,
        conversation_count: 3,
        summary: { totalIn: 100 },
        chart_data: { hist: [1, 2, 3] },
        dataset_version: 1,
        ingested_at: '2026-06-20T00:00:00Z',
      },
      {
        id: 'org/ds-old',
        slug: 'ds-old',
        label: 'DS Old',
        variant: 'full',
        description: 'oldest',
        hf_url: null,
        license: null,
        conversation_count: 0,
        summary: {},
        chart_data: {},
        dataset_version: 1,
        ingested_at: '2026-06-10T00:00:00Z',
      },
    ]),
  );
  writeFileSync(
    join(dir, 'dataset_conversations.json'),
    JSON.stringify([
      {
        id: 1,
        dataset_id: 'org/ds-new',
        conv_id: 'agent-alpha',
        models: ['m1'],
        num_turns: 5,
        num_subagent_groups: 2,
        total_in: 300,
        total_out: 30,
        total_cached: 10,
        structure: { nodes: [] },
      },
      {
        id: 2,
        dataset_id: 'org/ds-new',
        conv_id: 'AGENT-beta',
        models: ['m2'],
        num_turns: 9,
        num_subagent_groups: 1,
        total_in: 100,
        total_out: 20,
        total_cached: 5,
        structure: { nodes: [{ kind: 'turn' }] },
      },
      {
        id: 3,
        dataset_id: 'org/ds-new',
        conv_id: 'plain-gamma',
        models: ['m1'],
        num_turns: 2,
        num_subagent_groups: 4,
        total_in: 200,
        total_out: 40,
        total_cached: 15,
        structure: { nodes: [] },
      },
    ]),
  );
  writeFileSync(
    join(dir, 'run_datasets.json'),
    JSON.stringify([
      { workflow_run_id: 10, dataset_slug: 'ds-new', created_at: '2026-06-14T04:00:00Z' },
    ]),
  );

  // Empty tables the store loads eagerly.
  for (const f of [
    'run_stats.json',
    'eval_results.json',
    'availability.json',
    'changelog_entries.json',
  ]) {
    writeFileSync(join(dir, f), '[]');
  }

  process.env.DUMP_DIR = dir;
  jp = await import('./json-provider.js');
});

afterAll(() => {
  delete process.env.DUMP_DIR;
});

describe('agentic aggregates mirror', () => {
  it('serves precomputed aggregate_stats at the current version (fast path)', () => {
    const map = jp.getAgenticAggregates([1]);
    expect(map[1]?.isl).toEqual(CURRENT_AGG_STATS.isl);
    expect(map[1]?.kvCacheUtil).toEqual(CURRENT_AGG_STATS.kvCacheUtil);
  });

  it('re-derives from the dumped blobs when the stored version is stale', () => {
    const map = jp.getAgenticAggregates([2]);
    // isl percentiles from the two-turn profile blob (1000, 2000).
    expect(map[2]?.isl?.n).toBe(2);
    expect(map[2]?.isl?.mean).toBe(1500);
    // kv cache util from the server blob (0.4, 0.6).
    expect(map[2]?.kvCacheUtil?.n).toBe(2);
    expect(map[2]?.kvCacheUtil?.mean).toBeCloseTo(0.5);
  });

  it('returns a blank aggregate for an id with no trace_replay', () => {
    const map = jp.getAgenticAggregates([3]);
    expect(map[3]).toEqual({
      id: 3,
      isl: null,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
    });
  });
});

describe('derived agentic metrics mirror', () => {
  it('fast path reads the derived fields out of aggregate_stats', () => {
    const map = jp.getDerivedAgenticMetrics([1]);
    expect(map[1]?.normalized_session_time_s).toBe(0.65);
    expect(map[1]?.p90_prefill_tps_per_user).toBe(42);
    expect(map[1]?.p75_normalized_e2e_400_s).toBe(0.7);
  });

  it('blob fallback recomputes via computeDerivedFromBlob', () => {
    const map = jp.getDerivedAgenticMetrics([2]);
    expect(map[2]?.normalized_session_time_s).not.toBeNull();
    expect(map[2]?.p90_prefill_tps_per_user).not.toBeNull();
  });

  it('omits ids without a trace_replay (SQL joins on it)', () => {
    const map = jp.getDerivedAgenticMetrics([3]);
    expect(map[3]).toBeUndefined();
  });
});

describe('request timeline mirror', () => {
  it('serves the precomputed timeline at the current version', () => {
    const t = jp.getRequestTimeline(1);
    expect(t?.version).toBe(REQUEST_TIMELINE_VERSION);
    expect(t?.requests).toHaveLength(1);
  });

  it('recomputes from the profile blob when stale', () => {
    const t = jp.getRequestTimeline(2);
    expect(t?.version).toBe(REQUEST_TIMELINE_VERSION);
    // Two turns in the fixture blob.
    expect(t?.requests).toHaveLength(2);
  });

  it('returns null for an id without a trace_replay', () => {
    expect(jp.getRequestTimeline(3)).toBeNull();
  });
});

describe('trace server metrics mirror', () => {
  it('computes chart series from the server blob (no current chart_series)', async () => {
    const m = await jp.getTraceServerMetrics(1);
    expect(m).not.toBeNull();
    expect(m?.meta.hardware).toBe('h100');
    expect(m?.meta.run_url).toBe('https://github.com/x/runs/555/attempts/1');
    expect(m?.kvCacheUsage.length).toBeGreaterThan(0);
  });

  it('returns null for an id without a trace_replay blob', async () => {
    expect(await jp.getTraceServerMetrics(3)).toBeNull();
  });
});

describe('trace histograms mirror', () => {
  it('extracts isl/osl from the current request_timeline (fast path)', () => {
    const map = jp.getTraceHistograms([1]);
    expect(map[1]?.isl).toEqual([1000]);
    expect(map[1]?.osl).toEqual([200]);
  });

  it('falls back to the profile blob when the timeline is stale', () => {
    const map = jp.getTraceHistograms([2]);
    expect(map[2]?.isl).toEqual([1000, 2000]);
    expect(map[2]?.osl).toEqual([200, 400]);
  });

  it('omits ids without a trace_replay', () => {
    const map = jp.getTraceHistograms([3]);
    expect(map[3]).toBeUndefined();
  });
});

describe('benchmark siblings mirror', () => {
  it('groups rows sharing the SKU within the run, sorted by decode_tp then offload', () => {
    const res = jp.getBenchmarkSiblings(1);
    expect(res).not.toBeNull();
    expect(res?.sku.model).toBe('testm');
    expect(res?.sku.dataset_slug).toBe('ds-new'); // via run_datasets
    // ids 1 (tp2/off/conc16), 2 (tp4/on), 3 (tp2/off/conc8) share the SKU.
    // ORDER BY decode_tp asc → tp2 group (ids 1,3) before tp4 (id 2); within
    // tp2 both are offload 'off', so final tie-break is conc asc → id 3 (conc 8)
    // before id 1 (conc 16). Matches the SQL `order by … br.conc`.
    const ids = res?.siblings.map((s) => s.id);
    expect(ids).toEqual([3, 1, 2]);
    expect(res?.siblings.find((s) => s.id === 1)?.is_current).toBe(true);
    expect(res?.siblings.find((s) => s.id === 1)?.has_trace).toBe(true);
    expect(res?.siblings.find((s) => s.id === 3)?.has_trace).toBe(false);
    // total_requests coalesces total_requests_completed then num_requests_total.
    expect(res?.siblings.find((s) => s.id === 1)?.total_requests).toBe(200);
    expect(res?.siblings.find((s) => s.id === 2)?.total_requests).toBe(180);
  });

  it('returns null for an unknown benchmark id', () => {
    expect(jp.getBenchmarkSiblings(9999)).toBeNull();
  });
});

describe('dataset mirrors', () => {
  it('listDatasets orders newest ingested first', () => {
    const rows = jp.listDatasets();
    expect(rows.map((r) => r.slug)).toEqual(['ds-new', 'ds-old']);
    // chart_data is excluded from the list rows (DatasetRecord, not DatasetDetail).
    expect((rows[0] as unknown as Record<string, unknown>).chart_data).toBeUndefined();
  });

  it('getDataset returns one dataset including chart_data', () => {
    const d = jp.getDataset('ds-new');
    expect(d?.label).toBe('DS New');
    expect(d?.chart_data).toEqual({ hist: [1, 2, 3] });
    expect(jp.getDataset('nope')).toBeNull();
  });

  it('renders ingested_at in Postgres ::text form (parity with the SQL path)', () => {
    // Dump stores ISO ('2026-06-20T00:00:00Z'); the SQL query casts ::text →
    // '2026-06-20 00:00:00+00'. The mirror must match, not leak the ISO form.
    expect(jp.getDataset('ds-new')?.ingested_at).toBe('2026-06-20 00:00:00+00');
    expect(jp.listDatasets()[0]?.ingested_at).toBe('2026-06-20 00:00:00+00');
  });

  it('listConversations: search for literal "%" matches no rows (wildcard semantics do not apply)', () => {
    // The SQL path now escapes LIKE metacharacters via escapeLikePattern before
    // embedding into the ILIKE pattern. The json-provider mirror uses
    // .toLowerCase().includes() which already treats input literally. Both paths
    // must agree: a search for "%" finds only conv_ids that contain a literal
    // percent character — none of the fixture conv_ids do.
    const result = jp.listConversations('ds-new', { search: '%' });
    expect(result?.total).toBe(0);
    expect(result?.items).toHaveLength(0);
  });

  it('listConversations: search for literal "_" matches no rows', () => {
    // Similarly, "_" must not act as a single-character wildcard.
    const result = jp.listConversations('ds-new', { search: '_' });
    expect(result?.total).toBe(0);
  });

  it('listConversations applies case-insensitive search, sort, and pagination', () => {
    // Default sort = tokens (total_in desc): alpha(300), plain(200), AGENT-beta(100).
    const all = jp.listConversations('ds-new');
    expect(all?.total).toBe(3);
    expect(all?.items.map((c) => c.conv_id)).toEqual(['agent-alpha', 'plain-gamma', 'AGENT-beta']);

    // ILIKE '%agent%' matches 'agent-alpha' and 'AGENT-beta' (case-insensitive).
    const search = jp.listConversations('ds-new', { search: 'agent' });
    expect(search?.total).toBe(2);
    expect(search?.items.map((c) => c.conv_id).toSorted()).toEqual(['AGENT-beta', 'agent-alpha']);

    // sort=turns desc → beta(9), alpha(5), gamma(2).
    const byTurns = jp.listConversations('ds-new', { sort: 'turns' });
    expect(byTurns?.items.map((c) => c.conv_id)).toEqual([
      'AGENT-beta',
      'agent-alpha',
      'plain-gamma',
    ]);

    // sort=subagents desc → gamma(4), alpha(2), beta(1).
    const bySub = jp.listConversations('ds-new', { sort: 'subagents' });
    expect(bySub?.items.map((c) => c.conv_id)).toEqual([
      'plain-gamma',
      'agent-alpha',
      'AGENT-beta',
    ]);

    // sort=id asc. Postgres en_US.utf8 collation (verified against the live DB)
    // orders 'agent-alpha' before 'AGENT-beta'; String.localeCompare matches.
    const byId = jp.listConversations('ds-new', { sort: 'id' });
    expect(byId?.items.map((c) => c.conv_id)).toEqual(['agent-alpha', 'AGENT-beta', 'plain-gamma']);

    // limit + offset.
    const paged = jp.listConversations('ds-new', { limit: 1, offset: 1 });
    expect(paged?.total).toBe(3);
    expect(paged?.items.map((c) => c.conv_id)).toEqual(['plain-gamma']);

    // Unknown dataset → null.
    expect(jp.listConversations('nope')).toBeNull();
  });

  it('getConversation returns one flamegraph structure', () => {
    const c = jp.getConversation('ds-new', 'agent-alpha');
    expect(c?.num_turns).toBe(5);
    expect(c?.structure).toEqual({ nodes: [] });
    expect(jp.getConversation('ds-new', 'missing')).toBeNull();
    expect(jp.getConversation('nope', 'agent-alpha')).toBeNull();
  });
});
