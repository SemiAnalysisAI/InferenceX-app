import { describe, expect, it } from 'vitest';
import type { BenchmarkRow } from '@/lib/api';
import { preferVrDefaultRun, VR_DEFAULT_RUN } from './default-run-preference';

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 980200,
    hardware: 'vr200',
    model: 'dsv4',
    framework: 'trt',
    precision: 'fp4',
    spec_method: 'none',
    disagg: true,
    is_multinode: true,
    prefill_tp: 16,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 16,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 16,
    num_decode_gpu: 16,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 6,
    offload_mode: 'off',
    image: null,
    metrics: { tput_per_gpu: 800, p90_intvty: 200, server_gpu_cache_hit_rate: 0.9 },
    date: '2026-09-10',
    run_url: null,
    ...overrides,
  };
}

describe('VR default curve', () => {
  const preferred = row({
    id: 980000,
    date: VR_DEFAULT_RUN.date,
    run_url: null,
    metrics: { tput_per_gpu: 1000, p90_intvty: 250, server_gpu_cache_hit_rate: 0.95 },
  });

  it('replaces the whole affected line and preserves other chips, models and engines', () => {
    const unaffected = [
      row({ hardware: 'gb300' }),
      row({ hardware: 'b200' }),
      row({ model: 'dsr1' }),
      row({ framework: 'dynamo-trt' }),
      row({ precision: 'fp8' }),
      row({ offload_mode: 'on' }),
      row({ disagg: false }),
      row({ benchmark_type: 'single_turn', isl: 8192, osl: 1024 }),
    ];
    const latest = row({ prefill_tp: 32, decode_tp: 32 });
    const result = preferVrDefaultRun(
      [latest, ...unaffected],
      [preferred, row({ hardware: 'h200' })],
    );
    expect(result).toEqual([...unaffected, preferred]);
    expect(result.at(-1)).toBe(preferred);
    expect(preferred.metrics.server_gpu_cache_hit_rate).toBe(0.95);
    expect(latest.metrics.server_gpu_cache_hit_rate).toBe(0.9);
    unaffected.forEach((original, index) => expect(result[index]).toBe(original));
  });

  it.each([
    { candidate: [] },
    { candidate: [row()] },
    { candidate: [row({ ...preferred, date: '2026-09-08' })] },
    { candidate: [row({ ...preferred, curve_date: '2026-09-10' })] },
    { candidate: [row({ ...preferred, hardware: 'gb300' })] },
  ])('keeps the existing curve when the preferred snapshot is absent (%#)', ({ candidate }) => {
    const rows = [row()];
    expect(preferVrDefaultRun(rows, candidate)).toBe(rows);
  });

  it('preserves producer dates, public IDs and metrics in an imported logical snapshot', () => {
    const carried = row({
      ...preferred,
      id: 10,
      date: '2026-09-08',
      curve_date: '2026-09-09',
      workflow_run_id: 1,
      curve_workflow_run_id: 2,
    });
    const fresh = row({ ...preferred, id: 11, conc: 24, workflow_run_id: 2 });
    expect(preferVrDefaultRun([row()], [carried, fresh])).toEqual([carried, fresh]);
    expect(carried.date).toBe('2026-09-08');
    expect(carried.id).toBe(10);
    expect(carried.metrics.server_gpu_cache_hit_rate).toBe(0.95);
  });

  it('does not add VR to a response that has no matching line', () => {
    const rows = [row({ hardware: 'gb300' })];
    expect(preferVrDefaultRun(rows, [preferred])).toBe(rows);
  });
});
