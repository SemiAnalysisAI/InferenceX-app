import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { at, loadBundle, type Json } from './bundle';
import { servingFixture as fixture } from './serving.fixture';
import { servingCells } from './serving';

function set(value: Json, key: string, replacement: Json) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  value[key] = replacement;
}

describe('H3 serving matrix', () => {
  it('loads three single-runtime cells, preserves unavailable P90 and resolves original media', () => {
    const b = fixture();
    const cells = servingCells(b);
    expect(cells.map(({ id, concurrency }) => [id, concurrency])).toEqual([
      ['c1', 1],
      ['c2', 2],
      ['c4', 4],
    ]);
    expect(cells[2].runPath).toBe('gpu/c4/baseline/run.json');
    expect(at(cells[2].run, 'records', 1, 'artifact_path')).toBe(
      'artifacts/measurement-r001-c001.mp4',
    );
    expect(at(cells[2].run, 'serving', 'client_ready_latency_seconds', 'p90')).toBeNull();
    expect(at(cells[2].job, 'roles', 'candidate')).toBeNull();
    expect(at(cells[2].power, 'phases', 'measurement', 'aggregate', 'joules_per_valid_clip')).toBe(
      168000,
    );
  });
  it('leaves old artifacts alone and retains unstarted cells without invented results', () => {
    const b = fixture();
    const matrix = b.documents.get('serving-smoke.json')!;
    const last = at(matrix, 'cells', 2);
    set(last, 'status', 'not_started');
    set(last, 'verified', false);
    set(last, 'run', null);
    set(last, 'receipt', null);
    set(last, 'power', null);
    for (const path of b.documents.keys()) if (path.startsWith('gpu/c4/')) b.documents.delete(path);
    expect(servingCells(b)[2]).toMatchObject({
      id: 'c4',
      run: null,
      job: null,
      power: null,
      spec: null,
    });
    b.documents.delete('serving-smoke.json');
    expect(servingCells(b)).toEqual([]);
  });
  it.each([
    'version',
    'duplicate',
    'ci',
    'plan',
    'hardware',
    'concurrency',
    'job',
    'fixture',
    'metrics',
    'p50',
  ])('rejects inconsistent %s identity or accounting', (defect) => {
    const b = fixture();
    const matrix = b.documents.get('serving-smoke.json')!;
    const cell = at(matrix, 'cells', 0);
    const run = b.documents.get('gpu/c1/baseline/run.json')!;
    const job = b.documents.get('gpu/c1/gpu-job.json')!;
    const spec = b.documents.get('gpu/c1/spec.json')!;
    if (defect === 'version') set(matrix, 'schema_version', '2.0.0');
    if (defect === 'duplicate') set(at(matrix, 'cells', 1), 'concurrency', 1);
    if (defect === 'ci') set(b.ci, 'source_sha', 'd'.repeat(40));
    if (defect === 'plan') set(at(run, 'plan'), 'model_revision', 'e'.repeat(40));
    if (defect === 'hardware') set(spec, 'gpu_uuids', ['GPU-other']);
    if (defect === 'concurrency') set(at(run, 'measurement'), 'concurrency', 4);
    if (defect === 'job') set(job, 'job_id', 'github-999-1-c1');
    if (defect === 'fixture') set(run, 'evidence_kind', 'fixture');
    if (defect === 'metrics') set(at(cell, 'completion'), 'valid', 3);
    if (defect === 'p50') set(at(cell, 'metrics'), 'client_ready_p50_seconds', 1);
    expect(() => servingCells(b)).toThrow('Invalid H3 serving matrix:');
  });
  it.each(['reference', 'missing', 'spec', 'media', 'traversal', 'power'])(
    'rejects broken %s bindings',
    (defect) => {
      const b = fixture();
      const cell = at(b.documents.get('serving-smoke.json'), 'cells', 0);
      const record = at(b.documents.get('gpu/c1/baseline/run.json'), 'records', 1);
      if (defect === 'reference') set(at(cell, 'run'), 'sha256', '0'.repeat(64));
      if (defect === 'missing') b.documents.delete('gpu/c1/baseline/run.json');
      if (defect === 'spec') b.checksums.set('gpu/c1/spec.json', '0'.repeat(64));
      if (defect === 'media') set(record, 'sha256', '0'.repeat(64));
      if (defect === 'traversal') set(record, 'artifact_path', '../candidate/movie.mp4');
      if (defect === 'power')
        set(at(b.documents.get('gpu/c1/power.json'), 'phases', 'measurement'), 'valid', false);
      expect(() => servingCells(b)).toThrow();
    },
  );
});

it.skipIf(!process.env.H3_SERVING_ARTIFACT_DIR)(
  'reads the original checksum-sealed concurrency CI artifact',
  async () => {
    const b = await loadBundle(
      async (path) => new Blob([await readFile(join(process.env.H3_SERVING_ARTIFACT_DIR!, path))]),
    );
    const cells = servingCells(b);
    expect(cells.map(({ concurrency }) => concurrency)).toEqual([1, 2, 4]);
    expect(cells.map(({ cell }) => at(cell, 'completion', 'valid'))).toEqual([4, 4, 4]);
    expect(at(cells[0].run, 'records', 1, 'media', 'audio', 'channels')).toBe(2);
    expect(at(cells[2].cell, 'metrics', 'client_ready_p50_seconds')).toBeCloseTo(297.686668);
  },
);
