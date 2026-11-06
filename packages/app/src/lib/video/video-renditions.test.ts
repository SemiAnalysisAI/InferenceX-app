import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoredArtifact, StoredSource } from '@/components/video-benchmark/stored';
import {
  mp4TopLevelBoxes,
  renditionPlan,
  renditionProblems,
  withRenditionPreviews,
  type RenditionCheck,
} from './video-renditions';

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

  it('queues each sealed MP4 once and skips hashes that already have a receipt', () => {
    const plan = renditionPlan(stored, new Set([sha('b')]));
    expect(plan.pending.map((item) => item.sha256)).toEqual([sha('a'), sha('c')]);
    expect(plan.pending[0]).toEqual({
      sha256: sha('a'),
      path: clip(1),
      url: `https://store.test/h3-video-media/v1/objects/${sha('a')}/measurement-r001-c001.mp4`,
    });
    expect(plan.existing).toBe(1);
  });

  it('has no work once every sealed MP4 has a receipt', () => {
    expect(renditionPlan(stored, new Set([sha('a'), sha('b'), sha('c')]))).toEqual({
      pending: [],
      existing: 3,
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

describe('withRenditionPreviews', () => {
  it('adds previewUrl only to assets whose sealed SHA256 has a rendition', () => {
    const saved = artifact('41280191475', [
      source('41280191475', [
        [clip(1), sha('a')],
        [clip(2), sha('b')],
      ]),
    ]);
    const preview = `https://store.test/h3-video-media/v1/objects/${sha('e')}/web-h264-crf23.mp4`;
    const result = withRenditionPreviews(saved, new Map([[sha('a'), preview]]));
    expect(result.sources[0].assets).toEqual([
      [clip(1), { ...media(`${sha('a')}/measurement-r001-c001.mp4`), previewUrl: preview }],
      [clip(2), media(`${sha('b')}/measurement-r001-c002.mp4`)],
    ]);
    expect(saved.sources[0].assets[0][1]).not.toHaveProperty('previewUrl');
  });
});
