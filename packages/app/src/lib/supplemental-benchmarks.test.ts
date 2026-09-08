import { describe, expect, it } from 'vitest';

import {
  SUPPLEMENTAL_BENCHMARK_ROWS,
  supportsChartTokenMetric,
  supportsTokenMetric,
  withSupplementalAvailability,
  withSupplementalBenchmarkHistory,
  withSupplementalBenchmarks,
} from './supplemental-benchmarks';

describe('supplemental benchmark snapshots', () => {
  it('ships every supplied Jalapeño, July VR200, and TPUv7 point', () => {
    expect(SUPPLEMENTAL_BENCHMARK_ROWS).toHaveLength(57);
    expect(SUPPLEMENTAL_BENCHMARK_ROWS.filter((row) => row.hardware === 'jalapeno')).toHaveLength(
      36,
    );
    expect(SUPPLEMENTAL_BENCHMARK_ROWS.filter((row) => row.hardware === 'vr200')).toHaveLength(14);
    expect(
      new Set(
        SUPPLEMENTAL_BENCHMARK_ROWS.filter((row) => row.hardware === 'vr200').map(
          (row) => row.run_url,
        ),
      ),
    ).toEqual(
      new Set([
        'https://www.coreweave.com/blog/nvidia-vera-rubin-nvl72-on-coreweave-10x-more-tokens-per-megawatt-than-blackwell',
      ]),
    );
  });

  it('keeps TPUv7 FP8 rows and availability separate from legacy FP4 snapshots', () => {
    const rows = withSupplementalBenchmarks([], { model: 'Qwen-3.5-397B-A17B' }).filter(
      (row) => row.hardware === 'tpuv7',
    );
    expect(rows.map((row) => row.conc)).toEqual([4, 8, 16, 32, 64, 128, 256]);
    for (const row of rows) {
      expect(row).toMatchObject({
        precision: 'fp8',
        isl: 8192,
        osl: 1024,
        date: '2026-08-26',
        framework: 'vllm',
      });
    }
    expect(rows[0].metrics.output_tput_per_gpu).toBeCloseTo(123.001518);
    expect(withSupplementalAvailability([]).find((row) => row.hardware === 'tpuv7')).toMatchObject({
      model: 'qwen3.5',
      precision: 'fp8',
      isl: 8192,
      osl: 1024,
    });
    expect(
      SUPPLEMENTAL_BENCHMARK_ROWS.filter((row) => row.hardware !== 'tpuv7').every(
        (row) => row.precision === 'fp4',
      ),
    ).toBe(true);
    const history = withSupplementalBenchmarkHistory([], {
      model: 'qwen3.5',
      isl: 8192,
      osl: 1024,
    });
    expect(history.filter((row) => row.hardware === 'tpuv7')).toHaveLength(7);
  });

  it('resolves the newest snapshot independently per hardware curve', () => {
    const latest = withSupplementalBenchmarks([], { model: 'dsr1' });
    expect(latest.filter((row) => row.hardware === 'jalapeno')).toHaveLength(9);
    expect(latest.filter((row) => row.hardware === 'vr200')).toHaveLength(14);

    const august17 = withSupplementalBenchmarks([], {
      model: 'dsr1',
      date: '2026-08-17',
      exact: true,
    });
    expect(august17).toHaveLength(8);
    expect(new Set(august17.map((row) => row.date))).toEqual(new Set(['2026-08-17']));
  });

  it('merges idempotently and exposes complete history and availability', () => {
    const history = withSupplementalBenchmarkHistory([], { model: 'dsr1', isl: 8192, osl: 1024 });
    expect(history).toHaveLength(31);
    expect(
      withSupplementalBenchmarkHistory(history, { model: 'dsr1', isl: 8192, osl: 1024 }),
    ).toHaveLength(31);
    expect(withSupplementalBenchmarkHistory([], { model: 'dsr1', isl: 1024, osl: 1024 })).toEqual(
      [],
    );

    const availability = withSupplementalAvailability([]);
    expect(availability).toHaveLength(6);
    expect(withSupplementalAvailability(availability)).toHaveLength(6);
  });

  it('limits only the July VR200 snapshot to output-token metrics', () => {
    const julyVr = SUPPLEMENTAL_BENCHMARK_ROWS.find((row) => row.hardware === 'vr200');
    expect(julyVr).toBeDefined();
    expect(supportsTokenMetric(julyVr!, 'output')).toBe(true);
    expect(supportsTokenMetric(julyVr!, 'total')).toBe(false);
    expect(supportsTokenMetric(julyVr!, 'input')).toBe(false);
    expect(supportsChartTokenMetric('vr200_rubin-july', '2026-07-01', 'output')).toBe(true);
    expect(supportsChartTokenMetric('vr200_coreweave-vera-rubin', '2026-07-01', 'total')).toBe(
      false,
    );
  });

  it('leaves future VR200 snapshots unrestricted until metadata says otherwise', () => {
    const futureVr = {
      ...SUPPLEMENTAL_BENCHMARK_ROWS.find((row) => row.hardware === 'vr200')!,
      date: '2026-09-01',
    };
    expect(supportsTokenMetric(futureVr, 'total')).toBe(true);
    expect(supportsTokenMetric(futureVr, 'input')).toBe(true);
    expect(supportsChartTokenMetric('vr200_coreweave-vera-rubin', '2026-09-01', 'total')).toBe(
      true,
    );
  });
});
