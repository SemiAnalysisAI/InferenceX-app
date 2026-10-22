import { describe, expect, it } from 'vitest';
import type { StagedChartScope } from '@semianalysisai/inferencex-db/queries/staged-chart-links';
import { buildComparisonDates } from '@/components/inference/hooks/chart-data-core';
import {
  buildActiveComparisonIds,
  parseComparisonEntry,
} from '@/components/inference/utils/comparisonEntry';
import { buildStagedChartLinks } from './staged-chart-links';

const scope = (overrides: Partial<StagedChartScope> = {}): StagedChartScope => ({
  model: 'qwen3.5',
  hardware: 'mi355x',
  framework: 'mori-sglang',
  precision: 'fp8',
  spec_method: 'none',
  disagg: true,
  benchmark_type: 'agentic_traces',
  isl: null,
  osl: null,
  date: '2026-10-10',
  ...overrides,
});

const ORIGIN = 'https://staging.example.test';

describe('staged Pareto line links', () => {
  it('selects the actual workload, precision and exact run line even when it is the main run', () => {
    const [link] = buildStagedChartLinks(ORIGIN, '38295633957', [scope()]);
    const url = new URL(link!.url);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe('/inference');
    const p = url.searchParams;
    expect(p.get('g_model')).toBe('Qwen-3.5-397B-A17B');
    expect(p.get('i_seq')).toBe('agentic-traces');
    expect(p.get('i_prec')).toBe('fp8');
    expect(p.get('i_gpus')).toBe('mi355x_mori-sglang');
    expect(p.get('i_dates')).toBe('2026-10-10~r38295633957');
    const entries = buildComparisonDates(
      [p.get('i_gpus')!],
      [p.get('i_dates')!],
      { startDate: '', endDate: '' },
      '2026-10-10',
    );
    expect(entries.map(parseComparisonEntry)).toEqual([
      { raw: '2026-10-10~r38295633957', date: '2026-10-10', runId: '38295633957' },
    ]);
    expect([...buildActiveComparisonIds([p.get('i_gpus')!], entries)]).toEqual([
      '2026-10-10~r38295633957_mi355x_mori-sglang',
    ]);
  });

  it('keeps separate workloads, precisions and fixed-sequence spec lines but combines agentic point variants', () => {
    const links = buildStagedChartLinks(ORIGIN, '123', [
      scope(),
      scope({ spec_method: 'mtp' }),
      scope({ disagg: false }),
      scope({ precision: 'fp4' }),
      scope({ benchmark_type: 'single_turn', isl: 8192, osl: 1024 }),
      scope({ benchmark_type: 'single_turn', isl: 8192, osl: 1024, spec_method: 'mtp' }),
      scope({ benchmark_type: 'single_turn', isl: 1024, osl: 8192 }),
      scope({ model: 'dsv4' }),
    ]);
    expect(links).toHaveLength(6);
    const params = links.map((link) => new URL(link.url).searchParams);
    expect(params.filter((p) => p.get('i_seq') === 'agentic-traces')).toHaveLength(3);
    expect(params.some((p) => p.get('i_gpus') === 'mi355x_mori-sglang_mtp')).toBe(true);
    expect(params.every((p) => p.get('i_dates') === '2026-10-10~r123')).toBe(true);
    expect(new Set(links.map((link) => link.label)).size).toBe(6);
  });

  it('normalizes model/framework aliases with the same chart identity helpers', () => {
    const links = buildStagedChartLinks(ORIGIN, '123', [
      scope({ model: 'kimik2.6', framework: 'atom-disagg' }),
      scope({ model: 'kimik2.5', framework: 'mooncake-atom' }),
    ]);
    expect(links).toHaveLength(1);
    const p = new URL(links[0]!.url).searchParams;
    expect(p.get('g_model')).toBe('Kimi-K2.5');
    expect(p.get('i_gpus')).toBe('mi355x_mooncake-atom');
  });

  it('rejects unchartable scopes rather than linking to unrelated defaults', () => {
    expect(() => buildStagedChartLinks(ORIGIN, '123', [scope({ model: 'unknown' })])).toThrow(
      'Unsupported',
    );
    expect(() =>
      buildStagedChartLinks(ORIGIN, '123', [
        scope({ benchmark_type: 'single_turn', isl: 3, osl: 4 }),
      ]),
    ).toThrow('Unsupported');
    expect(() => buildStagedChartLinks(ORIGIN, 'invalid', [scope()])).toThrow('run ID');
  });
});
