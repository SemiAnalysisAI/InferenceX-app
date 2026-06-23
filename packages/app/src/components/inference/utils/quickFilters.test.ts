import { describe, it, expect } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import {
  EMPTY_QUICK_FILTERS,
  applyQuickFilters,
  computeAvailableQuickFilters,
  frameworkFamily,
  matchesQuickFilters,
  pointVendor,
  quickFiltersActive,
  type QuickFilters,
} from './quickFilters';

/** Minimal InferenceData stub — only the fields the predicate reads. */
function point(partial: Partial<InferenceData>): InferenceData {
  return { hwKey: 'h100', ...partial } as InferenceData;
}

const filters = (f: Partial<QuickFilters>): QuickFilters => ({ ...EMPTY_QUICK_FILTERS, ...f });

describe('pointVendor', () => {
  it('resolves vendor from the base GPU in the hardware key', () => {
    expect(pointVendor('h100_vllm_mtp')).toBe('NVIDIA');
    expect(pointVendor('mi300x_sglang')).toBe('AMD');
  });

  it('returns undefined for an unknown GPU base', () => {
    expect(pointVendor('madeupgpu_vllm')).toBeUndefined();
  });
});

describe('frameworkFamily', () => {
  it('maps base and variant engines to their family', () => {
    expect(frameworkFamily('vllm')).toBe('vllm');
    expect(frameworkFamily('dynamo-vllm')).toBe('vllm');
    expect(frameworkFamily('sglang')).toBe('sglang');
    expect(frameworkFamily('mori-sglang')).toBe('sglang');
    expect(frameworkFamily('trt')).toBe('trt');
    expect(frameworkFamily('trtllm')).toBe('trt');
    expect(frameworkFamily('dynamo-trt')).toBe('trt');
    expect(frameworkFamily('atom')).toBe('atom');
    expect(frameworkFamily('mooncake-atom')).toBe('atom');
  });

  it('returns undefined for unknown or missing frameworks', () => {
    expect(frameworkFamily('mystery-engine')).toBeUndefined();
    expect(frameworkFamily(undefined)).toBeUndefined();
  });
});

describe('computeAvailableQuickFilters', () => {
  it('reports present values per category in display order', () => {
    const points = [
      point({ hwKey: 'h100_vllm', framework: 'vllm', disagg: false, spec_decoding: 'none' }),
      point({
        hwKey: 'gb200_dynamo-trt',
        framework: 'dynamo-trt',
        disagg: true,
        spec_decoding: 'mtp',
      }),
      point({
        hwKey: 'mi355x_atom',
        framework: 'mooncake-atom',
        disagg: false,
        spec_decoding: 'none',
      }),
    ];
    expect(computeAvailableQuickFilters(points)).toEqual({
      vendors: ['NVIDIA', 'AMD'],
      frameworks: ['vllm', 'trt', 'atom'],
      disagg: ['agg', 'disagg'],
      spec: ['mtp', 'stp'],
    });
  });

  it('omits categories/values with no data', () => {
    const points = [
      point({ hwKey: 'h100_vllm', framework: 'vllm', disagg: false, spec_decoding: 'none' }),
    ];
    expect(computeAvailableQuickFilters(points)).toEqual({
      vendors: ['NVIDIA'],
      frameworks: ['vllm'],
      disagg: ['agg'],
      spec: ['stp'],
    });
  });

  it('returns all-empty for an empty point set', () => {
    expect(computeAvailableQuickFilters([])).toEqual({
      vendors: [],
      frameworks: [],
      disagg: [],
      spec: [],
    });
  });
});

describe('quickFiltersActive', () => {
  it('is false only when every category is empty', () => {
    expect(quickFiltersActive(EMPTY_QUICK_FILTERS)).toBe(false);
    expect(quickFiltersActive(filters({ vendors: ['AMD'] }))).toBe(true);
    expect(quickFiltersActive(filters({ frameworks: ['vllm'] }))).toBe(true);
    expect(quickFiltersActive(filters({ disagg: ['disagg'] }))).toBe(true);
    expect(quickFiltersActive(filters({ spec: ['mtp'] }))).toBe(true);
  });
});

describe('matchesQuickFilters', () => {
  it('matches everything when no filters are active', () => {
    expect(matchesQuickFilters(point({ hwKey: 'mi325x_sglang' }), EMPTY_QUICK_FILTERS)).toBe(true);
  });

  it('filters by vendor', () => {
    const f = filters({ vendors: ['NVIDIA'] });
    expect(matchesQuickFilters(point({ hwKey: 'h100_vllm' }), f)).toBe(true);
    expect(matchesQuickFilters(point({ hwKey: 'mi300x_sglang' }), f)).toBe(false);
  });

  it('treats multiple vendors as OR', () => {
    const f = filters({ vendors: ['NVIDIA', 'AMD'] });
    expect(matchesQuickFilters(point({ hwKey: 'h100' }), f)).toBe(true);
    expect(matchesQuickFilters(point({ hwKey: 'mi355x' }), f)).toBe(true);
  });

  it('filters by framework family', () => {
    const f = filters({ frameworks: ['trt'] });
    expect(matchesQuickFilters(point({ framework: 'dynamo-trt' }), f)).toBe(true);
    expect(matchesQuickFilters(point({ framework: 'trtllm' }), f)).toBe(true);
    expect(matchesQuickFilters(point({ framework: 'vllm' }), f)).toBe(false);
    expect(matchesQuickFilters(point({ framework: undefined }), f)).toBe(false);
  });

  it('filters by aggregation mode using the disagg flag', () => {
    expect(matchesQuickFilters(point({ disagg: true }), filters({ disagg: ['disagg'] }))).toBe(
      true,
    );
    expect(matchesQuickFilters(point({ disagg: true }), filters({ disagg: ['agg'] }))).toBe(false);
    expect(matchesQuickFilters(point({ disagg: false }), filters({ disagg: ['agg'] }))).toBe(true);
    // Missing disagg flag is treated as aggregated.
    expect(matchesQuickFilters(point({}), filters({ disagg: ['agg'] }))).toBe(true);
  });

  it('filters by spec-decoding via spec_decoding field or _mtp suffix', () => {
    const mtpFilter = filters({ spec: ['mtp'] });
    const stpFilter = filters({ spec: ['stp'] });
    expect(matchesQuickFilters(point({ spec_decoding: 'mtp' }), mtpFilter)).toBe(true);
    expect(matchesQuickFilters(point({ hwKey: 'h100_vllm_mtp' }), mtpFilter)).toBe(true);
    expect(matchesQuickFilters(point({ spec_decoding: 'none' }), mtpFilter)).toBe(false);
    expect(matchesQuickFilters(point({ spec_decoding: 'none' }), stpFilter)).toBe(true);
    expect(matchesQuickFilters(point({ hwKey: 'h100_vllm' }), stpFilter)).toBe(true);
  });

  it('treats non-standard spec methods (e.g. eagle) as spec-on (MTP), never STP', () => {
    const eagle = point({ hwKey: 'h200_trt_eagle', spec_decoding: 'eagle' });
    // Standard (STP) means `none` only — a speculative method groups under MTP.
    expect(matchesQuickFilters(eagle, filters({ spec: ['stp'] }))).toBe(false);
    expect(matchesQuickFilters(eagle, filters({ spec: ['mtp'] }))).toBe(true);
    expect(matchesQuickFilters(eagle, EMPTY_QUICK_FILTERS)).toBe(true);
    expect(computeAvailableQuickFilters([eagle]).spec).toEqual(['mtp']);
  });

  it('ANDs categories together', () => {
    const f = filters({ vendors: ['AMD'], disagg: ['disagg'], spec: ['stp'] });
    expect(
      matchesQuickFilters(
        point({ hwKey: 'mi300x_sglang', disagg: true, spec_decoding: 'none' }),
        f,
      ),
    ).toBe(true);
    // Right vendor + disagg, wrong spec.
    expect(
      matchesQuickFilters(point({ hwKey: 'mi300x_sglang', disagg: true, spec_decoding: 'mtp' }), f),
    ).toBe(false);
    // Wrong vendor.
    expect(
      matchesQuickFilters(point({ hwKey: 'h100_vllm', disagg: true, spec_decoding: 'none' }), f),
    ).toBe(false);
  });
});

describe('applyQuickFilters', () => {
  const data = [
    point({ hwKey: 'h100_vllm', disagg: false, spec_decoding: 'none' }),
    point({ hwKey: 'h100_vllm_mtp', disagg: false, spec_decoding: 'mtp' }),
    point({ hwKey: 'mi300x_sglang', disagg: true, spec_decoding: 'none' }),
  ];

  it('returns the same array reference when nothing is selected', () => {
    expect(applyQuickFilters(data, EMPTY_QUICK_FILTERS)).toBe(data);
  });

  it('narrows the list to matching points', () => {
    const result = applyQuickFilters(data, filters({ vendors: ['NVIDIA'], spec: ['stp'] }));
    expect(result.map((d) => d.hwKey)).toEqual(['h100_vllm']);
  });
});
