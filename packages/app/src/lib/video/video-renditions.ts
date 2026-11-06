import type { StoredArtifact, StoredSource } from '@/components/video-benchmark/stored';

/**
 * Web playback renditions of sealed H3 MP4s. The original stays the measured artifact;
 * a rendition only shortens the Clip view download.
 */
export const RENDITION_PROFILE = 'web-h264-crf23';
/** Fixed encode between `-i <original>` and the output path. */
export const RENDITION_ARGS = [
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '23',
  '-profile:v',
  'high',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'copy',
  '-movflags',
  '+faststart',
] as const;
export const RENDITION_DURATION_TOLERANCE_SECONDS = 0.05;

export interface RenditionReceipt {
  version: 1;
  profile: typeof RENDITION_PROFILE;
  source: { sha256: string };
  output: { sha256: string; url: string; bytes: number; durationSeconds: number };
  encoder: { ffmpeg: string; args: string[] };
}

export function renditionReceipt(
  sourceSha256: string,
  output: RenditionReceipt['output'],
  ffmpeg: string,
): RenditionReceipt {
  return {
    version: 1,
    profile: RENDITION_PROFILE,
    source: { sha256: sourceSha256 },
    output,
    encoder: { ffmpeg, args: [...RENDITION_ARGS] },
  };
}

/** One sealed original MP4, identified by its recorded SHA256. */
export interface RenditionSource {
  sha256: string;
  path: string;
  url: string;
}

/**
 * Every sealed MP4 of the stored sources, once per content hash, split by whether a rendition
 * receipt already exists. Fidelity sources reuse their originals' objects and dedupe here.
 */
export function renditionPlan(
  artifacts: readonly StoredArtifact[],
  done: ReadonlySet<string>,
): { pending: RenditionSource[]; existing: number } {
  const sources = new Map<string, RenditionSource>();
  for (const saved of artifacts)
    for (const source of saved.sources) {
      const checksums = new Map(source.checksums);
      for (const [path, asset] of source.assets) {
        const sha256 = checksums.get(path);
        if (!path.endsWith('.mp4') || !sha256 || !/^[a-f0-9]{64}$/u.test(sha256)) continue;
        if (!sources.has(sha256)) sources.set(sha256, { sha256, path, url: asset.url });
      }
    }
  const pending = [...sources.values()].filter((source) => !done.has(source.sha256));
  return { pending, existing: sources.size - pending.length };
}

/** Top-level ISO BMFF box types in file order; throws when a box runs past the end of the file. */
export function mp4TopLevelBoxes(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('Truncated MP4 box header');
    let size = view.getUint32(offset);
    const type = String.fromCodePoint(...bytes.subarray(offset + 4, offset + 8));
    if (size === 1) {
      if (offset + 16 > bytes.byteLength) throw new Error('Truncated MP4 box header');
      size = Number(view.getBigUint64(offset + 8));
    } else if (size === 0) {
      size = bytes.byteLength - offset;
    }
    if (size < 8 || offset + size > bytes.byteLength) throw new Error(`Truncated MP4 ${type} box`);
    types.push(type);
    offset += size;
  }
  return types;
}

export interface RenditionCheck {
  /** Recorded SHA256 of the original. */
  expectedSha256: string;
  /** SHA256 of the downloaded original bytes. */
  sourceSha256: string;
  sourceDurationSeconds: number;
  outputDurationSeconds: number;
  outputBoxes: readonly string[];
  /** Decoder error output for the whole rendition; null when it decoded cleanly. */
  decodeError: string | null;
}

/** Reasons a rendition must not be published; empty when it may replace the original for playback. */
export function renditionProblems(check: RenditionCheck): string[] {
  const problems: string[] = [];
  if (check.sourceSha256 !== check.expectedSha256)
    problems.push('downloaded original does not match its recorded SHA256');
  if (check.decodeError !== null) problems.push(`rendition does not decode: ${check.decodeError}`);
  const moov = check.outputBoxes.indexOf('moov');
  const mdat = check.outputBoxes.indexOf('mdat');
  if (moov === -1 || mdat === -1 || moov > mdat)
    problems.push('rendition is not faststart (moov must precede mdat)');
  if (
    !(check.sourceDurationSeconds > 0) ||
    !(
      Math.abs(check.outputDurationSeconds - check.sourceDurationSeconds) <=
      RENDITION_DURATION_TOLERANCE_SECONDS
    )
  )
    problems.push(
      `rendition duration ${check.outputDurationSeconds}s differs from original ${check.sourceDurationSeconds}s`,
    );
  return problems;
}

/**
 * Attach `previewUrl` to each stored asset whose sealed SHA256 has a rendition. Read time only;
 * stored indexes and the sealed `url` never change.
 */
export function withRenditionPreviews(
  saved: StoredArtifact,
  previews: ReadonlyMap<string, string>,
): StoredArtifact {
  if (previews.size === 0) return saved;
  return {
    ...saved,
    sources: saved.sources.map((source) => {
      const checksums = new Map(source.checksums);
      return {
        ...source,
        assets: source.assets.map(([path, asset]): StoredSource['assets'][number] => {
          const previewUrl = previews.get(checksums.get(path) ?? '');
          return [path, previewUrl ? { ...asset, previewUrl } : asset];
        }),
      };
    }),
  };
}
