import { describe, it, expect } from 'vitest';

import type { BenchmarkRow } from '../../src/lib/api';
import type { BestConfig, HistoryPoint } from './types';
import {
  gpuDisplayName,
  modelSlug,
  aggregateModelData,
  distinctGpus,
  allModels,
  costPerMtok,
  aggregateHistory,
  detectImprovements,
} from './data';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Minimal BenchmarkRow factory — only the fields aggregateModelData reads. */
function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    hardware: 'h100',
    framework: 'vllm',
    model: 'llama70b',
    precision: 'fp8',
    spec_method: 'fixed',
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
    num_decode_gpu: 0,
    isl: 1024,
    osl: 1024,
    conc: 64,
    image: null,
    metrics: {
      tput_per_gpu: 500,
      median_ttft: 100,
      median_tpot: 10,
      median_e2el: 2000,
    },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  };
}

// ===========================================================================
// gpuDisplayName
// ===========================================================================
describe('gpuDisplayName', () => {
  it('prepends NVIDIA vendor for known nvidia key', () => {
    expect(gpuDisplayName('h100')).toBe('NVIDIA H100');
  });

  it('prepends NVIDIA vendor for b200', () => {
    expect(gpuDisplayName('b200')).toBe('NVIDIA B200');
  });

  it('prepends AMD vendor for mi300x', () => {
    expect(gpuDisplayName('mi300x')).toBe('AMD MI300X');
  });

  it('uppercases MI keys without inserting space', () => {
    expect(gpuDisplayName('mi325x')).toBe('AMD MI325X');
  });

  it('uppercases unknown key with no vendor prefix', () => {
    expect(gpuDisplayName('tpu-v5')).toBe('TPU-V5');
  });

  it('handles gb200 (multi-letter prefix)', () => {
    expect(gpuDisplayName('gb200')).toBe('NVIDIA GB200');
  });

  it('handles mi355x without space insertion', () => {
    expect(gpuDisplayName('mi355x')).toBe('AMD MI355X');
  });
});

// ===========================================================================
// modelSlug
// ===========================================================================
describe('modelSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(modelSlug('Llama 3 70B')).toBe('llama-3-70b');
  });

  it('replaces dots and special chars with hyphens', () => {
    expect(modelSlug('Qwen-3.5-397B-A17B')).toBe('qwen-3-5-397b-a17b');
  });

  it('collapses multiple non-alphanumeric chars into one hyphen', () => {
    expect(modelSlug('foo---bar')).toBe('foo-bar');
  });

  it('strips leading and trailing hyphens', () => {
    expect(modelSlug('--hello--')).toBe('hello');
  });

  it('returns empty string for all-special-char input', () => {
    expect(modelSlug('...')).toBe('');
  });

  it('handles FP8 suffix correctly', () => {
    expect(modelSlug('Llama-3.3-70B-Instruct-FP8')).toBe('llama-3-3-70b-instruct-fp8');
  });

  it('handles parentheses in display name', () => {
    expect(modelSlug('GPT-4 (oss)')).toBe('gpt-4-oss');
  });
});

// ===========================================================================
// aggregateModelData
// ===========================================================================
describe('aggregateModelData', () => {
  it('returns empty bestBySequence for empty rows', () => {
    const result = aggregateModelData('llama70b', 'Llama-3.3-70B', []);
    expect(result.modelKey).toBe('llama70b');
    expect(result.displayName).toBe('Llama-3.3-70B');
    expect(result.rows).toHaveLength(0);
    expect(result.bestBySequence.size).toBe(0);
  });

  it('groups rows by sequence key', () => {
    const rows = [makeRow({ isl: 1024, osl: 1024 }), makeRow({ isl: 8192, osl: 1024 })];
    const result = aggregateModelData('m', 'M', rows);
    expect(result.bestBySequence.has('1k/1k')).toBe(true);
    expect(result.bestBySequence.has('8k/1k')).toBe(true);
  });

  it('formats sub-1024 ISL/OSL as plain numbers', () => {
    const rows = [makeRow({ isl: 128, osl: 512 })];
    const result = aggregateModelData('m', 'M', rows);
    expect(result.bestBySequence.has('128/512')).toBe(true);
  });

  it('skips 1k/8k sequence', () => {
    const rows = [makeRow({ isl: 1024, osl: 8192 })];
    const result = aggregateModelData('m', 'M', rows);
    expect(result.bestBySequence.has('1k/8k')).toBe(false);
    expect(result.bestBySequence.size).toBe(0);
  });

  it('keeps best tput_per_gpu per config key', () => {
    const rows = [
      makeRow({
        hardware: 'h100',
        precision: 'fp8',
        framework: 'vllm',
        disagg: false,
        conc: 32,
        metrics: { tput_per_gpu: 300, median_ttft: 80, median_tpot: 12, median_e2el: 1500 },
      }),
      makeRow({
        hardware: 'h100',
        precision: 'fp8',
        framework: 'vllm',
        disagg: false,
        conc: 64,
        metrics: { tput_per_gpu: 700, median_ttft: 120, median_tpot: 8, median_e2el: 2500 },
      }),
    ];
    const result = aggregateModelData('m', 'M', rows);
    const configs = result.bestBySequence.get('1k/1k')!;
    expect(configs).toHaveLength(1);
    expect(configs[0].tputPerGpu).toBe(700);
    expect(configs[0].conc).toBe(64);
  });

  it('keeps separate entries for different config keys', () => {
    const rows = [
      makeRow({ hardware: 'h100', framework: 'vllm', precision: 'fp8', disagg: false }),
      makeRow({ hardware: 'b200', framework: 'sglang', precision: 'bf16', disagg: false }),
    ];
    const result = aggregateModelData('m', 'M', rows);
    const configs = result.bestBySequence.get('1k/1k')!;
    expect(configs).toHaveLength(2);
  });

  it('treats disagg=true and disagg=false as separate configs for the same hardware', () => {
    const rows = [
      makeRow({
        hardware: 'h100',
        precision: 'fp8',
        framework: 'vllm',
        disagg: false,
        metrics: { tput_per_gpu: 500 },
      }),
      makeRow({
        hardware: 'h100',
        precision: 'fp8',
        framework: 'vllm',
        disagg: true,
        num_prefill_gpu: 2,
        num_decode_gpu: 6,
        metrics: { tput_per_gpu: 600 },
      }),
    ];
    const result = aggregateModelData('m', 'M', rows);
    const configs = result.bestBySequence.get('1k/1k')!;
    expect(configs).toHaveLength(2);
  });

  it('sorts configs descending by tputPerGpu', () => {
    const rows = [
      makeRow({
        hardware: 'h100',
        framework: 'vllm',
        metrics: { tput_per_gpu: 200 },
      }),
      makeRow({
        hardware: 'b200',
        framework: 'sglang',
        metrics: { tput_per_gpu: 900 },
      }),
      makeRow({
        hardware: 'mi300x',
        framework: 'vllm',
        metrics: { tput_per_gpu: 450 },
      }),
    ];
    const result = aggregateModelData('m', 'M', rows);
    const configs = result.bestBySequence.get('1k/1k')!;
    expect(configs.map((c) => c.tputPerGpu)).toEqual([900, 450, 200]);
  });

  it('skips rows with tput_per_gpu <= 0', () => {
    const rows = [
      makeRow({ metrics: { tput_per_gpu: 0 } }),
      makeRow({ metrics: { tput_per_gpu: -1 } }),
      makeRow({ metrics: {} }),
    ];
    const result = aggregateModelData('m', 'M', rows);
    // The sequence key still exists but no configs survive the tput > 0 filter
    const configs = result.bestBySequence.get('1k/1k')!;
    expect(configs).toHaveLength(0);
  });

  it('uses decode_tp for non-disagg rows', () => {
    const rows = [makeRow({ disagg: false, decode_tp: 8 })];
    const result = aggregateModelData('m', 'M', rows);
    const config = result.bestBySequence.get('1k/1k')![0];
    expect(config.tp).toBe(8);
  });

  it('sums prefill + decode GPUs for disagg rows', () => {
    const rows = [
      makeRow({
        disagg: true,
        num_prefill_gpu: 2,
        num_decode_gpu: 6,
        metrics: { tput_per_gpu: 500 },
      }),
    ];
    const result = aggregateModelData('m', 'M', rows);
    const config = result.bestBySequence.get('1k/1k')![0];
    expect(config.tp).toBe(8);
  });

  it('maps all metric fields onto BestConfig correctly', () => {
    const rows = [
      makeRow({
        metrics: {
          tput_per_gpu: 999,
          median_ttft: 42,
          median_tpot: 7,
          median_e2el: 3000,
        },
        conc: 128,
        date: '2026-02-15',
      }),
    ];
    const result = aggregateModelData('m', 'M', rows);
    const config = result.bestBySequence.get('1k/1k')![0];
    expect(config).toMatchObject<Partial<BestConfig>>({
      tputPerGpu: 999,
      medianTtft: 42,
      medianTpot: 7,
      medianE2el: 3000,
      conc: 128,
      date: '2026-02-15',
    });
  });

  it('defaults missing metric values to 0', () => {
    const rows = [makeRow({ metrics: { tput_per_gpu: 100 } })];
    const result = aggregateModelData('m', 'M', rows);
    const config = result.bestBySequence.get('1k/1k')![0];
    expect(config.medianTtft).toBe(0);
    expect(config.medianTpot).toBe(0);
    expect(config.medianE2el).toBe(0);
  });

  it('preserves the original rows array', () => {
    const rows = [makeRow(), makeRow()];
    const result = aggregateModelData('m', 'M', rows);
    expect(result.rows).toBe(rows);
  });

  it('handles mixed sequences with 1k/8k filtered out', () => {
    const rows = [
      makeRow({ isl: 1024, osl: 1024 }), // 1k/1k — kept
      makeRow({ isl: 1024, osl: 8192 }), // 1k/8k — skipped
      makeRow({ isl: 8192, osl: 1024 }), // 8k/1k — kept
    ];
    const result = aggregateModelData('m', 'M', rows);
    expect(result.bestBySequence.size).toBe(2);
    expect(result.bestBySequence.has('1k/1k')).toBe(true);
    expect(result.bestBySequence.has('8k/1k')).toBe(true);
  });
});

// ===========================================================================
// distinctGpus
// ===========================================================================
describe('distinctGpus', () => {
  it('returns unique hardware keys for the given sequence', () => {
    const rows = [
      makeRow({ hardware: 'h100', framework: 'vllm' }),
      makeRow({ hardware: 'b200', framework: 'sglang' }),
      makeRow({ hardware: 'h100', framework: 'sglang' }),
    ];
    const data = aggregateModelData('m', 'M', rows);
    const gpus = distinctGpus(data, '1k/1k');
    expect(gpus).toEqual(new Set(['h100', 'b200']));
  });

  it('returns empty set for non-existent sequence', () => {
    const data = aggregateModelData('m', 'M', [makeRow()]);
    const gpus = distinctGpus(data, '999/999');
    expect(gpus.size).toBe(0);
  });
});

// ===========================================================================
// allModels
// ===========================================================================
describe('allModels', () => {
  it('returns [dbKey, displayName] pairs', () => {
    const models = allModels();
    expect(models.length).toBeGreaterThan(0);
    for (const [key, display] of models) {
      expect(typeof key).toBe('string');
      expect(typeof display).toBe('string');
      expect(key.length).toBeGreaterThan(0);
      expect(display.length).toBeGreaterThan(0);
    }
  });

  it('includes llama70b entry', () => {
    const models = allModels();
    const llama = models.find(([k]) => k === 'llama70b');
    expect(llama).toBeDefined();
    expect(llama![1]).toContain('70B');
  });
});

// ===========================================================================
// costPerMtok
// ===========================================================================
describe('costPerMtok', () => {
  it('computes cost per million tokens correctly', () => {
    // $1.30/hr GPU, 1000 tok/s = $1.30 / (1000 * 3600 / 1_000_000) = $1.30 / 3.6 ≈ $0.361
    const cost = costPerMtok(1.3, 1000);
    expect(cost).toBeCloseTo(0.3611, 3);
  });

  it('returns 0 for zero throughput', () => {
    expect(costPerMtok(1.3, 0)).toBe(0);
  });

  it('returns 0 for zero cost', () => {
    expect(costPerMtok(0, 1000)).toBe(0);
  });

  it('higher throughput means lower cost per Mtok', () => {
    const costLow = costPerMtok(1.3, 500);
    const costHigh = costPerMtok(1.3, 2000);
    expect(costHigh).toBeLessThan(costLow);
  });
});

// ===========================================================================
// aggregateHistory
// ===========================================================================
describe('aggregateHistory', () => {
  it('groups rows by config key and picks best per date', () => {
    const rows = [
      makeRow({
        hardware: 'b200',
        framework: 'vllm',
        precision: 'fp8',
        disagg: false,
        date: '2026-01-01',
        metrics: { tput_per_gpu: 500, median_ttft: 100, median_tpot: 10, median_e2el: 2000 },
      }),
      makeRow({
        hardware: 'b200',
        framework: 'vllm',
        precision: 'fp8',
        disagg: false,
        date: '2026-01-01',
        metrics: { tput_per_gpu: 700, median_ttft: 80, median_tpot: 8, median_e2el: 1800 },
      }),
      makeRow({
        hardware: 'b200',
        framework: 'vllm',
        precision: 'fp8',
        disagg: false,
        date: '2026-02-01',
        metrics: { tput_per_gpu: 900, median_ttft: 60, median_tpot: 6, median_e2el: 1500 },
      }),
    ];
    const history = aggregateHistory(rows);
    const key = 'b200|vllm|fp8|false';
    expect(history[key]).toHaveLength(2);
    expect(history[key][0].tputPerGpu).toBe(700); // best of Jan 1
    expect(history[key][1].tputPerGpu).toBe(900); // Feb 1
  });

  it('separates different configs', () => {
    const rows = [
      makeRow({ hardware: 'b200', framework: 'vllm', date: '2026-01-01' }),
      makeRow({ hardware: 'h100', framework: 'trt', date: '2026-01-01' }),
    ];
    const history = aggregateHistory(rows);
    expect(Object.keys(history)).toHaveLength(2);
  });

  it('sorts points chronologically', () => {
    const rows = [
      makeRow({ date: '2026-03-01', metrics: { tput_per_gpu: 100 } }),
      makeRow({ date: '2026-01-01', metrics: { tput_per_gpu: 200 } }),
      makeRow({ date: '2026-02-01', metrics: { tput_per_gpu: 300 } }),
    ];
    const history = aggregateHistory(rows);
    const points = Object.values(history)[0];
    expect(points.map((p) => p.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
});

// ===========================================================================
// detectImprovements
// ===========================================================================
describe('detectImprovements', () => {
  function makeHistory(tputs: number[], dates?: string[]): Record<string, HistoryPoint[]> {
    const points: HistoryPoint[] = tputs.map((tput, i) => ({
      date: dates?.[i] ?? `2026-0${i + 1}-01`,
      hardware: 'b200',
      framework: 'vllm',
      precision: 'fp8',
      disagg: false,
      tputPerGpu: tput,
      medianTtft: 100,
      medianTpot: 10,
      medianIntvty: 50,
      conc: 64,
    }));
    return { 'b200|vllm|fp8|false': points };
  }

  it('flags >20% improvement', () => {
    const history = makeHistory([1000, 1300]); // 30% gain
    const improvements = detectImprovements(history, 'TestModel');
    expect(improvements).toHaveLength(1);
    expect(improvements[0].pctGain).toBeCloseTo(0.3);
    expect(improvements[0].oldTput).toBe(1000);
    expect(improvements[0].newTput).toBe(1300);
  });

  it('ignores <20% improvement', () => {
    const history = makeHistory([1000, 1100]); // 10% gain
    const improvements = detectImprovements(history, 'TestModel');
    expect(improvements).toHaveLength(0);
  });

  it('ignores regressions', () => {
    const history = makeHistory([1000, 800]); // -20%
    const improvements = detectImprovements(history, 'TestModel');
    expect(improvements).toHaveLength(0);
  });

  it('needs at least 2 data points', () => {
    const history = makeHistory([1000]);
    const improvements = detectImprovements(history, 'TestModel');
    expect(improvements).toHaveLength(0);
  });

  it('sorts by pctGain descending', () => {
    const history = {
      'b200|vllm|fp8|false': [
        {
          date: '2026-01-01',
          hardware: 'b200',
          framework: 'vllm',
          precision: 'fp8',
          disagg: false,
          tputPerGpu: 1000,
          medianTtft: 0,
          medianTpot: 0,
          medianIntvty: 0,
          conc: 64,
        },
        {
          date: '2026-02-01',
          hardware: 'b200',
          framework: 'vllm',
          precision: 'fp8',
          disagg: false,
          tputPerGpu: 1500,
          medianTtft: 0,
          medianTpot: 0,
          medianIntvty: 0,
          conc: 64,
        },
      ] satisfies HistoryPoint[],
      'h100|trt|fp8|false': [
        {
          date: '2026-01-01',
          hardware: 'h100',
          framework: 'trt',
          precision: 'fp8',
          disagg: false,
          tputPerGpu: 500,
          medianTtft: 0,
          medianTpot: 0,
          medianIntvty: 0,
          conc: 64,
        },
        {
          date: '2026-02-01',
          hardware: 'h100',
          framework: 'trt',
          precision: 'fp8',
          disagg: false,
          tputPerGpu: 1000,
          medianTtft: 0,
          medianTpot: 0,
          medianIntvty: 0,
          conc: 64,
        },
      ] satisfies HistoryPoint[],
    };
    const improvements = detectImprovements(history, 'TestModel');
    expect(improvements).toHaveLength(2);
    expect(improvements[0].pctGain).toBeCloseTo(1); // h100: 100% gain
    expect(improvements[1].pctGain).toBeCloseTo(0.5); // b200: 50% gain
  });
});

// ===========================================================================
// aggregateModelData — medianIntvty
// ===========================================================================
describe('aggregateModelData medianIntvty', () => {
  it('extracts median_intvty from metrics', () => {
    const rows = [
      makeRow({
        metrics: {
          tput_per_gpu: 500,
          median_ttft: 100,
          median_tpot: 10,
          median_e2el: 2000,
          median_intvty: 42.5,
        },
      }),
    ];
    const result = aggregateModelData('m', 'M', rows);
    const config = result.bestBySequence.get('1k/1k')![0];
    expect(config.medianIntvty).toBe(42.5);
  });

  it('defaults medianIntvty to 0 when missing', () => {
    const rows = [makeRow({ metrics: { tput_per_gpu: 500 } })];
    const result = aggregateModelData('m', 'M', rows);
    const config = result.bestBySequence.get('1k/1k')![0];
    expect(config.medianIntvty).toBe(0);
  });
});
