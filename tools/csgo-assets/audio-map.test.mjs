import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEAPONS } from './weapons.mjs';
import { fireSound, resolveSound } from './audio-map.mjs';
test('every firearm and knife resolves to an exact imported firing audio file', () => {
  const manifest = JSON.parse(readFileSync(new URL('assets-lock.json', import.meta.url)));
  const paths = manifest.files.map((a) => a.path);
  for (const id of Object.keys(WEAPONS)) {
    const path = fireSound(id);
    assert.ok(
      paths.some((p) => p.endsWith(path)),
      `${id}: ${path}`,
    );
    assert.equal(
      resolveSound(paths, path),
      paths.find((p) => p.endsWith(path)),
    );
  }
});
