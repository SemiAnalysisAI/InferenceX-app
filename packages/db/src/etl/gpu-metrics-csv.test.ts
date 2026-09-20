import { describe, expect, it } from 'vitest';

import {
  computeGpuMetricStats,
  parseAmdTimestamp,
  parseGpuMetricsCsv,
  parseMetricCell,
  parseNvidiaTimestamp,
  summarizeGpuMetricSamples,
} from './gpu-metrics-csv.js';

const NVIDIA_CSV = [
  'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
  '2026/09/11 04:19:41.982, 0, 187.80 W, 33, 120 MHz, 3996 MHz, 0 %, 0 %',
  '2026/09/11 04:19:41.986, 1, 190.96 W, 39, 120 MHz, 3996 MHz, 0 %, 0 %',
  '2026/09/11 04:19:42.990, 0, 912.10 W, 61, 1965 MHz, 3996 MHz, 98 %, 74 %',
  '2026/09/11 04:19:42.994, 1, [N/A], 62, 1965 MHz, 3996 MHz, 97 %, 73 %',
  '2026/09/11 04:19:43.990, 0, 930.00 W, 63, 1965 MHz, 3996 MHz, 99 %, 75 %',
].join('\n');

const AMD_HEADER =
  'timestamp,gpu,gfx_activity,umc_activity,mm_activity,socket_power,gfx_voltage,soc_voltage,mem_voltage,gfx_0_clk,mem_0_clk,fclk_0_clk,socclk_0_clk,edge,hotspot,mem';

const AMD_CSV = [
  AMD_HEADER,
  `1789515524,0,0,0,N/A,288,N/A,N/A,N/A,2402,2000,1250,39,N/A,44,24`,
  `1789515525,0,95,80,N/A,1180,850,900,1250,2100,2000,1250,39,55,78,60`,
  `1789515524,1,0,0,N/A,290,N/A,N/A,N/A,2402,2000,1250,39,40,45,25`,
].join('\r\n');

describe('parseGpuMetricsCsv — NVIDIA', () => {
  it('parses unit-suffixed cells into UTC epoch samples and drops rows without power', () => {
    const parsed = parseGpuMetricsCsv(NVIDIA_CSV);
    expect(parsed?.vendor).toBe('nvidia');
    expect(parsed?.samples).toHaveLength(4);
    const first = parsed!.samples[0]!;
    expect(first.timestampMs).toBe(Date.UTC(2026, 8, 11, 4, 19, 41, 982));
    expect(first.gpuIndex).toBe(0);
    expect(first.powerW).toBe(187.8);
    expect(first.temperatureC).toBe(33);
    expect(first.smClockMhz).toBe(120);
    expect(first.memClockMhz).toBe(3996);
    expect(first.gpuUtilPct).toBe(0);
    expect(first.memUtilPct).toBe(0);
    expect(first.edgeTempC).toBeNull();
    // The `[N/A]` power row for GPU 1 is not a usable sample.
    expect(parsed!.samples.filter((s) => s.gpuIndex === 1)).toHaveLength(1);
  });

  it('applies a fixed collector offset when the context is not UTC', () => {
    const parsed = parseGpuMetricsCsv(NVIDIA_CSV, { nvidiaUtcOffsetMinutes: -300 });
    expect(parsed!.samples[0]!.timestampMs).toBe(Date.UTC(2026, 8, 11, 9, 19, 41, 982));
  });

  it('returns null for a header-only file or an unknown header', () => {
    expect(parseGpuMetricsCsv(NVIDIA_CSV.split('\n')[0]!)).toBeNull();
    expect(parseGpuMetricsCsv('a,b,c\n1,2,3')).toBeNull();
  });
});

describe('parseGpuMetricsCsv — AMD', () => {
  it('maps the amd-smi subset, preferring hotspot over edge temperature', () => {
    const parsed = parseGpuMetricsCsv(AMD_CSV);
    expect(parsed?.vendor).toBe('amd');
    expect(parsed?.samples).toHaveLength(3);
    const idle = parsed!.samples[0]!;
    expect(idle.timestampMs).toBe(1789515524000);
    expect(idle.powerW).toBe(288);
    expect(idle.temperatureC).toBe(44);
    expect(idle.edgeTempC).toBeNull();
    expect(idle.memTempC).toBe(24);
    expect(idle.gfxVoltageMv).toBeNull();
    const busy = parsed!.samples[1]!;
    expect(busy.gpuUtilPct).toBe(95);
    expect(busy.memUtilPct).toBe(80);
    expect(busy.gfxVoltageMv).toBe(850);
    expect(busy.fclkMhz).toBe(1250);
    expect(busy.socclkMhz).toBe(39);
    expect(busy.edgeTempC).toBe(55);
    expect(busy.temperatureC).toBe(78);
  });
});

describe('timestamp and cell helpers', () => {
  it('parses nvidia-smi timestamps with and without milliseconds', () => {
    expect(parseNvidiaTimestamp('2026/01/02 03:04:05')).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(parseNvidiaTimestamp('2026/01/02 03:04:05.5')).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 500));
    expect(parseNvidiaTimestamp('not a date')).toBeNull();
  });

  it('accepts epoch seconds, epoch milliseconds, and ISO strings for amd-smi', () => {
    expect(parseAmdTimestamp('1789515524')).toBe(1789515524000);
    expect(parseAmdTimestamp('1789515524.25')).toBe(1789515524250);
    expect(parseAmdTimestamp('1789515524000')).toBe(1789515524000);
    expect(parseAmdTimestamp('2026-09-16T00:00:00Z')).toBe(Date.UTC(2026, 8, 16));
    expect(parseAmdTimestamp('12')).toBeNull();
  });

  it('treats N/A and blanks as null', () => {
    expect(parseMetricCell('N/A')).toBeNull();
    expect(parseMetricCell('')).toBeNull();
    expect(parseMetricCell(undefined)).toBeNull();
    expect(parseMetricCell(' 12.5 W')).toBe(12.5);
  });
});

describe('computeGpuMetricStats', () => {
  it('digests every non-null metric per GPU with interpolated percentiles', () => {
    const parsed = parseGpuMetricsCsv(NVIDIA_CSV)!;
    const stats = computeGpuMetricStats(parsed.samples);
    const gpu0Power = stats.find((s) => s.gpuIndex === 0 && s.metric === 'powerW')!;
    expect(gpu0Power.count).toBe(3);
    expect(gpu0Power.min).toBe(187.8);
    expect(gpu0Power.max).toBe(930);
    expect(gpu0Power.mean).toBeCloseTo((187.8 + 912.1 + 930) / 3, 6);
    expect(gpu0Power.median).toBe(912.1);
    expect(gpu0Power.p95).toBeCloseTo(912.1 + (930 - 912.1) * 0.9, 6);
    expect(gpu0Power.p99).toBeCloseTo(912.1 + (930 - 912.1) * 0.98, 6);
    expect(gpu0Power.stddev).toBeGreaterThan(0);
    // AMD-only columns never appear for an NVIDIA series.
    expect(stats.some((s) => s.metric === 'edgeTempC')).toBe(false);
    expect(stats.filter((s) => s.gpuIndex === 1 && s.metric === 'powerW')[0]!.count).toBe(1);
  });

  it('returns an empty digest for no samples', () => {
    expect(computeGpuMetricStats([])).toEqual([]);
  });
});

describe('summarizeGpuMetricSamples', () => {
  it('reports the window, GPU count, and median per-GPU cadence', () => {
    const summary = summarizeGpuMetricSamples(parseGpuMetricsCsv(NVIDIA_CSV)!.samples)!;
    expect(summary.sampleCount).toBe(4);
    expect(summary.gpuCount).toBe(2);
    expect(summary.startedAtMs).toBe(Date.UTC(2026, 8, 11, 4, 19, 41, 982));
    expect(summary.endedAtMs).toBe(Date.UTC(2026, 8, 11, 4, 19, 43, 990));
    expect(summary.sampleIntervalS).toBeCloseTo(1.004, 3);
  });

  it('returns null for an empty series', () => {
    expect(summarizeGpuMetricSamples([])).toBeNull();
  });
});
