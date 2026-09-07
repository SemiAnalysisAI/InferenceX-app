function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export function agentxObservation(id, overrides = {}) {
  return {
    id,
    hardware: 'b300',
    framework: 'sglang',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:nightly-dev-cu13',
    recipe_fingerprint: 'recipe-agentx',
    metrics: { mean_ttft: 0, output_tput_per_gpu: 14.5 },
    date: '2026-09-01',
    workflow_run_id: 2390,
    run_started_at: '2026-09-01 17:04:07+00',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33145139961',
    curve_date: '2026-09-01',
    curve_workflow_run_id: 2390,
    curve_run_started_at: '2026-09-01 17:04:07+00',
    ...overrides,
  };
}

function percentiles(seed = 1) {
  return { mean: seed, p50: seed, p75: seed, p90: seed, p95: seed, p99: seed, n: seed };
}

export function agentxAggregate(id, seed = 1) {
  return {
    id,
    isl: percentiles(seed),
    osl: percentiles(seed),
    kvCacheUtil: percentiles(seed),
    prefixCacheHitRate: percentiles(seed),
  };
}

export function agentxDerived(id, value = 1) {
  return { id, p75_e2e_norm_intvty: value, p90_e2e_norm_intvty: value };
}

const base = 'https://inferencex.semianalysis.com/api/v1';
const args = [
  'agentx',
  'export',
  '--model',
  'DeepSeek-V4-Pro',
  '--date',
  '2026-09-04',
  '--hardware',
  'b300',
];

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function responses(rows, enrichment) {
  const ids = rows.map((row) => Number(row.id));
  return [
    {
      operation: 'benchmarks',
      url: `${base}/benchmarks?model=DeepSeek-V4-Pro&date=2026-09-04`,
      body: rows,
      status: 200,
    },
    ...chunks(ids, 200).map((group) => ({
      operation: 'agentic-aggregates',
      url: `${base}/agentic-aggregates?ids=${group.join('%2C')}`,
      body: Object.fromEntries(
        group.flatMap((id) => (enrichment.aggregates === false ? [] : [[id, agentxAggregate(id)]])),
      ),
      status: 200,
    })),
    ...chunks(ids, 200).map((group) => ({
      operation: 'derived-agentic-metrics',
      url: `${base}/derived-agentic-metrics?ids=${group.join('%2C')}`,
      body: Object.fromEntries(
        group.flatMap((id) => (enrichment.derived === false ? [] : [[id, agentxDerived(id)]])),
      ),
      status: 200,
    })),
    ...chunks(ids, 500).map((group) => ({
      operation: 'trace-availability',
      url: `${base}/trace-availability?ids=${group.join('%2C')}`,
      body: Object.fromEntries(
        group.flatMap((id) => (enrichment.trace === undefined ? [] : [[id, enrichment.trace]])),
      ),
      status: 200,
    })),
  ];
}

function fixture(rows, enrichment, expected) {
  return { args, responses: responses(rows, enrichment), expected };
}

const positiveRows = [agentxObservation(1)];
const multiRows = Array.from({ length: 401 }, (_, index) => agentxObservation(index + 1));

export const AGENTX_BUNDLE_VARIANTS = freeze({
  positive: fixture(
    positiveRows,
    { trace: true },
    {
      selected_records: 1,
      ids: ['1'],
      valid_hardware: ['b300'],
      request_chunks: [[1], [1], [1]],
    },
  ),
  'not-returned': fixture(
    positiveRows,
    { aggregates: false, trace: true },
    {
      selected_records: 1,
      ids: ['1'],
      valid_hardware: [],
      request_chunks: [[1], [1], [1]],
    },
  ),
  'no-trace': fixture(
    positiveRows,
    { trace: false },
    {
      selected_records: 1,
      ids: ['1'],
      valid_hardware: ['b300'],
      request_chunks: [[1], [1], [1]],
    },
  ),
  empty: fixture(
    [],
    {},
    {
      selected_records: 0,
      ids: [],
      valid_hardware: [],
      request_chunks: [],
    },
  ),
  'multi-chunk': fixture(
    multiRows,
    { trace: false },
    {
      selected_records: 401,
      ids: multiRows.map((row) => String(row.id)),
      valid_hardware: ['b300'],
      request_chunks: [
        ...chunks(
          multiRows.map((row) => row.id),
          200,
        ),
        ...chunks(
          multiRows.map((row) => row.id),
          200,
        ),
        ...chunks(
          multiRows.map((row) => row.id),
          500,
        ),
      ],
    },
  ),
});
