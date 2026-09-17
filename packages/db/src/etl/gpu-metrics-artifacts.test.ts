import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  contextUtcOffsetMinutes,
  discoverGpuMetricsArtifacts,
  gpuMetricsArtifactSuffix,
  listGpuMetricsCsvFiles,
  parseEnergyCsv,
  readGpuMetricsSidecars,
} from './gpu-metrics-artifacts.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-metrics-artifacts-'));
  roots.push(root);
  return root;
}

describe('gpu_metrics artifact discovery', () => {
  it('pairs by the bare suffix and ignores eval-only uploads', () => {
    expect(gpuMetricsArtifactSuffix('gpu_metrics_dsr1_8k1k_conc1_b200-x_0')).toBe(
      'dsr1_8k1k_conc1_b200-x_0',
    );
    expect(gpuMetricsArtifactSuffix('eval_gpu_metrics_dsr1_8k1k_conc1_b200-x_0')).toBeNull();
    expect(gpuMetricsArtifactSuffix('bmk_dsr1')).toBeNull();
  });

  it('lists telemetry CSVs recursively but skips identity and energy sidecars', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'results'));
    fs.writeFileSync(path.join(root, 'gpu_metrics.csv'), 'timestamp\n');
    fs.writeFileSync(path.join(root, 'gpu_metrics_identity.csv'), 'index\n');
    fs.writeFileSync(path.join(root, 'results', 'gpu_metrics_energy_start.csv'), 'gpu\n');
    fs.writeFileSync(path.join(root, 'results', 'gpu_metrics_rank1.csv'), 'timestamp\n');
    fs.writeFileSync(path.join(root, 'results', 'server.log'), '');

    expect(listGpuMetricsCsvFiles(root).map((file) => file.fileName)).toEqual([
      'gpu_metrics.csv',
      'results/gpu_metrics_rank1.csv',
    ]);
  });

  it('indexes extracted artifact directories by suffix', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'gpu_metrics_cfg-a_runner_0'));
    fs.mkdirSync(path.join(root, 'bmk_cfg-a_runner_0'));
    fs.writeFileSync(path.join(root, 'gpu_metrics_not-a-dir_0'), '');
    const discovered = discoverGpuMetricsArtifacts(root);
    expect([...discovered.keys()]).toEqual(['cfg-a_runner_0']);
    expect(discovered.get('cfg-a_runner_0')?.artifactName).toBe('gpu_metrics_cfg-a_runner_0');
  });
});

describe('sidecars', () => {
  it('reads context, identity CSV, and energy counters next to the CSV', () => {
    const root = tempRoot();
    const csv = path.join(root, 'gpu_metrics.csv');
    fs.writeFileSync(csv, 'timestamp\n');
    fs.writeFileSync(path.join(root, 'gpu_metrics_context.json'), '{"timestamp_timezone":"UTC"}');
    fs.writeFileSync(
      path.join(root, 'gpu_metrics_identity.csv'),
      'index, uuid, name\n0, GPU-abc, NVIDIA B200\n',
    );
    fs.writeFileSync(
      path.join(root, 'gpu_metrics_energy_start.csv'),
      'gpu,total_energy_consumption\n0,162815801.936\n',
    );
    const sidecars = readGpuMetricsSidecars(csv);
    expect(sidecars.context).toEqual({ timestamp_timezone: 'UTC' });
    expect(sidecars.identity).toEqual([{ index: '0', uuid: 'GPU-abc', name: 'NVIDIA B200' }]);
    expect(sidecars.energyStart).toEqual({ '0': 162815801.936 });
    expect(sidecars.energyEnd).toBeNull();
  });

  it('parses energy CSVs and rejects header-only files', () => {
    expect(parseEnergyCsv('gpu,total_energy_consumption\n0,1.5\n1,2.5\n')).toEqual({
      '0': 1.5,
      '1': 2.5,
    });
    expect(parseEnergyCsv('gpu,total_energy_consumption\n')).toBeNull();
  });

  it('derives a fixed UTC offset only from ±HH:MM zones', () => {
    expect(contextUtcOffsetMinutes({ timestamp_timezone: 'UTC' })).toBe(0);
    expect(contextUtcOffsetMinutes({ timestamp_timezone: '-05:00' })).toBe(-300);
    expect(contextUtcOffsetMinutes({ timestamp_timezone: '+0530' })).toBe(330);
    expect(contextUtcOffsetMinutes(null)).toBe(0);
  });
});
