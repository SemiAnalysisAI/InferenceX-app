import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { at, type Json } from './bundle';
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
    expect(() => fidelityEvidence(fixture.documents, fixture.checksums, '790')).toThrow(
      'Unsupported',
    );
    const { documents, checksums } = changed();
    both(documents, (value) =>
      Object.assign(at(value, 'source_artifacts', 0, 'artifact', 'workflow_run')!, {
        head_sha: 'f'.repeat(40),
      }),
    );
    expect(() => fidelityEvidence(documents, checksums, fixture.runId)).toThrow('source snapshots');
    const invalidProducer = changed();
    both(invalidProducer.documents, (value) =>
      Object.assign(at(value, 'producer')!, { run_url: 'https://untrusted.example.test/run' }),
    );
    expect(() =>
      fidelityEvidence(invalidProducer.documents, invalidProducer.checksums, fixture.runId),
    ).toThrow('Unsupported');
  });
  it('rejects portable metric changes while allowing only documented media path rewrites', () => {
    const { documents, checksums } = changed();
    Object.assign(at(documents.get('report/index.comparison.json'), 'slots', 0, 'metrics')!, {
      video_psnr_db: 999,
    });
    expect(() => fidelityEvidence(documents, checksums, fixture.runId)).toThrow('disagrees');
  });
  it('rejects substituted media hashes and missing verified entry points', () => {
    const extra = changed();
    extra.checksums.set('report/index_assets/unreferenced.mp4', 'e'.repeat(64));
    expect(() => fidelityEvidence(extra.documents, extra.checksums, fixture.runId)).toThrow(
      'Unreferenced',
    );
    const { documents, checksums } = changed();
    const path = `report/${at(documents.get('report/index.comparison.json'), 'slots', 0, 'baseline', 'artifact_path')}`;
    checksums.set(path, 'f'.repeat(64));
    expect(() => fidelityEvidence(documents, checksums, fixture.runId)).toThrow('media identity');
    checksums.delete('report/index.html');
    expect(() => fidelityEvidence(documents, checksums, fixture.runId)).toThrow('unverified');
  });
  it('rejects mismatched source seals and an empty comparison', () => {
    const { documents, checksums } = changed();
    checksums.set('sources/101/original-SHA256SUMS', 'f'.repeat(64));
    expect(() => fidelityEvidence(documents, checksums, fixture.runId)).toThrow('source snapshots');
    both(documents, (value) => Object.assign(value!, { slots: [] }));
    expect(() => fidelityEvidence(documents, checksums, fixture.runId)).toThrow('slots');
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
  },
);
