import { expect, it } from 'vitest';

import { planBenchmarkPoint } from '../etl/run-overrides';
import {
  isRetiredRawCsv,
  isRetiredStoredSeries,
  rawPointRetires,
  withoutRetiredGpuPower,
} from './legacy-amd-smi-policy';
import rawPoints from './legacy-amd-smi-raw-points.json';
const raw = rawPoints.entries[0]!;
const config = raw.config;

it('removes only GPU W/J and worker power on an exact raw-verified ingest', () => {
  const run = {
    githubRunId: raw.githubRunId,
    runAttempt: raw.runAttempt,
    headSha: raw.headSha,
  };
  const point = {
    config,
    benchmarkType: raw.benchmarkType,
    isl: raw.isl,
    osl: raw.osl,
    conc: raw.conc,
    offloadMode: raw.offloadMode,
    recipeFingerprint: raw.recipeFingerprint,
    metrics: {
      avg_power_w: 535,
      prefill_joules_per_input_token: 1.5,
      decode_joules_per_output_token: 2.5,
      avg_cpu_socket_power_w: 250,
      power_valid: 1,
      power_metric_schema_version: 2,
      mean_ttft: 0.2,
    },
    workers: [{ role: 'decode', avg_power_w: 535, avg_temp_c: 72 }],
  };
  const retired = withoutRetiredGpuPower(run, point);
  expect(retired.metrics).toEqual({
    avg_cpu_socket_power_w: 250,
    power_valid: 1,
    power_metric_schema_version: 2,
    mean_ttft: 0.2,
  });
  expect(retired.workers).toEqual([{ role: 'decode', avg_temp_c: 72 }]);
  expect(point.metrics.avg_power_w).toBe(535);
  expect(withoutRetiredGpuPower({ ...run, runAttempt: run.runAttempt + 1 }, point)).toBe(point);
  expect(withoutRetiredGpuPower({ ...run, headSha: '0'.repeat(40) }, point)).toBe(point);
  expect(
    withoutRetiredGpuPower(run, { ...point, config: { ...config, hardware: 'h100' } }),
  ).toEqual({
    ...point,
    config: { ...config, hardware: 'h100' },
  });
  expect(isRetiredStoredSeries(run, 'amd', raw.csvSha256)).toBe(true);
  expect(isRetiredStoredSeries(run, 'nvidia', 'any-sha')).toBe(false);
});

it('matches raw evidence by portable full config, point, run and CSV bytes', () => {
  const run = {
    githubRunId: raw.githubRunId,
    runAttempt: raw.runAttempt,
    headSha: raw.headSha,
  };
  const point = {
    config,
    benchmarkType: raw.benchmarkType,
    isl: raw.isl,
    osl: raw.osl,
    conc: raw.conc,
    offloadMode: raw.offloadMode,
    recipeFingerprint: raw.recipeFingerprint,
  };
  expect(rawPointRetires(run, point)).toBe(true);
  expect(rawPointRetires(run, { ...point, conc: point.conc + 1 })).toBe(false);
  expect(rawPointRetires(run, { ...point, config: { ...config, prefillTp: 8 } })).toBe(false);
  expect(isRetiredRawCsv(run, Buffer.from('timestamp,gpu,socket_power\n1,0,535\n'))).toBe(false);
  expect(isRetiredStoredSeries(run, 'amd', raw.csvSha256)).toBe(true);
  expect(isRetiredStoredSeries(run, 'amd', 'different')).toBe(false);
  expect(
    isRetiredStoredSeries({ ...run, headSha: null, runAttempt: 0 }, 'amd', raw.csvSha256),
  ).toBe(true);
  expect(isRetiredStoredSeries({ ...run, headSha: '0'.repeat(40) }, 'amd', raw.csvSha256)).toBe(
    false,
  );
});

it('applies the source policy at the shared ingest planner', () => {
  const point = {
    config,
    configId: 999,
    benchmarkType: raw.benchmarkType as 'single_turn',
    isl: raw.isl,
    osl: raw.osl,
    conc: raw.conc,
    offloadMode: raw.offloadMode,
    recipeFingerprint: raw.recipeFingerprint,
    metrics: { avg_power_w: 535, mean_ttft: 0.2 },
  };
  const result = planBenchmarkPoint(
    { githubRunId: raw.githubRunId, runAttempt: raw.runAttempt, headSha: raw.headSha },
    point,
    new Map(),
  );
  expect(result.kind).toBe('planned');
  if (result.kind === 'planned') {
    expect(result.point.metrics).toEqual({ mean_ttft: 0.2 });
  }
  const unresolved = planBenchmarkPoint(
    { githubRunId: raw.githubRunId, runAttempt: 0, headSha: null },
    point,
    new Map(),
  );
  expect(unresolved.kind).toBe('planned');
  if (unresolved.kind === 'planned') {
    expect(unresolved.point.metrics).toEqual({ mean_ttft: 0.2 });
  }
  const wrongHead = planBenchmarkPoint(
    { githubRunId: raw.githubRunId, runAttempt: raw.runAttempt, headSha: '0'.repeat(40) },
    point,
    new Map(),
  );
  expect(wrongHead.kind).toBe('planned');
  if (wrongHead.kind === 'planned') {
    expect(wrongHead.point.metrics).toEqual(point.metrics);
  }
});
