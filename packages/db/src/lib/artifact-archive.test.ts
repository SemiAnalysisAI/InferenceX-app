import AdmZip from 'adm-zip';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { crc32, createDeflateRaw } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';
import { extractVerifiedArchive, inspectArchive, sha256, sha256File } from './artifact-archive';

const roots: string[] = [];
function root() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-archive-'));
  roots.push(value);
  return value;
}
afterEach(() => roots.forEach((value) => fs.rmSync(value, { recursive: true, force: true })));
it('extracts checked bytes and refuses overwrites and altered members', () => {
  const zip = new AdmZip();
  zip.addFile('raw/result.json', Buffer.from('{"ok":true}'));
  const bytes = zip.toBuffer();
  const target = path.join(root(), '123');
  const expected = [
    {
      path: 'raw/result.json',
      size: 11,
      sha256: '4062edaf750fb8074e7e83e0c9028c94a8e32468a8b6e6c0fc692be0f1cc83875',
    },
  ];
  expect(() => extractVerifiedArchive(bytes, target, expected)).toThrow('digest/size mismatch');
  expect(fs.existsSync(target)).toBe(false);
  extractVerifiedArchive(bytes, target);
  expect(fs.readFileSync(path.join(target, 'raw/result.json'), 'utf8')).toBe('{"ok":true}');
  expect(() => extractVerifiedArchive(bytes, target)).toThrow('overwrite');
});
it('rejects links and file-directory collisions before filesystem writes', () => {
  const links = new AdmZip();
  links.addFile('link', Buffer.from('/tmp/target'));
  links.getEntries()[0].attr = (0o120777 << 16) >>> 0;
  expect(() => inspectArchive(links.toBuffer())).toThrow('Unsafe');
  const collision = new AdmZip();
  collision.addFile('raw', Buffer.from('file'));
  collision.addFile('raw/result.json', Buffer.from('{}'));
  expect(() => inspectArchive(collision.toBuffer())).toThrow('collision');
});

it('verifies a disk archive and resolves its worker independently of the current directory', () => {
  const zip = new AdmZip();
  const payload = Buffer.from('verified trace\n');
  zip.addFile('raw/trace.jsonl', payload);
  const directory = root();
  const archive = path.join(directory, 'archive.zip');
  const target = path.join(directory, 'output');
  fs.writeFileSync(archive, zip.toBuffer());
  const expected = [{ path: 'raw/trace.jsonl', size: payload.length, sha256: sha256(payload) }];
  expect(sha256File(archive)).toBe(sha256(zip.toBuffer()));
  const previous = process.cwd();
  try {
    process.chdir(directory);
    extractVerifiedArchive(archive, target, expected);
  } finally {
    process.chdir(previous);
  }
  expect(fs.readFileSync(path.join(target, 'raw/trace.jsonl'))).toEqual(payload);
});

it('checks the complete member inventory before creating any extraction directory', () => {
  const zip = new AdmZip();
  zip.addFile('first.json', Buffer.from('{}'));
  zip.addFile('last.json', Buffer.from('{}'));
  const directory = root();
  const expected = [{ path: 'first.json', size: 2, sha256: sha256('{}') }];
  const target = path.join(directory, 'output');
  expect(() => extractVerifiedArchive(zip.toBuffer(), target, expected)).toThrow('member set');
  expect(fs.existsSync(target)).toBe(false);

  zip.getEntry('last.json')!.attr = (0o120777 << 16) >>> 0;
  expect(() => extractVerifiedArchive(zip.toBuffer(), target)).toThrow('Unsafe');
  expect(fs.existsSync(target)).toBe(false);
});

it('rejects damaged payload CRCs before extraction and preserves existing symlink destinations', () => {
  const zip = new AdmZip();
  zip.addFile('trace.jsonl', Buffer.from('valid bytes'));
  const bytes = Buffer.from(zip.toBuffer());
  // Mutate only the ZIP's recorded central-directory CRC, preserving deflate data.
  const central = bytes.indexOf(Buffer.from('504b0102', 'hex'));
  bytes.writeUInt32LE((bytes.readUInt32LE(central + 16) ^ 1) >>> 0, central + 16);
  const directory = root();
  const target = path.join(directory, 'output');
  expect(() => extractVerifiedArchive(bytes, target)).toThrow('CRC/size mismatch');
  expect(fs.existsSync(target)).toBe(false);
  fs.symlinkSync(path.join(directory, 'missing'), target);
  expect(() => extractVerifiedArchive(zip.toBuffer(), target)).toThrow('overwrite');
  expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
});

it('runs the synchronous archive API and streaming worker under the production Bun runtime', () => {
  const zip = new AdmZip();
  zip.addFile('raw/trace.jsonl', Buffer.from('Bun verified bytes'));
  const directory = root();
  const archive = path.join(directory, 'archive.zip');
  const target = path.join(directory, 'output');
  fs.writeFileSync(archive, zip.toBuffer());
  const module = fileURLToPath(new URL('artifact-archive.ts', import.meta.url));
  const result = spawnSync(
    'bun',
    [
      '--eval',
      `import { extractVerifiedArchive } from ${JSON.stringify(module)};
       extractVerifiedArchive(${JSON.stringify(archive)}, ${JSON.stringify(target)});`,
    ],
    { cwd: directory, encoding: 'utf8' },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(fs.readFileSync(path.join(target, 'raw/trace.jsonl'), 'utf8')).toBe('Bun verified bytes');
});

/** Write a large, valid fixture without allocating its uncompressed payload. */
async function writeLargeArchive(filename: string, megabytes: number) {
  const name = Buffer.from('raw/large-trace.jsonl');
  const local = Buffer.alloc(30 + name.length);
  Buffer.from('504b0304', 'hex').copy(local);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  fs.writeFileSync(filename, local);
  const chunk = Buffer.alloc(1024 ** 2, 'x');
  const hash = createHash('sha256');
  let checksum = 0;
  const input = Readable.from(
    (function* () {
      for (let index = 0; index < megabytes; index++) {
        hash.update(chunk);
        checksum = crc32(chunk, checksum);
        yield chunk;
      }
    })(),
  );
  await pipeline(
    input,
    createDeflateRaw(),
    fs.createWriteStream(filename, { flags: 'r+', start: local.length }),
  );
  const compressedSize = fs.statSync(filename).size - local.length;
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressedSize, 18);
  local.writeUInt32LE(megabytes * chunk.length, 22);
  const descriptor = fs.openSync(filename, 'r+');
  try {
    fs.writeSync(descriptor, local, 0, local.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  const central = Buffer.alloc(46 + name.length);
  Buffer.from('504b0102', 'hex').copy(central);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressedSize, 20);
  central.writeUInt32LE(megabytes * chunk.length, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);
  const end = Buffer.alloc(22);
  Buffer.from('504b0506', 'hex').copy(end);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + compressedSize, 16);
  fs.appendFileSync(filename, Buffer.concat([central, end]));
  return { path: name.toString(), size: megabytes * chunk.length, sha256: hash.digest('hex') };
}

it('extracts a 256 MiB trace without retaining the payload in memory', async () => {
  const directory = root();
  const archive = path.join(directory, 'large.zip');
  const target = path.join(directory, 'output');
  const expected = await writeLargeArchive(archive, 256);
  const worker = new URL('artifact-archive-worker.mjs', import.meta.url);
  const program = `
    import { processArchive } from ${JSON.stringify(worker.href)};
    const result = await processArchive(JSON.parse(process.argv[1]));
    process.stdout.write(JSON.stringify({ ...result, maxRSS: process.resourceUsage().maxRSS }));
  `;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      program,
      JSON.stringify({ archive, destination: target, expected: [expected] }),
    ],
    { cwd: directory, encoding: 'utf8', timeout: 25_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.members).toEqual([expected]);
  // maxRSS is in KiB on Node's supported Linux/macOS runners. Allow ample
  // runtime overhead while detecting retention of even one entire payload.
  expect(report.maxRSS).toBeLessThan(192 * 1024);
  expect(fs.statSync(path.join(target, expected.path)).size).toBe(expected.size);
  expect(sha256File(path.join(target, expected.path))).toBe(expected.sha256);
}, 30_000);
