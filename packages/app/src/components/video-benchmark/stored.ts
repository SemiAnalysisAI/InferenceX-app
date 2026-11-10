import { at, type Bundle, type Json } from './bundle';
import type { CIArtifact } from './archive';
import { fidelityEvidence, type FidelityBundle } from './fidelity';
import type { ArtifactQuality, ClipQuality, UnscoredClip } from './reference-quality';
import type { DiagnosticPair } from './diagnostic-quality';

export interface StoredMedia {
  /** The sealed original. */
  url: string;
  downloadUrl: string;
  /** Web playback rendition of `url`, attached at read time and never stored in the index. */
  previewUrl?: string;
  /**
   * JPEG of the first decoded frame of `url`, attached at read time like `previewUrl`.
   * Presentation only; metrics, PSNR and Difference read the sealed original.
   */
  posterUrl?: string;
}
export interface StoredSource {
  id: string;
  kind?: 'fidelity';
  documents: [string, Json][];
  checksums: [string, string][];
  assets: [string, StoredMedia][];
  texts: [string, string][];
}
export function storedFidelityBundle(source: StoredSource): FidelityBundle {
  if (source.kind !== 'fidelity') throw new Error('Not a fidelity source');
  const documents = new Map(source.documents);
  const checksums = new Map(source.checksums);
  return {
    ...fidelityEvidence(documents, checksums, source.id, new Map(source.texts)),
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
  /** Independently sealed reference pairs; never an approval or part of the original ZIP. */
  quality?: ClipQuality[];
  /** Measured clips the quality scorer listed without a comparison. */
  unscored?: UnscoredClip[];
  /** The quality scorer could not read this artifact, so none of its clips were compared. */
  qualityUnreadable?: true;
  /** Native single-case diagnostics retain separate media and never become performance points. */
  diagnostics?: DiagnosticPair[];
}
/**
 * A verified quality attachment for one published artifact, stored apart from its immutable
 * index so later quality never rewrites the index or its approval.
 */
export interface StoredQuality extends ArtifactQuality {
  version: 1;
  runId: string;
  artifactId: number;
  /** The trusted Video Quality artifact the pairs were verified from. */
  source: { artifactId: number; name: string; workflowRunId: number };
}
export function withQuality(saved: StoredArtifact, quality: ArtifactQuality): StoredArtifact {
  return {
    ...saved,
    quality: quality.pairs,
    unscored: quality.unscored,
    ...(quality.unreadable ? { qualityUnreadable: true as const } : {}),
  };
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
