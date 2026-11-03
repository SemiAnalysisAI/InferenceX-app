import { isDeepStrictEqual } from 'node:util';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StoredGpuMetricSample } from './gpu-metric-stats';
import {
  decodeGpuSampleBlob,
  encodeGpuSampleBlob,
  GpuSampleBlobUnsupportedError,
  pgFloat4Number,
  shortestFloat4Exact,
} from './gpu-sample-blob';

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const fromBits = (bits: number): number => {
  u32[0] = bits;
  return f32[0]!;
};
const MAX_FRACTION = 2 ** 23 - 1;

/** Deterministic float4 values covering random bit patterns and tie-prone decimals. */
function float4Corpus(): number[] {
  let seed = 2_654_435_769;
  const next = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed;
  };
  const values = [
    0.1, 0.2, 0.3, 1e-7, 3.4e38, 1e-45, 1.17549435e-38, 1401091.25, 233_556_992, 125_918_656,
    16_777_217, 187.8, 1965, 3996, 12.5, 0.001, 99.999, 65_504, 5e-324,
  ].map(Math.fround);
  for (let exponent = 0; exponent < 255; exponent++) {
    for (const fraction of [0, 1, 2, MAX_FRACTION, 2 ** 22]) {
      values.push(fromBits((exponent << 23) | fraction));
    }
  }
  for (let i = 0; i < 20_000; i++) {
    const value = fromBits(next());
    if (Number.isFinite(value)) values.push(value);
    values.push(
      // Few significant bits: decimal ties and exact interval bounds.
      Math.fround((next() >>> 8) * 2 ** ((next() % 64) - 32)),
      // Telemetry-like readings with up to three decimals.
      Math.fround((next() % 2_000_000) / 1000),
    );
  }
  return [...values, ...values.map((value) => -value)];
}

describe('pgFloat4Number', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await PGlite.create();
  }, 20_000);
  afterAll(async () => {
    await db?.close();
  });

  it('equals parseFloat of PostgreSQL float4 output for every value', async () => {
    const values = float4Corpus();
    const { rows } = await db.query<{ text: string }>(
      `select value::float8::float4::text as text
       from unnest($1::text[]) with ordinality as input(value, position) order by position`,
      [values.map((value) => (Object.is(value, -0) ? '-0' : String(value)))],
    );
    const differing = values.filter(
      (value, i) => !Object.is(pgFloat4Number(value), parseFloat(rows[i]!.text)),
    );
    expect(differing).toEqual([]);
  }, 60_000);

  it('keeps PostgreSQL text for special values and known shortest outputs', async () => {
    const cases: [number, string][] = [
      [Math.fround(0.1), '0.1'],
      [Math.fround(1e-7), '1e-07'],
      [Math.fround(3.4e38), '3.4e+38'],
      [fromBits(1), '1e-45'],
      [fromBits(MAX_FRACTION), '1.1754942e-38'],
      [Math.fround(1401091.25), '1.4010912e+06'],
      [Math.fround(233_556_992), '2.3355699e+08'],
      [Number.NaN, 'NaN'],
      [Number.POSITIVE_INFINITY, 'Infinity'],
      [Number.NEGATIVE_INFINITY, '-Infinity'],
      [-0, '-0'],
      [0, '0'],
    ];
    const { rows } = await db.query<{ text: string }>(
      `select value::float4::text as text
       from unnest($1::text[]) with ordinality as input(value, position) order by position`,
      [cases.map(([value]) => (Object.is(value, -0) ? '-0' : String(value)))],
    );
    expect(rows.map((row) => row.text)).toEqual(cases.map(([, text]) => text));
    for (const [value, text] of cases) expect(pgFloat4Number(value)).toBe(parseFloat(text));
  });

  it('agrees with the exact rational search on its fast path', () => {
    const differing = float4Corpus().filter(
      (value) => !Object.is(pgFloat4Number(value), shortestFloat4Exact(value)),
    );
    expect(differing).toEqual([]);
  });
});

const row = (
  gpuIndex: number,
  sampledAt: string,
  metrics: Partial<Record<string, number | null>> = {},
): StoredGpuMetricSample => ({
  gpu_index: gpuIndex,
  sampled_at: sampledAt,
  power_w: null,
  temperature_c: null,
  sm_clock_mhz: null,
  mem_clock_mhz: null,
  gpu_util_pct: null,
  mem_util_pct: null,
  edge_temp_c: null,
  mem_temp_c: null,
  gfx_voltage_mv: null,
  soc_voltage_mv: null,
  mem_voltage_mv: null,
  fclk_mhz: null,
  socclk_mhz: null,
  mm_activity_pct: null,
  ...metrics,
});

const roundTrip = (rows: StoredGpuMetricSample[]): StoredGpuMetricSample[] =>
  decodeGpuSampleBlob(encodeGpuSampleBlob(rows));

describe('gpu sample blob codec', () => {
  it('round-trips rows exactly, including nulls, specials and microseconds, in input order', () => {
    const rows = [
      row(1, '2026-09-11T04:19:41.982000Z', {
        power_w: 187.8,
        temperature_c: 33,
        sm_clock_mhz: 1965,
        mem_clock_mhz: 3996,
        gpu_util_pct: 0,
        mem_util_pct: -0,
        mm_activity_pct: 12.5,
      }),
      row(0, '2026-09-11T04:19:41.982000Z', { power_w: Number.NaN, temperature_c: Infinity }),
      row(7, '2026-09-11T04:19:41.000001Z', { power_w: -Infinity, edge_temp_c: 1e-45 }),
      row(-32_768, '1999-12-31T23:59:59.999999Z', { gfx_voltage_mv: 3.4e38, socclk_mhz: 1e-7 }),
      row(32_767, '2026-09-11T04:19:41.982000Z', { fclk_mhz: 0.1, soc_voltage_mv: 1401091.2 }),
      row(0, '2027-01-01T00:00:00.000000Z', { mem_temp_c: 233_556_990, mem_voltage_mv: 0.001 }),
      row(0, '2027-01-01T00:00:00.000000Z'),
    ];
    const decoded = roundTrip(rows);
    expect(decoded).toStrictEqual(rows);
    expect(isDeepStrictEqual(decoded, rows)).toBe(true);
    expect(Object.is(decoded[0]!.mem_util_pct, -0)).toBe(true);
  });

  it('round-trips every PostgreSQL float4 output in every column', () => {
    const values = float4Corpus().map(pgFloat4Number);
    const rows = values.map((value, i) =>
      row(i % 8, `2026-09-11T04:${String(Math.floor(i / 6000) % 60).padStart(2, '0')}:00.000000Z`, {
        [['power_w', 'mm_activity_pct', 'mem_clock_mhz'][i % 3]!]: value,
      }),
    );
    expect(isDeepStrictEqual(roundTrip(rows), rows)).toBe(true);
  });

  it('round-trips an empty series', () => {
    expect(roundTrip([])).toEqual([]);
  });

  it('refuses values the decoder could not reproduce', () => {
    const unsupported = [
      row(0, '2026-09-11T04:19:41.982000Z', { power_w: Math.fround(0.1) }),
      row(0, '2026-09-11T04:19:41.982000Z', { power_w: 0.123_456_789_012 }),
      row(0, '2026-09-11T04:19:41.982Z'),
      row(0, '10000-01-01T00:00:00.000000Z'),
      row(1.5, '2026-09-11T04:19:41.982000Z'),
      { ...row(0, ''), sampled_at: new Date('2026-09-11T04:19:41.982Z') },
    ];
    for (const input of unsupported) {
      expect(() => encodeGpuSampleBlob([input])).toThrow(GpuSampleBlobUnsupportedError);
    }
  });
});
