import { describe, expect, it } from 'vitest';

import {
  BUNDLE_MANIFEST_ENTRY,
  BUNDLE_SAMPLES_ENTRY,
  BUNDLE_WINDOW_PAD_SECONDS,
  cutPowerAuditBundle,
  isPowerAuditBundleEntry,
} from './power-audit-bundle';

const ARTIFACT = 'power_audit_qwen3.5_8k1k_fp8_dynamo-sglang_x';
const RESULT = 'qwen3.5_8k1k_fp8_dynamo-sglang_x_sa-bench_isl_8192_osl_1024';

/** `<hostname>/<GPU-uuid>` ids of the 2 × 2 synthetic cluster. */
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

/** Every device sampled once per whole second in `[from, to]`, in scrambled device order. */
function tick(time: number, watts: Record<string, number>): string[] {
  return [B1, A1, B0, A0].map((device) => sample(time, device, watts[device]));
}

const WATTS = { [A0]: 100, [A1]: 110, [B0]: 200, [B1]: 50 };

/** Window 1 at 1000–1010 s, window 2 at 2000–2010 s; nothing near window 3 at 5000 s. */
const SAMPLES = [
  HEADER,
  // Just outside the 60 s pad of window 1.
  ...tick(1000 - BUNDLE_WINDOW_PAD_SECONDS - 1, WATTS),
  // Pad boundaries and the window itself.
  ...tick(1000 - BUNDLE_WINDOW_PAD_SECONDS, WATTS),
  ...tick(1000, WATTS),
  ...tick(1005.4, { [A0]: 300, [A1]: 310, [B0]: 400, [B1]: 60 }),
  ...tick(1010, WATTS),
  ...tick(1010 + BUNDLE_WINDOW_PAD_SECONDS, WATTS),
  ...tick(1010 + BUNDLE_WINDOW_PAD_SECONDS + 1, WATTS),
  // Window 2, sampled by three devices only.
  sample(2000, A1, 120),
  sample(2000, A0, 130),
  sample(2000, B0, 220),
  sample(2001, A1, 121),
  sample(2001, A0, 131),
  sample(2001, B0, 221),
  // Malformed rows: short line, non-numeric power, blank power (`Number('')`
  // is 0), blank gpu_index, blank line.
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

/** Window 1: roles from `per_gpu_role`, where cn02/GPU-b0 is a prefill worker and GPU-b1 is unassigned. */
const VALIDATION_1 = JSON.stringify({
  schema_version: 1,
  benchmark_window: { start_time_unix: 900, end_time_unix: 1100 },
  selected_window: { concurrency: 1, start_time_unix: 1000, end_time_unix: 1010 },
  per_gpu_role: { [A0]: 'decode', [A1]: 'prefill', [B0]: 'prefill' },
});

/** Window 2: no `per_gpu_role` and no `selected_window`, so the manifest and `benchmark_window` apply. */
const VALIDATION_2 = JSON.stringify({
  schema_version: 1,
  benchmark_window: { start_time_unix: 2000, end_time_unix: 2010 },
});

/** Window 3: valid, but no sample lands within the pad. */
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

describe('isPowerAuditBundleEntry', () => {
  it('selects samples, manifest, and top-level validations only', () => {
    expect(isPowerAuditBundleEntry(BUNDLE_SAMPLES_ENTRY)).toBe(true);
    expect(isPowerAuditBundleEntry(BUNDLE_MANIFEST_ENTRY)).toBe(true);
    expect(isPowerAuditBundleEntry(validationName(8))).toBe(true);
    expect(isPowerAuditBundleEntry('LOGS/power/windows/results_concurrency_8.json')).toBe(false);
    expect(isPowerAuditBundleEntry(`LOGS/sa-bench_isl_8192_osl_1024/results.json`)).toBe(false);
    expect(isPowerAuditBundleEntry(`agg_${RESULT}_conc8.json`)).toBe(false);
    expect(isPowerAuditBundleEntry(`${RESULT}_conc8.json`)).toBe(false);
    expect(isPowerAuditBundleEntry(`nested/${validationName(8)}`)).toBe(false);
    expect(isPowerAuditBundleEntry('power_validation_x.json.bak')).toBe(false);
  });
});

describe('cutPowerAuditBundle', () => {
  it('emits one series per validation window with samples, in window order', () => {
    const series = cutPowerAuditBundle(ARTIFACT, bundle());
    expect(series.map((entry) => entry.source)).toEqual([validationName(1), validationName(2)]);
    expect(series.every((entry) => entry.artifact === ARTIFACT)).toBe(true);
    expect(series.every((entry) => entry.bucketSeconds === 1)).toBe(true);
  });

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
    // Row order is the device order: A1 reads 110 W, then 310 W in the window.
    expect(first.power[0][1]).toBe(110);
    expect(first.power[0][2]).toBe(310);
    expect(first.power[3][2]).toBe(60);
  });

  it('falls back to manifest roles and to benchmark_window', () => {
    const [, second] = cutPowerAuditBundle(ARTIFACT, bundle());
    expect(second.source).toBe(validationName(2));
    expect(second.devices).toEqual([
      { id: A0, role: 'prefill' },
      { id: A1, role: 'prefill' },
      { id: B0, role: 'decode' },
    ]);
    expect(second.startMs).toBe(2000 * 1000);
    expect(second.t).toEqual([0, 1]);
    expect(second.power).toEqual([
      [130, 131],
      [120, 121],
      [220, 221],
    ]);
  });

  it('leaves roles undefined without a manifest or per_gpu_role', () => {
    const [, second] = cutPowerAuditBundle(
      ARTIFACT,
      bundle({ [BUNDLE_MANIFEST_ENTRY]: undefined }),
    );
    expect(second.devices).toEqual([{ id: A0 }, { id: A1 }, { id: B0 }]);
    const [first] = cutPowerAuditBundle(ARTIFACT, bundle({ [BUNDLE_MANIFEST_ENTRY]: '{oops' }));
    expect(first.devices!.map((device) => device.role)).toEqual([
      'prefill',
      'prefill',
      'decode',
      undefined,
    ]);
  });

  it('clips samples to the window plus the pad on both sides', () => {
    const [first] = cutPowerAuditBundle(ARTIFACT, bundle());
    expect(first.startMs).toBe((1000 - BUNDLE_WINDOW_PAD_SECONDS) * 1000);
    expect(first.t).toEqual([0, 60, 65, 70, 130]);
    // 1005.4 s lands in the 1005 s bucket; the malformed 2002 s rows never appear.
    expect(first.power[2]).toEqual([100, 100, 300, 100, 100]);
  });

  it('skips the sweep entirely without samples', () => {
    expect(cutPowerAuditBundle(ARTIFACT, bundle({ [BUNDLE_SAMPLES_ENTRY]: undefined }))).toEqual(
      [],
    );
    expect(cutPowerAuditBundle(ARTIFACT, bundle({ [BUNDLE_SAMPLES_ENTRY]: '' }))).toEqual([]);
    expect(
      cutPowerAuditBundle(ARTIFACT, bundle({ [BUNDLE_SAMPLES_ENTRY]: `${HEADER}\n` })),
    ).toEqual([]);
    // A header without the required columns is as good as no samples.
    expect(
      cutPowerAuditBundle(
        ARTIFACT,
        bundle({ [BUNDLE_SAMPLES_ENTRY]: 'timestamp,index,power\n1000,0,100' }),
      ),
    ).toEqual([]);
  });

  it('reads columns by header name, not position', () => {
    const reordered = [
      'power_w,gpu_uuid,gpu_index,hostname,timestamp_unix',
      '123.5,GPU-a0,0,cn01,1000',
      '124.5,GPU-a0,0,cn01,1001.2',
    ].join('\r\n');
    const [first] = cutPowerAuditBundle(ARTIFACT, bundle({ [BUNDLE_SAMPLES_ENTRY]: reordered }));
    expect(first.devices).toEqual([{ id: A0, role: 'decode' }]);
    expect(first.power).toEqual([[123.5, 124.5]]);
  });

  it('skips malformed validation files and files without a window', () => {
    const series = cutPowerAuditBundle(
      ARTIFACT,
      bundle({
        [validationName(1)]: '{"selected_window": ',
        [validationName(4)]: JSON.stringify({ power_valid: true }),
        [validationName(5)]: JSON.stringify([1, 2]),
        [validationName(6)]: JSON.stringify({
          selected_window: { start_time_unix: 2010, end_time_unix: 2000 },
        }),
      }),
    );
    expect(series.map((entry) => entry.source)).toEqual([validationName(2)]);
  });
});
