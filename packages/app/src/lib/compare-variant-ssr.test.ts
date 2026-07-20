import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';

import {
  buildVariantBreadcrumbJsonLd,
  buildVariantJsonLd,
  computeVariantCompareImageRows,
  computeVariantCompareTableData,
  dateRangeForVariantPair,
  pickVariantPairDefaults,
  summarizeVariantSide,
  variantCompareNarrative,
} from './compare-variant-ssr';
import {
  buildVariantBreadcrumbJsonLdZh,
  buildVariantJsonLdZh,
  variantCompareNarrativeZh,
} from './compare-variant-ssr-zh';

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

let nextStubId = 1;

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

// Fixture with two precisions (fp8, bf16) and mtp/none spec methods on one hw.
function variantRows(): BenchmarkRow[] {
  return [
    // FP8, no spec decode, various concurrency
    stubRow({
      hardware: 'h200',
      precision: 'fp8',
      spec_method: 'none',
      conc: 16,
      metrics: { tput_per_gpu: 800, median_intvty: 10 },
      date: '2026-02-01',
    }),
    stubRow({
      hardware: 'h200',
      precision: 'fp8',
      spec_method: 'none',
      conc: 32,
      metrics: { tput_per_gpu: 600, median_intvty: 20 },
      date: '2026-02-15',
    }),
    stubRow({
      hardware: 'h200',
      precision: 'fp8',
      spec_method: 'none',
      conc: 64,
      metrics: { tput_per_gpu: 400, median_intvty: 30 },
      date: '2026-03-01',
    }),
    stubRow({
      hardware: 'h200',
      precision: 'fp8',
      spec_method: 'none',
      conc: 128,
      metrics: { tput_per_gpu: 200, median_intvty: 40 },
      date: '2026-03-15',
    }),
    // BF16, no spec decode
    stubRow({
      hardware: 'h200',
      precision: 'bf16',
      spec_method: 'none',
      conc: 16,
      metrics: { tput_per_gpu: 500, median_intvty: 10 },
      date: '2026-02-01',
    }),
    stubRow({
      hardware: 'h200',
      precision: 'bf16',
      spec_method: 'none',
      conc: 32,
      metrics: { tput_per_gpu: 350, median_intvty: 20 },
      date: '2026-02-15',
    }),
    stubRow({
      hardware: 'h200',
      precision: 'bf16',
      spec_method: 'none',
      conc: 64,
      metrics: { tput_per_gpu: 250, median_intvty: 30 },
      date: '2026-03-01',
    }),
    stubRow({
      hardware: 'h200',
      precision: 'bf16',
      spec_method: 'none',
      conc: 128,
      metrics: { tput_per_gpu: 120, median_intvty: 40 },
      date: '2026-03-15',
    }),
    // FP8 with MTP (speculative decoding)
    stubRow({
      hardware: 'h200',
      precision: 'fp8',
      spec_method: 'mtp',
      conc: 16,
      metrics: { tput_per_gpu: 1000, median_intvty: 10 },
      date: '2026-02-01',
    }),
    stubRow({
      hardware: 'h200',
      precision: 'fp8',
      spec_method: 'mtp',
      conc: 32,
      metrics: { tput_per_gpu: 750, median_intvty: 20 },
      date: '2026-03-01',
    }),
    stubRow({
      hardware: 'h200',
      precision: 'fp8',
      spec_method: 'mtp',
      conc: 64,
      metrics: { tput_per_gpu: 500, median_intvty: 30 },
      date: '2026-03-15',
    }),
  ];
}

const MODEL_SLUG = {
  slug: 'deepseek-r1',
  displayName: 'DeepSeek-R1-0528',
  dbKeys: ['dsr1'],
  label: 'DeepSeek R1',
  seoName: 'DeepSeek R1',
};

// ---------------------------------------------------------------------------
// pickVariantPairDefaults
// ---------------------------------------------------------------------------

describe('pickVariantPairDefaults', () => {
  it('precision: picks the sequence with the most overlapping variants', () => {
    const result = pickVariantPairDefaults(
      'precision',
      variantRows(),
      'h200',
      { precision: 'fp8' },
      { precision: 'bf16' },
    );
    expect(result.sequence).toBe('1k/1k');
    expect(result.precision).toBeNull();
  });

  it('spec-decode: picks the best sequence, precision fixed by caller', () => {
    const result = pickVariantPairDefaults(
      'spec-decode',
      variantRows(),
      'h200',
      { specMethod: 'mtp', precision: 'fp8' },
      { specMethod: 'none', precision: 'fp8' },
    );
    expect(result.sequence).toBe('1k/1k');
    expect(result.precision).toBe('fp8');
  });

  it('returns nulls when no data matches the hardware', () => {
    const result = pickVariantPairDefaults(
      'precision',
      variantRows(),
      'b200',
      { precision: 'fp8' },
      { precision: 'bf16' },
    );
    expect(result.sequence).toBeNull();
    expect(result.precision).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeVariantCompareTableData
// ---------------------------------------------------------------------------

describe('computeVariantCompareTableData', () => {
  it('returns rows with both sides for a precision comparison', () => {
    const result = computeVariantCompareTableData(
      variantRows(),
      'h200',
      '1k/1k',
      { precision: 'fp8' },
      { precision: 'bf16' },
    );
    expect(result.ssrRows.length).toBeGreaterThan(0);
    expect(result.interactivityRange.min).toBeLessThan(result.interactivityRange.max);
    // At least one row should have both sides
    const bothSides = result.ssrRows.filter((r) => r.a && r.b);
    expect(bothSides.length).toBeGreaterThan(0);
  });

  it('returns rows for a spec-decode comparison', () => {
    const result = computeVariantCompareTableData(
      variantRows(),
      'h200',
      '1k/1k',
      { specMethod: 'mtp', precision: 'fp8' },
      { specMethod: 'none', precision: 'fp8' },
    );
    expect(result.ssrRows.length).toBeGreaterThan(0);
  });

  it('returns empty when sequence is null', () => {
    const result = computeVariantCompareTableData(
      variantRows(),
      'h200',
      null,
      { precision: 'fp8' },
      { precision: 'bf16' },
    );
    expect(result.ssrRows).toEqual([]);
    expect(result.defaultTargets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeVariantCompareImageRows
// ---------------------------------------------------------------------------

describe('computeVariantCompareImageRows', () => {
  it('returns 17 evenly-spaced samples for precision comparison', () => {
    const rows = computeVariantCompareImageRows(
      variantRows(),
      'h200',
      '1k/1k',
      { precision: 'fp8' },
      { precision: 'bf16' },
      { min: 10, max: 40 },
    );
    expect(rows.length).toBe(17);
    expect(rows.at(0)?.target).toBe(10);
    expect(rows.at(-1)?.target).toBe(40);
  });

  it('returns empty when range is degenerate', () => {
    const rows = computeVariantCompareImageRows(
      variantRows(),
      'h200',
      '1k/1k',
      { precision: 'fp8' },
      { precision: 'bf16' },
      { min: 20, max: 20 },
    );
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeVariantSide
// ---------------------------------------------------------------------------

describe('summarizeVariantSide', () => {
  it('summarizes fp8 side', () => {
    const s = summarizeVariantSide(variantRows(), 'h200', { precision: 'fp8' });
    expect(s.hardware).toBe('h200');
    expect(s.configCount).toBeGreaterThan(0);
    expect(s.bestThroughputPerGpu).toBeGreaterThan(0);
  });

  it('returns zeros for unknown side filter', () => {
    const s = summarizeVariantSide(variantRows(), 'h200', { precision: 'int4' });
    expect(s.configCount).toBe(0);
    expect(s.bestThroughputPerGpu).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// dateRangeForVariantPair
// ---------------------------------------------------------------------------

describe('dateRangeForVariantPair', () => {
  it('returns the date range covering both sides', () => {
    const dr = dateRangeForVariantPair(
      variantRows(),
      'h200',
      { precision: 'fp8' },
      { precision: 'bf16' },
    );
    expect(dr.oldest).toBe('2026-02-01');
    expect(dr.newest).toBe('2026-03-15');
  });
});

// ---------------------------------------------------------------------------
// variantCompareNarrative
// ---------------------------------------------------------------------------

function makeNarrativeRows() {
  return [
    {
      target: 20,
      a: {
        hwKey: 'h200',
        resultKey: 'h200',
        value: 600,
        outputTputValue: 600,
        inputTputValue: 0,
        cost: 0.5,
        costInput: 0.5,
        costOutput: 0.5,
        tpPerMw: 100,
        inputTpPerMw: 0,
        outputTpPerMw: 100,
        concurrency: 32,
        nearestPoints: [],
      },
      b: {
        hwKey: 'h200',
        resultKey: 'h200',
        value: 350,
        outputTputValue: 350,
        inputTputValue: 0,
        cost: 0.8,
        costInput: 0.8,
        costOutput: 0.8,
        tpPerMw: 80,
        inputTpPerMw: 0,
        outputTpPerMw: 80,
        concurrency: 32,
        nearestPoints: [],
      },
    },
    {
      target: 30,
      a: {
        hwKey: 'h200',
        resultKey: 'h200',
        value: 400,
        outputTputValue: 400,
        inputTputValue: 0,
        cost: 0.6,
        costInput: 0.6,
        costOutput: 0.6,
        tpPerMw: 90,
        inputTpPerMw: 0,
        outputTpPerMw: 90,
        concurrency: 64,
        nearestPoints: [],
      },
      b: {
        hwKey: 'h200',
        resultKey: 'h200',
        value: 250,
        outputTputValue: 250,
        inputTputValue: 0,
        cost: 0.9,
        costInput: 0.9,
        costOutput: 0.9,
        tpPerMw: 70,
        inputTpPerMw: 0,
        outputTpPerMw: 70,
        concurrency: 64,
        nearestPoints: [],
      },
    },
  ];
}

describe('variantCompareNarrative', () => {
  it('returns non-empty deterministic strings for precision kind', () => {
    const range = { min: 10, max: 40 };
    const result = variantCompareNarrative(
      'precision',
      'DeepSeek R1',
      'H200',
      'FP8',
      'BF16',
      makeNarrativeRows(),
      range,
    );
    expect(result.length).toBeGreaterThan(0);
    // Deterministic: same inputs produce same output
    const result2 = variantCompareNarrative(
      'precision',
      'DeepSeek R1',
      'H200',
      'FP8',
      'BF16',
      makeNarrativeRows(),
      range,
    );
    expect(result).toEqual(result2);
    // Precision kind mentions quantization/evaluation
    expect(result.some((p) => /quantization|evaluation|accuracy|precision/i.test(p))).toBe(true);
  });

  it('returns non-empty deterministic strings for spec-decode kind', () => {
    const range = { min: 10, max: 40 };
    const result = variantCompareNarrative(
      'spec-decode',
      'DeepSeek R1',
      'H200',
      'MTP',
      'Off',
      makeNarrativeRows(),
      range,
    );
    expect(result.length).toBeGreaterThan(0);
    // Spec-decode kind mentions speculative decoding/draft tokens
    expect(result.some((p) => /speculative|draft/i.test(p))).toBe(true);
  });

  it('returns empty for empty ssrRows', () => {
    expect(
      variantCompareNarrative('precision', 'M', 'G', 'A', 'B', [], { min: 0, max: 100 }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// variantCompareNarrativeZh
// ---------------------------------------------------------------------------

describe('variantCompareNarrativeZh', () => {
  it('returns Chinese prose for precision kind', () => {
    const result = variantCompareNarrativeZh(
      'precision',
      'DeepSeek R1',
      'H200',
      'FP8',
      'BF16',
      makeNarrativeRows(),
      { min: 10, max: 40 },
    );
    expect(result.length).toBeGreaterThan(0);
    // Contains Chinese characters
    expect(result.some((p) => /[一-鿿]/.test(p))).toBe(true);
  });

  it('returns Chinese prose for spec-decode kind', () => {
    const result = variantCompareNarrativeZh(
      'spec-decode',
      'DeepSeek R1',
      'H200',
      'MTP',
      'Off',
      makeNarrativeRows(),
      { min: 10, max: 40 },
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => /[一-鿿]/.test(p))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildVariantJsonLd
// ---------------------------------------------------------------------------

describe('buildVariantJsonLd', () => {
  const summary = {
    hardware: 'h200',
    configCount: 4,
    bestThroughputPerGpu: 800,
    bestMedianTtft: 0.01,
    bestMedianTpot: 0.001,
  };

  it('builds precision JSON-LD with side labels (not HW vendor labels)', () => {
    const ssrRows = [
      {
        target: 20,
        a: {
          hwKey: 'h200',
          resultKey: 'h200',
          value: 600,
          outputTputValue: 600,
          inputTputValue: 0,
          cost: 0.5,
          costInput: 0.5,
          costOutput: 0.5,
          tpPerMw: 100,
          inputTpPerMw: 0,
          outputTpPerMw: 100,
          concurrency: 32,
          nearestPoints: [],
        },
        b: {
          hwKey: 'h200',
          resultKey: 'h200',
          value: 350,
          outputTputValue: 350,
          inputTputValue: 0,
          cost: 0.8,
          costInput: 0.8,
          costOutput: 0.8,
          tpPerMw: 80,
          inputTpPerMw: 0,
          outputTpPerMw: 80,
          concurrency: 32,
          nearestPoints: [],
        },
      },
    ];
    const ld = buildVariantJsonLd(
      'precision',
      MODEL_SLUG,
      'h200',
      'FP8',
      'BF16',
      'https://example.com/compare-precision/test',
      summary,
      summary,
      ssrRows,
    );
    expect(ld['@context']).toBe('https://schema.org');
    const graph = ld['@graph'] as Record<string, unknown>[];
    expect(graph.length).toBe(2); // ItemList + Dataset
    const itemList = graph[0] as Record<string, unknown>;
    expect(itemList['@type']).toBe('ItemList');
    // Side labels in ListItems
    const elements = itemList.itemListElement as { item: { name: string } }[];
    expect(elements[0].item.name).toBe('FP8');
    expect(elements[1].item.name).toBe('BF16');
    // Name mentions precision
    expect(String(itemList.name)).toContain('Precision comparison');
  });

  it('builds spec-decode JSON-LD', () => {
    const ld = buildVariantJsonLd(
      'spec-decode',
      MODEL_SLUG,
      'h200',
      'MTP',
      'Off',
      'https://example.com/compare-spec-decode/test',
      summary,
      summary,
      [],
    );
    const graph = ld['@graph'] as Record<string, unknown>[];
    const itemList = graph[0] as Record<string, unknown>;
    expect(String(itemList.name)).toContain('Speculative decoding comparison');
  });
});

// ---------------------------------------------------------------------------
// buildVariantJsonLdZh
// ---------------------------------------------------------------------------

describe('buildVariantJsonLdZh', () => {
  const summary = {
    hardware: 'h200',
    configCount: 4,
    bestThroughputPerGpu: 800,
    bestMedianTtft: 0.01,
    bestMedianTpot: 0.001,
  };

  it('carries inLanguage zh-CN', () => {
    const ld = buildVariantJsonLdZh(
      'precision',
      MODEL_SLUG,
      'h200',
      'FP8',
      'BF16',
      'https://example.com/zh/compare-precision/test',
      summary,
      summary,
      [],
    );
    const graph = ld['@graph'] as Record<string, unknown>[];
    const itemList = graph[0] as Record<string, unknown>;
    expect(itemList.inLanguage).toBe('zh-CN');
  });
});

// ---------------------------------------------------------------------------
// buildVariantBreadcrumbJsonLd
// ---------------------------------------------------------------------------

describe('buildVariantBreadcrumbJsonLd', () => {
  it('builds precision breadcrumb with correct index URL', () => {
    const bc = buildVariantBreadcrumbJsonLd('precision', 'FP8 vs BF16', 'https://example.com/test');
    const items = bc.itemListElement as { name: string; item: string }[];
    expect(items[1].name).toBe('Precision Comparisons');
    expect(items[1].item).toContain('compare-precision');
  });

  it('builds spec-decode breadcrumb with correct index URL', () => {
    const bc = buildVariantBreadcrumbJsonLd(
      'spec-decode',
      'MTP vs Off',
      'https://example.com/test',
    );
    const items = bc.itemListElement as { name: string; item: string }[];
    expect(items[1].name).toBe('Speculative Decoding Comparisons');
    expect(items[1].item).toContain('compare-spec-decode');
  });
});

// ---------------------------------------------------------------------------
// buildVariantBreadcrumbJsonLdZh
// ---------------------------------------------------------------------------

describe('buildVariantBreadcrumbJsonLdZh', () => {
  it('uses /zh/ prefixed URLs and Chinese labels', () => {
    const bc = buildVariantBreadcrumbJsonLdZh(
      'precision',
      'FP8 vs BF16',
      'https://example.com/zh/test',
    );
    const items = bc.itemListElement as { name: string; item: string }[];
    expect(items[0].name).toBe('首页'); // 首页
    expect(items[1].name).toBe('精度对比'); // 精度对比
    expect(items[1].item).toContain('/zh/compare-precision');
  });

  it('uses spec-decode Chinese labels', () => {
    const bc = buildVariantBreadcrumbJsonLdZh(
      'spec-decode',
      'MTP vs Off',
      'https://example.com/zh/test',
    );
    const items = bc.itemListElement as { name: string; item: string }[];
    expect(items[1].name).toBe('投机解码对比'); // 投机解码对比
    expect(items[1].item).toContain('/zh/compare-spec-decode');
  });
});
