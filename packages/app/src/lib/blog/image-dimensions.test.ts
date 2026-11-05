import { describe, expect, it } from 'vitest';

import { imageDimensions } from './image-dimensions';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((char) => char.codePointAt(0)!) : part,
    ),
  );
const be16 = (value: number) => [value >> 8, value & 255];
const be32 = (value: number) => [...be16(value >>> 16), ...be16(value & 65_535)];
const le16 = (value: number) => [value & 255, value >> 8];
const le24 = (value: number) => [value & 255, (value >> 8) & 255, value >> 16];

const png = (width: number, height: number) =>
  bytes([137], 'PNG\r\n\u001A\n', be32(13), 'IHDR', be32(width), be32(height), [8, 6, 0, 0, 0]);
const riff = (chunk: string, body: number[]) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', chunk, body);
const CHUNK_SIZE = [0, 0, 0, 0];

describe('imageDimensions', () => {
  it('reads PNG sizes, including values past 16 bits', () => {
    expect(imageDimensions(png(4200, 5130))).toEqual({ width: 4200, height: 5130 });
    expect(imageDimensions(png(70000, 3))).toEqual({ width: 70000, height: 3 });
  });

  it('skips JPEG metadata segments to the start-of-frame size', () => {
    const app1 = [255, 225, ...be16(8), 1, 2, 3, 4, 5, 6];
    const dht = [255, 196, ...be16(4), 0, 0];
    const sof2 = [255, 194, ...be16(11), 8, ...be16(925), ...be16(1456), 3, 0, 0];
    expect(imageDimensions(bytes([255, 216], app1, dht, sof2))).toEqual({
      width: 1456,
      height: 925,
    });
  });

  it('returns null when a JPEG header is cut off before its frame', () => {
    const app1 = [255, 225, ...be16(200), ...Array.from({ length: 20 }, () => 0)];
    expect(imageDimensions(bytes([255, 216], app1))).toBeNull();
  });

  it('reads GIF sizes', () => {
    expect(imageDimensions(bytes('GIF89a', le16(320), le16(200), [0, 0]))).toEqual({
      width: 320,
      height: 200,
    });
  });

  it('reads extended, lossy and lossless WebP sizes', () => {
    const flags = [0, 0, 0, 0];
    expect(
      imageDimensions(riff('VP8X', [...CHUNK_SIZE, ...flags, ...le24(1199), ...le24(629)])),
    ).toEqual({ width: 1200, height: 630 });

    const frameTag = [0, 0, 0];
    const startCode = [157, 1, 42];
    const lossy = [...CHUNK_SIZE, ...frameTag, ...startCode, ...le16(640), ...le16(480)];
    expect(imageDimensions(riff('VP8 ', lossy))).toEqual({ width: 640, height: 480 });

    const packed = 799 | (599 << 14);
    const packedBytes = [packed & 255, (packed >> 8) & 255, (packed >> 16) & 255, packed >>> 24];
    expect(imageDimensions(riff('VP8L', [...CHUNK_SIZE, 47, ...packedBytes]))).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('rejects unknown formats, zero sizes and truncated headers', () => {
    expect(imageDimensions(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(imageDimensions(png(0, 10))).toBeNull();
    expect(imageDimensions(bytes([137], 'PNG'))).toBeNull();
  });
});
