import { gunzipSync, gzipSync } from 'node:zlib';

import type { RequestChartDataWire, RequestChartTuple } from '../queries/request-chart-data';

const MAGIC = [0x52, 0x43, 0x44, 0x01];
const HEADER_NUMBERS = 5;

const KIND_PLAIN = 0;
const KIND_DELTA = 1;
const KIND_FLOAT64 = 2;

const MAX_DELTA_MAGNITUDE = 2 ** 50;

interface ColumnSpec {
  scale: number;
  nullable: boolean;
  plain: boolean;
}

const COLUMNS: readonly ColumnSpec[] = [
  { scale: 1, nullable: false, plain: true }, // cid
  { scale: 1, nullable: false, plain: true }, // phase
  { scale: 1, nullable: false, plain: false }, // startUs
  { scale: 1, nullable: false, plain: false }, // endUs
  { scale: 1000, nullable: true, plain: false }, // ttftMs
  { scale: 1000, nullable: true, plain: false }, // tpotMs
  { scale: 1, nullable: true, plain: false }, // isl
  { scale: 1, nullable: true, plain: false }, // osl
  { scale: 1, nullable: false, plain: true }, // cancelled
];
const ISL_COLUMN = 6;
const OSL_COLUMN = 7;

class ByteWriter {
  bytes = new Uint8Array(1 << 16);
  view = new DataView(this.bytes.buffer);
  length = 0;

  reserve(count: number): void {
    if (this.length + count <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + count) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
    this.view = new DataView(grown.buffer);
  }

  varint(value: number): void {
    this.reserve(8);
    let rest = value;
    while (rest >= 128) {
      this.bytes[this.length++] = (rest % 128) | 128;
      rest = Math.floor(rest / 128);
    }
    this.bytes[this.length++] = rest;
  }

  u32(value: number): void {
    this.reserve(4);
    this.view.setUint32(this.length, value, true);
    this.length += 4;
  }

  f64(value: number): void {
    this.reserve(8);
    this.view.setFloat64(this.length, value, true);
    this.length += 8;
  }

  append(bytes: Uint8Array): void {
    this.reserve(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  written(): Uint8Array {
    return this.bytes.subarray(0, this.length);
  }
}

function writePlainColumn(
  writer: ByteWriter,
  requests: RequestChartTuple[],
  column: number,
): boolean {
  for (const request of requests) {
    const value = request[column];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return false;
    writer.varint(value);
  }
  return true;
}

function writeDeltaColumn(
  writer: ByteWriter,
  requests: RequestChartTuple[],
  column: number,
  { scale, nullable }: ColumnSpec,
): boolean {
  let previous = 0;
  for (const request of requests) {
    const value = request[column];
    if (value === null && nullable) {
      writer.varint(0);
      continue;
    }
    if (typeof value !== 'number') return false;
    const scaled = Math.round(value * scale);
    if (!(Math.abs(scaled) <= MAX_DELTA_MAGNITUDE) || scaled / scale !== value) return false;
    const delta = scaled - previous;
    writer.varint((delta >= 0 ? delta * 2 : -delta * 2 - 1) + 1);
    previous = scaled;
  }
  return true;
}

function writeColumn(
  writer: ByteWriter,
  requests: RequestChartTuple[],
  column: number,
  spec: ColumnSpec,
): void {
  const body = new ByteWriter();
  let kind = spec.plain ? KIND_PLAIN : KIND_DELTA;
  const exact =
    kind === KIND_PLAIN
      ? writePlainColumn(body, requests, column)
      : writeDeltaColumn(body, requests, column, spec);
  if (!exact) {
    kind = KIND_FLOAT64;
    body.length = 0;
    for (const request of requests) body.f64(request[column] ?? Number.NaN);
  }
  writer.append(Uint8Array.of(kind));
  writer.u32(body.length);
  writer.append(body.written());
}

export function encodeRequestChartColumns(wire: RequestChartDataWire): Buffer {
  const writer = new ByteWriter();
  writer.append(Uint8Array.from(MAGIC));
  for (const value of [
    wire.version,
    wire.timelineVersion,
    wire.startNs,
    wire.endNs,
    wire.durationS,
  ]) {
    writer.f64(value);
  }
  writer.u32(wire.requests.length);
  const dictionaries = Buffer.from(JSON.stringify([wire.cids, wire.phases]), 'utf8');
  writer.u32(dictionaries.length);
  writer.append(dictionaries);
  for (const [column, spec] of COLUMNS.entries()) {
    writeColumn(writer, wire.requests, column, spec);
  }
  return gzipSync(writer.written());
}

function malformed(): Error {
  return new Error('request chart columns are malformed');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

interface ColumnSlice {
  kind: number;
  start: number;
  end: number;
}

interface ChartColumnsLayout {
  bytes: Uint8Array;
  view: DataView;
  header: number[];
  count: number;
  cids: string[];
  phases: string[];
  columns: ColumnSlice[];
}

function readLayout(gz: Uint8Array): ChartColumnsLayout {
  const bytes = gunzipSync(gz);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const take = (count: number): number => {
    const at = offset;
    offset += count;
    if (offset > bytes.length) throw malformed();
    return at;
  };
  const magicAt = take(MAGIC.length);
  if (MAGIC.some((byte, index) => bytes[magicAt + index] !== byte)) throw malformed();
  const header: number[] = [];
  for (let index = 0; index < HEADER_NUMBERS; index++) {
    header.push(view.getFloat64(take(8), true));
  }
  const count = view.getUint32(take(4), true);
  const dictionaryBytes = view.getUint32(take(4), true);
  const dictionaryAt = take(dictionaryBytes);
  const dictionaries: unknown = JSON.parse(
    Buffer.from(bytes.buffer, bytes.byteOffset + dictionaryAt, dictionaryBytes).toString('utf8'),
  );
  if (
    !Array.isArray(dictionaries) ||
    dictionaries.length !== 2 ||
    !isStringArray(dictionaries[0]) ||
    !isStringArray(dictionaries[1])
  ) {
    throw malformed();
  }
  const columns = COLUMNS.map((): ColumnSlice => {
    const kind = bytes[take(1)];
    const length = view.getUint32(take(4), true);
    const start = take(length);
    return { kind, start, end: start + length };
  });
  if (offset !== bytes.length) throw malformed();
  return {
    bytes,
    view,
    header,
    count,
    cids: dictionaries[0],
    phases: dictionaries[1],
    columns,
  };
}

function readColumn(layout: ChartColumnsLayout, column: number): Float64Array {
  const { bytes, view, count } = layout;
  const { kind, start, end } = layout.columns[column];
  const values = new Float64Array(count);
  if (kind === KIND_FLOAT64) {
    if (end - start !== count * 8) throw malformed();
    for (let index = 0; index < count; index++) {
      values[index] = view.getFloat64(start + index * 8, true);
    }
    return values;
  }
  if (kind !== KIND_PLAIN && kind !== KIND_DELTA) throw malformed();
  const { scale } = COLUMNS[column];
  let offset = start;
  let previous = 0;
  for (let index = 0; index < count; index++) {
    let varint = 0;
    let multiplier = 1;
    let byte: number;
    do {
      if (offset >= end) throw malformed();
      byte = bytes[offset++];
      varint += (byte & 127) * multiplier;
      multiplier *= 128;
    } while (byte >= 128);
    if (kind === KIND_PLAIN) {
      values[index] = varint;
    } else if (varint === 0) {
      values[index] = Number.NaN;
    } else {
      const zigzag = varint - 1;
      previous += zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2;
      values[index] = previous / scale;
    }
  }
  if (offset !== end) throw malformed();
  return values;
}

const nullIfNaN = (value: number): number | null => (Number.isNaN(value) ? null : value);

export function decodeRequestChartColumns(gz: Uint8Array): RequestChartDataWire {
  const layout = readLayout(gz);
  const [cid, phase, startUs, endUs, ttftMs, tpotMs, isl, osl, cancelled] = COLUMNS.map(
    (_, column) => readColumn(layout, column),
  );
  const requests: RequestChartTuple[] = [];
  for (let index = 0; index < layout.count; index++) {
    requests.push([
      cid[index],
      phase[index],
      startUs[index],
      endUs[index],
      nullIfNaN(ttftMs[index]),
      nullIfNaN(tpotMs[index]),
      nullIfNaN(isl[index]),
      nullIfNaN(osl[index]),
      cancelled[index] === 1 ? 1 : 0,
    ]);
  }
  const [version, timelineVersion, startNs, endNs, durationS] = layout.header;
  return {
    version,
    timelineVersion,
    startNs,
    endNs,
    durationS,
    cids: layout.cids,
    phases: layout.phases,
    requests,
  };
}

export function decodeRequestChartSequenceLengths(gz: Uint8Array): {
  isl: number[];
  osl: number[];
} {
  const layout = readLayout(gz);
  const [isl, osl] = [ISL_COLUMN, OSL_COLUMN].map((column) =>
    [...readColumn(layout, column)].filter(Number.isFinite),
  );
  return { isl, osl };
}
