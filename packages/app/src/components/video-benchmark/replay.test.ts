import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { replayVideoArtifact } from './replay';

const fixture = join(import.meta.dirname, 'fixtures', 'native-serving-bundle');
const planHash = 'f'.repeat(64);
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

// Package the existing synthetic reader fixture for tests only, never as CI evidence.
async function archive(change?: (files: Record<string, string>) => void) {
  const paths = await readdir(fixture, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = Object.fromEntries(
    await Promise.all(
      paths
        .filter((p) => p.isFile())
        .map(async (p) => {
          const path = join(p.parentPath, p.name).slice(fixture.length + 1);
          return [path, await readFile(join(fixture, path), 'utf8')];
        }),
    ),
  );
  change?.(files);
  const manifest = JSON.parse(files['manifest.json']);
  for (const path of Object.keys(manifest.evidence)) manifest.evidence[path] = hash(files[path]);
  files['manifest.json'] = JSON.stringify(manifest);
  files.SHA256SUMS = Object.entries(files)
    .filter(([path]) => path !== 'SHA256SUMS')
    .map(([path, bytes]) => `${hash(bytes)}  ${path}`)
    .join('\n');
  const zip = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, value]) => [path, strToU8(value)])),
  );
  const metadata = {
    id: 9,
    name: 'h3-results-123456789-1',
    expired: false,
    size_in_bytes: zip.length,
    digest: `sha256:${hash(zip)}`,
    workflow_run: { id: 123456789, head_sha: 'b'.repeat(40) },
  };
  return { blob: new Blob([new Uint8Array(zip)]), metadata };
}

afterEach(() => vi.unstubAllGlobals());

describe('offline original CI ZIP replay', () => {
  it('reuses the sealed reader, keeps both GPU counts, and never grants local publication approval', async () => {
    const { blob, metadata } = await archive((files) => {
      const ci = JSON.parse(files['ci.json']);
      ci.site = { gpu_model: 'NVIDIA H100 80GB HBM3' };
      ci.slurm_job.AllocTRES = 'cpu=128,gres/gpu=8';
      files['ci.json'] = JSON.stringify(ci);
    });
    const fetch = vi.fn(() => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetch);
    const report = await replayVideoArtifact(blob, metadata, planHash);
    expect(report).toMatchObject({
      ok: true,
      artifact: metadata,
      errors: [],
      officialPoints: 0,
      namedDiagnosticPoints: 3,
    });
    expect(report.history).toMatchObject({ approved: false, publishedAt: null });
    expect(report.cells[0]).toMatchObject({
      cell: 'c1',
      planSha256: planHash,
      frameCount: 107,
      caseCount: 1,
      distinctPrompts: 1,
    });
    expect(report.history.sources[0].observations[0]).toMatchObject({
      hardware: 'NVIDIA H100 80GB HBM3',
      participating: 2,
      allocated: 8,
      scheduled: 4,
      valid: 4,
    });
    expect(report.results).toEqual([]); // Four samples cannot satisfy the Results floor.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires original size, digest and workflow metadata and verifies the original ZIP bytes', async () => {
    const { blob, metadata } = await archive();
    for (const changed of [
      { ...metadata, size_in_bytes: blob.size + 1 },
      { ...metadata, digest: null },
      { ...metadata, workflow_run: null },
    ])
      await expect(replayVideoArtifact(blob, changed, planHash)).rejects.toThrow(
        'Original GitHub artifact metadata',
      );
    await expect(
      replayVideoArtifact(blob, { ...metadata, digest: `sha256:${'0'.repeat(64)}` }, planHash),
    ).rejects.toThrow('digest mismatch');
    await expect(
      replayVideoArtifact(
        blob,
        { ...metadata, workflow_run: { ...metadata.workflow_run, id: 100 } },
        planHash,
      ),
    ).rejects.toThrow('different runs');
  });

  it('reports every cell with a wrong expected workload while retaining original counts', async () => {
    const { blob, metadata } = await archive();
    const report = await replayVideoArtifact(blob, metadata, 'a'.repeat(64));
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      [1, 2, 4].map((c) => `123456789/c${c}: missing or mismatched expected plan SHA256`),
    );
    expect(report.cells.map((c) => c.completion)).toEqual(
      Array.from({ length: 3 }, () => ({
        scheduled: 4,
        attempted: 4,
        completed: 4,
        valid: 4,
        failed: 0,
        not_started: 0,
        unfinished: 0,
      })),
    );
    expect(report.history.sources[0].observations[0].allocated).toBeNull();
  });

  it('keeps failed-cell denominators and reports a missing run instead of manufacturing an accepted result', async () => {
    const { blob, metadata } = await archive((files) => {
      const matrix = JSON.parse(files['serving-smoke.json']);
      Object.assign(matrix.cells[0], {
        verified: false,
        status: 'failed',
        run: null,
        receipt: null,
        power: null,
        completion: { scheduled: 20, attempted: 20, completed: 19, valid: 19, failed: 1 },
      });
      files['serving-smoke.json'] = JSON.stringify(matrix);
    });
    const report = await replayVideoArtifact(blob, metadata, planHash);
    expect(report.ok).toBe(false);
    expect(report.cells[0]).toMatchObject({
      status: 'failed',
      verified: false,
      powerValid: null,
      planSha256: null,
      completion: { scheduled: 20, attempted: 20, completed: 19, valid: 19, failed: 1 },
    });
    expect(report.errors).toEqual(['123456789/c1: missing or mismatched expected plan SHA256']);
    expect(report.officialPoints).toBe(0);
  });

  it('reports a rejected source and fails an empty replay', async () => {
    const { blob, metadata } = await archive((files) => {
      const matrix = JSON.parse(files['serving-smoke.json']);
      matrix.cells = [];
      files['serving-smoke.json'] = JSON.stringify(matrix);
    });
    const report = await replayVideoArtifact(blob, metadata, planHash);
    expect(report.ok).toBe(false);
    expect(report.errors).toContain(
      '123456789: Invalid H3 serving matrix: unsupported matrix contract',
    );
    expect(report.cells).toEqual([]);
    expect(report.namedDiagnosticPoints).toBe(0);
  });
});
