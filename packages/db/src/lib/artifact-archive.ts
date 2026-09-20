import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ArchiveMember {
  path: string;
  sha256: string;
  size: number;
}

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Hash archive bytes without retaining the download in the ingestion process. */
export function sha256File(filename: string): string {
  const descriptor = fs.openSync(filename, 'r');
  try {
    const hash = createHash('sha256');
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let length;
    while ((length = fs.readSync(descriptor, chunk, 0, chunk.length, null)) > 0) {
      hash.update(chunk.subarray(0, length));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(descriptor);
  }
}

function processArchive(
  archive: Buffer | string,
  destination?: string,
  expected?: readonly ArchiveMember[],
): { members: ArchiveMember[] } {
  // Only callers that already own a small Buffer use this compatibility path.
  // Production downloads pass a private on-disk ZIP directly to the worker.
  const temporary = Buffer.isBuffer(archive)
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-inspect-'))
    : undefined;
  try {
    const filename = temporary
      ? path.join(temporary, 'archive.zip')
      : path.resolve(archive as string);
    if (temporary) fs.writeFileSync(filename, archive, { flag: 'wx', mode: 0o600 });
    const input = JSON.stringify({
      archive: filename,
      destination: destination === undefined ? undefined : path.resolve(destination),
      expected,
    });
    if (Buffer.byteLength(input) > 32 * 1024 ** 2) {
      throw new Error('Artifact member metadata exceeds size budget');
    }
    // Keep the public ingestion API synchronous while the isolated worker uses
    // bounded asynchronous ZIP streams. Only member metadata crosses stdout.
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('artifact-archive-worker.mjs', import.meta.url))],
      { input, encoding: 'utf8', maxBuffer: 32 * 1024 ** 2 },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || 'Artifact verification failed');
    }
    return JSON.parse(result.stdout) as { members: ArchiveMember[] };
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
}

/** Validate and hash every entry, retaining member metadata rather than payloads. */
export function inspectArchive(archive: Buffer | string): { members: ArchiveMember[] } {
  return processArchive(archive);
}

/** Verify the complete archive before creating its exclusive extraction directory. */
export function extractVerifiedArchive(
  archive: Buffer | string,
  destination: string,
  expected?: readonly ArchiveMember[],
): void {
  processArchive(archive, destination, expected);
}
