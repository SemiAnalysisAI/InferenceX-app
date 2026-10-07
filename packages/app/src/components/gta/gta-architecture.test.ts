import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const base = resolve(process.cwd(), 'public/decorative/gta/architecture');
const manifest = JSON.parse(readFileSync(resolve(base, 'manifest.json'), 'utf8')) as {
  file: string;
  bytes: number;
  sha256: string;
  source: string;
  license: string;
}[];
describe('Optional city architecture asset integrity', () => {
  it('keeps the additional asset pack below 11 MB with explicit provenance', () => {
    expect(manifest).toHaveLength(11);
    expect(manifest.reduce((sum, e) => sum + e.bytes, 0)).toBeLessThan(11_000_000);
    expect(
      manifest.every((e) => e.license === 'CC0' && e.source.startsWith('https://polyhaven.com/a/')),
    ).toBe(true);
  });
  for (const entry of manifest)
    it(`verifies ${entry.file}`, () => {
      const bytes = readFileSync(resolve(base, entry.file));
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      if (entry.file.endsWith('.glb')) {
        expect(bytes.readUInt32LE(8)).toBe(bytes.length);
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        for (const item of [...json.buffers, ...json.images]) expect(item.uri).toBeUndefined();
      }
    });
});
