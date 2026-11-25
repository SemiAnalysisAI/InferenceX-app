import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { at, generationDuration, loadBundle, safePath, sha256 } from './bundle';

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
  it.each(['', '{"interrupted":'])(
    'retains interrupted stdout without parsing it: %j',
    async (log) => {
      const path = 'gpu/c2/supervisor/baseline/client.stdout.json';
      const f = await fixture({ [path]: log });
      const b = await loadBundle(f.read);
      expect(at(b.ci, 'phase')).toBe('failed');
      expect(await b.files.get(path)!.text()).toBe(log);
      expect(b.documents.has(path)).toBe(false);
      f.files.set(path, new Blob(['changed after sealing']));
      await expect(loadBundle(f.read)).rejects.toThrow(`SHA256 mismatch: ${path}`);
    },
  );
  it('still rejects malformed structured result documents', async () => {
    const f = await fixture({ 'gpu/c2/gpu-job.json': '{"status":' });
    await expect(loadBundle(f.read)).rejects.toThrow(SyntaxError);
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
});

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

describe('generationDuration', () => {
  it('prefers the nominal duration and falls back to frame_count / fps', () => {
    expect(generationDuration({ duration_seconds: 5, frame_count: 124, fps: 24 })).toBe(5);
    expect(generationDuration({ frame_count: 81, fps: 16 })).toBe(5.0625);
    expect(generationDuration({ duration_seconds: 0, frame_count: 81, fps: 16 })).toBeNull();
    expect(generationDuration({ frame_count: 81 })).toBeNull();
    expect(generationDuration({ frame_count: 81, fps: 0 })).toBeNull();
    expect(generationDuration(null)).toBeNull();
  });
});
