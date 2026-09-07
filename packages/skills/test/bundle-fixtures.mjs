function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

export function observation(overrides = {}) {
  return {
    id: '900719925474099312345',
    hardware: 'h200_sxm',
    framework: 'vllm',
    model: 'glm5',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 0,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 32,
    offload_mode: 'off',
    image: 'vllm/vllm-openai:v0.10.2',
    recipe_fingerprint: 'recipe-1',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 678.5,
      joules_per_successful_query: 5427.2,
      joules_per_input_token: 0.5,
      joules_per_output_token: 5.3,
      joules_per_total_token: 2.65,
      prefill_joules_per_input_token: 0.2,
      decode_joules_per_output_token: 4.1,
    },
    date: '2026-09-01',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/900719925474099312345',
    curve_date: '2026-09-04',
    curve_workflow_run_id: '900719925474099399999',
    curve_run_started_at: '2026-09-04T09:00:00Z',
    ...overrides,
  };
}

const missingPower = observation();
missingPower.metrics = { power_valid: 1, power_metric_schema_version: 2 };

export const POWERX_BUNDLE_VARIANTS = freeze({
  positive: {
    rows: [observation()],
    expected: {
      selected_records: 1,
      ids: ['900719925474099312345'],
      observation_dates: ['2026-09-01'],
      curve_dates: ['2026-09-04'],
      units: {
        avg_power_w: 'measured W per GPU',
        joules_per_successful_query: 'whole-deployment accelerator J/query',
      },
    },
  },
  empty: {
    rows: [],
    expected: {
      selected_records: 0,
      ids: [],
      observation_dates: [],
      curve_dates: [],
      units: {
        avg_power_w: 'measured W per GPU',
        joules_per_successful_query: 'whole-deployment accelerator J/query',
      },
    },
  },
  'missing-power': {
    rows: [missingPower],
    expected: {
      selected_records: 1,
      ids: ['900719925474099312345'],
      observation_dates: ['2026-09-01'],
      curve_dates: ['2026-09-04'],
      units: {
        avg_power_w: 'measured W per GPU',
        joules_per_successful_query: 'whole-deployment accelerator J/query',
      },
    },
  },
});
