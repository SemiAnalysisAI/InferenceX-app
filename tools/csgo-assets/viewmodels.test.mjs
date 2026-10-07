import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { WEAPONS } from './weapons.mjs';
import { actionClip } from './weapon-animation.mjs';
test('animation binding handles shoot/fire and inspect/lookat aliases', () => {
  const clips = ['@idle', '@shoot1', '@reload', '@lookat01'].map((name) => ({ name }));
  assert.equal(actionClip(clips, 'fire').name, '@shoot1');
  assert.equal(actionClip(clips, 'lookat').name, '@lookat01');
  assert.equal(actionClip([{ name: 'weapon_fire1' }], 'fire').name, 'weapon_fire1');
  assert.equal(actionClip([{ name: 'inspect' }], 'lookat').name, 'inspect');
});
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
      for (const action of ['idle', 'fire', 'reload', 'lookat'])
        assert.ok(actionClip(json.animations, action), `${id}: ${action} animation binding`);
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
