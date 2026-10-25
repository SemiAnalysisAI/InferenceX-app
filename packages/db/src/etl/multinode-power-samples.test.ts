import { describe, expect, it } from 'vitest';

import { parseMultinodePowerSamples } from './multinode-power-samples';

const HEADER =
  'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w,gpu_util_pct,sm_active,temperature_c';

describe('native GPU temperature', () => {
  it('retains per-host identity and distinguishes missing temperature from zero', () => {
    const hosts = parseMultinodePowerSamples(
      [
        HEADER,
        '3,1000,0,node-a,0,GPU-a,400,,,65.5',
        '3,1001,1,node-a,0,GPU-a,420,,,',
        '3,1000,0,node-b,0,GPU-b,300,,,0',
      ].join('\n'),
    )!;
    expect(hosts.map((host) => [host.hostname, host.gpuUuids])).toEqual([
      ['node-a', { 0: 'GPU-a' }],
      ['node-b', { 0: 'GPU-b' }],
    ]);
    expect(hosts[0]!.samples.map((s) => [s.timestampMs, s.powerW, s.temperatureC])).toEqual([
      [1000000, 400, 65.5],
      [1001000, 420, null],
    ]);
    expect(hosts[1]!.samples[0]!.temperatureC).toBe(0);
  });

  it.each(['N/A', 'NaN', 'Infinity', '65oops', '-300', '9223372036854775794'])(
    'omits invalid temperature %s without dropping power',
    (temperature) => {
      const hosts = parseMultinodePowerSamples(
        `${HEADER}\n3,1000,0,node-a,0,GPU-a,400,,,${temperature}`,
      )!;
      expect(hosts[0]!.samples[0]).toMatchObject({ powerW: 400, temperatureC: null });
    },
  );

  it('keeps historical power-only samples readable', () => {
    const hosts = parseMultinodePowerSamples(
      'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w\n1,1000,0,node-a,0,GPU-a,400',
    )!;
    expect(hosts[0]!.samples[0]).toMatchObject({ powerW: 400, temperatureC: null });
  });
});
