import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import type { InterpolatedResult } from '@/components/calculator/types';

import { COMPARE_MODEL_SLUGS } from './compare-slug';
import {
  compareMetaDescription,
  computeCompareImageRows,
  KNOWN_MODELS,
  META_DESCRIPTION_MAX,
  type SsrInterpolatedRow,
} from './compare-ssr';
import { compareMetaDescriptionZh } from './compare-ssr-zh';

// BenchmarkRow.id is required (stable per-point id from benchmark_results);
// hand out a fresh one per stub so id-keyed logic can't collide across rows.
let nextStubId = 1;

describe('compare URL validators', () => {
  it('accepts GLM-5.2 as a model override', () => {
    expect(KNOWN_MODELS.has('GLM-5.2')).toBe(true);
  });
});

function stubRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextStubId++,
    hardware: 'h200',
    framework: 'sglang',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
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
    benchmark_type: 'single_turn',
    offload_mode: 'off',
    isl: 1024,
    osl: 1024,
    conc: 128,
    image: null,
    metrics: { tput_per_gpu: 100, median_intvty: 30 },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  };
}

function pairRows(): BenchmarkRow[] {
  return [
    stubRow({ hardware: 'h200', conc: 16, metrics: { tput_per_gpu: 800, median_intvty: 10 } }),
    stubRow({ hardware: 'h200', conc: 32, metrics: { tput_per_gpu: 600, median_intvty: 20 } }),
    stubRow({ hardware: 'h200', conc: 64, metrics: { tput_per_gpu: 400, median_intvty: 30 } }),
    stubRow({ hardware: 'h200', conc: 128, metrics: { tput_per_gpu: 200, median_intvty: 40 } }),
    stubRow({ hardware: 'b200', conc: 16, metrics: { tput_per_gpu: 900, median_intvty: 10 } }),
    stubRow({ hardware: 'b200', conc: 32, metrics: { tput_per_gpu: 700, median_intvty: 20 } }),
    stubRow({ hardware: 'b200', conc: 64, metrics: { tput_per_gpu: 500, median_intvty: 30 } }),
    stubRow({ hardware: 'b200', conc: 128, metrics: { tput_per_gpu: 250, median_intvty: 40 } }),
  ];
}

describe('computeCompareImageRows', () => {
  const range = { min: 10, max: 40 };

  it('returns 17 evenly-spaced samples when no includeTargets are passed', () => {
    const rows = computeCompareImageRows(pairRows(), 'h200', 'b200', '1k/1k', 'fp8', range);
    expect(rows.length).toBe(17);
    expect(rows.at(0)?.target).toBe(10);
    expect(rows.at(-1)?.target).toBe(40);
  });

  it('inserts includeTargets as exact samples without dropping the even grid', () => {
    const rows = computeCompareImageRows(
      pairRows(),
      'h200',
      'b200',
      '1k/1k',
      'fp8',
      range,
      [17, 25, 33],
    );
    const targets = rows.map((r) => r.target);
    expect(targets).toContain(17);
    expect(targets).toContain(25);
    expect(targets).toContain(33);
    // Endpoints from the even grid still present.
    expect(targets).toContain(10);
    expect(targets).toContain(40);
    // Strictly increasing — required so curve-partition by target works.
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i]).toBeGreaterThan(targets[i - 1]);
    }
  });

  it('drops includeTargets that fall outside the interactivity range', () => {
    const rows = computeCompareImageRows(
      pairRows(),
      'h200',
      'b200',
      '1k/1k',
      'fp8',
      range,
      [-5, 9, 41, 1000],
    );
    const targets = rows.map((r) => r.target);
    expect(targets).not.toContain(-5);
    expect(targets).not.toContain(9);
    expect(targets).not.toContain(41);
    expect(targets).not.toContain(1000);
    // The even grid is unaffected when every includeTarget is rejected.
    expect(rows.length).toBe(17);
  });

  it('dedupes includeTargets that already coincide with an even-grid sample', () => {
    const rows = computeCompareImageRows(
      pairRows(),
      'h200',
      'b200',
      '1k/1k',
      'fp8',
      range,
      [10, 40],
    );
    expect(rows.length).toBe(17);
    expect(rows.filter((r) => r.target === 10).length).toBe(1);
    expect(rows.filter((r) => r.target === 40).length).toBe(1);
  });

  it('returns an empty array when the interactivity range is degenerate', () => {
    expect(
      computeCompareImageRows(
        pairRows(),
        'h200',
        'b200',
        '1k/1k',
        'fp8',
        { min: 20, max: 20 },
        [20],
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// compareMetaDescription (+ zh port)
// ---------------------------------------------------------------------------

const GLM = COMPARE_MODEL_SLUGS.find((m) => m.slug === 'glm-5-1')!; // seoName 'GLM-5'
const DSV4 = COMPARE_MODEL_SLUGS.find((m) => m.slug === 'deepseek-v4')!; // long seoName

/** Minimal InterpolatedResult stub — compareMetaDescription only reads
 *  `value` (tok/s/GPU) and `cost` ($/M tok); the rest are inert zeros. */
function ir(value: number, cost: number): InterpolatedResult {
  return {
    hwKey: 'x',
    resultKey: 'x',
    value,
    outputTputValue: value,
    inputTputValue: 0,
    cost,
    costInput: 0,
    costOutput: cost,
    tpPerMw: 0,
    inputTpPerMw: 0,
    outputTpPerMw: 0,
    concurrency: 0,
    nearestPoints: [],
  };
}

function makeSsrRows(
  triples: [number, InterpolatedResult | null, InterpolatedResult | null][],
): SsrInterpolatedRow[] {
  return triples.map(([target, a, b]) => ({ target, a, b }));
}

describe('compareMetaDescription', () => {
  it('leads with the throughput + cost stat when both dimensions differ', () => {
    // a=B200 34% faster, b=B300 12% cheaper, at the middle (default) target.
    const ssr = makeSsrRows([
      [20, ir(60, 2), ir(50, 1.7)],
      [40, ir(134, 1.12), ir(100, 1)], // 134/100 = +34%, 1.12/1.0 = +12%
      [60, ir(200, 0.9), ir(160, 0.85)],
    ]);
    const desc = compareMetaDescription(GLM, 'b200', 'b300', ssr);
    expect(desc).toBe(
      'B200 delivers 34% more tok/s/GPU than B300 on GLM-5; B300 is 12% cheaper per token. Verified open-source benchmarks from InferenceX by SemiAnalysis.',
    );
    expect(desc.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(desc.startsWith('B200 delivers 34% more tok/s/GPU than B300 on GLM-5')).toBe(true);
  });

  it('emits only the throughput clause when cost is within 1% (tied)', () => {
    const ssr = makeSsrRows([[40, ir(134, 1), ir(100, 1)]]);
    const desc = compareMetaDescription(GLM, 'b200', 'b300', ssr);
    expect(desc.includes('34% more tok/s/GPU')).toBe(true);
    expect(desc.includes('cheaper per token')).toBe(false);
    expect(desc.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('emits only the cost clause (with "than") when throughput is tied', () => {
    const ssr = makeSsrRows([[40, ir(100, 1.5), ir(100, 1)]]);
    const desc = compareMetaDescription(GLM, 'b200', 'b300', ssr);
    expect(desc).toContain('B300 is 50% cheaper per token than B200 on GLM-5');
    expect(desc.includes('more tok/s/GPU')).toBe(false);
    expect(desc.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('falls back to boilerplate when there is no comparable data', () => {
    const empty = compareMetaDescription(GLM, 'b200', 'b300', []);
    expect(empty.startsWith('B200 vs B300 inference benchmark on GLM-5')).toBe(true);
    expect(empty.includes('tok/s/GPU')).toBe(false);
    expect(empty.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);

    // One side missing at every target → still boilerplate.
    const oneSided = compareMetaDescription(
      GLM,
      'b200',
      'b300',
      makeSsrRows([[40, ir(100, 1), null]]),
    );
    expect(oneSided.startsWith('B200 vs B300 inference benchmark on GLM-5')).toBe(true);
  });

  it('falls back when both dimensions are within 1%', () => {
    const ssr = makeSsrRows([[40, ir(100, 1), ir(100, 1)]]);
    const desc = compareMetaDescription(GLM, 'b200', 'b300', ssr);
    expect(desc.startsWith('B200 vs B300 inference benchmark on GLM-5')).toBe(true);
  });

  it('prefers the middle (default) target row', () => {
    // Middle row has the data; outer rows are degenerate.
    const ssr = makeSsrRows([
      [20, null, null],
      [40, ir(134, 1.12), ir(100, 1)],
      [60, null, null],
    ]);
    const desc = compareMetaDescription(GLM, 'b200', 'b300', ssr);
    expect(desc.includes('34% more tok/s/GPU')).toBe(true);
  });

  it('falls back to an outer usable row when the middle target is degenerate', () => {
    const ssr = makeSsrRows([
      [20, ir(134, 1.12), ir(100, 1)],
      [40, null, null],
      [60, null, null],
    ]);
    const desc = compareMetaDescription(GLM, 'b200', 'b300', ssr);
    expect(desc.includes('34% more tok/s/GPU')).toBe(true);
  });

  it('stays ≤155 chars even with long GPU labels, model name, and huge ratios', () => {
    const ssr = makeSsrRows([[40, ir(9999, 99.9), ir(10, 0.5)]]);
    const desc = compareMetaDescription(DSV4, 'gb200', 'gb300', ssr);
    expect(desc.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    // A differentiating stat is still present (not the boilerplate).
    expect(desc.includes('tok/s/GPU') || desc.includes('cheaper per token')).toBe(true);
  });
});

describe('compareMetaDescriptionZh — structural 1:1 port', () => {
  const ssr = makeSsrRows([
    [20, ir(60, 2), ir(50, 1.7)],
    [40, ir(134, 1.12), ir(100, 1)],
    [60, ir(200, 0.9), ir(160, 0.85)],
  ]);

  it('surfaces the same numbers, model name, and GPU labels as the English version', () => {
    const zh = compareMetaDescriptionZh(GLM, 'b200', 'b300', ssr);
    expect(zh).toContain('GLM-5');
    expect(zh).toContain('B200');
    expect(zh).toContain('B300');
    expect(zh).toContain('34%');
    expect(zh).toContain('12%');
    expect(zh).toContain('每 GPU 吞吐量');
    expect(zh).toContain('每 token 成本');
    expect(zh.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('is stat-led exactly when the English version is (and boilerplate otherwise)', () => {
    // With data: both stat-led.
    const en = compareMetaDescription(GLM, 'b200', 'b300', ssr);
    const zh = compareMetaDescriptionZh(GLM, 'b200', 'b300', ssr);
    expect(en.includes('34%')).toBe(true);
    expect(zh.includes('34%')).toBe(true);

    // Without data: both boilerplate.
    const enFb = compareMetaDescription(GLM, 'b200', 'b300', []);
    const zhFb = compareMetaDescriptionZh(GLM, 'b200', 'b300', []);
    expect(enFb.includes('inference benchmark')).toBe(true);
    expect(zhFb.includes('推理基准测试')).toBe(true);
    expect(zhFb.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('stays ≤155 chars with long labels + huge ratios', () => {
    const big = makeSsrRows([[40, ir(9999, 99.9), ir(10, 0.5)]]);
    expect(compareMetaDescriptionZh(DSV4, 'gb200', 'gb300', big).length).toBeLessThanOrEqual(
      META_DESCRIPTION_MAX,
    );
  });
});
