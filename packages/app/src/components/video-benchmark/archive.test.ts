import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { archiveSources } from './archive';
import { loadBundle } from './bundle';
const artifact = { id: 20, name: 'h3-video-10-1', expired: false, size_in_bytes: 0 };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function archive(files: Record<string, string>) {
  return new Blob([
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))).buffer,
  ]);
}
describe('CI ZIP import', () => {
  it('verifies and opens a legacy CI artifact', async () => {
    const manifest = JSON.stringify({
      schema_version: 1,
      run_id: '10',
      run_attempt: '1',
      git_commit: 'a'.repeat(40),
      ci: { repository: 'SemiAnalysisAI/InferenceX' },
    });
    const blob = archive({
      'manifest.json': manifest,
      SHA256SUMS: `${hash(manifest)}  manifest.json\n`,
    });
    const [source] = await archiveSources(blob, artifact);
    expect(source.id).toBe('10');
    const bundle = await loadBundle(source.read);
    expect(bundle.manifestSha256).toBe(hash(manifest));
  });
  it('preserves original execution identities in an exported archive', async () => {
    const index = JSON.stringify({
      schema_version: '1.0.0',
      producer: { ci: { run_id: '10', run_attempt: '1' } },
      results: [{ source_run_id: '9', manifest: 'source-9/result.json' }],
    });
    const files = {
      'index.json': index,
      'source-9/result.json': '{}',
      'source-9/manifest.json': JSON.stringify({ run_id: '9' }),
    };
    const blob = archive({
      ...files,
      SHA256SUMS: Object.entries(files)
        .map(([path, value]) => `${hash(value)}  ${path}`)
        .join('\n'),
    });
    const [source] = await archiveSources(blob, { ...artifact, name: 'h3-results-10-1' });
    expect(source.id).toBe('9');
    const original = await source.read('manifest.json');
    expect(JSON.parse(await original.text())).toEqual({ run_id: '9' });
    await expect(archiveSources(blob, { ...artifact, name: 'h3-results-11-1' })).rejects.toThrow(
      'different runs',
    );
  });
  it('rejects a legacy manifest attributed to another CI run', async () => {
    const manifest = JSON.stringify({ run_id: '11', run_attempt: '1' });
    await expect(
      archiveSources(
        archive({
          'manifest.json': manifest,
          SHA256SUMS: `${hash(manifest)}  manifest.json`,
        }),
        artifact,
      ),
    ).rejects.toThrow('different runs');
  });
  it('binds fidelity processing provenance to GitHub metadata when available', async () => {
    const comparison = JSON.stringify({
      producer: { run_id: '10', run_attempt: '1', git_commit: 'a'.repeat(40) },
    });
    const blob = archive({
      'comparison.json': comparison,
      SHA256SUMS: `${hash(comparison)}  comparison.json`,
    });
    const fidelity = { ...artifact, name: 'h3-fidelity-10-1' };
    const [source] = await archiveSources(blob, {
      ...fidelity,
      workflow_run: { id: 10, head_sha: 'a'.repeat(40) },
    });
    expect(source.id).toBe('10');
    await expect(
      archiveSources(blob, {
        ...fidelity,
        workflow_run: { id: 10, head_sha: 'b'.repeat(40) },
      }),
    ).rejects.toThrow('different runs');
    await expect(
      archiveSources(blob, {
        ...fidelity,
        workflow_run: { id: 11, head_sha: 'a'.repeat(40) },
      }),
    ).rejects.toThrow('different runs');
  });
  it('rejects corrupted GitHub archive digests', async () => {
    await expect(
      archiveSources(archive({}), { ...artifact, digest: `sha256:${'0'.repeat(64)}` }),
    ).rejects.toThrow('digest mismatch');
  });
  it('rejects unsafe paths and checksum mismatches', async () => {
    await expect(archiveSources(archive({ '../secret': 'x' }), artifact)).rejects.toThrow('Unsafe');
    await expect(
      archiveSources(
        archive({ SHA256SUMS: `${'0'.repeat(64)}  manifest.json`, 'manifest.json': '{}' }),
        artifact,
      ),
    ).rejects.toThrow('checksum mismatch');
  });
  it('rejects unknown export schemas', async () => {
    const index = JSON.stringify({
      schema_version: '99',
      producer: { ci: { run_id: '10', run_attempt: '1' } },
      results: [],
    });
    await expect(
      archiveSources(
        archive({ 'index.json': index, SHA256SUMS: `${hash(index)}  index.json` }),
        artifact,
      ),
    ).rejects.toThrow('Unsupported');
  });
});
