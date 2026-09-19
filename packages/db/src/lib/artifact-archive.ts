import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface ArchiveMember {
  path: string;
  sha256: string;
  size: number;
}
export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Validate every entry before writing anything. Extraction never follows ZIP links. */
export function inspectArchive(bytes: Buffer): {
  members: ArchiveMember[];
  files: Map<string, Buffer>;
} {
  const zip = new AdmZip(bytes);
  const files = new Map<string, Buffer>();
  const names = new Set<string>();
  let total = 0;
  for (const entry of zip.getEntries()) {
    const name = entry.entryName;
    const segments = name.replace(/\/$/u, '').split('/');
    const mode = (entry.attr >>> 16) & 0o170000;
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
    if (entry.isDirectory) continue;
    total += entry.header.size;
    if (total > 20 * 1024 ** 3 || entry.header.size > 10 * 1024 ** 3) {
      throw new Error('Artifact exceeds extraction size budget');
    }
    files.set(normalized, entry.getData());
  }
  for (const name of files.keys()) {
    const segments = name.split('/');
    segments.pop();
    while (segments.length > 0) {
      if (files.has(segments.join('/')))
        throw new Error(`Archive file/directory collision: ${name}`);
      segments.pop();
    }
  }
  return {
    files,
    members: [...files].map(([name, data]) => ({
      path: name,
      size: data.length,
      sha256: sha256(data),
    })),
  };
}

export function extractVerifiedArchive(
  bytes: Buffer,
  destination: string,
  expected?: readonly ArchiveMember[],
): void {
  const { files, members } = inspectArchive(bytes);
  if (expected) {
    const selected = new Map(expected.map((member) => [member.path, member]));
    if (selected.size !== expected.length || selected.size !== members.length)
      throw new Error('Archive member set mismatch');
    for (const member of members) {
      const match = selected.get(member.path);
      if (!match || match.sha256 !== member.sha256 || match.size !== member.size) {
        throw new Error(`Archive member digest/size mismatch: ${member.path}`);
      }
    }
  }
  if (fs.existsSync(destination)) throw new Error(`Refusing artifact overwrite: ${destination}`);
  fs.mkdirSync(destination, { recursive: true });
  try {
    for (const [name, data] of files) {
      const target = path.join(destination, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data, { flag: 'wx', mode: 0o600 });
    }
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}
