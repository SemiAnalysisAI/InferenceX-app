import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { at, loadBundle, type Bundle, type Json } from './bundle';
import { videoReleaseCoverage } from './release-coverage';
import { nativeHardware } from './hardware';
import { videoHistoryEntry } from './history';
import { servingFixture } from './serving.fixture';
import { isNativeH3, servingCells } from './serving';
import type { StoredArtifact } from './stored';
import { efficiencyValue, latencyValue, tradeoffPoints } from './tradeoff';

// Trimmed copy of the InferenceX #2916 native srt-slurm sample bundle: JSON only, the
// placeholder clips and their SHA256SUMS lines dropped. Synthetic values, never evidence.
const FIXTURE = join(import.meta.dirname, 'fixtures', 'native-serving-bundle');
const RUN_ID = '123456789';

const bundle = () => loadBundle(async (path) => new Blob([await readFile(join(FIXTURE, path))]));
const points = (b: Bundle) => tradeoffPoints({ bundle: b, exportRun: RUN_ID, artifact: '9' });
const stored = (b: Bundle): StoredArtifact => ({
  storageVersion: 1,
  runId: RUN_ID,
  artifact: { id: 9, name: `h3-results-${RUN_ID}-1`, expired: false, size_in_bytes: 0 },
  sources: [
    { id: RUN_ID, documents: [...b.documents], checksums: [...b.checksums], assets: [], texts: [] },
  ],
});
function set(value: Json, key: string, replacement: Json) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  value[key] = replacement;
}
const cellOf = (b: Bundle, concurrency: number) =>
  at(b.documents.get('serving-smoke.json') ?? null, 'cells', [1, 2, 4].indexOf(concurrency));

/** Mirror the producer: invalid power empties the phase aggregate and un-verifies the cell. */
function invalidatePower(b: Bundle, concurrency: number) {
  const power = b.documents.get(`gpu/c${concurrency}/power.json`)!;
  const phase = at(power, 'phases', 'measurement');
  for (const document of [power, phase]) {
    set(document, 'valid', false);
    set(document, 'status', 'invalid');
    set(document, 'invalid_reasons', ['expected_device_missing']);
  }
  set(phase, 'aggregate', null);
  set(phase, 'per_gpu', null);
  set(phase, 'valid_window_count', 0);
  const cell = cellOf(b, concurrency);
  set(at(cell, 'power'), 'phases', structuredClone(at(power, 'phases')));
  set(cell, 'verified', false);
  const job = b.documents.get(`gpu/c${concurrency}/gpu-job.json`)!;
  set(at(job, 'power'), 'valid', false);
  set(job, 'measurement_verified', false);
  set(job, 'power_verified', false);
  set(b.documents.get('serving-smoke.json')!, 'power_verified', false);
}

describe('native srt-slurm H3 bundle', () => {
  it('accepts the native matrix, receipts and power documents as a first-class source', async () => {
    const b = await bundle();
    expect(isNativeH3(b.manifest)).toBe(true);
    expect(b.report).toBeNull();
    expect(b.result).toBeNull();
    const cells = servingCells(b);
    expect(cells.map(({ id, concurrency }) => [id, concurrency])).toEqual([
      ['c1', 1],
      ['c2', 2],
      ['c4', 4],
    ]);
    for (const cell of cells) {
      expect(at(cell.job, 'bundle_type')).toBe('srt_slurm_h3_service_receipt');
      expect(at(cell.power, 'bundle_type')).toBe('h3_native_power');
      expect(at(cell.power, 'valid')).toBe(true);
      expect(at(cell.cell, 'verified')).toBe(true);
    }
    expect(isNativeH3(servingFixture().manifest)).toBe(false);
  });

  it('projects latency, throughput, GPU counts, power and energy per concurrency', async () => {
    const b = await bundle();
    const all = points(b);
    expect(all.map((p) => [p.cellId, p.concurrency, p.role])).toEqual([
      ['c1', 1, 'serving'],
      ['c2', 2, 'serving'],
      ['c4', 4, 'serving'],
    ]);
    for (const p of all) {
      // The sample's srt-client records carry no per-request timing: the harness median stands in.
      expect(p.latencies).toEqual([]);
      expect(latencyValue(p, 'median')).toBe(119);
      expect(latencyValue(p, 'p90')).toBeNull();
      expect(p.samples).toBe(4);
      expect(p.rate).toBeCloseTo(240);
      expect(efficiencyValue(p, 'clipsGpu')).toBeCloseTo(120);
      expect(p.participating).toBe(2);
      expect(p.allocated).toBe(2);
      expect(p.power).toBe(1201);
      expect(p.energy).toBe(18000.25);
      expect(p.powerWindow).toBe(60);
      expect(p.powerLimit).toBeNull();
      expect(p.revision).toBe('71de97b264b04dcd514cf904003028aefe9775c8');
      expect(p.completeWorkload).toBe(true);
      expect(p.hardware).toBe('');
      expect([p.valid, p.completed, p.scheduled, p.failed]).toEqual([4, 4, 4, 0]);
    }
    expect(new Set(all.map((p) => p.group)).size).toBe(1);

    const entry = videoHistoryEntry(stored(b), '2026-10-17T04:00:00Z');
    expect(entry.sources).toHaveLength(1);
    const source = entry.sources[0];
    expect(source.error).toBeNull();
    expect(source).toMatchObject({
      execution: 'complete',
      releaseQualified: false,
      powerVerified: true,
      observedAt: '2026-10-17T03:38:07.253472Z',
      sourceSha: 'b'.repeat(40),
    });
    expect(source.observations[0]).toMatchObject({
      cell: 'c1',
      concurrency: 1,
      status: 'complete',
      valid: 4,
      completed: 4,
      scheduled: 4,
      failed: 0,
      samples: 4,
      p50: 119,
      p90: null,
      clipsGpuHour: 120,
      energyKj: 18.00025,
      avgPowerW: 1201,
      enforcedLimitW: null,
      participating: 2,
      allocated: 2,
      replicas: null,
      wallSeconds: 60,
      durationSeconds: 4,
      frameCount: 107,
      server: { tp: 1, ulysses: 2, attention: null },
    });
    expect(source.observations[0].workloadKey).toEqual(expect.any(String));
  });

  it('retains the sealed engine identity and failed status from a producer startup-failure replay', async () => {
    const directory = join(import.meta.dirname, 'fixtures', 'native-startup-failure');
    const failed = await loadBundle(
      async (path) => new Blob([await readFile(join(directory, path))]),
    );
    const saved = stored(failed);
    saved.runId = '123456790';
    saved.sources[0].id = saved.runId;
    const entry = videoHistoryEntry(saved, '2026-10-18T00:00:00Z');
    const source = entry.sources[0];
    expect(source.execution).toBe('failed');
    expect(source.producer?.engine.name).toBe('vllm-omni');
    expect(source.producer?.planSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(source.observations).toEqual([]);
    expect(source.serving?.[0].scheduled).toBe(0);
    expect(
      videoReleaseCoverage([{ schemaVersion: 1, nextPage: null, entries: [entry] }])[1].status,
    ).toBe('failed');
  });

  it('names the hardware only from the site record or the CI runner', async () => {
    expect(
      nativeHardware({ site: { gpu_model: 'NVIDIA H200' }, ci: { runner_name: 'b200-x' } }),
    ).toBe('NVIDIA H200');
    expect(nativeHardware({ ci: { runner_name: 'h200-dgxc-gha-01' } })).toBe('H200');
    // The sealed aggregate's cluster outranks the runner's name.
    expect(nativeHardware({ ci: { runner_name: 'runner-07' } }, 'b200-nscale')).toBe('B200');
    expect(nativeHardware({ ci: { runner_name: 'h200-dgxc-gha-01' } }, 'b200-nscale')).toBe('B200');
    expect(nativeHardware({ ci: { runner_name: 'gb200-nvl72-02' } })).toBe('GB200 NVL72');
    expect(nativeHardware({ ci: { runner_name: 'runner-07' } })).toBe('');
    expect(nativeHardware({ ci: { runner_name: null } })).toBe('');
    expect(nativeHardware(null)).toBe('');
    const b = await bundle();
    set(at(b.ci, 'ci'), 'runner_name', 'h200-dgxc-gha-01');
    const source = videoHistoryEntry(stored(b), null).sources[0];
    expect(source.hardware).toBe('H200');
    expect(source.observations.map((point) => point.hardware)).toEqual(['H200', 'H200', 'H200']);
    for (const concurrency of [1, 2, 4])
      set(b.documents.get(`gpu/c${concurrency}/aggregate.json`)!, 'cluster', 'b200-nscale');
    const sealed = videoHistoryEntry(stored(b), null).sources[0];
    expect(sealed.hardware).toBe('B200');
    expect(sealed.observations.map((point) => point.hardware)).toEqual(['B200', 'B200', 'B200']);
  });

  it('renders invalid power as not measured and withholds the unverified cell', async () => {
    const b = await bundle();
    invalidatePower(b, 2);
    const all = points(b);
    expect(all).toHaveLength(3);
    expect(all[1]).toMatchObject({ power: null, energy: null, powerWindow: null, samples: 0 });
    expect(latencyValue(all[1], 'median')).toBeNull();
    expect(all[1].rate).toBeNull();
    expect(all[2]).toMatchObject({ power: 1201, energy: 18000.25 });
    const source = videoHistoryEntry(stored(b), null).sources[0];
    expect(source.error).toBeNull();
    expect(source.powerVerified).toBe(false);
    expect(source.observations[1]).toMatchObject({
      status: 'complete',
      valid: 4,
      p50: null,
      avgPowerW: null,
      energyKj: null,
    });
    expect(source.observations[2].avgPowerW).toBe(1201);
  });

  it('renders a cell without a power document as not measured', async () => {
    const b = await bundle();
    const cell = cellOf(b, 1);
    set(cell, 'power', null);
    set(cell, 'verified', false);
    set(b.documents.get('gpu/c1/gpu-job.json')!, 'measurement_verified', false);
    b.documents.delete('gpu/c1/power.json');
    b.checksums.delete('gpu/c1/power.json');
    expect(servingCells(b)[0].power).toBeNull();
    const observation = videoHistoryEntry(stored(b), null).sources[0].observations[0];
    expect(observation).toMatchObject({ avgPowerW: null, energyKj: null, p50: null });
  });

  it('keeps the launcher contract and power seal strict', async () => {
    const defects: [string, (b: Bundle) => void][] = [
      [
        'legacy receipt',
        (b) =>
          set(b.documents.get('gpu/c1/gpu-job.json')!, 'bundle_type', 'controlled_serving_smoke'),
      ],
      [
        'receipt power seal',
        (b) => set(at(b.documents.get('gpu/c1/gpu-job.json'), 'power'), 'sha256', '0'.repeat(64)),
      ],
      ['power verdict', (b) => set(b.documents.get('gpu/c1/power.json')!, 'valid', false)],
      ['verified without power', (b) => set(cellOf(b, 1), 'power', null)],
      [
        'matrix launcher',
        (b) => set(b.documents.get('serving-smoke.json')!, 'evidence_kind', null),
      ],
      ['ci launcher', (b) => set(b.ci, 'evidence_kind', 'controlled_h3_gpu')],
      ['summary median', (b) => set(at(cellOf(b, 1), 'metrics'), 'latency_median_seconds', 1)],
      ['aggregate seal', (b) => set(at(cellOf(b, 1), 'aggregate'), 'sha256', '0'.repeat(64))],
      [
        'client concurrency',
        (b) => set(at(b.documents.get('gpu/c1/baseline/run.json'), 'serving'), 'concurrency', 2),
      ],
    ];
    for (const [name, defect] of defects) {
      const b = await bundle();
      defect(b);
      expect(() => servingCells(b), name).toThrow('Invalid video serving matrix:');
    }
  });

  it('lets a dissenting InferenceX sidecar withhold energy or the whole power reading', async () => {
    const b = await bundle();
    set(b.documents.get('gpu/c4/benchmark_concurrency_4.json')!, 'energy_normalization', 'tokens');
    set(b.documents.get('gpu/c2/aggregate.json')!, 'power_valid', 0);
    const all = points(b);
    expect(all[2]).toMatchObject({ power: 1201, energy: null });
    expect(all[1]).toMatchObject({ power: null, energy: null });
    expect(latencyValue(all[1], 'median')).toBe(119);
  });
});
