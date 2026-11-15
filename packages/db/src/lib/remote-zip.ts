/**
 * Read chosen entries of a zip archive through byte-range reads, without
 * downloading the archive. A benchmark artifact can hold gigabytes of server
 * metrics next to the few megabytes a reader needs.
 */

import { inflateRawSync } from 'node:zlib';

/** Read bytes `start..end` inclusive of the archive. */
export type RangeReader = (start: number, end: number) => Promise<Buffer>;

export interface RemoteZipEntry {
  name: string;
  /** 0 stored, 8 deflate. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/** `PK\x05\x06`, `PK\x01\x02` and `PK\x03\x04` as little-endian integers. */
const EOCD_SIGNATURE = 101_010_256;
const CENTRAL_SIGNATURE = 33_639_248;
const LOCAL_SIGNATURE = 67_324_752;
const EOCD_SEARCH_BYTES = 65_557;
const ZIP64_MARKER = 4_294_967_295;

/** List the entries of a zip archive of `size` bytes from its central directory. */
export async function listRemoteZip(read: RangeReader, size: number): Promise<RemoteZipEntry[]> {
  const tailStart = Math.max(0, size - EOCD_SEARCH_BYTES);
  const tail = await read(tailStart, size - 1);
  let eocd = -1;
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) throw new Error('zip: end of central directory not found');
  const count = tail.readUInt16LE(eocd + 10);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  if (count === 65_535 || directorySize === ZIP64_MARKER || directoryOffset === ZIP64_MARKER) {
    throw new Error('zip: zip64 archives are not supported');
  }

  const directory =
    directoryOffset >= tailStart
      ? tail.subarray(directoryOffset - tailStart, directoryOffset - tailStart + directorySize)
      : await read(directoryOffset, directoryOffset + directorySize - 1);
  const entries: RemoteZipEntry[] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    if (directory.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error('zip: malformed central directory');
    }
    const nameLength = directory.readUInt16LE(offset + 28);
    const extraLength = directory.readUInt16LE(offset + 30);
    const commentLength = directory.readUInt16LE(offset + 32);
    entries.push({
      name: directory.toString('utf8', offset + 46, offset + 46 + nameLength),
      method: directory.readUInt16LE(offset + 10),
      compressedSize: directory.readUInt32LE(offset + 20),
      uncompressedSize: directory.readUInt32LE(offset + 24),
      localHeaderOffset: directory.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Read and decompress one entry. */
export async function readRemoteZipEntry(
  read: RangeReader,
  entry: RemoteZipEntry,
): Promise<Buffer> {
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`zip: unsupported compression method ${entry.method} for ${entry.name}`);
  }
  const header = await read(entry.localHeaderOffset, entry.localHeaderOffset + 29);
  if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
    throw new Error(`zip: malformed local header for ${entry.name}`);
  }
  const dataStart =
    entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  if (entry.compressedSize === 0) return Buffer.alloc(0);
  const data = await read(dataStart, dataStart + entry.compressedSize - 1);
  return entry.method === 8 ? inflateRawSync(data) : data;
}

/** A range reader over an HTTP URL that honours `Range` requests. */
export function httpRangeReader(url: string, headers: Record<string, string> = {}): RangeReader {
  return async (start, end) => {
    const response = await fetch(url, { headers: { ...headers, Range: `bytes=${start}-${end}` } });
    if (response.status !== 206) {
      throw new Error(`range read ${start}-${end} returned ${response.status}`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length !== end - start + 1) {
      throw new Error(`range read ${start}-${end} returned ${body.length} bytes`);
    }
    return body;
  };
}
