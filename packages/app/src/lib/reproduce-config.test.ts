import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { CONFIG_JSON_KEYS, buildReproduceConfig } from './reproduce-config';

// Minimal "real-looking" point: every allow-list field populated, plus the
// result-metric fields the old subtractive destructure would have leaked.
function makePoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    // Chart-derived (must not appear in output)
    x: 100,
    y: 200,
    tpPerGpu: { y: 50, roof: false },
    tpPerMw: { y: 5, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },

    // Allow-list (must appear in output)
    model: 'deepseek-ai/DeepSeek-R1',
    framework: 'vllm',
    precision: 'fp8',
    hw: 'b200',
    hwKey: 'b200',
    tp: 8,
    ep: 8,
    dp_attention: true,
    disagg: false,
    is_multinode: false,
    prefill_tp: 0,
    prefill_ep: 0,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 0,
    decode_ep: 0,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 0,
    num_decode_gpu: 0,
    spec_decoding: 'mtp',
    conc: 64,
    image: 'vllm/vllm-openai:v0.6.4',
    date: '2025-12-01',
    actualDate: '2025-12-01',
    run_url: 'https://github.com/InferenceMAX/InferenceMAX/actions/runs/123',

    // Result metrics (must not appear in output)
    tput_per_gpu: 1234.5,
    output_tput_per_gpu: 567.8,
    input_tput_per_gpu: 666.7,
    mean_ttft: 100,
    median_ttft: 95,
    std_ttft: 5,
    p99_ttft: 150,
    mean_tpot: 10,
    median_tpot: 9,
    std_tpot: 1,
    p99_tpot: 20,
    mean_intvty: 0.1,
    median_intvty: 0.09,
    std_intvty: 0.01,
    p99_intvty: 0.2,
    mean_itl: 5,
    median_itl: 4,
    std_itl: 1,
    p99_itl: 10,
    mean_e2el: 200,
    median_e2el: 190,
    std_e2el: 10,
    p99_e2el: 300,

    ...overrides,
  };
}

const RESULT_KEYS = [
  'tput_per_gpu',
  'output_tput_per_gpu',
  'input_tput_per_gpu',
  'mean_ttft',
  'median_ttft',
  'std_ttft',
  'p99_ttft',
  'mean_tpot',
  'median_tpot',
  'std_tpot',
  'p99_tpot',
  'mean_intvty',
  'median_intvty',
  'std_intvty',
  'p99_intvty',
  'mean_itl',
  'median_itl',
  'std_itl',
  'p99_itl',
  'mean_e2el',
  'median_e2el',
  'std_e2el',
  'p99_e2el',
];

const CHART_DERIVED_KEYS = [
  'x',
  'y',
  'tpPerGpu',
  'tpPerMw',
  'outputTputPerGpu',
  'inputTputPerGpu',
  'outputTputPerMw',
  'inputTputPerMw',
  'costh',
  'costn',
  'costr',
  'costhi',
  'costni',
  'costri',
  'costhOutput',
  'costnOutput',
  'costrOutput',
  'costUser',
  'powerUser',
  'jTotal',
  'jOutput',
  'jInput',
];

describe('buildReproduceConfig', () => {
  it('includes every allow-list key when populated', () => {
    const out = buildReproduceConfig(makePoint());
    for (const key of CONFIG_JSON_KEYS) {
      expect(out, `missing allow-list key "${key}"`).toHaveProperty(key);
    }
  });

  it('omits raw result-metric fields', () => {
    const out = buildReproduceConfig(makePoint());
    for (const key of RESULT_KEYS) {
      expect(out, `result key "${key}" leaked into config JSON`).not.toHaveProperty(key);
    }
  });

  it('omits chart-derived presentational fields', () => {
    const out = buildReproduceConfig(makePoint());
    for (const key of CHART_DERIVED_KEYS) {
      expect(out, `chart-derived key "${key}" leaked into config JSON`).not.toHaveProperty(key);
    }
  });

  it('omits undefined / null allow-list fields (no "image: null" noise)', () => {
    const out = buildReproduceConfig(
      makePoint({ image: undefined, actualDate: undefined, ep: undefined }),
    );
    expect(out).not.toHaveProperty('image');
    expect(out).not.toHaveProperty('actualDate');
    expect(out).not.toHaveProperty('ep');
    // Sibling required fields still present.
    expect(out).toHaveProperty('model');
    expect(out).toHaveProperty('framework');
  });

  it('preserves boolean false and numeric 0 (does not treat them as absent)', () => {
    const out = buildReproduceConfig(
      makePoint({ disagg: false, is_multinode: false, prefill_tp: 0 }),
    );
    expect(out.disagg).toBe(false);
    expect(out.is_multinode).toBe(false);
    expect(out.prefill_tp).toBe(0);
  });

  it('emits keys in CONFIG_JSON_KEYS order in the stringified output', () => {
    const json = JSON.stringify(buildReproduceConfig(makePoint()), null, 2);
    const indices = CONFIG_JSON_KEYS.map((k) => json.indexOf(`"${k}":`));
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i], `key order broken at "${CONFIG_JSON_KEYS[i]}"`).toBeGreaterThan(
        indices[i - 1]!,
      );
    }
  });

  describe('with sequence', () => {
    it('inserts isl/osl just before conc when sequence is provided', () => {
      const json = JSON.stringify(
        buildReproduceConfig(makePoint(), { isl: 1024, osl: 1024 }),
        null,
        2,
      );
      const iIsl = json.indexOf('"isl":');
      const iOsl = json.indexOf('"osl":');
      const iConc = json.indexOf('"conc":');
      const iSpec = json.indexOf('"spec_decoding":');
      expect(iIsl).toBeGreaterThan(iSpec);
      expect(iOsl).toBeGreaterThan(iIsl);
      expect(iConc).toBeGreaterThan(iOsl);
    });

    it('does not emit isl/osl when sequence is omitted', () => {
      const out = buildReproduceConfig(makePoint());
      expect(out).not.toHaveProperty('isl');
      expect(out).not.toHaveProperty('osl');
    });
  });
});
