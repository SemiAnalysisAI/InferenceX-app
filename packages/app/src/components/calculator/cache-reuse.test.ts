import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';

import {
  buildCacheReuse,
  cacheReuseRecipes,
  cacheShareOf,
  recipeKeyOf,
  defaultCacheReuseGroup,
  formatShare,
  tieredRowCount,
} from './cache-reuse';
import type { GPUDataPoint } from './types';

function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    hardware: 'b200',
    framework: 'sglang',
    model: 'glm5.2',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    decode_tp: 8,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: null,
    osl: null,
    conc: 8,
    offload_mode: 'on',
    benchmark_type: 'agentic_traces',
    image: 'sglang:test',
    metrics: {},
    workers: null,
    date: '2026-09-17',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1',
    ...overrides,
  } as BenchmarkRow;
}

function makePoint(
  metrics: Record<string, number>,
  row: Partial<BenchmarkRow> = {},
  point: Partial<GPUDataPoint> = {},
): GPUDataPoint {
  return {
    hwKey: `${row.hardware ?? 'b200'}_${row.framework ?? 'sglang'}`,
    interactivity: 100,
    throughput: 1000,
    outputThroughput: 300,
    inputThroughput: 700,
    concurrency: row.conc ?? 8,
    tp: 8,
    precision: 'fp4',
    costh: 0.1,
    costr: 0.2,
    costhi: 0.05,
    costri: 0.1,
    costhOutput: 0.3,
    costrOutput: 0.6,
    tpPerMw: 0,
    inputTpPerMw: 0,
    outputTpPerMw: 0,
    sourceRow: makeRow({ ...row, metrics }),
    ...point,
  } as GPUDataPoint;
}

describe('cacheShareOf', () => {
  it('reproduces the article: B200 + SGLang at concurrency 8, 12, 16', () => {
    // Live GLM-5.2 rows, 2026-09-17. The article rounds the remainder to one decimal.
    const rows = [
      [8, 0.903, 0.06, 0.056],
      [12, 0.765, 0.192, 0.123],
      [16, 0.548, 0.403, 0.368],
    ] as const;
    const shares = rows.map(([conc, gpu, cpu, external]) =>
      cacheShareOf(
        makePoint(
          {
            server_gpu_cache_hit_rate: gpu,
            server_cpu_cache_hit_rate: cpu,
            server_external_cache_hit_rate: external,
          },
          { conc },
        ),
      ),
    );
    // The CPU-offload figure is the HiCache host tier the article plots; the
    // router's external figure is reported too and must not be added on top.
    expect(shares.map((s) => s?.hostSource)).toEqual(['cpu', 'cpu', 'cpu']);
    expect(shares.map((s) => formatShare(s!.hbm))).toEqual(['90.3%', '76.5%', '54.8%']);
    expect(shares.map((s) => formatShare(s!.host))).toEqual(['6.0%', '19.2%', '40.3%']);
    expect(shares.map((s) => formatShare(s!.unreused))).toEqual(['3.7%', '4.3%', '4.9%']);
  });

  it('falls back to the external tier when no CPU rate is reported', () => {
    const share = cacheShareOf(
      makePoint({ server_gpu_cache_hit_rate: 0.7, server_external_cache_hit_rate: 0.2 }),
    );
    expect(share).toMatchObject({ hbm: 0.7, host: 0.2, hostSource: 'external', combined: false });
    expect(share!.unreused).toBeCloseTo(0.1);
  });

  it('draws TensorRT-LLM with offload as one combined reused segment', () => {
    const share = cacheShareOf(
      makePoint(
        { server_gpu_cache_hit_rate: 0.85, server_cpu_cache_hit_rate: 0.3 },
        { framework: 'trt', offload_mode: 'on' },
      ),
    );
    expect(share).toMatchObject({ hbm: 0.85, host: 0, combined: true, hostSource: null });
    expect(share!.unreused).toBeCloseTo(0.15);
  });

  it('keeps TensorRT-LLM without offload as a plain HBM figure', () => {
    const share = cacheShareOf(
      makePoint({ server_gpu_cache_hit_rate: 0.9 }, { framework: 'trt', offload_mode: 'off' }),
    );
    expect(share).toMatchObject({ hbm: 0.9, host: 0, combined: false });
  });

  it('reads the canonical offload descriptor over the legacy mode flag', () => {
    const share = cacheShareOf(
      makePoint(
        {
          server_gpu_cache_hit_rate: 0.8,
          server_cpu_cache_hit_rate: 0.1,
          // The descriptor is a string inside the numeric metrics bag on real rows.
          kv_offloading: 'none' as unknown as number,
        },
        { framework: 'trt', offload_mode: 'on' },
      ),
    );
    expect(share!.combined).toBe(false);
  });

  it('clamps an over-reported runtime figure and keeps the raw total for the caveat', () => {
    // GB300 Dynamo rows report 1.012 on occasion.
    const share = cacheShareOf(makePoint({ server_gpu_cache_hit_rate: 1.012 }));
    expect(share).toMatchObject({ hbm: 1, host: 0, unreused: 0 });
    expect(share!.reportedTotal).toBeCloseTo(1.012);

    const both = cacheShareOf(
      makePoint({ server_gpu_cache_hit_rate: 0.9, server_external_cache_hit_rate: 0.3 }),
    );
    expect(both!.host).toBeCloseTo(0.1);
    expect(both!.unreused).toBe(0);
    expect(both!.reportedTotal).toBeCloseTo(1.2);
  });

  it('carries the theoretical ceiling and returns null without any tier', () => {
    expect(
      cacheShareOf(makePoint({ server_gpu_cache_hit_rate: 0.5, theoretical_cache_hit_rate: 0.97 }))!
        .theoretical,
    ).toBe(0.97);
    // A GB300 row scraped only at the frontend: ceiling but no measured tier.
    expect(cacheShareOf(makePoint({ theoretical_cache_hit_rate: 0.97 }))).toBeNull();
    expect(cacheShareOf(makePoint({ tput_per_gpu: 100 }))).toBeNull();
    expect(
      cacheShareOf({ ...makePoint({ server_gpu_cache_hit_rate: 0.5 }), sourceRow: undefined }),
    ).toBeNull();
  });
});

describe('buildCacheReuse', () => {
  const official = [
    makePoint({ server_gpu_cache_hit_rate: 0.9, server_cpu_cache_hit_rate: 0.05 }, { conc: 8 }),
    makePoint({ server_gpu_cache_hit_rate: 0.7, server_cpu_cache_hit_rate: 0.2 }, { conc: 16 }),
    makePoint({ tput_per_gpu: 1 }, { conc: 32 }),
  ];
  const config = { hwKey: 'b200_sglang' };

  it('lists one official bar per concurrency and reports rows without tiers', () => {
    const result = buildCacheReuse({ official, config });
    expect(result.series).toEqual([{ key: 'official', label: 'official' }]);
    expect(result.concurrencies).toEqual([8, 16, 32]);
    expect(result.bars.map((b) => [b.concurrency, b.share.hbm])).toEqual([
      [8, 0.9],
      [16, 0.7],
    ]);
    expect(result.unmeasured).toMatchObject([{ seriesKey: 'official', concurrency: 32 }]);
    expect(result.anyCombined).toBe(false);
  });

  it('adds each unofficial run on the same hardware as its own series', () => {
    const result = buildCacheReuse({
      official,
      config,
      overlay: {
        b200_sglang__run0: [
          makePoint(
            { server_gpu_cache_hit_rate: 0.95, server_cpu_cache_hit_rate: 0.02 },
            { conc: 8 },
          ),
          makePoint({ server_gpu_cache_hit_rate: 0.6 }, { conc: 24 }),
        ],
        // Another chip in the same run: not this configuration, so not drawn.
        mi355x_sglang__run0: [
          makePoint({ server_gpu_cache_hit_rate: 0.5 }, { hardware: 'mi355x' }),
        ],
        b200_sglang__run1: [makePoint({ server_gpu_cache_hit_rate: 0.8 }, { conc: 8 })],
      },
      overlayMeta: {
        b200_sglang__run0: { hwKey: 'b200_sglang', runIndex: 0 },
        mi355x_sglang__run0: { hwKey: 'mi355x_sglang', runIndex: 0 },
        b200_sglang__run1: { hwKey: 'b200_sglang', runIndex: 1 },
      },
      overlayLabels: { 0: 'perf/hicache' },
    });
    expect(result.series.map((s) => s.key)).toEqual(['official', 'run:0', 'run:1']);
    expect(result.series[1]).toMatchObject({ label: '✕ perf/hicache', runIndex: 0 });
    expect(result.series[2].label).toBe('✕ run 2');
    expect(result.concurrencies).toEqual([8, 16, 24, 32]);
    expect(result.bars.filter((b) => b.seriesKey === 'run:0').map((b) => b.concurrency)).toEqual([
      8, 24,
    ]);
    expect(result.bars.find((b) => b.seriesKey === 'run:0' && b.concurrency === 8)?.runIndex).toBe(
      0,
    );
  });

  it('gives an overlay-only configuration the full bar width', () => {
    const result = buildCacheReuse({
      official: [],
      config: { hwKey: 'mi355x_sglang' },
      overlay: {
        mi355x_sglang__run0: [
          makePoint({ server_gpu_cache_hit_rate: 0.5 }, { hardware: 'mi355x', conc: 8 }),
        ],
      },
      overlayMeta: { mi355x_sglang__run0: { hwKey: 'mi355x_sglang', runIndex: 0 } },
    });
    expect(result.series.map((s) => s.key)).toEqual(['run:0']);
    expect(result.bars.map((b) => b.seriesKey)).toEqual(['run:0']);
    expect(result.unmeasured).toEqual([]);
  });

  it('matches overlay groups on precision when the page splits by precision', () => {
    const result = buildCacheReuse({
      official,
      config: { hwKey: 'b200_sglang', precision: 'fp4' },
      overlay: {
        b200_sglang__fp8__run0: [makePoint({ server_gpu_cache_hit_rate: 0.5 }, { conc: 8 })],
        b200_sglang__fp4__run0: [makePoint({ server_gpu_cache_hit_rate: 0.6 }, { conc: 8 })],
      },
      overlayMeta: {
        b200_sglang__fp8__run0: { hwKey: 'b200_sglang', precision: 'fp8', runIndex: 0 },
        b200_sglang__fp4__run0: { hwKey: 'b200_sglang', precision: 'fp4', runIndex: 0 },
      },
    });
    expect(result.bars.filter((b) => b.seriesKey === 'run:0')).toHaveLength(1);
    expect(result.bars.find((b) => b.seriesKey === 'run:0')?.share.hbm).toBe(0.6);
  });
});

describe('defaultCacheReuseGroup', () => {
  const tiered = (n: number, hardware: string, framework: string) =>
    Array.from({ length: n }, (_, i) =>
      makePoint({ server_gpu_cache_hit_rate: 0.5 }, { hardware, framework, conc: i + 1 }),
    );

  it('opens on the configuration with the most tiered rows', () => {
    const groups = {
      b300_sglang: tiered(3, 'b300', 'sglang'),
      b200_vllm: tiered(5, 'b200', 'vllm'),
    };
    const meta = { b300_sglang: { hwKey: 'b300_sglang' }, b200_vllm: { hwKey: 'b200_vllm' } };
    expect(defaultCacheReuseGroup(groups, meta)).toBe('b200_vllm');
  });

  it('prefers SGLang on a tie and returns null when nothing reports a tier', () => {
    const groups = {
      b200_trt: tiered(4, 'b200', 'trt'),
      b200_sglang: tiered(4, 'b200', 'sglang'),
      h100_sglang: [makePoint({ tput_per_gpu: 1 }, { hardware: 'h100' })],
    };
    const meta = {
      b200_trt: { hwKey: 'b200_trt' },
      b200_sglang: { hwKey: 'b200_sglang' },
      h100_sglang: { hwKey: 'h100_sglang' },
    };
    expect(defaultCacheReuseGroup(groups, meta)).toBe('b200_sglang');
    expect(tieredRowCount(groups.h100_sglang)).toBe(0);
    expect(defaultCacheReuseGroup({ h100_sglang: groups.h100_sglang }, meta)).toBeNull();
  });
});

describe('recipe identity', () => {
  // Kimi K3 / H200 vLLM, 2026-09: three recipes share concurrency 8 and 10 —
  // 4×DEP8 with offload off and on, and 2×TP16. Keyed on concurrency alone the
  // chart kept whichever row came first and mixed recipes along one sweep.
  const dep8 = {
    is_multinode: true,
    prefill_tp: 8,
    prefill_ep: 32,
    prefill_dp_attention: true,
    prefill_num_workers: 4,
    decode_tp: 8,
    decode_ep: 32,
    decode_dp_attention: true,
    decode_num_workers: 4,
    num_prefill_gpu: 32,
    num_decode_gpu: 32,
    spec_method: 'mtp',
  };
  const tp16 = {
    ...dep8,
    prefill_tp: 16,
    decode_tp: 16,
    prefill_num_workers: 2,
    decode_num_workers: 2,
  };
  const off = (conc: number, gpu: number) =>
    makePoint({ server_gpu_cache_hit_rate: gpu }, { ...dep8, conc, offload_mode: 'off' });
  const on = (conc: number, gpu: number, cpu: number) =>
    makePoint(
      { server_gpu_cache_hit_rate: gpu, server_cpu_cache_hit_rate: cpu },
      { ...dep8, conc, offload_mode: 'on' },
    );
  const wide = (conc: number, gpu: number) =>
    makePoint({ server_gpu_cache_hit_rate: gpu }, { ...tp16, conc, offload_mode: 'off' });
  // Interleaved the way the API returns them: offload-on first at conc 8.
  const official = [
    off(4, 0.6),
    wide(4, 0.62),
    on(8, 0.55, 0.11),
    off(8, 0.54),
    wide(8, 0.5),
    off(10, 0.53),
    on(10, 0.52, 0.12),
    on(16, 0.38, 0.16),
    on(24, 0.33, 0.22),
  ];
  const config = { hwKey: 'h200_vllm' };

  it('tells recipes apart by layout and offload, not by concurrency', () => {
    expect(recipeKeyOf(off(8, 0.5))).toBe(recipeKeyOf(off(16, 0.4)));
    expect(recipeKeyOf(off(8, 0.5))).not.toBe(recipeKeyOf(on(8, 0.5, 0.1)));
    expect(recipeKeyOf(off(8, 0.5))).not.toBe(recipeKeyOf(wide(8, 0.5)));
  });

  it('never mixes recipes along one sweep', () => {
    const result = buildCacheReuse({ official, config });
    const plotted = new Set(result.bars.map((b) => recipeKeyOf(b.point)));
    expect(plotted.size).toBe(1);
  });

  it('defaults to the recipe with the most tiered rows and keeps all of its rows', () => {
    const result = buildCacheReuse({ official, config });
    expect(result.recipe).toBe(recipeKeyOf(on(8, 0, 0)));
    expect(result.bars.map((b) => b.concurrency)).toEqual([8, 10, 16, 24]);
    expect(result.bars.every((b) => b.share.host > 0)).toBe(true);
  });

  it('plots the requested recipe and falls back when it is unknown', () => {
    const offKey = recipeKeyOf(off(8, 0));
    const picked = buildCacheReuse({ official, config, recipe: offKey });
    expect(picked.recipe).toBe(offKey);
    expect(picked.bars.map((b) => [b.concurrency, b.share.hbm])).toEqual([
      [4, 0.6],
      [8, 0.54],
      [10, 0.53],
    ]);
    expect(buildCacheReuse({ official, config, recipe: 'nope' }).recipe).toBe(
      recipeKeyOf(on(8, 0, 0)),
    );
  });

  it('lists each recipe once with a readable label and its row counts', () => {
    const recipes = cacheReuseRecipes(official);
    expect(recipes.map((r) => [r.rows, r.tiered])).toEqual([
      [4, 4],
      [3, 3],
      [2, 2],
    ]);
    expect(recipes[0]!.label).toContain('KV offload');
    expect(recipes[1]!.label).toContain('no offload');
    expect(new Set(recipes.map((r) => r.label)).size).toBe(3);
  });

  it('selects recipes in an overlay-only configuration', () => {
    const result = buildCacheReuse({
      official: [],
      config,
      recipe: recipeKeyOf(off(8, 0)),
      overlay: { h200_vllm__run0: official },
      overlayMeta: { h200_vllm__run0: { hwKey: 'h200_vllm', runIndex: 0 } },
    });
    expect(result.recipes).toHaveLength(3);
    expect(result.recipe).toBe(recipeKeyOf(off(8, 0)));
    expect(result.bars.map((bar) => [bar.concurrency, bar.share.hbm])).toEqual([
      [4, 0.6],
      [8, 0.54],
      [10, 0.53],
    ]);
  });

  it('keeps a run on its own recipe when it did not measure the plotted one', () => {
    const run = [wide(8, 0.7), wide(16, 0.6)];
    const result = buildCacheReuse({
      official,
      config,
      overlay: { h200_vllm__run0: run },
      overlayMeta: { h200_vllm__run0: { hwKey: 'h200_vllm', runIndex: 0 } as never },
    });
    const runBars = result.bars.filter((b) => b.seriesKey === 'run:0');
    expect(runBars.map((b) => b.concurrency)).toEqual([8, 16]);
  });
});
