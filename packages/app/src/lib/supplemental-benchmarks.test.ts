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
  it('ships every supplied Jalapeño and July VR200 point', () => {
    expect(SUPPLEMENTAL_BENCHMARK_ROWS).toHaveLength(50);
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
    expect(availability).toHaveLength(5);
    expect(withSupplementalAvailability(availability)).toHaveLength(5);
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
