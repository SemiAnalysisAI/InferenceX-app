import { describe, expect, it } from 'vitest';
import {
  BUNDLE_MANIFEST_ENTRY,
  BUNDLE_SAMPLES_ENTRY,
  BUNDLE_WINDOW_PAD_SECONDS,
} from '@semianalysisai/inferencex-db/power-series/power-audit-cut';

import { cutPowerAuditBundle, parsePowerCsvData } from './power-audit-bundle';

const ARTIFACT = 'power_audit_qwen3.5_8k1k_fp8_dynamo-sglang_x';
const RESULT = 'qwen3.5_8k1k_fp8_dynamo-sglang_x_sa-bench_isl_8192_osl_1024';

const A0 = 'cn01/GPU-a0';
const A1 = 'cn01/GPU-a1';
const B0 = 'cn02/GPU-b0';
const B1 = 'cn02/GPU-b1';

const HEADER = 'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w';

function sample(time: number, device: string, power: number): string {
  const [hostname, uuid] = device.split('/');
  const gpuIndex = uuid.endsWith('0') ? 0 : 1;
  return `1,${time},7,${hostname},${gpuIndex},${uuid},${power}`;
}

function tick(time: number, watts: Record<string, number>): string[] {
  return [B1, A1, B0, A0].map((device) => sample(time, device, watts[device]));
}

const WATTS = { [A0]: 100, [A1]: 110, [B0]: 200, [B1]: 50 };

const SAMPLES = [
  HEADER,
  ...tick(1000 - BUNDLE_WINDOW_PAD_SECONDS - 1, WATTS),
  ...tick(1000 - BUNDLE_WINDOW_PAD_SECONDS, WATTS),
  ...tick(1000, WATTS),
  ...tick(1005.4, { [A0]: 300, [A1]: 310, [B0]: 400, [B1]: 60 }),
  ...tick(1010, WATTS),
  ...tick(1010 + BUNDLE_WINDOW_PAD_SECONDS, WATTS),
  ...tick(1010 + BUNDLE_WINDOW_PAD_SECONDS + 1, WATTS),
  sample(2000, A1, 120),
  sample(2000, A0, 130),
  sample(2000, B0, 220),
  sample(2001, A1, 121),
  sample(2001, A0, 131),
  sample(2001, B0, 221),
  '1,2002,7,cn01',
  `1,2002,7,cn01,0,GPU-a0,N/A`,
  `1,2002,7,cn01,0,GPU-a0,`,
  `1,2002,7,cn01, ,GPU-a0,55`,
  '',
].join('\n');

const MANIFEST = JSON.stringify({
  schema_version: 1,
  producer: 'srt-slurm.dcgm-power',
  expected_devices: [
    { hostname: 'cn01', gpu_index: 0, assignments: [{ worker_role: 'prefill' }] },
    { hostname: 'cn01', gpu_index: 1, assignments: [{ worker_role: 'prefill' }] },
    { hostname: 'cn02', gpu_index: 0, assignments: [{ worker_role: 'decode' }] },
    { hostname: 'cn02', gpu_index: 1, assignments: [] },
  ],
});

function validationName(conc: number): string {
  return `power_validation_${RESULT}_conc${conc}_gpus_4_ctx_2_gen_2.json`;
}

const VALIDATION_1 = JSON.stringify({
  schema_version: 1,
  benchmark_window: { start_time_unix: 900, end_time_unix: 1100 },
  selected_window: { concurrency: 1, start_time_unix: 1000, end_time_unix: 1010 },
  per_gpu_role: { [A0]: 'decode', [A1]: 'prefill', [B0]: 'prefill' },
});

const VALIDATION_2 = JSON.stringify({
  schema_version: 1,
  benchmark_window: { start_time_unix: 2000, end_time_unix: 2010 },
});

const VALIDATION_3 = JSON.stringify({
  selected_window: { concurrency: 3, start_time_unix: 5000, end_time_unix: 5010 },
});

function bundle(overrides: Record<string, string | undefined> = {}): Map<string, string> {
  const files = new Map<string, string | undefined>([
    [validationName(3), VALIDATION_3],
    [validationName(1), VALIDATION_1],
    [BUNDLE_SAMPLES_ENTRY, SAMPLES],
    [BUNDLE_MANIFEST_ENTRY, MANIFEST],
    [validationName(2), VALIDATION_2],
  ]);
  for (const [name, text] of Object.entries(overrides)) files.set(name, text);
  const present = new Map<string, string>();
  for (const [name, text] of files) if (text !== undefined) present.set(name, text);
  return present;
}

describe('cutPowerAuditBundle', () => {
  it('orders rows prefill, decode, unassigned, then by hostname and gpu_index', () => {
    const [first] = cutPowerAuditBundle(ARTIFACT, bundle());
    expect(first.devices).toEqual([
      { id: A1, role: 'prefill' },
      { id: B0, role: 'prefill' },
      { id: A0, role: 'decode' },
      { id: B1 },
    ]);
    expect(first.gpus).toEqual([0, 1, 2, 3]);
    expect(first.power).toHaveLength(4);
    expect(first.power[0][1]).toBe(110);
    expect(first.power[0][2]).toBe(310);
    expect(first.power[3][2]).toBe(60);
  });

  it('clips samples to the window plus the pad on both sides', () => {
    const [first] = cutPowerAuditBundle(ARTIFACT, bundle());
    expect(first.startMs).toBe((1000 - BUNDLE_WINDOW_PAD_SECONDS) * 1000);
    expect(first.t).toEqual([0, 60, 65.4, 70, 130]);
    expect(first.power[2]).toEqual([100, 100, 300, 100, 100]);
  });
});

describe('parsePowerCsvData', () => {
  const NVIDIA_CSV = [
    'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
    '2026/09/11 04:19:41.123, 0, 350.5 W, 60, 1980 MHz, 2619 MHz, 90 %, 50 %',
  ].join('\n');

  it('normalizes UTC and missing collector context to ISO UTC like the stored path', () => {
    for (const context of [null, { timestamp_timezone: 'UTC' }, { timestamp_timezone: '+00:00' }]) {
      expect(parsePowerCsvData(NVIDIA_CSV, context).map((row) => row.timestamp)).toEqual([
        '2026-09-11T04:19:41.123Z',
      ]);
    }
  });

  it('applies a non-zero collector offset', () => {
    expect(
      parsePowerCsvData(NVIDIA_CSV, { timestamp_timezone: '+08:00' }).map((row) => row.timestamp),
    ).toEqual(['2026-09-10T20:19:41.123Z']);
  });

  it('leaves ISO timestamps untouched', () => {
    const iso = NVIDIA_CSV.replace('2026/09/11 04:19:41.123', '2026-09-11T04:19:41.123Z');
    expect(parsePowerCsvData(iso, { timestamp_timezone: 'UTC' })[0]?.timestamp).toBe(
      '2026-09-11T04:19:41.123Z',
    );
  });
});
