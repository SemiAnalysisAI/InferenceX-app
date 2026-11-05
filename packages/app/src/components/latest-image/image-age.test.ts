import { describe, expect, it } from 'vitest';
import {
  imageAgeHistory,
  imageAgeSummary,
  matchesImageFilters,
  type ImageAgeObservation,
  type ImageFilters,
} from './image-age';

const row: ImageAgeObservation = {
  model: 'dsr1',
  hardware: 'b200',
  framework: 'sglang',
  precision: 'fp8',
  spec_method: 'none',
  disagg: false,
  benchmark_type: 'single_turn',
  isl: 8192,
  osl: 1024,
  date: '2026-07-01',
};
const filters: ImageFilters = {
  model: 'all',
  hardware: 'all',
  precision: 'all',
  spec: 'all',
  nodeType: 'single',
  sequence: '8k/1k',
  frameworks: [],
};

describe('image age p90', () => {
  it('uses the ninth ordered age for ten configurations, not the maximum or interpolated quantile', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      ...row,
      hardware: `gpu-${i}`,
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    }));
    expect(imageAgeSummary(rows, '2026-10-10')).toEqual({
      date: '2026-10-10',
      p90AgeDays: 8,
      configurationCount: 10,
    });
    expect(imageAgeSummary([...rows, ...rows, rows[0]], '2026-10-10')).toEqual(
      imageAgeSummary(rows, '2026-10-10'),
    );
  });

  it('preserves no-data as null, excludes future observations, and includes zero-day ages', () => {
    expect(imageAgeSummary([], '2026-07-01').p90AgeDays).toBeNull();
    expect(imageAgeSummary([row], '2026-06-30').configurationCount).toBe(0);
    expect(imageAgeSummary([row], '2026-07-01').p90AgeDays).toBe(0);
    expect(imageAgeSummary([{ ...row, date: 'invalid' }], '2026-07-01').p90AgeDays).toBeNull();
  });

  it('returns exactly 90 UTC days, retains old seeds, and resets only when a submission occurs', () => {
    const history = imageAgeHistory([{ ...row, date: '2026-10-12' }], [row], '2026-10-13');
    expect(history).toHaveLength(90);
    expect(history[0]).toEqual({ date: '2026-07-16', p90AgeDays: 15, configurationCount: 1 });
    expect(history.at(-3)?.p90AgeDays).toBe(102);
    expect(history.at(-2)?.p90AgeDays).toBe(0);
    expect(history.at(-1)).toEqual({ date: '2026-10-13', p90AgeDays: 1, configurationCount: 1 });
  });

  it('does not project current configurations backward or use future data', () => {
    const history = imageAgeHistory(
      [
        { ...row, date: '2026-10-12' },
        { ...row, hardware: 'h200', date: '2026-10-14' },
      ],
      [{ ...row, hardware: 'h200', date: '2026-10-01' }],
      '2026-10-13',
    );
    expect(history[0]).toMatchObject({ p90AgeDays: null, configurationCount: 0 });
    expect(history.at(-3)).toMatchObject({ p90AgeDays: null, configurationCount: 0 });
    expect(history.at(-1)).toMatchObject({ p90AgeDays: 1, configurationCount: 1 });
  });

  it('ends on the summary and ignores configurations missing from the current rows', () => {
    const rows = [
      { ...row, spec_method: 'draft_model', date: '2026-10-10' },
      { ...row, hardware: 'h200', date: '2026-10-01' },
    ];
    const history = imageAgeHistory(
      rows,
      [
        { ...row, spec_method: 'mtp', date: '2026-07-01' },
        { ...row, spec_method: 'draft_model', date: '2026-09-01' },
        { ...row, hardware: 'h200', date: '2026-10-05' },
      ],
      '2026-10-13',
    );
    expect(history.at(-1)).toEqual(imageAgeSummary(rows, '2026-10-13'));
    expect(history.at(-1)).toEqual({ date: '2026-10-13', p90AgeDays: 12, configurationCount: 2 });
    expect(history.find((p) => p.date === '2026-09-15')).toEqual({
      date: '2026-09-15',
      p90AgeDays: 14,
      configurationCount: 1,
    });
  });

  it('keeps framework, node type, precision, speculation, and scenario identities distinct', () => {
    expect(
      imageAgeSummary(
        [
          row,
          { ...row, framework: 'vllm' },
          { ...row, disagg: true },
          { ...row, precision: 'fp4' },
          { ...row, spec_method: 'mtp' },
          { ...row, benchmark_type: 'agentic_traces', isl: null, osl: null },
        ],
        '2026-10-13',
      ).configurationCount,
    ).toBe(6);
  });

  it('shares all table filters, framework normalization, and active catalog rules', () => {
    expect(matchesImageFilters(row, filters)).toBe(true);
    for (const change of [
      { model: 'MiniMax-M3' },
      { hardware: 'h200' },
      { precision: 'fp4' },
      { spec: 'mtp' },
      { nodeType: 'disagg' as const },
      { sequence: 'agentic-traces' },
      { frameworks: ['vllm'] },
    ])
      expect(matchesImageFilters(row, { ...filters, ...change })).toBe(false);
    expect(
      matchesImageFilters(
        { ...row, framework: 'mori-sglang' },
        { ...filters, frameworks: ['sglang'] },
      ),
    ).toBe(true);
    expect(matchesImageFilters({ ...row, model: 'minimaxm3' }, filters)).toBe(false);
    expect(matchesImageFilters({ ...row, model: 'qwen3.5' }, filters)).toBe(false);
    expect(
      matchesImageFilters(
        { ...row, model: 'qwen3.5', benchmark_type: 'agentic_traces', isl: null, osl: null },
        { ...filters, sequence: 'agentic-traces' },
      ),
    ).toBe(true);
    expect(matchesImageFilters({ ...row, model: 'brand-new-model' }, filters)).toBe(true);
  });
});
