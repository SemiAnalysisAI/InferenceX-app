import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disposeModelInstance } from './model-lifecycle.mjs';
test('cloned materials and skeletons are released once without destroying cached geometry/textures', () => {
  const calls = { material: 0, skeleton: 0, geometry: 0, texture: 0 };
  const mesh = {
    isMesh: true,
    material: { dispose: () => calls.material++, map: { dispose: () => calls.texture++ } },
    skeleton: { dispose: () => calls.skeleton++ },
    geometry: { dispose: () => calls.geometry++ },
  };
  const root = {
    traverse: (visit) => {
      visit(mesh);
      visit(mesh);
    },
  };
  disposeModelInstance(root);
  assert.deepEqual(calls, { material: 1, skeleton: 1, geometry: 0, texture: 0 });
});
test('procedural models can additionally release their owned geometry', () => {
  let disposed = 0;
  disposeModelInstance(
    { traverse: (visit) => visit({ isMesh: true, geometry: { dispose: () => disposed++ } }) },
    { geometry: true },
  );
  assert.equal(disposed, 1);
});
