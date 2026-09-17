function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

export const RELEASE_ARGS = Object.freeze([
  '--model',
  'GLM-5',
  '--hardware',
  'h200_sxm',
  '--framework',
  'vllm',
  '--isl',
  '8192',
  '--osl',
  '1024',
  '--metric',
  'median_ttft',
  '--before-date',
  '2026-09-01',
  '--after-date',
  '2026-09-02',
  '--before-image',
  'vllm/vllm-openai:before',
  '--after-image',
  'vllm/vllm-openai:after',
]);

export function releaseObservation(after = false, overrides = {}) {
  return {
    id: after ? '900719925474099312346' : '900719925474099312345',
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
    image: `vllm/vllm-openai:${after ? 'after' : 'before'}`,
    recipe_fingerprint: after ? 'new-recipe' : 'old-recipe',
    metrics: { median_ttft: after ? 0.3 : 0.4 },
    date: after ? '2026-09-02' : '2026-09-01',
    run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${after ? '222' : '111'}/attempts/2`,
    ...overrides,
  };
}

export const RELEASE_BUNDLE_VARIANTS = freeze({
  comparable: {
    rows: [
      releaseObservation(false, {
        recipe_fingerprint: null,
        curve_date: '2026-09-02',
        curve_workflow_run_id: '900719925474099399997',
        curve_run_started_at: '2026-09-02T03:00:00Z',
      }),
      releaseObservation(true),
    ],
    expected: { comparable_pairs: 1, comparisons: 1, unmatched: 0 },
  },
  'no-comparable-pairs': {
    rows: [releaseObservation(false, { metrics: {} }), releaseObservation(true)],
    expected: { comparable_pairs: 0, comparisons: 1, unmatched: 0 },
  },
  ambiguous: {
    rows: [
      releaseObservation(),
      releaseObservation(false, { id: '900719925474099312347' }),
      releaseObservation(true),
    ],
    expected: { comparable_pairs: 0, comparisons: 0, unmatched: 3 },
  },
  'producer-mismatch': {
    rows: [
      releaseObservation(false, { image: 'vllm/vllm-openai:other' }),
      releaseObservation(true),
    ],
    expected: { comparable_pairs: 0, comparisons: 0, unmatched: 1 },
  },
});
