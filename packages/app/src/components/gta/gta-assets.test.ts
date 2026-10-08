import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
const base = resolve(process.cwd(), 'public/decorative/gta/models');
const manifest = JSON.parse(readFileSync(resolve(base, 'manifest.json'), 'utf8')) as {
  file: string;
  bytes: number;
  sha256: string;
}[];
describe('GTA locally hosted asset integrity', () => {
  it('includes city models and separately loaded terrain/aircraft', () => {
    expect(manifest).toHaveLength(16);
    for (const name of ['adder', 'police', 'michael', 'los-santos', 'frogger'])
      expect(manifest.some((m) => m.file === `${name}.glb`)).toBe(true);
  });
  for (const entry of manifest)
    it(`${entry.file} is intact and has no external resource references`, () => {
      const b = readFileSync(resolve(base, entry.file));
      expect(b.length).toBe(entry.bytes);
      expect(b.subarray(0, 4).toString()).toBe('glTF');
      expect(b.readUInt32LE(8)).toBe(b.length);
      expect(createHash('sha256').update(b).digest('hex')).toBe(entry.sha256);
      const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      for (const resource of [...(json.buffers || []), ...(json.images || [])])
        expect(resource.uri).toBeUndefined();
    });
});
