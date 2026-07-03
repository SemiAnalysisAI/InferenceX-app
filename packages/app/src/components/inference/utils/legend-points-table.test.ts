import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import {
  buildLegendPointsRows,
  formatRowValue,
  pointDetailHref,
  sortLegendPointsRows,
} from '@/components/inference/utils/legend-points-table';

// ---------------------------------------------------------------------------
// fixture factory (mirrors tooltip-utils.test.ts)
// ---------------------------------------------------------------------------
function pt(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2025-06-15',
    x: 100,
    y: 500,
    tp: 8,
    conc: 64,
    hwKey: 'b300_vllm',
    precision: 'fp4',
    tput_per_gpu: 1234.5678,
    median_intvty: 45.2,
    p90_intvty: 38.1,
    median_ttft: 0.42,
    p90_ttft: 0.87,
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

// ===========================================================================
// pointDetailHref
// ===========================================================================
describe('pointDetailHref', () => {
  it('agentic point with numeric id links to the in-app detail page', () => {
    const d = pt({ benchmark_type: 'agentic_traces', id: 206863 });
    expect(pointDetailHref(d, false)).toEqual({
      href: '/inference/agentic/206863',
      isExternal: false,
    });
  });

  it('fixed-seq point links to its GitHub Actions run (repo URL rewritten)', () => {
    const d = pt({
      benchmark_type: 'single_turn',
      run_url: 'https://github.com/InferenceMAX/InferenceMAX/actions/runs/123',
    });
    expect(pointDetailHref(d, false)).toEqual({
      href: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
      isExternal: true,
    });
  });

  it('agentic point without a numeric id falls back to the run URL', () => {
    const d = pt({
      benchmark_type: 'agentic_traces',
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/9',
    });
    expect(pointDetailHref(d, false)).toEqual({
      href: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/9',
      isExternal: true,
    });
  });

  it('returns no link when there is neither an id nor a run URL', () => {
    expect(pointDetailHref(pt(), false)).toEqual({ href: null, isExternal: false });
  });

  it('does not build an /agentic/<id> link for a non-persisted id (0 / NaN)', () => {
    // `typeof id === 'number'` accepted these; isPersistedBenchmarkId rejects
    // them so we never link to /inference/agentic/0 or /inference/agentic/NaN.
    for (const badId of [0, Number.NaN]) {
      const d = pt({ benchmark_type: 'agentic_traces', id: badId });
      expect(pointDetailHref(d, false)).toEqual({ href: null, isExternal: false });
    }
  });

  it('overlay points never get a link (no DB benchmark id)', () => {
    const d = pt({
      benchmark_type: 'agentic_traces',
      id: 42,
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1',
    });
    expect(pointDetailHref(d, true)).toEqual({ href: null, isExternal: false });
  });
});

// ===========================================================================
// buildLegendPointsRows
// ===========================================================================
describe('buildLegendPointsRows', () => {
  it('maps official point fields onto table rows', () => {
    const rows = buildLegendPointsRows(
      [pt({ benchmark_type: 'agentic_traces', id: 1, ep: 8, dp_attention: true })],
      false,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      conc: 64,
      parallelism: 'DEP8',
      precision: 'fp4',
      offload: null,
      tputPerGpu: 1234.5678,
      p50Intvty: 45.2,
      p90Intvty: 38.1,
      p50Ttft: 0.42,
      p90Ttft: 0.87,
      href: '/inference/agentic/1',
      isExternal: false,
    });
  });

  it('default-sorts by concurrency ascending', () => {
    const rows = buildLegendPointsRows(
      [pt({ conc: 32 }), pt({ conc: 4 }), pt({ conc: 16 })],
      false,
    );
    expect(rows.map((r) => r.conc)).toEqual([4, 16, 32]);
  });

  it('keeps agentic offload on/off row pairs adjacent and deterministic', () => {
    const rows = buildLegendPointsRows(
      [
        pt({ conc: 8, offload_mode: 'on' }),
        pt({ conc: 4, offload_mode: 'off' }),
        pt({ conc: 4, offload_mode: 'on' }),
      ],
      false,
    );
    expect(rows.map((r) => [r.conc, r.offload])).toEqual([
      [4, 'OFF'],
      [4, 'ON'],
      [8, 'ON'],
    ]);
  });

  it('nulls out metrics missing on old points instead of coercing to 0', () => {
    const rows = buildLegendPointsRows(
      [pt({ tput_per_gpu: undefined, p90_intvty: undefined, p90_ttft: Number.NaN })],
      false,
    );
    expect(rows[0].tputPerGpu).toBeNull();
    expect(rows[0].p90Intvty).toBeNull();
    expect(rows[0].p90Ttft).toBeNull();
  });

  it('treats the transform\'s "?? 0" coercion of absent metrics as missing', () => {
    // Agentic rows have no median_* keys in metrics JSONB; benchmark-transform
    // fills them with 0. These metrics are strictly positive when measured.
    const rows = buildLegendPointsRows([pt({ median_intvty: 0, median_ttft: 0 })], false);
    expect(rows[0].p50Intvty).toBeNull();
    expect(rows[0].p50Ttft).toBeNull();
  });

  it('overlay rows carry metrics but no links', () => {
    const rows = buildLegendPointsRows(
      [pt({ id: 7, benchmark_type: 'agentic_traces', run_url: 'https://github.com/x/y/runs/1' })],
      true,
    );
    expect(rows[0].href).toBeNull();
    expect(rows[0].tputPerGpu).toBe(1234.5678);
  });
});

// ===========================================================================
// sortLegendPointsRows
// ===========================================================================
describe('sortLegendPointsRows', () => {
  const rows = buildLegendPointsRows(
    [
      pt({ conc: 4, tput_per_gpu: 300 }),
      pt({ conc: 16, tput_per_gpu: undefined }),
      pt({ conc: 8, tput_per_gpu: 900 }),
    ],
    false,
  );

  it('sorts numeric columns in both directions', () => {
    expect(sortLegendPointsRows(rows, 'tputPerGpu', 'asc').map((r) => r.conc)).toEqual([4, 8, 16]);
    expect(sortLegendPointsRows(rows, 'tputPerGpu', 'desc').map((r) => r.conc)).toEqual([8, 4, 16]);
  });

  it('always sorts null metrics last', () => {
    for (const dir of ['asc', 'desc'] as const) {
      expect(sortLegendPointsRows(rows, 'tputPerGpu', dir).at(-1)?.conc).toBe(16);
    }
  });

  it('sorts string columns alphabetically', () => {
    const mixed = buildLegendPointsRows(
      [pt({ conc: 1, ep: 8 }), pt({ conc: 2, tp: 4, ep: undefined })],
      false,
    );
    expect(sortLegendPointsRows(mixed, 'parallelism', 'asc').map((r) => r.parallelism)).toEqual([
      '4',
      'TEP8',
    ]);
  });

  it('does not mutate the input array', () => {
    const before = rows.map((r) => r.conc);
    sortLegendPointsRows(rows, 'tputPerGpu', 'desc');
    expect(rows.map((r) => r.conc)).toEqual(before);
  });
});

// ===========================================================================
// formatRowValue
// ===========================================================================
describe('formatRowValue', () => {
  it('renders em dash for missing values', () => {
    expect(formatRowValue(null)).toBe('—');
  });

  it('caps at 3 decimals like the scatter tooltip', () => {
    expect(formatRowValue(1234.5678)).toBe('1234.568');
    expect(formatRowValue(0.42)).toBe('0.42');
  });

  it('comma-formats large values like the scatter tooltip', () => {
    expect(formatRowValue(123456.7)).toBe('123,456.7');
  });
});
