import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { at, sha256, text, type Json } from './bundle';
import { fidelityEvidence, fidelitySource, loadFidelityBundle } from './fidelity';
import { fidelityFixture } from './fidelity.fixture';
import { storedBundle, storedFidelityBundle } from './stored';
import { servingCells } from './serving';

let fixture: Awaited<ReturnType<typeof fidelityFixture>>;
beforeAll(async () => {
  fixture = await fidelityFixture();
});
const changed = () => ({
  documents: structuredClone(fixture.documents),
  checksums: new Map(fixture.checksums),
});
const verify = (
  documents: Map<string, Json>,
  checksums: Map<string, string>,
  runId?: string,
  seals = new Map(fixture.published.texts),
) => fidelityEvidence(documents, checksums, runId, seals);
const both = (documents: Map<string, Json>, mutate: (value: Json) => void) => {
  for (const path of ['comparison.json', 'report/index.comparison.json'])
    mutate(documents.get(path)!);
};

describe('native H3 fidelity evidence (synthetic fixtures)', () => {
  it('loads the sealed native artifact and restores stored media references without a fake manifest', async () => {
    const loaded = await loadFidelityBundle(fixture.read, fixture.runId);
    expect(loaded.comparisonSha256).toBe(fixture.checksums.get('comparison.json'));
    expect(at(loaded.comparison, 'summary', 'matched_valid_pairs')).toBe(2);
    expect(loaded.documents.has('manifest.json')).toBe(false);
    expect(storedFidelityBundle(fixture.published).comparison).toEqual(loaded.comparison);
    expect(at(fidelitySource(loaded, 'baseline'), 'ci', 'databaseId')).toBe(101);
    expect(at(fidelitySource(loaded, 'candidate'), 'ci', 'databaseId')).toBe(102);
    for (const original of fixture.originals)
      expect(servingCells(storedBundle(original.sources[0]))).toHaveLength(1);
  });
  it('rejects producer and original source identity substitutions', () => {
    expect(() => verify(fixture.documents, fixture.checksums, '790')).toThrow('Unsupported');
    const { documents, checksums } = changed();
    both(documents, (value) =>
      Object.assign(at(value, 'source_artifacts', 0, 'artifact', 'workflow_run')!, {
        head_sha: 'f'.repeat(40),
      }),
    );
    expect(() => verify(documents, checksums, fixture.runId)).toThrow('source snapshots');
    const invalidProducer = changed();
    both(invalidProducer.documents, (value) =>
      Object.assign(at(value, 'producer')!, { run_url: 'https://untrusted.example.test/run' }),
    );
    expect(() =>
      verify(invalidProducer.documents, invalidProducer.checksums, fixture.runId),
    ).toThrow('Unsupported');
  });
  it('rejects portable metric changes while allowing only documented media path rewrites', () => {
    const { documents, checksums } = changed();
    Object.assign(at(documents.get('report/index.comparison.json'), 'slots', 0, 'metrics')!, {
      video_psnr_db: 999,
    });
    expect(() => verify(documents, checksums, fixture.runId)).toThrow('disagrees');
  });
  it('rejects substituted media hashes and missing verified entry points', () => {
    const extra = changed();
    extra.checksums.set('report/index_assets/unreferenced.mp4', 'e'.repeat(64));
    expect(() => verify(extra.documents, extra.checksums, fixture.runId)).toThrow('Unreferenced');
    const { documents, checksums } = changed();
    const path = `report/${at(documents.get('report/index.comparison.json'), 'slots', 0, 'baseline', 'artifact_path')}`;
    checksums.set(path, 'f'.repeat(64));
    expect(() => verify(documents, checksums, fixture.runId)).toThrow('media identity');
    checksums.delete('report/index.html');
    expect(() => verify(documents, checksums, fixture.runId)).toThrow('unverified');
  });
  it('rejects mismatched source seals and an empty comparison', () => {
    const { documents, checksums } = changed();
    checksums.set('sources/101/original-SHA256SUMS', 'f'.repeat(64));
    expect(() => verify(documents, checksums, fixture.runId)).toThrow('source snapshots');
    both(documents, (value) => Object.assign(value!, { slots: [] }));
    expect(() => verify(documents, checksums, fixture.runId)).toThrow('slots');
  });
  it('rejects copied hardware metadata changed and resealed only in the comparison artifact', async () => {
    const files = new Map(fixture.files);
    const { documents, checksums } = changed();
    const path = 'sources/101/ci.json';
    Object.assign(at(documents.get(path), 'site')!, { gpu_model: 'Substituted hardware' });
    const altered = new Blob([JSON.stringify(documents.get(path))]);
    files.set(path, altered);
    checksums.set(path, await sha256(altered));
    files.set(
      'SHA256SUMS',
      new Blob([[...checksums].map(([name, hash]) => `${hash}  ${name}`).join('\n')]),
    );
    await expect(
      loadFidelityBundle((name) => Promise.resolve(files.get(name)!), fixture.runId),
    ).rejects.toThrow('snapshot differs from original inventory: ci.json');
    expect(() =>
      storedFidelityBundle({
        ...fixture.published,
        documents: [...documents],
        checksums: [...checksums],
      }),
    ).toThrow('snapshot differs from original inventory: ci.json');
  });
  it('binds all retained snapshot hashes and requires a well-formed original inventory', () => {
    const sample = fixture;
    for (const path of ['manifest.json', 'serving-smoke.json', 'c1-run.json']) {
      const { documents, checksums } = changed();
      checksums.set(`sources/101/${path}`, 'f'.repeat(64));
      expect(() => verify(documents, checksums, sample.runId)).toThrow(
        /source snapshots|original inventory/u,
      );
    }
    expect(() => verify(sample.documents, sample.checksums, sample.runId, new Map())).toThrow(
      'Missing original',
    );
    const sourcePath = 'sources/101/original-SHA256SUMS';
    const original = new Map(sample.published.texts).get(sourcePath)!;
    for (const invalid of [
      'not a checksum',
      `${original}\n${original.split('\n')[0]}`,
      `${'f'.repeat(64)}  ../escape.json`,
    ]) {
      const seals = new Map<string, string>([...sample.published.texts, [sourcePath, invalid]]);
      expect(() => verify(sample.documents, sample.checksums, sample.runId, seals)).toThrow(
        /inventory|Unsafe artifact path/u,
      );
    }
  });
  it('checks actual bytes before rendering any evidence', async () => {
    await expect(
      loadFidelityBundle(
        (path) =>
          path === 'comparison.json' ? Promise.resolve(new Blob(['{}'])) : fixture.read(path),
        fixture.runId,
      ),
    ).rejects.toThrow('SHA256 mismatch');
  });
});

const realDirectory = process.env.H3_FIDELITY_ARTIFACT_DIR;
it.skipIf(!realDirectory)(
  'loads an explicitly supplied real compact artifact without copying it into fixtures',
  async () => {
    const bundle = await loadFidelityBundle(
      async (path) => new Blob([await readFile(join(realDirectory!, path))]),
    );
    expect(at(bundle.comparison, 'bundle_type')).toBe('mvp_comparison');
    expect(at(bundle.comparison, 'summary', 'matched_valid_pairs')).toBe(20);
    expect(fidelitySource(bundle, 'baseline')).not.toBeNull();
    expect(fidelitySource(bundle, 'candidate')).not.toBeNull();
    const texts: [string, string][] = [];
    for (const [path, file] of bundle.files)
      if (path === 'report/index.html' || path.endsWith('/original-SHA256SUMS'))
        texts.push([path, await file.text()]);
    const stored = storedFidelityBundle({
      id: text(at(bundle.comparison, 'producer', 'run_id')),
      kind: 'fidelity',
      documents: [...bundle.documents],
      checksums: [...bundle.checksums],
      assets: [],
      texts,
    });
    expect(stored.comparisonSha256).toBe(bundle.comparisonSha256);
  },
);
