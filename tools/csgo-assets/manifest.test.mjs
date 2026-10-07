import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safePath } from './asset-io.mjs';

const lock = JSON.parse(await readFile(new URL('assets-lock.json', import.meta.url)));

test('manifest pins every model and audio file with a unique safe path and SHA-256', () => {
  assert.equal(lock.schemaVersion, 1);
  assert.match(lock.audio.commit, /^[a-f0-9]{40}$/);
  assert.ok(lock.audio.baseUrl.endsWith(lock.audio.commit));
  assert.match(lock.archive.sha256, /^[a-f0-9]{64}$/);
  assert.ok(lock.archive.bytes > 0);
  assert.equal(new Set(lock.files.map((entry) => entry.path)).size, lock.files.length);
  assert.equal(lock.files.filter((entry) => entry.kind === 'model').length, 34);
  assert.equal(lock.files.filter((entry) => entry.kind === 'audio').length, 1021);
  for (const entry of lock.files) {
    assert.ok(safePath('/tmp/csgo-assets', entry.path));
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0);
    if (entry.kind === 'model') {
      assert.equal(entry.member, `OBJs/${entry.id}.obj`);
      assert.equal(entry.path, `models/${entry.id}.obj`);
    } else {
      assert.equal(entry.kind, 'audio');
      assert.equal(entry.sourcePath, entry.path);
      assert.match(entry.gitBlob, /^[a-f0-9]{40}$/);
      assert.match(entry.path, /^sound\/(?:weapons|player\/footsteps)\/.+\.wav$/);
    }
  }
});
