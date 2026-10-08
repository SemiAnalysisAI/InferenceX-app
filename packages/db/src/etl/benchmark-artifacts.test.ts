import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readBenchmarkArtifacts } from './benchmark-artifacts';
import { createSkipTracker } from './skip-tracker';

const golden = path.resolve(import.meta.dirname, 'fixtures/powerx-manifest-v2');
const dirs: string[] = [];
function bundle(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-artifacts-'));
  dirs.push(dir);
  fs.cpSync(golden, dir, { recursive: true });
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readBenchmarkArtifacts', () => {
  it('lists each per-job file and results_* aggregate once, in sorted order', () => {
    const dir = bundle();
    fs.mkdirSync(path.join(dir, 'results_bmk'));
    fs.copyFileSync(
      path.join(dir, 'bmk_agentic_golden/agg.json'),
      path.join(dir, 'results_bmk/agg.json'),
    );
    const files = readBenchmarkArtifacts(dir, { runId: 123, tracker: createSkipTracker() });
    expect(files.map((file) => file.path)).toEqual([
      'bmk_agentic_golden/agg.json',
      'results_bmk/agg.json',
    ]);
  });

  it('reports unreadable JSON, non-object entries and failed runs without throwing', () => {
    const dir = bundle();
    fs.writeFileSync(path.join(dir, 'bmk_agentic_golden/broken.json'), '{');
    const row = JSON.parse(fs.readFileSync(path.join(dir, 'bmk_agentic_golden/agg.json'), 'utf8'));
    fs.writeFileSync(
      path.join(dir, 'bmk_agentic_golden/mixed.json'),
      JSON.stringify([1, { ...row, benchmark_outcome: { status: 'failed' } }]),
    );
    const files = readBenchmarkArtifacts(dir, { runId: 123, tracker: createSkipTracker() });
    expect(files.find((file) => file.path.endsWith('broken.json'))).toMatchObject({
      unreadable: expect.stringContaining('JSON'),
      rows: [],
    });
    expect(files.find((file) => file.path.endsWith('mixed.json'))).toMatchObject({
      nonObjectRows: 1,
      rows: [{ mapped: null, failed: true }],
    });
  });

  it('maps rows with the run id, so run-scoped legacy repairs apply', () => {
    const dir = bundle();
    const legacyTpuRow = {
      hw: 'tpuv7',
      model: 'Qwen/Qwen3.5-397B-A17B-FP8',
      framework: 'vllm',
      precision: 'fp8',
      spec_decoding: 'none',
      isl: 8192,
      osl: 1024,
      conc: 4,
      tp: 1,
      ep: 1,
      tput_per_gpu: 800,
    };
    fs.mkdirSync(path.join(dir, 'bmk_tpu'));
    fs.writeFileSync(path.join(dir, 'bmk_tpu/legacy.json'), JSON.stringify(legacyTpuRow));
    const gpus = (runId: number | null) =>
      readBenchmarkArtifacts(dir, { runId, tracker: createSkipTracker() })
        .find((file) => file.path === 'bmk_tpu/legacy.json')!
        .rows.map((row) => row.mapped?.config.numDecodeGpu);
    expect(gpus(30864013158)).toEqual([4]);
    expect(gpus(null)).not.toEqual([4]);
  });
});
