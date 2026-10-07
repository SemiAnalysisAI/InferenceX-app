import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { WEAPONS } from './weapons.mjs';
const root = new URL('assets/viewmodels/', import.meta.url);
test(
  'all 34 animated viewmodels contain real textures, geometry and animation clips',
  {
    skip: !existsSync(new URL('ak-47.glb', root)),
  },
  () => {
    for (const id of Object.keys(WEAPONS).filter((name) => name !== 'knife')) {
      const bytes = readFileSync(new URL(`${id}.glb`, root));
      assert.equal(bytes.toString('ascii', 0, 4), 'glTF', id);
      assert.equal(bytes.readUInt32LE(8), bytes.length, id);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      assert.ok(json.meshes.length > 0, id);
      assert.ok(json.animations.length > 0, id);
      assert.ok(json.images.length > 0, id);
      assert.ok(
        json.images.every((image) => !image.name?.startsWith('missing_')),
        id,
      );
      assert.ok(
        json.materials.every(
          (material) =>
            material.pbrMetallicRoughness?.baseColorTexture || /glass/i.test(material.name),
        ),
        `${id}: every opaque material needs its original base texture`,
      );
      for (const view of json.bufferViews)
        assert.ok((view.byteOffset || 0) + view.byteLength <= json.buffers[0].byteLength, id);
    }
  },
);
