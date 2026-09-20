// Node/Bun worker for the synchronous ingestion boundary. Payloads stay in
// bounded ZIP streams; only the bounded member inventory crosses stdout.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import yauzl from 'yauzl';

const MAX_ARCHIVE_BYTES = 20 * 1024 ** 3;
const MAX_MEMBER_BYTES = 10 * 1024 ** 3;
const MAX_MEMBERS = 100_000;
const MAX_NAME_BYTES = 16 * 1024 ** 2;

async function scanArchive(archive, destination) {
  const zip = await yauzl.openPromise(archive, {
    autoClose: false,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  const members = [];
  const names = new Set();
  const files = new Set();
  let total = 0;
  let nameBytes = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      const segments = name.replace(/\/$/u, '').split('/');
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (
        !name ||
        name.includes('\\') ||
        name.includes('\0') ||
        name.startsWith('/') ||
        /^[A-Za-z]:/u.test(name) ||
        segments.some((part) => !part || part === '.' || part === '..') ||
        (mode !== 0 && mode !== 0o100000 && mode !== 0o040000)
      ) {
        throw new Error(`Unsafe archive member: ${name}`);
      }
      const normalized = segments.join('/');
      if (names.has(normalized)) throw new Error(`Duplicate archive member: ${normalized}`);
      names.add(normalized);
      nameBytes += Buffer.byteLength(name);
      if (names.size > MAX_MEMBERS || nameBytes > MAX_NAME_BYTES) {
        throw new Error('Artifact member metadata exceeds size budget');
      }
      if (name.endsWith('/')) continue;
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
        throw new Error(`Invalid archive member size: ${normalized}`);
      }
      total += entry.uncompressedSize;
      if (total > MAX_ARCHIVE_BYTES || entry.uncompressedSize > MAX_MEMBER_BYTES) {
        throw new Error('Artifact exceeds extraction size budget');
      }
      files.add(normalized);
      const hash = createHash('sha256');
      let size = 0;
      let checksum = 0;
      let output;
      try {
        if (destination !== undefined) {
          const target = path.join(destination, normalized);
          fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
          output = fs.openSync(target, 'wx', 0o600);
        }
        const stream = await zip.openReadStreamPromise(entry);
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > entry.uncompressedSize || size > MAX_MEMBER_BYTES) {
            throw new Error(`Archive member size mismatch: ${normalized}`);
          }
          hash.update(chunk);
          checksum = crc32(chunk, checksum);
          if (output !== undefined) {
            let offset = 0;
            while (offset < chunk.length) {
              const written = fs.writeSync(output, chunk, offset, chunk.length - offset);
              if (written === 0) throw new Error(`Cannot write archive member: ${normalized}`);
              offset += written;
            }
          }
        }
      } finally {
        if (output !== undefined) fs.closeSync(output);
      }
      if (size !== entry.uncompressedSize || checksum !== entry.crc32) {
        throw new Error(`Archive member CRC/size mismatch: ${normalized}`);
      }
      members.push({ path: normalized, size, sha256: hash.digest('hex') });
    }
    for (const name of names) {
      const segments = name.split('/');
      segments.pop();
      while (segments.length > 0) {
        if (files.has(segments.join('/'))) {
          throw new Error(`Archive file/directory collision: ${name}`);
        }
        segments.pop();
      }
    }
    return members;
  } finally {
    zip.close();
  }
}

function verifyMembers(members, expected) {
  const selected = new Map(expected.map((member) => [member.path, member]));
  if (selected.size !== expected.length || selected.size !== members.length) {
    throw new Error('Archive member set mismatch');
  }
  for (const member of members) {
    const match = selected.get(member.path);
    if (!match || match.sha256 !== member.sha256 || match.size !== member.size) {
      throw new Error(`Archive member digest/size mismatch: ${member.path}`);
    }
  }
}

export async function processArchive({ archive, destination, expected }) {
  const stat = fs.statSync(archive);
  if (!stat.isFile() || stat.size > MAX_ARCHIVE_BYTES) {
    throw new Error('Artifact exceeds archive size budget');
  }
  // First pass verifies every payload, even in the legacy path. A late unsafe
  // member, damaged CRC, or receipt mismatch cannot leave extraction writes.
  const members = await scanArchive(archive);
  if (expected !== undefined) verifyMembers(members, expected);
  if (destination !== undefined) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    try {
      fs.mkdirSync(destination, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST')
        throw new Error(`Refusing artifact overwrite: ${destination}`, { cause: error });
      throw error;
    }
    try {
      // The second pass streams to disk and rechecks hashes, defending against
      // archive changes between validation and extraction.
      verifyMembers(await scanArchive(archive, destination), members);
    } catch (error) {
      fs.rmSync(destination, { recursive: true, force: true });
      throw error;
    }
  }
  return { members };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    const request = JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(await processArchive(request)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
