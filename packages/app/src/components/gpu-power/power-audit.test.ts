import { describe, expect, it } from 'vitest';
import {
  buildServingPowerTrace,
  parsePowerAuditEntries,
  type PowerAuditArtifact,
} from './power-audit';

function fixture(): PowerAuditArtifact {
  return {
    id: 1,
    name: 'power_audit_qwen3.5_8k1k_fp8_gb200',
    manifest: {
      source_metric: 'DCGM_FI_DEV_POWER_USAGE',
      power_scope: 'gpu_device_board_as_reported_by_dcgm',
      sample_interval_seconds: 1,
      producer: 'test',
      producer_git_commit: 'abc',
      expected_devices: [
        { hostname: 'prefill-host', gpu_index: 0, assignments: [{ worker_role: 'prefill' }] },
        { hostname: 'decode-host', gpu_index: 0, assignments: [{ worker_role: 'decode' }] },
      ],
    },
    samples: [0, 1, 2, 3].flatMap((time) => [
      {
        timestamp_unix: time,
        scrape_seq: time,
        hostname: 'prefill-host',
        gpu_index: 0,
        gpu_uuid: 'p',
        power_w: (time + 1) * 10,
      },
      {
        timestamp_unix: time,
        scrape_seq: time,
        hostname: 'decode-host',
        gpu_index: 0,
        gpu_uuid: 'd',
        power_w: (time + 1) * 100,
      },
    ]),
    windows: [
      {
        name: 'windows/results_concurrency_4.json',
        concurrency: 4,
        benchmark_start_time_unix: 0.5,
        benchmark_end_time_unix: 2.5,
        result_path: 'results_concurrency_4.json',
        status: 'completed',
        validation: {
          power_valid: true,
          benchmark_window: { start_time_unix: 0.5, end_time_unix: 2.5 },
          per_gpu_role: { 'prefill-host/p': 'prefill', 'decode-host/d': 'decode' },
          per_gpu_energy_j: { 'prefill-host/p': 50, 'decode-host/d': 500 },
        },
      },
    ],
  };
}

describe('serving-window power traces', () => {
  it('keeps reused GPU indices on separate hosts in their roles and clips at the formal bounds', () => {
    const artifact = fixture();
    const trace = buildServingPowerTrace(artifact, artifact.windows[0]);
    expect(trace.duration).toBe(2);
    expect(trace.roles.map((r) => r.meanWatts)).toEqual([25, 250]);
    expect(trace.roles[0].points).toEqual([
      { x: 0, y: 15, boundary: true },
      { x: 0.5, y: 20, boundary: false },
      { x: 1.5, y: 30, boundary: false },
      { x: 2, y: 35, boundary: true },
    ]);
    expect(trace.roles[0].maxSample).toMatchObject({ x: 1.5, y: 30 });
    expect(trace.roles[0].tdpWatts).toBe(1200);
  });
  it('derives each hardware TDP instead of copying the article reference', () => {
    const artifact = fixture();
    artifact.name = 'power_audit_gb300';
    expect(buildServingPowerTrace(artifact, artifact.windows[0]).roles[0].tdpWatts).toBe(1400);
  });
  it('sums a synchronized four-GPU pool without changing its sampled maximum', () => {
    const artifact = fixture();
    const device = artifact.manifest.expected_devices[0];
    const samples = artifact.samples.filter((sample) => sample.hostname === device.hostname);
    const validation = artifact.windows[0].validation!;
    for (const index of [1, 2, 3]) {
      artifact.manifest.expected_devices.push({ ...device, gpu_index: index });
      artifact.samples.push(
        ...samples.map((sample) => ({ ...sample, gpu_index: index, gpu_uuid: `p${index}` })),
      );
      validation.per_gpu_role[`prefill-host/p${index}`] = 'prefill';
      validation.per_gpu_energy_j[`prefill-host/p${index}`] = 50;
    }
    const role = buildServingPowerTrace(artifact, artifact.windows[0]).roles[0];
    expect(role.gpuCount).toBe(4);
    expect(role.meanWatts).toBe(100);
    expect(role.maxSample).toMatchObject({ x: 1.5, y: 120 });
    expect(role.points.map((point) => point.y)).toEqual([60, 80, 120, 140]);
  });
  it('rejects asynchronous pool samples even when each device matches its validated energy', () => {
    const artifact = fixture();
    artifact.manifest.expected_devices[1].assignments = [{ worker_role: 'prefill' }];
    artifact.samples = [
      ...[0, 2, 4, 6, 8].map((timestamp_unix, scrape_seq) => ({
        timestamp_unix,
        scrape_seq,
        hostname: 'prefill-host',
        gpu_index: 0,
        gpu_uuid: 'p',
        power_w: scrape_seq === 1 ? 100 : 0,
      })),
      ...[0, 3, 5, 6, 8].map((timestamp_unix, scrape_seq) => ({
        timestamp_unix,
        scrape_seq,
        hostname: 'decode-host',
        gpu_index: 0,
        gpu_uuid: 'd',
        power_w: scrape_seq === 1 ? 100 : 0,
      })),
    ];
    const window = artifact.windows[0];
    window.benchmark_start_time_unix = 1;
    window.benchmark_end_time_unix = 7;
    window.validation = {
      power_valid: true,
      benchmark_window: { start_time_unix: 1, end_time_unix: 7 },
      per_gpu_role: { 'prefill-host/p': 'prefill', 'decode-host/d': 'prefill' },
      per_gpu_energy_j: { 'prefill-host/p': 175, 'decode-host/d': 700 / 3 },
      per_gpu_max_sample_gap_s: { 'prefill-host/p': 2, 'decode-host/d': 3 },
    };
    // Summing the two peaks by scrape sequence would invent a 200 W pool peak;
    // their actual piecewise-linear sum peaks at 166.67 W at different times.
    expect(() => buildServingPowerTrace(artifact, window)).toThrow('alignment');
  });
  it('rejects two device indices that would count the same physical GPU twice', () => {
    const artifact = fixture();
    artifact.manifest.expected_devices.push({
      ...artifact.manifest.expected_devices[0],
      gpu_index: 1,
    });
    artifact.samples.push(
      ...artifact.samples
        .filter((sample) => sample.hostname === 'prefill-host')
        .map((sample) => ({ ...sample, gpu_index: 1 })),
    );
    expect(() => buildServingPowerTrace(artifact, artifact.windows[0])).toThrow('devices');
  });
  it('rejects a device index whose physical identity changes during collection', () => {
    const artifact = fixture();
    artifact.samples[0].gpu_uuid = 'replacement';
    const validation = artifact.windows[0].validation!;
    validation.per_gpu_role['prefill-host/replacement'] = 'prefill';
    validation.per_gpu_energy_j['prefill-host/replacement'] = 50;
    expect(() => buildServingPowerTrace(artifact, artifact.windows[0])).toThrow('devices');
  });
  it.each(['per_gpu_role', 'per_gpu_energy_j'] as const)(
    'rejects sidecar %s coverage that includes an unaccounted physical GPU',
    (field) => {
      const artifact = fixture();
      const validation = artifact.windows[0].validation!;
      if (field === 'per_gpu_role') validation.per_gpu_role['extra-host/x'] = 'prefill';
      else validation.per_gpu_energy_j['extra-host/x'] = 50;
      expect(() => buildServingPowerTrace(artifact, artifact.windows[0])).toThrow('devices');
    },
  );
  it('does not bridge a missing scrape beyond the accepted per-device gap', () => {
    const artifact = fixture();
    artifact.windows[0].validation!.per_gpu_max_sample_gap_s = {
      'prefill-host/p': 1,
      'decode-host/d': 1,
    };
    artifact.samples = artifact.samples.filter((sample) => sample.timestamp_unix !== 1);
    expect(() => buildServingPowerTrace(artifact, artifact.windows[0])).toThrow('coverage');
  });
  it.each([
    'invalid',
    'mismatched-window',
    'unbracketed',
    'missing-device',
    'ambiguous-role',
    'wrong-energy',
    'nonfinite',
    'duplicate-time',
  ])('rejects %s without fabricating points', (failure) => {
    const artifact = fixture();
    const window = artifact.windows[0];
    if (failure === 'invalid') window.validation!.power_valid = false;
    if (failure === 'mismatched-window') window.validation!.benchmark_window.start_time_unix = 0;
    if (failure === 'unbracketed')
      artifact.samples = artifact.samples.filter((s) => s.timestamp_unix > 0);
    if (failure === 'missing-device')
      artifact.samples = artifact.samples.filter((s) => s.hostname === 'prefill-host');
    if (failure === 'ambiguous-role')
      artifact.manifest.expected_devices[0].assignments.push({ worker_role: 'decode' });
    if (failure === 'wrong-energy') window.validation!.per_gpu_energy_j['prefill-host/p'] = 100;
    if (failure === 'nonfinite') artifact.samples[0].power_w = NaN;
    if (failure === 'duplicate-time') artifact.samples.push({ ...artifact.samples[0] });
    expect(() => buildServingPowerTrace(artifact, window)).toThrow();
  });
  it('parses the raw audit CSV and matches validation to the exact serving window', () => {
    const artifact = fixture();
    const window = artifact.windows[0];
    const entries = {
      'LOGS/power/manifest.json': JSON.stringify(artifact.manifest),
      'LOGS/power/samples.csv':
        'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w\n1,1,1,prefill-host,0,p,20\n',
      [`LOGS/power/${window.name}`]: JSON.stringify(window),
      'power_validation_run.json': JSON.stringify({
        ...window.validation,
        selected_window: { window_file: window.name },
      }),
    };
    const parsed = parsePowerAuditEntries(entries);
    expect(parsed.samples).toEqual([artifact.samples[2]]);
    expect(parsed.windows[0].validation?.per_gpu_energy_j).toEqual(
      window.validation?.per_gpu_energy_j,
    );
    expect(() =>
      parsePowerAuditEntries({
        ...entries,
        'LOGS/power/samples.csv': entries['LOGS/power/samples.csv'].replace(',20\n', ',N/A\n'),
      }),
    ).toThrow();
  });
});
