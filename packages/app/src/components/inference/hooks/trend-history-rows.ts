import type { BenchmarkRow } from '@/lib/api/api';

/**
 * The metric keys Historical Trends reads besides the interactivity axis, for any
 * selectable metric. They feed the trend point (`interpolated-trend-core.ts`), the
 * entry behind its derived metrics (`rowToAggDataEntry`, `buildDerivedChartFields`),
 * revenue pricing, and the modeled system power behind the facility and IT power
 * bases (`modelSystemPower`).
 */
const TREND_METRIC_KEYS = [
  'tput_per_gpu',
  'output_tput_per_gpu',
  'input_tput_per_gpu',
  'power_valid',
  'power_metric_schema_version',
  'avg_power_w',
  'p75_power_w',
  'p90_power_w',
  'prefill_avg_power_w',
  'decode_avg_power_w',
  'joules_per_successful_query',
  'joules_per_output_token',
  'joules_per_total_token',
  'joules_per_input_token',
  'prefill_joules_per_input_token',
  'decode_joules_per_output_token',
  'server_gpu_cache_hit_rate',
  'server_external_cache_hit_rate',
  'server_cpu_cache_hit_rate',
  'theoretical_cache_hit_rate',
  'total_prompt_tokens',
  'total_generation_tokens',
  'avg_total_gpu_power_w',
  'cpu_power_valid',
  'avg_cpu_socket_power_w',
  'avg_total_cpu_power_w',
  'pp',
  'prefill_pp',
  'decode_pp',
  'pcp_size',
  'prefill_pcp_size',
  'decode_pcp_size',
  'kv_offloading',
  'offload_mode',
  'kv_offload_backend',
];

/** A fixed-sequence row's interactivity is its stored median. */
const FIXED_AXIS_KEYS = ['median_intvty'];

/**
 * An agentic row's interactivity is `1 / P90 ITL`. A numeric P90 full-response ITL
 * decides it alone. Without one, plain P90 ITL stands in only when no other
 * percentile has a full-response ITL (`rowToAggDataEntry`).
 */
const AGENTIC_AXIS_KEYS = ['p90_full_response_itl'];
const AGENTIC_FALLBACK_AXIS_KEYS = [
  'p90_full_response_itl',
  'mean_full_response_itl',
  'median_full_response_itl',
  'p75_full_response_itl',
  'p95_full_response_itl',
  'p99_full_response_itl',
  'p99.9_full_response_itl',
  'p90_itl',
];

const METRIC_KEYS = [...TREND_METRIC_KEYS, ...FIXED_AXIS_KEYS, ...AGENTIC_FALLBACK_AXIS_KEYS];
const METRIC_INDEX = new Map(METRIC_KEYS.map((key, index) => [key, index]));

type CompactTrendConfig = [
  hardware: string,
  framework: string,
  model: string,
  precision: string,
  specMethod: string,
  disagg: boolean,
  isMultinode: boolean,
  prefillTp: number,
  prefillEp: number,
  prefillDpAttention: boolean,
  prefillNumWorkers: number,
  decodeTp: number,
  decodeEp: number,
  decodeDpAttention: boolean,
  decodeNumWorkers: number,
  numPrefillGpu: number,
  numDecodeGpu: number,
  benchmarkType: string,
  isl: number | null,
  osl: number | null,
  offloadMode: string,
  image: string | null,
  recipeFingerprint: string | null,
];

/** Run and snapshot provenance, holding only the keys the source row has. */
type CompactTrendRun = Pick<
  BenchmarkRow,
  | 'date'
  | 'run_url'
  | 'workflow_run_id'
  | 'run_started_at'
  | 'curve_date'
  | 'curve_workflow_run_id'
  | 'curve_run_started_at'
>;

/** Per-worker power, and the CPU audit modeled rack power checks, when the row has them. */
type CompactTrendPower = Pick<BenchmarkRow, 'workers' | 'power_audit'>;

type CompactTrendRow =
  | [id: number, config: number, run: number, conc: number, metrics: number[]]
  | [
      id: number,
      config: number,
      run: number,
      conc: number,
      metrics: number[],
      power: CompactTrendPower,
    ];

/**
 * The Historical Trends form of `/api/v1/benchmarks/history`. A history repeats each
 * config's columns on all of its rows and each run's provenance on all of that run's
 * rows, so both are sent once. `metrics` is `[keyIndex, value, ...]` over `metricKeys`
 * and holds only the keys a trend reads. `power_audit` keeps only `cpu`, and
 * `power_invalid_reasons` is not sent.
 */
export interface CompactTrendHistory {
  readonly metricKeys: readonly string[];
  readonly configs: CompactTrendConfig[];
  readonly runs: CompactTrendRun[];
  readonly rows: CompactTrendRow[];
}

export function compactTrendHistory(historyRows: readonly BenchmarkRow[]): CompactTrendHistory {
  const configIndex = new Map<string, number>();
  const runIndex = new Map<string, number>();
  const compact: CompactTrendHistory = {
    metricKeys: METRIC_KEYS,
    configs: [],
    runs: [],
    rows: [],
  };
  for (const row of historyRows) {
    const config: CompactTrendConfig = [
      row.hardware,
      row.framework,
      row.model,
      row.precision,
      row.spec_method,
      row.disagg,
      row.is_multinode,
      row.prefill_tp,
      row.prefill_ep,
      row.prefill_dp_attention,
      row.prefill_num_workers,
      row.decode_tp,
      row.decode_ep,
      row.decode_dp_attention,
      row.decode_num_workers,
      row.num_prefill_gpu,
      row.num_decode_gpu,
      row.benchmark_type,
      row.isl,
      row.osl,
      row.offload_mode,
      row.image,
      row.recipe_fingerprint ?? null,
    ];
    const configKey = JSON.stringify(config);
    let configId = configIndex.get(configKey);
    if (configId === undefined) {
      configId = compact.configs.length;
      configIndex.set(configKey, configId);
      compact.configs.push(config);
    }

    // Absent and null run times order agentic runs differently, so only present keys are kept.
    const run: CompactTrendRun = { date: row.date, run_url: row.run_url };
    if (row.workflow_run_id !== undefined) run.workflow_run_id = row.workflow_run_id;
    if (row.run_started_at !== undefined) run.run_started_at = row.run_started_at;
    if (row.curve_date !== undefined) run.curve_date = row.curve_date;
    if (row.curve_workflow_run_id !== undefined)
      run.curve_workflow_run_id = row.curve_workflow_run_id;
    if (row.curve_run_started_at !== undefined) run.curve_run_started_at = row.curve_run_started_at;
    const runKey = JSON.stringify(run);
    let runId = runIndex.get(runKey);
    if (runId === undefined) {
      runId = compact.runs.length;
      runIndex.set(runKey, runId);
      compact.runs.push(run);
    }

    const axisKeys =
      row.benchmark_type === 'agentic_traces'
        ? typeof row.metrics.p90_full_response_itl === 'number'
          ? AGENTIC_AXIS_KEYS
          : AGENTIC_FALLBACK_AXIS_KEYS
        : FIXED_AXIS_KEYS;
    const metrics: number[] = [];
    for (const keys of [TREND_METRIC_KEYS, axisKeys]) {
      for (const key of keys) {
        if (Object.hasOwn(row.metrics, key))
          metrics.push(METRIC_INDEX.get(key)!, row.metrics[key]!);
      }
    }

    const power: CompactTrendPower = {};
    if (row.workers) power.workers = row.workers;
    if (row.power_audit?.cpu) power.power_audit = { cpu: row.power_audit.cpu };
    compact.rows.push(
      row.workers || power.power_audit
        ? [row.id, configId, runId, row.conc, metrics, power]
        : [row.id, configId, runId, row.conc, metrics],
    );
  }
  return compact;
}

/** Rebuild `BenchmarkRow`s from `compactTrendHistory` output, with the trend metric keys. */
export function expandTrendHistory({
  metricKeys,
  configs,
  runs,
  rows,
}: CompactTrendHistory): BenchmarkRow[] {
  return rows.map(([id, config, run, conc, pairs, power]) => {
    const [
      hardware,
      framework,
      model,
      precision,
      spec_method,
      disagg,
      is_multinode,
      prefill_tp,
      prefill_ep,
      prefill_dp_attention,
      prefill_num_workers,
      decode_tp,
      decode_ep,
      decode_dp_attention,
      decode_num_workers,
      num_prefill_gpu,
      num_decode_gpu,
      benchmark_type,
      isl,
      osl,
      offload_mode,
      image,
      recipe_fingerprint,
    ] = configs[config]!;
    const metrics: Record<string, number> = {};
    for (let i = 0; i < pairs.length; i += 2) metrics[metricKeys[pairs[i]!]!] = pairs[i + 1]!;
    return {
      id,
      hardware,
      framework,
      model,
      precision,
      spec_method,
      disagg,
      is_multinode,
      prefill_tp,
      prefill_ep,
      prefill_dp_attention,
      prefill_num_workers,
      decode_tp,
      decode_ep,
      decode_dp_attention,
      decode_num_workers,
      num_prefill_gpu,
      num_decode_gpu,
      benchmark_type,
      isl,
      osl,
      conc,
      offload_mode,
      image,
      recipe_fingerprint,
      metrics,
      ...power,
      ...runs[run]!,
    };
  });
}
