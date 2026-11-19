import { safePath } from '@/components/video-benchmark/bundle';

/** Returns exactly bytes [start, end) of the archive, or throws. */
export type RangeRead = (start: number, end: number) => Promise<Uint8Array>;

interface Entry {
  name: string;
  nameLength: number;
  offset: number;
  compressedSize: number;
  size: number;
  method: number;
}

const EOCD = 'PK\u0005\u0006';
const CENTRAL = 'PK\u0001\u0002';
const LOCAL = 'PK\u0003\u0004';
const ZIP32_MAX = 2 ** 32 - 1;
/** End-of-central-directory record plus the largest possible archive comment. */
const TAIL_BYTES = 22 + 2 ** 16 - 1;
/** Selected entries closer than this share one request. */
const COALESCE_GAP = 64 * 1024;
/** Room for a local extra field; a longer one costs one more request. */
const LOCAL_SLACK = 1024;
const MAX_ENTRIES = 4000;
const MAX_CENTRAL_BYTES = 4 * 1024 ** 2;
const MAX_SELECTED_BYTES = 64 * 1024 ** 2;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const signature = (bytes: Uint8Array, at: number) =>
  String.fromCodePoint(...bytes.subarray(at, at + 4));

function centralDirectory(tail: Uint8Array, tailStart: number) {
  const data = view(tail);
  for (let at = tail.length - 22; at >= 0; at--) {
    if (signature(tail, at) !== EOCD || at + 22 + data.getUint16(at + 20, true) !== tail.length)
      continue;
    const count = data.getUint16(at + 10, true);
    const size = data.getUint32(at + 12, true);
    const offset = data.getUint32(at + 16, true);
    // Zip64 and multi-disk archives put more records between the directory and this one.
    if (
      data.getUint16(at + 4, true) !== 0 ||
      data.getUint16(at + 6, true) !== 0 ||
      count !== data.getUint16(at + 8, true) ||
      offset + size !== tailStart + at
    )
      throw new Error('Unsupported ZIP layout');
    return { count, size, offset };
  }
  throw new Error('ZIP end of central directory not found');
}

function parseEntries(bytes: Uint8Array, count: number, end: number): Entry[] {
  if (count > MAX_ENTRIES) throw new Error('ZIP has too many entries');
  const data = view(bytes);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const names = new Set<string>();
  const entries: Entry[] = [];
  let at = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || signature(bytes, at) !== CENTRAL)
      throw new Error('Malformed ZIP central directory');
    const nameLength = data.getUint16(at + 28, true);
    const next =
      at + 46 + nameLength + data.getUint16(at + 30, true) + data.getUint16(at + 32, true);
    if (next > bytes.length) throw new Error('Malformed ZIP central directory');
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const entry = {
      name,
      nameLength,
      method: data.getUint16(at + 10, true),
      compressedSize: data.getUint32(at + 20, true),
      size: data.getUint32(at + 24, true),
      offset: data.getUint32(at + 42, true),
    };
    if (data.getUint16(at + 8, true) & 1) throw new Error('Encrypted ZIP entries are unsupported');
    if ([entry.compressedSize, entry.size, entry.offset].includes(ZIP32_MAX))
      throw new Error('Zip64 entries are unsupported');
    if (entry.offset + 30 + nameLength + entry.compressedSize > end)
      throw new Error('ZIP entry overlaps the central directory');
    at = next;
    if (name.endsWith('/')) continue;
    safePath(name);
    if (names.has(name)) throw new Error('Duplicate archive path');
    names.add(name);
    entries.push(entry);
  }
  return entries;
}

/**
 * Reads only the selected entries of a remote ZIP through explicit byte ranges: the tail for
 * the central directory, then nearby entries coalesced into a few requests.
 */
export async function readZipEntries(
  read: RangeRead,
  zipSize: number,
  select: (name: string) => boolean,
): Promise<Map<string, Uint8Array>> {
  const tailStart = Math.max(0, zipSize - TAIL_BYTES);
  const tail = await read(tailStart, zipSize);
  const directory = centralDirectory(tail, tailStart);
  if (directory.size > MAX_CENTRAL_BYTES) throw new Error('ZIP central directory is too large');
  const central =
    directory.offset >= tailStart
      ? tail.subarray(directory.offset - tailStart, directory.offset - tailStart + directory.size)
      : await read(directory.offset, directory.offset + directory.size);
  const selected = parseEntries(central, directory.count, directory.offset)
    .filter((entry) => select(entry.name))
    .toSorted((a, b) => a.offset - b.offset);
  if (
    selected.reduce((total, entry) => total + Math.max(entry.size, entry.compressedSize), 0) >
    MAX_SELECTED_BYTES
  )
    throw new Error('Selected ZIP entries exceed the read limit');
  if (selected.some((entry) => entry.method !== 0 && entry.method !== 8))
    throw new Error('Unsupported ZIP compression method');

  const spans: { start: number; end: number; bytes?: Promise<Uint8Array> }[] = [];
  for (const entry of selected) {
    const start = entry.offset;
    const end = Math.min(
      directory.offset,
      start + 30 + entry.nameLength + entry.compressedSize + LOCAL_SLACK,
    );
    const last = spans.at(-1);
    if (last && start <= last.end + COALESCE_GAP) last.end = Math.max(last.end, end);
    else spans.push({ start, end });
  }
  for (const span of spans) span.bytes = read(span.start, span.end);

  const { inflateSync } = await import('fflate');
  const files = new Map<string, Uint8Array>();
  for (const entry of selected) {
    const span = spans.find((item) => entry.offset >= item.start && entry.offset < item.end)!;
    let bytes = await span.bytes!;
    const header = entry.offset - span.start;
    const local = view(bytes);
    if (header + 30 + entry.nameLength > bytes.length || signature(bytes, header) !== LOCAL)
      throw new Error(`Malformed ZIP local header: ${entry.name}`);
    const nameLength = local.getUint16(header + 26, true);
    if (
      nameLength !== entry.nameLength ||
      new TextDecoder().decode(bytes.subarray(header + 30, header + 30 + nameLength)) !== entry.name
    )
      throw new Error(`ZIP local header names another entry: ${entry.name}`);
    const dataStart = header + 30 + nameLength + local.getUint16(header + 28, true);
    const dataEnd = dataStart + entry.compressedSize;
    if (span.start + dataEnd > directory.offset)
      throw new Error('ZIP entry overlaps the central directory');
    if (dataEnd > bytes.length) {
      const joined = new Uint8Array(dataEnd);
      joined.set(bytes);
      joined.set(await read(span.start + bytes.length, span.start + dataEnd), bytes.length);
      bytes = joined;
    }
    const compressed = bytes.subarray(dataStart, dataEnd);
    // A sized buffer caps memory at the declared size; longer output fails the size check below.
    const content =
      entry.method === 0
        ? compressed
        : inflateSync(compressed, { out: new Uint8Array(entry.size + 1) });
    if (content.length !== entry.size) throw new Error(`ZIP entry size mismatch: ${entry.name}`);
    files.set(entry.name, content);
  }
  return files;
}
