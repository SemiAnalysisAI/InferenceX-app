import { describe, expect, it } from 'vitest';

import {
  isMultinodePowerSamplesPath,
  multinodePowerVendor,
  parseMultinodePowerSamples,
} from './multinode-power-samples.js';

// Shape of run 34674595026's LOGS/power/samples.csv (Kimi K3 B200, two hosts),
// trimmed to two GPUs and two scrapes, with one malformed row of each kind.
const CSV = [
  'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w',
  '1,1789194365.2924976,4,im-b200-c002,0,GPU-c2-0,401.5',
  '1,1789194365.2924976,4,im-b200-c001,0,GPU-c1-0,186.656',
  '1,1789194365.2924976,4,im-b200-c001,1,GPU-c1-1,190.1',
  '1,1789194366.29,5,im-b200-c001,0,GPU-c1-0,700.25',
  '1,1789194366.29,5,im-b200-c001,1,GPU-c1-1,702.0',
  '1,1789194366.29,5,im-b200-c002,0,GPU-c2-0,650.0',
  '1,not-a-time,6,im-b200-c001,0,GPU-c1-0,1.0',
  '1,1789194367.29,6,im-b200-c001,x,GPU-c1-0,1.0',
  '1,1789194367.29,6,,0,GPU-c1-0,1.0',
  '',
].join('\n');

describe('parseMultinodePowerSamples', () => {
  it('regroups the deployment CSV into power-only samples per host, sorted by hostname', () => {
    const hosts = parseMultinodePowerSamples(CSV);
    expect(hosts?.map((host) => host.hostname)).toEqual(['im-b200-c001', 'im-b200-c002']);
    const [c001, c002] = hosts!;
    expect(c001.samples).toHaveLength(4);
    expect(c002.samples).toHaveLength(2);
    expect(c001.samples[0]).toEqual({
      timestampMs: 1789194365292,
      gpuIndex: 0,
      powerW: 186.656,
      temperatureC: null,
      smClockMhz: null,
      memClockMhz: null,
      gpuUtilPct: null,
      memUtilPct: null,
      edgeTempC: null,
      memTempC: null,
      gfxVoltageMv: null,
      socVoltageMv: null,
      memVoltageMv: null,
      fclkMhz: null,
      socclkMhz: null,
      mmActivityPct: null,
    });
    expect(c001.gpuUuids).toEqual({ 0: 'GPU-c1-0', 1: 'GPU-c1-1' });
    expect(c002.gpuUuids).toEqual({ 0: 'GPU-c2-0' });
  });

  it('rejects other CSV layouts instead of guessing', () => {
    expect(parseMultinodePowerSamples('timestamp, index, power.draw [W]\n1,0,1\n')).toBeNull();
    expect(
      parseMultinodePowerSamples('schema_version,timestamp_unix,gpu_index,power_w\n1,1,0,1\n'),
    ).toBeNull();
    expect(parseMultinodePowerSamples(CSV.split('\n')[0]!)).toBeNull();
    expect(parseMultinodePowerSamples('')).toBeNull();
  });
});

describe('multinode power bundle layout', () => {
  it('recognises only samples.csv under LOGS/', () => {
    expect(isMultinodePowerSamplesPath('LOGS/power/samples.csv')).toBe(true);
    expect(isMultinodePowerSamplesPath('LOGS/native_power/node-1/samples.csv')).toBe(true);
    expect(isMultinodePowerSamplesPath(String.raw`LOGS\power\samples.csv`)).toBe(true);
    expect(isMultinodePowerSamplesPath('samples.csv')).toBe(false);
    expect(isMultinodePowerSamplesPath('LOGS/power/manifest.json')).toBe(false);
    expect(isMultinodePowerSamplesPath('results/gpu_metrics.csv')).toBe(false);
  });

  it('maps the producer manifest to a vendor, defaulting to NVIDIA/DCGM', () => {
    expect(
      multinodePowerVendor({
        producer: 'srt-slurm.dcgm-power',
        source_metric: 'DCGM_FI_DEV_POWER_USAGE',
      }),
    ).toBe('nvidia');
    expect(multinodePowerVendor({ producer: 'srt-slurm.amd-smi-power' })).toBe('amd');
    expect(multinodePowerVendor({ source_metric: 'rocm_smi_power' })).toBe('amd');
    expect(multinodePowerVendor(null)).toBe('nvidia');
  });
});
