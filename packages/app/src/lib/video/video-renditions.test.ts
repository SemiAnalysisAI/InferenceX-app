import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoredArtifact, StoredSource } from '@/components/video-benchmark/stored';
import {
  MEDIA_PROFILES,
  mp4TopLevelBoxes,
  POSTER_ARGS,
  POSTER_PROFILE,
  posterProblems,
  posterReceipt,
  RENDITION_PROFILE,
  renditionPlan,
  renditionProblems,
  withDerivedMedia,
  type DerivedMedia,
  type PosterCheck,
  type RenditionCheck,
} from './video-renditions';
import { derivedMediaPath, derivedReceiptPath } from './video-storage';

const sha = (digit: string) => digit.repeat(64);
const media = (name: string) => ({
  url: `https://store.test/h3-video-media/v1/objects/${name}`,
  downloadUrl: `https://store.test/h3-video-media/v1/objects/${name}?download=1`,
});
const source = (
  id: string,
  files: [path: string, sha256: string][],
  kind?: 'fidelity',
): StoredSource => ({
  id,
  ...(kind ? { kind } : {}),
  documents: [],
  checksums: files,
  assets: files.map(([file, hash]) => [file, media(`${hash}/${file.split('/').at(-1)}`)]),
  texts: [],
});
const artifact = (runId: string, sources: StoredSource[]): StoredArtifact => ({
  storageVersion: 1,
  runId,
  artifact: {
    id: Number(runId) + 1,
    name: `h3-results-${runId}-1`,
    expired: false,
    size_in_bytes: 0,
  },
  sources,
});
const clip = (n: number) => `gpu/c1/baseline/artifacts/measurement-r001-c00${n}.mp4`;

describe('renditionPlan', () => {
  const stored = [
    artifact('41280191475', [
      source('41280191475', [
        ['manifest.json', sha('d')],
        [clip(1), sha('a')],
        [clip(2), sha('b')],
      ]),
    ]),
    // A fidelity source republishes the original C1 objects; each hash is encoded once.
    artifact('41280200000', [source('41280200000', [[clip(1), sha('a')]], 'fidelity')]),
    artifact('41280300000', [
      source('41280300000', [
        [clip(1), sha('c')],
        [clip(2), 'not-a-sealed-sha256'],
      ]),
    ]),
  ];

  const both = { previewUrl: 'https://store.test/p.mp4', posterUrl: 'https://store.test/p.jpg' };

  it('queues each sealed MP4 once and skips hashes that already have both receipts', () => {
    const plan = renditionPlan(stored, new Map([[sha('b'), both]]));
    expect(plan.pending.map((item) => item.sha256)).toEqual([sha('a'), sha('c')]);
    expect(plan.pending[0]).toEqual({
      sha256: sha('a'),
      path: clip(1),
      url: `https://store.test/h3-video-media/v1/objects/${sha('a')}/measurement-r001-c001.mp4`,
      profiles: [POSTER_PROFILE, RENDITION_PROFILE],
    });
    expect(plan.sources).toBe(3);
    expect(plan.existing).toEqual({ [RENDITION_PROFILE]: 1, [POSTER_PROFILE]: 1 });
  });

  it('queues only the poster for a clip that already has a web rendition', () => {
    // A backfill after the poster profile lands must neither skip rendered clips nor re-encode them.
    const plan = renditionPlan(
      stored,
      new Map<string, DerivedMedia>([
        [sha('a'), { previewUrl: both.previewUrl }],
        [sha('b'), both],
        [sha('c'), { posterUrl: both.posterUrl }],
      ]),
    );
    expect(plan.pending.map(({ sha256, profiles }) => [sha256, profiles])).toEqual([
      [sha('a'), [POSTER_PROFILE]],
      [sha('c'), [RENDITION_PROFILE]],
    ]);
    expect(plan.existing).toEqual({ [RENDITION_PROFILE]: 2, [POSTER_PROFILE]: 2 });
  });

  it('has no work once every sealed MP4 has every receipt', () => {
    expect(
      renditionPlan(
        stored,
        new Map([
          [sha('a'), both],
          [sha('b'), both],
          [sha('c'), both],
        ]),
      ),
    ).toEqual({
      pending: [],
      sources: 3,
      existing: { [RENDITION_PROFILE]: 3, [POSTER_PROFILE]: 3 },
    });
  });
});

const box = (type: string, payload: number) => {
  const bytes = new Uint8Array(8 + payload);
  new DataView(bytes.buffer).setUint32(0, 8 + payload);
  bytes.set(new TextEncoder().encode(type), 4);
  return bytes;
};
const join = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
};

describe('mp4TopLevelBoxes', () => {
  it('reads the box order of a real faststart MP4', () => {
    const file = readFileSync(
      path.resolve(import.meta.dirname, '../../../cypress/fixtures/video-results/candidate.mp4'),
    );
    expect(mp4TopLevelBoxes(new Uint8Array(file))).toEqual(['ftyp', 'moov', 'free', 'mdat']);
  });

  it('follows 64-bit and to-end box sizes', () => {
    const large = new Uint8Array(24);
    const view = new DataView(large.buffer);
    view.setUint32(0, 1);
    large.set(new TextEncoder().encode('mdat'), 4);
    view.setUint32(12, 24); // 64-bit largesize: high word 0, low word 24
    const toEnd = box('moov', 4);
    new DataView(toEnd.buffer).setUint32(0, 0);
    expect(mp4TopLevelBoxes(join(box('ftyp', 4), large, toEnd))).toEqual(['ftyp', 'mdat', 'moov']);
  });

  it('rejects a box that runs past the end of the file', () => {
    expect(() => mp4TopLevelBoxes(join(box('ftyp', 4), box('mdat', 16).subarray(0, 12)))).toThrow(
      'Truncated MP4 mdat box',
    );
  });
});

describe('renditionProblems', () => {
  const valid: RenditionCheck = {
    expectedSha256: sha('a'),
    sourceSha256: sha('a'),
    sourceDurationSeconds: 5.166667,
    outputDurationSeconds: 5.2,
    outputBoxes: ['ftyp', 'moov', 'free', 'mdat'],
    decodeError: null,
  };

  it('accepts a decodable faststart rendition within 0.05 s of the original', () => {
    expect(renditionProblems(valid)).toEqual([]);
  });

  it.each([
    [
      'a downloaded original that is not the sealed one',
      { sourceSha256: sha('b') },
      'downloaded original does not match its recorded SHA256',
    ],
    [
      'moov after mdat',
      { outputBoxes: ['ftyp', 'mdat', 'moov'] },
      'rendition is not faststart (moov must precede mdat)',
    ],
    [
      'a missing moov',
      { outputBoxes: ['ftyp', 'mdat'] },
      'rendition is not faststart (moov must precede mdat)',
    ],
    [
      'a duration 0.06 s longer',
      { outputDurationSeconds: 5.226667 },
      'rendition duration 5.226667s differs from original 5.166667s',
    ],
    [
      'an unknown original duration',
      { sourceDurationSeconds: Number.NaN },
      'rendition duration 5.2s differs from original NaNs',
    ],
    [
      'a decoder error',
      { decodeError: 'Invalid NAL unit size' },
      'rendition does not decode: Invalid NAL unit size',
    ],
  ])('rejects %s', (_, change, problem) => {
    expect(renditionProblems({ ...valid, ...change })).toEqual([problem]);
  });
});

describe('poster profile', () => {
  it('encodes the first decoded frame at 672 px wide or less as one JPEG at q 4', () => {
    expect(POSTER_PROFILE).toBe('poster-f0-w672-q4');
    // No seek before -i and exactly one frame: the poster is the frame Play starts on.
    expect(POSTER_ARGS).toEqual([
      '-frames:v',
      '1',
      '-vf',
      "scale='min(672,iw)':-2",
      '-q:v',
      '4',
      '-map_metadata',
      '-1',
    ]);
    expect(MEDIA_PROFILES[POSTER_PROFILE]).toMatchObject({
      field: 'posterUrl',
      extension: 'jpg',
      contentType: 'image/jpeg',
    });
    expect(MEDIA_PROFILES[RENDITION_PROFILE]).toMatchObject({
      field: 'previewUrl',
      extension: 'mp4',
      contentType: 'video/mp4',
    });
  });

  it('keys the poster object by its own hash and the receipt by the sealed source hash', () => {
    expect(derivedMediaPath(POSTER_PROFILE, sha('e'))).toBe(
      `h3-video-media/v1/objects/${sha('e')}/poster-f0-w672-q4.jpg`,
    );
    expect(derivedReceiptPath(POSTER_PROFILE, sha('a'), sha('e'))).toBe(
      `h3-video-media/v1/renditions/${sha('a')}/poster-f0-w672-q4/${sha('e')}.json`,
    );
    // The rendition paths stay where existing receipts already live.
    expect(derivedMediaPath(RENDITION_PROFILE, sha('e'))).toBe(
      `h3-video-media/v1/objects/${sha('e')}/web-h264-crf23.mp4`,
    );
    const output = { sha256: sha('e'), url: 'https://store.test/p.jpg', bytes: 23_000 };
    expect(posterReceipt(sha('a'), { ...output, width: 672, height: 384 }, 'ffmpeg 6.1')).toEqual({
      version: 1,
      profile: 'poster-f0-w672-q4',
      source: { sha256: sha('a') },
      output: { ...output, width: 672, height: 384 },
      encoder: { ffmpeg: 'ffmpeg 6.1', args: [...POSTER_ARGS] },
    });
  });
});

describe('posterProblems', () => {
  const valid: PosterCheck = {
    expectedSha256: sha('a'),
    sourceSha256: sha('a'),
    sourceWidth: 1344,
    sourceHeight: 768,
    codec: 'mjpeg',
    frames: 1,
    width: 672,
    height: 384,
  };

  it('accepts one 672x384 JPEG frame of a 1344x768 original', () => {
    expect(posterProblems(valid)).toEqual([]);
  });

  it.each([
    [
      'a downloaded original that is not the sealed one',
      { sourceSha256: sha('b') },
      'downloaded original does not match its recorded SHA256',
    ],
    ['two frames', { frames: 2 }, 'poster is not one JPEG frame (mjpeg, 2 frames)'],
    ['a PNG', { codec: 'png' }, 'poster is not one JPEG frame (png, 1 frames)'],
    ['a width above 672', { width: 1344, height: 768 }, 'poster width 1344 exceeds 672'],
    [
      'an aspect ratio 2% off the original',
      { height: 392 },
      'poster aspect 672x392 differs from original 1344x768',
    ],
  ])('rejects %s', (_, change, problem) => {
    expect(posterProblems({ ...valid, ...change })).toEqual([problem]);
  });
});

describe('withDerivedMedia', () => {
  const saved = artifact('41280191475', [
    source('41280191475', [
      [clip(1), sha('a')],
      [clip(2), sha('b')],
      [clip(3), sha('c')],
    ]),
  ]);
  const preview = `https://store.test/h3-video-media/v1/objects/${sha('e')}/web-h264-crf23.mp4`;
  const poster = `https://store.test/h3-video-media/v1/objects/${sha('f')}/poster-f0-w672-q4.jpg`;

  it('adds previewUrl only to assets whose sealed SHA256 has a rendition', () => {
    const result = withDerivedMedia(saved, new Map([[sha('a'), { previewUrl: preview }]]));
    expect(result.sources[0].assets).toEqual([
      [clip(1), { ...media(`${sha('a')}/measurement-r001-c001.mp4`), previewUrl: preview }],
      [clip(2), media(`${sha('b')}/measurement-r001-c002.mp4`)],
      [clip(3), media(`${sha('c')}/measurement-r001-c003.mp4`)],
    ]);
    expect(saved.sources[0].assets[0][1]).not.toHaveProperty('previewUrl');
  });

  it('adds posterUrl with or without a rendition, to clips and to the reference', () => {
    const reference = {
      media_sha256: sha('d'),
      media_path: 'coffee-grinder.mp4',
      url: `https://store.test/h3-video-media/v1/objects/${sha('d')}/coffee-grinder.mp4`,
    };
    const withQuality = {
      ...saved,
      quality: [{ reference }, { reference: { ...reference, media_sha256: sha('9') } }],
    } as unknown as StoredArtifact;
    const result = withDerivedMedia(
      withQuality,
      new Map<string, DerivedMedia>([
        [sha('a'), { previewUrl: preview, posterUrl: poster }],
        [sha('b'), { posterUrl: poster }],
        [sha('d'), { posterUrl: poster }],
      ]),
    );
    expect(result.sources[0].assets).toEqual([
      [
        clip(1),
        {
          ...media(`${sha('a')}/measurement-r001-c001.mp4`),
          previewUrl: preview,
          posterUrl: poster,
        },
      ],
      [clip(2), { ...media(`${sha('b')}/measurement-r001-c002.mp4`), posterUrl: poster }],
      // No receipt: the field stays absent rather than empty.
      [clip(3), media(`${sha('c')}/measurement-r001-c003.mp4`)],
    ]);
    expect(result.quality?.[0].reference).toEqual({ ...reference, posterUrl: poster });
    expect(result.quality?.[1].reference).not.toHaveProperty('posterUrl');
    expect(result.quality?.[1].reference).not.toHaveProperty('previewUrl');
  });

  it('ignores a listing value that is not a derived media object', () => {
    // The v1 shared listing cached a bare URL string per original; spreading it would add junk keys.
    const legacy = new Map([[sha('a'), preview as unknown as DerivedMedia]]);
    expect(withDerivedMedia(saved, legacy).sources[0].assets).toEqual(saved.sources[0].assets);
  });
});
