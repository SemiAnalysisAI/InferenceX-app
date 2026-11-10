import type { StoredArtifact, StoredSource } from '@/components/video-benchmark/stored';

/**
 * Web playback renditions of sealed H3 MP4s. The original stays the measured artifact;
 * a rendition only shortens the Clip view download.
 */
export const RENDITION_PROFILE = 'web-h264-crf23';
/**
 * Still poster of a sealed H3 MP4: its first decoded frame, so the stage does not jump when
 * Play starts. Presentation only; metrics, PSNR and Difference never read it.
 */
export const POSTER_PROFILE = 'poster-f0-w672-q4';
export const POSTER_MAX_WIDTH = 672;
/** Fixed encode between `-i <original>` and the output path. A change needs a new profile id. */
export const POSTER_ARGS = [
  '-frames:v',
  '1',
  '-vf',
  `scale='min(${POSTER_MAX_WIDTH},iw)':-2`,
  '-q:v',
  '4',
  '-map_metadata',
  '-1',
] as const;
/** Allowed relative difference between the poster and original aspect ratios. */
export const POSTER_ASPECT_TOLERANCE = 0.01;
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

/**
 * Every derived media profile, keyed by the profile id in its object and receipt paths. Each
 * sets one optional read-time field on a stored asset; `url` always stays the sealed original.
 */
export const MEDIA_PROFILES = {
  [POSTER_PROFILE]: {
    field: 'posterUrl',
    extension: 'jpg',
    contentType: 'image/jpeg',
    args: POSTER_ARGS,
  },
  [RENDITION_PROFILE]: {
    field: 'previewUrl',
    extension: 'mp4',
    contentType: 'video/mp4',
    args: RENDITION_ARGS,
  },
} as const;
export type MediaProfile = keyof typeof MEDIA_PROFILES;
/** Encode order: the sub-second poster first, then the rendition. */
export const MEDIA_PROFILE_IDS = Object.keys(MEDIA_PROFILES) as MediaProfile[];
export const isMediaProfile = (profile: string): profile is MediaProfile =>
  Object.hasOwn(MEDIA_PROFILES, profile);
export type DerivedField = (typeof MEDIA_PROFILES)[MediaProfile]['field'];
/** Derived media of one sealed original, by read-time field. */
export type DerivedMedia = Partial<Record<DerivedField, string>>;

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

export interface PosterReceipt {
  version: 1;
  profile: typeof POSTER_PROFILE;
  source: { sha256: string };
  output: { sha256: string; url: string; bytes: number; width: number; height: number };
  encoder: { ffmpeg: string; args: string[] };
}

export function posterReceipt(
  sourceSha256: string,
  output: PosterReceipt['output'],
  ffmpeg: string,
): PosterReceipt {
  return {
    version: 1,
    profile: POSTER_PROFILE,
    source: { sha256: sourceSha256 },
    output,
    encoder: { ffmpeg, args: [...POSTER_ARGS] },
  };
}

/** One sealed original MP4, identified by its recorded SHA256. */
export interface RenditionSource {
  sha256: string;
  path: string;
  url: string;
}
/** A sealed original and the profiles it still lacks a receipt for, in encode order. */
export interface PendingSource extends RenditionSource {
  profiles: MediaProfile[];
}

/**
 * Every sealed MP4 of the stored sources and stored reference pairs, once per content hash,
 * with the profiles that have no receipt yet. Fidelity sources reuse their originals' objects
 * and dedupe here. `existing` counts receipted originals per profile.
 */
export function renditionPlan(
  artifacts: readonly StoredArtifact[],
  done: ReadonlyMap<string, DerivedMedia>,
): { pending: PendingSource[]; sources: number; existing: Record<MediaProfile, number> } {
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
  for (const { reference } of artifacts.flatMap((saved) => saved.quality ?? []))
    if (reference.url && !sources.has(reference.media_sha256))
      sources.set(reference.media_sha256, {
        sha256: reference.media_sha256,
        path: reference.media_path,
        url: reference.url,
      });
  const existing = Object.fromEntries(MEDIA_PROFILE_IDS.map((profile) => [profile, 0])) as Record<
    MediaProfile,
    number
  >;
  const pending: PendingSource[] = [];
  for (const source of sources.values()) {
    const derived = done.get(source.sha256);
    const profiles: MediaProfile[] = [];
    for (const profile of MEDIA_PROFILE_IDS)
      if (derived?.[MEDIA_PROFILES[profile].field]) existing[profile]++;
      else profiles.push(profile);
    if (profiles.length > 0) pending.push({ ...source, profiles });
  }
  return { pending, sources: sources.size, existing };
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

export interface PosterCheck {
  /** Recorded SHA256 of the original. */
  expectedSha256: string;
  /** SHA256 of the downloaded original bytes. */
  sourceSha256: string;
  sourceWidth: number;
  sourceHeight: number;
  /** ffprobe codec name and decoded frame count of the poster file. */
  codec: string;
  frames: number;
  width: number;
  height: number;
}

/** Reasons a poster must not be published; empty when it may stand in for the first frame. */
export function posterProblems(check: PosterCheck): string[] {
  const problems: string[] = [];
  if (check.sourceSha256 !== check.expectedSha256)
    problems.push('downloaded original does not match its recorded SHA256');
  if (check.codec !== 'mjpeg' || check.frames !== 1)
    problems.push(`poster is not one JPEG frame (${check.codec}, ${check.frames} frames)`);
  if (check.width > POSTER_MAX_WIDTH)
    problems.push(`poster width ${check.width} exceeds ${POSTER_MAX_WIDTH}`);
  else {
    const source = check.sourceWidth / check.sourceHeight;
    const poster = check.width / check.height;
    if (!(Math.abs(poster - source) <= source * POSTER_ASPECT_TOLERANCE))
      problems.push(
        `poster aspect ${check.width}x${check.height} differs from original ` +
          `${check.sourceWidth}x${check.sourceHeight}`,
      );
  }
  return problems;
}

/** Only the known string fields, so a malformed listing entry never spreads into an asset. */
function derivedFields(derived: DerivedMedia | undefined): DerivedMedia {
  const fields: DerivedMedia = {};
  for (const { field } of Object.values(MEDIA_PROFILES)) {
    const value = derived?.[field];
    if (typeof value === 'string' && value) fields[field] = value;
  }
  return fields;
}

/**
 * Attach `previewUrl` and `posterUrl` to each stored asset and stored reference whose sealed
 * SHA256 has that derived media. Read time only; stored indexes and the sealed `url` never
 * change, and a missing receipt leaves the field absent.
 */
export function withDerivedMedia(
  saved: StoredArtifact,
  media: ReadonlyMap<string, DerivedMedia>,
): StoredArtifact {
  if (media.size === 0) return saved;
  const fieldsOf = (sha256: string | undefined) => {
    const fields = derivedFields(sha256 === undefined ? undefined : media.get(sha256));
    return Object.keys(fields).length > 0 ? fields : null;
  };
  return {
    ...saved,
    quality: saved.quality?.map((pair) => {
      const fields = fieldsOf(pair.reference.media_sha256);
      return fields ? { ...pair, reference: { ...pair.reference, ...fields } } : pair;
    }),
    sources: saved.sources.map((source) => {
      const checksums = new Map(source.checksums);
      return {
        ...source,
        assets: source.assets.map(([path, asset]): StoredSource['assets'][number] => {
          const fields = fieldsOf(checksums.get(path));
          return [path, fields ? { ...asset, ...fields } : asset];
        }),
      };
    }),
  };
}
