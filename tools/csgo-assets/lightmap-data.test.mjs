import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { decodeRgbExp } from './lightmap-data.mjs';
import { verify } from './asset-io.mjs';
import { extractLighting } from './conversion/extract-world-lighting.mjs';

test('RGBExp light samples preserve signed exponents and linear channel ratios', () => {
  const decoded = decodeRgbExp(
    new Uint8Array([255, 128, 0, 255, 255, 255, 255, 1]),
    new Float32Array(8),
  );
  assert.equal(decoded[0], 0.5);
  assert.ok(Math.abs(decoded[1] - 128 / 510) < 1e-6);
  assert.equal(decoded[2], 0);
  assert.equal(decoded[3], 1);
  assert.equal(decoded[4], 2);
  assert.throws(() => decodeRgbExp(new Uint8Array(3), new Float32Array(3)));
  assert.throws(() => extractLighting(Buffer.alloc(1036)), /Expected Source BSP/);
});
test('baked world geometry and light samples match their checked-in hashes', async () => {
  const root = new URL('lighting/', import.meta.url);
  const metadata = JSON.parse(await readFile(new URL('world.json', root)));
  assert.equal(
    metadata.sourceSha256,
    '0f91e0a20297ab32eb2bad31e9cd77d585de1ec82cadd6961e9373e7f16962a6',
  );
  assert.equal(metadata.surfaces, 2773);
  assert.equal(metadata.unlitSurfaces, 4);
  for (const path of ['world.bin.gz', 'atlas.rgbe.gz']) {
    const bytes = await readFile(new URL(path, root));
    verify(bytes, { path, ...metadata[path] });
    const expected = path.startsWith('world')
      ? metadata.vertices * 7 * 4
      : metadata.atlasWidth * metadata.atlasHeight * 4;
    assert.equal(gunzipSync(bytes).length, expected);
  }
});
test('baked geometry groups cover finite triangles and valid lightmap UVs', async () => {
  const metadata = JSON.parse(await readFile(new URL('lighting/world.json', import.meta.url)));
  const bytes = gunzipSync(await readFile(new URL('lighting/world.bin.gz', import.meta.url)));
  let offset = 0;
  for (const group of metadata.groups) {
    assert.equal(group.offset, offset);
    assert.equal(group.count % 3, 0);
    offset += group.count;
  }
  assert.equal(offset, metadata.vertices);
  for (let i = 0; i < bytes.length / 4; i++) {
    const value = bytes.readFloatLE(i * 4);
    assert.ok(Number.isFinite(value));
    if (i % 7 >= 5) assert.ok(value >= 0 && value <= 1);
  }
});
