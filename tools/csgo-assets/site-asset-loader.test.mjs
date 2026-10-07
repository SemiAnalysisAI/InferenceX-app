import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from './asset-io.mjs';
import { downloadArchive, validateArchiveListing, verifiedAssets } from './site-asset-loader.mjs';

const baseUrl = `https://raw.githubusercontent.com/SemiAnalysisAI/InferenceX-app/${'a'.repeat(40)}/`;
test('asset archive rejects traversal, unknown members, missing files and links', () => {
  const entries = [{ path: 'map/dust2.glb' }];
  validateArchiveListing('map/\nmap/dust2.glb\n', 'drwx map/\n-rw map/dust2.glb\n', entries);
  for (const names of [
    '../bad\n',
    'map/\n',
    'map/dust2.glb\nextra\n',
    'map/dust2.glb\nmap/dust2.glb\n',
  ]) {
    assert.throws(() => validateArchiveListing(names, '-rw file', entries));
  }
  assert.throws(() => validateArchiveListing('map/dust2.glb', 'lrwx link', entries), /forbidden/);
});
test('archive download checks each part and the assembled digest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csgo-parts-'));
  const content = [Buffer.from('first'), Buffer.from('second')];
  const parts = content.map((bytes, index) => ({
    path: `part-${index}`,
    bytes: bytes.length,
    sha256: digest(bytes),
  }));
  const complete = Buffer.concat(content);
  const config = { baseUrl, bytes: complete.length, sha256: digest(complete) };
  try {
    const destination = join(dir, 'archive');
    await downloadArchive(
      config,
      parts,
      destination,
      (url) => new Response(content[Number(url.pathname.at(-1))]),
    );
    assert.deepEqual(await readFile(destination), complete);
    await assert.rejects(
      downloadArchive({ ...config, baseUrl: 'https://example.com/' }, parts, join(dir, 'bad')),
      /pinned/,
    );
    await assert.rejects(
      downloadArchive(config, parts, join(dir, 'bad'), () => new Response('wrong')),
      /mismatch/,
    );
    await assert.rejects(readFile(join(dir, 'bad')), { code: 'ENOENT' });
    await assert.rejects(
      downloadArchive(config, parts, join(dir, 'large'), () => new Response('too many bytes')),
      /Oversized/,
    );
    await assert.rejects(
      downloadArchive(
        config,
        parts,
        join(dir, 'missing'),
        () => new Response(null, { status: 404 }),
      ),
      /404/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('local game assets must all match the locked bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csgo-local-'));
  const bytes = Buffer.from('model');
  const entries = [{ path: 'model.glb', bytes: bytes.length, sha256: digest(bytes) }];
  try {
    assert.equal(await verifiedAssets(dir, entries), false);
    await writeFile(join(dir, 'model.glb'), bytes);
    assert.equal(await verifiedAssets(dir, entries), true);
    await writeFile(join(dir, 'model.glb'), 'wrong');
    assert.equal(await verifiedAssets(dir, entries), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
