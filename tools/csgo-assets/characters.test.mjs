import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { WEAPONS } from './weapons.mjs';
function glb(path) {
  const bytes = readFileSync(new URL(`assets/${path}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.length, bytes.readUInt32LE(8));
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert.ok(doc.meshes.length);
  assert.ok(
    doc.materials.every((m) => m.pbrMetallicRoughness?.baseColorTexture || /glass/i.test(m.name)),
  );
  assert.ok(doc.images.every((i) => !i.name?.startsWith('missing_')));
  return doc;
}
test(
  'both original character ports have textured skinning and retargeted locomotion',
  {
    skip: !existsSync(new URL('assets/characters/ct.glb', import.meta.url)),
  },
  () => {
    for (const team of ['ct', 't']) {
      const doc = glb(`characters/${team}.glb`);
      assert.ok(doc.skins.length);
      assert.deepEqual(doc.animations.map((a) => a.name).sort(), ['crouch', 'idle', 'run']);
      assert.ok(doc.nodes.some((n) => n.name === 'ValveBiped.Bip01_R_Hand'));
    }
  },
);
test(
  'all 34 world weapons have original materials and hand attachment bones',
  {
    skip: !existsSync(new URL('assets/worldmodels/ak-47.glb', import.meta.url)),
  },
  () => {
    for (const id of Object.keys(WEAPONS).filter((name) => name !== 'knife')) {
      const doc = glb(`worldmodels/${id}.glb`);
      assert.ok(
        doc.nodes.some((n) => n.name === 'ValveBiped.Bip01_R_Hand'),
        id,
      );
    }
  },
);
