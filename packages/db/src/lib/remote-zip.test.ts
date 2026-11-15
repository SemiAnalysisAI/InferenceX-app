import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { listRemoteZip, readRemoteZipEntry, type RangeReader } from './remote-zip';

/** Build a zip archive in memory: local headers, a central directory and its end record. */
function zip(files: { name: string; data: Buffer; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const body = file.store ? file.data : deflateRawSync(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(67_324_752, 0);
    local.writeUInt16LE(file.store ? 0 : 8, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(33_639_248, 0);
    central.writeUInt16LE(file.store ? 0 : 8, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(101_010_256, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function reader(archive: Buffer): { read: RangeReader; bytesRead: () => number } {
  let total = 0;
  return {
    read: (start, end) => {
      total += end - start + 1;
      return Promise.resolve(archive.subarray(start, end + 1));
    },
    bytesRead: () => total,
  };
}

describe('remote zip', () => {
  const big = Buffer.alloc(400_000, 7);
  const archive = zip([
    { name: 'aiperf_artifacts/server_metrics_export.json', data: big, store: true },
    { name: 'aiperf_artifacts/profile_export.jsonl', data: Buffer.from('{"a":1}\n{"a":2}\n') },
    { name: 'benchmark.log', data: Buffer.from('Phase profiling complete'), store: true },
    { name: 'empty.txt', data: Buffer.alloc(0), store: true },
  ]);

  it('lists entries from the central directory', async () => {
    const entries = await listRemoteZip(reader(archive).read, archive.length);
    expect(entries.map((entry) => [entry.name, entry.uncompressedSize])).toEqual([
      ['aiperf_artifacts/server_metrics_export.json', 400_000],
      ['aiperf_artifacts/profile_export.jsonl', 16],
      ['benchmark.log', 24],
      ['empty.txt', 0],
    ]);
  });

  it('reads deflated and stored entries without reading the rest of the archive', async () => {
    const { read, bytesRead } = reader(archive);
    const entries = await listRemoteZip(read, archive.length);
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    const jsonl = await readRemoteZipEntry(
      read,
      byName.get('aiperf_artifacts/profile_export.jsonl')!,
    );
    const log = await readRemoteZipEntry(read, byName.get('benchmark.log')!);
    expect(jsonl.toString('utf8')).toBe('{"a":1}\n{"a":2}\n');
    expect(log.toString('utf8')).toBe('Phase profiling complete');
    expect(await readRemoteZipEntry(read, byName.get('empty.txt')!)).toHaveLength(0);
    expect(bytesRead()).toBeLessThan(big.length);
  });

  it('rejects bytes that are not a zip archive', async () => {
    const junk = Buffer.alloc(100, 1);
    await expect(listRemoteZip(reader(junk).read, junk.length)).rejects.toThrow(
      'end of central directory not found',
    );
  });
});
