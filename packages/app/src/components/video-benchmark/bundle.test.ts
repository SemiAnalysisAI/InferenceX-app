import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  at,
  estimateEconomics,
  httpReader,
  loadBundle,
  sampledPower,
  safePath,
  sha256,
  type Json,
} from './bundle';

// Synthetic contract tests only. These values are never presented as benchmark evidence.
async function fixture(extra: Record<string, string> = {}) {
  const files = new Map(
    Object.entries({
      'manifest.json': JSON.stringify({
        schema_version: 1,
        run_id: '123',
        run_attempt: '1',
        ci: { repository: 'SemiAnalysisAI/InferenceX' },
        git_commit: 'a'.repeat(40),
        evidence: {},
      }),
      'ci.json': JSON.stringify({ phase: 'failed', exit_code: 2 }),
      ...extra,
    }).map(([name, value]) => [name, new Blob([value])]),
  );
  const sums = [];
  for (const [name, blob] of files) sums.push(`${await sha256(blob)}  ${name}`);
  files.set('SHA256SUMS', new Blob([`${sums.join('\n')}\n`]));
  return {
    files,
    read: async (name: string) => {
      const file = files.get(name);
      if (!file) throw new Error(`Missing: ${name}`);
      return await Promise.resolve(file);
    },
  };
}
describe('H3 artifact contract', () => {
  it('loads a partial failed attempt without inventing report/media or measurements', async () => {
    const f = await fixture();
    const b = await loadBundle(f.read);
    expect(at(b.ci, 'phase')).toBe('failed');
    expect(b.report).toBeNull();
    expect(b.files.size).toBe(3);
  });
  it('rejects modified bytes and missing files', async () => {
    const f = await fixture();
    f.files.set('ci.json', new Blob(['tampered']));
    await expect(loadBundle(f.read)).rejects.toThrow('SHA256 mismatch: ci.json');
    f.files.delete('ci.json');
    await expect(loadBundle(f.read)).rejects.toThrow('Missing: ci.json');
  });
  it('rejects inconsistent manifest evidence even when the inventory is self-consistent', async () => {
    const f = await fixture({
      'manifest.json': JSON.stringify({
        schema_version: 1,
        run_id: '123',
        run_attempt: '1',
        ci: { repository: 'SemiAnalysisAI/InferenceX' },
        git_commit: 'a'.repeat(40),
        evidence: { 'ci.json': 'b'.repeat(64) },
      }),
    });
    await expect(loadBundle(f.read)).rejects.toThrow('Manifest evidence mismatch');
  });
  it('rejects fixture reports and unknown manifest versions', async () => {
    const synthetic = await fixture({ 'report/evidence.json': '{"bundle_type":"synthetic"}' });
    await expect(loadBundle(synthetic.read)).rejects.toThrow('Unsupported report');
    const unknown = await fixture({ 'manifest.json': '{"schema_version":2}' });
    await expect(loadBundle(unknown.read)).rejects.toThrow('Unsupported H3');
  });
  it.each([
    '../secret',
    '/absolute',
    'a/../b',
    'a/%2e%2e/b',
    'https://other/x',
    String.raw`a\b`,
    'a?x=1',
    'a\n',
  ])('rejects unsafe paths: %s', (path) => expect(() => safePath(path)).toThrow());
  it('permits only explicit HTTPS or loopback artifact directories without embedded credentials', () => {
    expect(() => httpReader('https://example.com/run/manifest.json')).not.toThrow();
    expect(() => httpReader('http://127.0.0.1:8769/manifest.json')).not.toThrow();
    for (const url of [
      'http://example.com/manifest.json',
      'https://user:secret@example.com/manifest.json',
      'https://example.com/manifest.json?token=secret',
      'file:///manifest.json',
    ])
      expect(() => httpReader(url)).toThrow();
  });
});
function sample(t: number, watts: Json, phase = 'measurement'): Json {
  return {
    monotonic_seconds: t,
    phase,
    at: `time-${t}`,
    gpus: [{ uuid: 'GPU-1', power_watts: watts }],
    owned_compute_apps: [{ gpu_uuid: 'GPU-1' }],
    unowned_compute_apps: [],
  };
}
describe('sampled board power', () => {
  it('integrates unequal intervals, excludes startup and does not extrapolate endpoints', () => {
    const value = sampledPower(
      [sample(0, 999, 'startup'), sample(1, 100), sample(2, 200), sample(4, 100)],
      ['GPU-1'],
      3,
    );
    expect(value).toMatchObject({
      watts: 150,
      joules: 450,
      seconds: 3,
      sampleCount: 3,
      start: 'time-1',
      end: 'time-4',
    });
  });
  it('keeps missing power, missing GPUs, insufficient samples, gaps and duplicate timestamps unavailable', () => {
    for (const samples of [
      [sample(1, 1)],
      [sample(1, 100), sample(2, null)],
      [sample(1, 100), sample(5, 100)],
      [sample(1, 100), sample(1, 100)],
    ])
      expect(sampledPower(samples, ['GPU-1'], 3)).toBeNull();
    expect(sampledPower([sample(1, 100), sample(2, 100)], ['GPU-2'], 3)).toBeNull();
    expect(sampledPower([sample(1, 0), sample(2, 0)], ['GPU-1'], 3)?.joules).toBe(0);
  });
});
describe('explicit economics assumptions', () => {
  it('charges billed GPUs while displaying both denominators and preserves a negative profit', () => {
    const value = estimateEconomics(1 / 60, 4, 8, 0.2, 3);
    expect(value).toEqual({
      revenue: 12,
      revenuePerParticipating: 3,
      revenuePerBilled: 1.5,
      profitPerParticipating: -3,
      profitPerBilled: -1.5,
    });
    expect(estimateEconomics(1 / 60, 4, 8, 0.2, null)?.profitPerBilled).toBeNull();
  });
  it('rejects absent/invalid assumptions without converting missing data to zero', () => {
    expect(estimateEconomics(null, 4, 8, 1, 1)).toBeNull();
    expect(estimateEconomics(1, 4, 2, 1, 1)).toBeNull();
    expect(estimateEconomics(1, 4, 8, Number.NaN, 1)).toBeNull();
  });
});

// Opt-in verification of original downloaded backend bytes; no model/GPU execution.
it.skipIf(!process.env.H3_ARTIFACT_DIR)(
  'opens the real CI artifact with both roles and native audio',
  async () => {
    const b = await loadBundle(
      async (path) => new Blob([await readFile(join(process.env.H3_ARTIFACT_DIR!, path))]),
    );
    expect(at(b.ci, 'phase')).toBe('complete');
    expect(at(b.ci, 'regression_status')).toBe('inconclusive');
    for (const role of ['baseline', 'candidate']) {
      expect(at(b.report, 'roles', role, 'observations', 0, 'media', 'audio', 'channels')).toBe(2);
      expect(at(b.report, 'roles', role, 'summary', 'valid')).toBe(1);
    }
  },
);
