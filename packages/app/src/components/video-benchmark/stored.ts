import { at, type Bundle, type Json } from './bundle';
import type { CIArtifact } from './archive';
import { fidelityEvidence, type FidelityBundle } from './fidelity';

export interface StoredSource {
  id: string;
  kind?: 'fidelity';
  documents: [string, Json][];
  checksums: [string, string][];
  assets: [string, { url: string; downloadUrl: string }][];
  texts: [string, string][];
}
export function storedFidelityBundle(source: StoredSource): FidelityBundle {
  if (source.kind !== 'fidelity') throw new Error('Not a fidelity source');
  const documents = new Map(source.documents);
  const checksums = new Map(source.checksums);
  return {
    ...fidelityEvidence(documents, checksums, source.id),
    documents,
    checksums,
    files: new Map(source.texts.map(([path, value]) => [path, new Blob([value])])),
  };
}
export interface StoredArtifact {
  storageVersion: 1;
  runId: string;
  artifact: CIArtifact;
  sources: StoredSource[];
}
export function storedBundle(source: StoredSource): Bundle {
  const documents = new Map(source.documents);
  const checksums = new Map(source.checksums);
  const manifest = documents.get('manifest.json') ?? null;
  if (at(manifest, 'run_id') !== source.id || !checksums.has('manifest.json'))
    throw new Error('Stored result identity mismatch');
  return {
    manifest,
    result: documents.get('result.json') ?? null,
    report: documents.get('report/evidence.json') ?? null,
    job: documents.get('gpu/gpu-job.json') ?? null,
    ci: documents.get('ci.json') ?? null,
    comparison: documents.get('gpu/comparison.json') ?? null,
    documents,
    checksums,
    files: new Map(source.texts.map(([path, value]) => [path, new Blob([value])])),
    manifestSha256: checksums.get('manifest.json')!,
  };
}
