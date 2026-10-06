import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  atomicWrite,
  digest,
  download,
  gitBlobDigest,
  safePath,
  validLocal,
  verify,
} from './asset-io.mjs';

test('asset paths reject traversal, absolute paths, backslashes and empty components', () => {
  for (const path of [
    '../x',
    '/tmp/x',
    'x/../../y',
    String.raw`x\y`,
    'x//y',
    'x/./y',
    'x/%2e%2e/y',
  ]) {
    assert.throws(() => safePath('/tmp/assets', path));
  }
  assert.equal(safePath('/tmp/assets', 'models/ak-47.obj'), '/tmp/assets/models/ak-47.obj');
});

test('checks byte size, pinned SHA-256 and optional Git blob identity', () => {
  const bytes = Buffer.from('test');
  const entry = {
    path: 'test.bin',
    bytes: 4,
    sha256: digest(bytes),
    gitBlob: gitBlobDigest(bytes),
  };
  assert.doesNotThrow(() => verify(bytes, entry));
  assert.throws(() => verify(Buffer.from('tost'), entry), /SHA-256/);
  assert.throws(() => verify(bytes, { ...entry, bytes: 5 }), /Size/);
  assert.throws(() => verify(bytes, { ...entry, gitBlob: '0'.repeat(40) }), /Git blob/);
  assert.throws(() => verify(bytes, { path: 'x', bytes: 4 }), /Missing digest/);
});

test('format guards reject HTML disguised as a model or audio file', () => {
  const bytes = Buffer.from('<html>not an asset</html>');
  for (const path of ['x.obj', 'x.wav']) {
    assert.throws(() => verify(bytes, { path, bytes: bytes.length, sha256: digest(bytes) }));
  }
});

test('atomic writes preserve verified files and refuse symlink targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'csgo-assets-'));
  try {
    const target = join(root, 'nested', 'test.bin');
    const bytes = Buffer.from('verified');
    const entry = { path: 'test.bin', bytes: bytes.length, sha256: digest(bytes) };
    await atomicWrite(target, bytes);
    assert.equal(await validLocal(target, entry), true);
    assert.equal(await validLocal(target, { ...entry, sha256: '0'.repeat(64) }), false);
    await symlink(target, join(root, 'alias'));
    await assert.rejects(() => atomicWrite(join(root, 'alias'), Buffer.from('bad')), /Symlink/);
    const restored = await readFile(target);
    assert.equal(restored.toString(), 'verified');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('downloads reject unapproved hosts, failures and oversized payloads', async () => {
  await assert.rejects(() => download('http://raw.githubusercontent.com/x', 4), /Unapproved/);
  await assert.rejects(() => download('https://example.com/x', 4), /Unapproved/);
  await assert.rejects(
    () =>
      download('https://raw.githubusercontent.com/x', 4, () => new Response('no', { status: 404 })),
    /HTTP 404/,
  );
  await assert.rejects(
    () => download('https://raw.githubusercontent.com/x', 2, () => new Response('too big')),
    /exceeds/,
  );
  const result = await download(
    'https://raw.githubusercontent.com/x',
    4,
    () => new Response('test'),
  );
  assert.equal(result.toString(), 'test');
});
