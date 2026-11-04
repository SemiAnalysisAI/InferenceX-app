import { brotliDecompressSync } from 'node:zlib';

import type { DbClient } from '../connection.js';
import {
  countCodePoints,
  foldCodePoint,
  SERVER_LOG_BLOOM_LOOKAHEAD,
  serverLogGramBit,
} from '../server-log-blocks';
import { pgCaseVariants, pgLowerText } from './server-log-pg-lower';
import type { ServerLogSearchMatch } from './server-logs.js';

function termFolds(term: string): number[][] {
  return [...term].map((ch) => [
    ...new Set(
      pgCaseVariants(ch.codePointAt(0)!).flatMap((code) =>
        code < 128
          ? [foldCodePoint(String.fromCodePoint(code))]
          : [code, foldCodePoint(String.fromCodePoint(code))],
      ),
    ),
  ]);
}

export function termBloomGroups(term: string): { groups: number[]; bits: number[] } {
  const folds = termFolds(term);
  const groups: number[] = [];
  const bits: number[] = [];
  if (folds.length === 0 || folds.length > SERVER_LOG_BLOOM_LOOKAHEAD + 1) return { groups, bits };
  const n = Math.min(3, folds.length);
  for (let start = 0; start + n <= folds.length; start++) {
    const group = new Set<number>();
    for (const a of folds[start])
      for (const b of n > 1 ? folds[start + 1] : [-1])
        for (const c of n > 2 ? folds[start + 2] : [-1]) group.add(serverLogGramBit(a, b, c));
    for (const bit of group) {
      groups.push(start);
      bits.push(bit);
    }
  }
  return { groups, bits };
}

interface BlockMeta {
  index: number;
  start: number;
  end: number;
  ascii: boolean;
  candidate: boolean;
  fetched: boolean;
  data: Uint8Array | null;
}

interface DecodedBlock {
  text: string;
  lower: string | null;
  units: Uint32Array | null;
}

export interface BlockSearchFile {
  logId: string;
  fileName: string;
  charCount: number;
  blocks: BlockMeta[];
}

export interface BlockSearchIndex {
  fileNames: string[];
  files: Map<string, BlockSearchFile>;
}

export async function readBlockSearchIndex(
  sql: DbClient,
  benchmarkResultId: number,
  term: string,
): Promise<BlockSearchIndex> {
  const { groups, bits } = termBloomGroups(term);
  const rows = (await sql`
    with log_files as (
      select sl.id as server_log_id, sl.file_name, 0 as priority
      from benchmark_results br
      join server_logs sl on sl.id = br.server_log_id
      where br.id = ${benchmarkResultId}
      union all
      select slf.server_log_id, slf.file_name, 1 as priority
      from benchmark_results br
      join server_logs sl on sl.id = br.server_log_id
      join server_log_files slf on slf.server_log_id = sl.id
      where br.id = ${benchmarkResultId}
        and slf.file_name <> sl.file_name
    )
    select f.file_name, f.server_log_id::text as log_id, m.char_count as file_chars,
           b.block_index, b.char_offset, b.char_count, b.ascii,
           (cardinality(${groups}::int[]) = 0 or not exists (
             select 1 from unnest(${groups}::int[], ${bits}::int[]) as g(grp, bit)
             group by g.grp
             having not bool_or(get_bit(b.bloom, g.bit) = 1)
           )) as candidate
    from log_files f
    left join server_log_block_files m
      on m.server_log_id = f.server_log_id and m.file_name = f.file_name
    left join server_log_blocks b
      on m.char_count is not null
      and b.server_log_id = f.server_log_id and b.file_name = f.file_name
    order by f.priority, f.file_name, b.block_index
  `) as {
    file_name: string;
    log_id: string;
    file_chars: number | string | null;
    block_index: number | null;
    char_offset: number | string;
    char_count: number;
    ascii: boolean;
    candidate: boolean;
  }[];
  const fileNames: string[] = [];
  const files = new Map<string, BlockSearchFile>();
  let file: BlockSearchFile | undefined;
  for (const row of rows) {
    if (fileNames.at(-1) !== row.file_name) {
      fileNames.push(row.file_name);
      if (row.file_chars !== null) {
        file = {
          logId: row.log_id,
          fileName: row.file_name,
          charCount: Number(row.file_chars),
          blocks: [],
        };
        files.set(row.file_name, file);
      }
    }
    if (file && row.block_index !== null)
      file.blocks.push({
        index: row.block_index,
        start: Number(row.char_offset),
        end: Number(row.char_offset) + row.char_count,
        ascii: row.ascii,
        candidate: row.candidate,
        fetched: false,
        data: null,
      });
  }
  return { fileNames, files };
}

export type BlockFetcher = (file: BlockSearchFile, needed: readonly number[]) => Promise<void>;

export function createBlockFetcher(sql: DbClient, files: readonly BlockSearchFile[]): BlockFetcher {
  let rounds = 0;
  return async (file, needed) => {
    const wanted: [BlockSearchFile, number][] = needed.map((i) => [file, i]);
    let extra = rounds === 0 ? 0 : Math.min(2 ** rounds, 32);
    rounds++;
    let next = Math.max(...needed) + 1;
    for (let f = files.indexOf(file); f >= 0 && f < files.length && extra > 0; f++) {
      const { blocks } = files[f];
      for (; next < blocks.length && extra > 0; next++) {
        if (!blocks[next].candidate || blocks[next].fetched) continue;
        wanted.push([files[f], next]);
        extra--;
        if (next + 1 < blocks.length && !blocks[next + 1].fetched) {
          next++;
          wanted.push([files[f], next]);
          extra--;
        }
      }
      next = 0;
    }
    const rows = (await sql`
      select w.ord, b.data
      from unnest(
        ${wanted.map(([f]) => f.logId)}::bigint[],
        ${wanted.map(([f]) => f.fileName)}::text[],
        ${wanted.map(([f, i]) => f.blocks[i].index)}::int[]
      ) with ordinality as w(server_log_id, file_name, block_index, ord)
      join server_log_blocks b
        on b.server_log_id = w.server_log_id
        and b.file_name = w.file_name
        and b.block_index = w.block_index
    `) as { ord: number | string; data: Uint8Array }[];
    for (const row of rows) {
      const [f, i] = wanted[Number(row.ord) - 1];
      f.blocks[i].data = row.data;
    }
    for (const [f, i] of wanted) f.blocks[i].fetched = true;
  };
}

export interface BlockScanBudget {
  chunkSize: number;
  overlap: number;
  remaining: number;
  checkDeadline: () => void;
}

export async function searchBlockFile(
  fetchBlocks: BlockFetcher,
  file: BlockSearchFile,
  needle: string,
  searchLength: number,
  matches: ServerLogSearchMatch[],
  limit: number,
  { chunkSize, overlap, remaining, checkDeadline }: BlockScanBudget,
): Promise<{ incomplete: boolean; end: number }> {
  const { blocks } = file;
  const decoded = new Map<number, DecodedBlock>();
  const blockAfter = (point: number) => {
    let lo = 0;
    let hi = blocks.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (blocks[mid].end <= point) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const load = async (from: number, to: number) => {
    const missing: number[] = [];
    for (let i = blockAfter(from); i < blocks.length && blocks[i].start < to; i++)
      if (!decoded.has(i) && blocks[i].data === null) missing.push(i);
    if (missing.length > 0) await fetchBlocks(file, missing);
    for (let i = blockAfter(from); i < blocks.length && blocks[i].start < to; i++) {
      const block = blocks[i];
      if (decoded.has(i)) continue;
      const text = brotliDecompressSync(block.data!).toString('utf8');
      block.data = null;
      let units: Uint32Array | null = null;
      if (!block.ascii) {
        units = new Uint32Array(block.end - block.start + 1);
        let point = 0;
        let unit = 0;
        for (const ch of text) {
          units[point++] = unit;
          unit += ch.length;
        }
        units[point] = unit;
      }
      decoded.set(i, { text, lower: null, units });
    }
  };
  const text = (from: number, to: number) => {
    let out = '';
    for (let i = blockAfter(from); i < blocks.length && blocks[i].start < to; i++) {
      const block = blocks[i];
      const { text: body, units } = decoded.get(i)!;
      const a = Math.max(from, block.start) - block.start;
      const b = Math.min(to, block.end) - block.start;
      out += units ? body.slice(units[a], units[b]) : body.slice(a, b);
    }
    return out;
  };
  const findInBlock = async (i: number, from: number, to: number) => {
    const block = blocks[i];
    await load(from, block.end + 1);
    const entry = decoded.get(i)!;
    entry.lower ??= pgLowerText(entry.text);
    const { units } = entry;
    const found = entry.lower.indexOf(
      needle,
      units ? units[from - block.start] : from - block.start,
    );
    if (found === -1) return -1;
    let point = found;
    if (units) {
      let lo = 0;
      let hi = units.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (units[mid] < found) lo = mid + 1;
        else hi = mid;
      }
      point = lo;
    }
    return block.start + point <= to ? block.start + point : -1;
  };

  let offset = 0;
  let end = 0;
  while (matches.length <= limit) {
    if (offset >= remaining) return { incomplete: true, end };
    checkDeadline();
    const chunkEnd = Math.min(offset + chunkSize, file.charCount);
    end = Math.max(end, chunkEnd);
    const lastStart = chunkEnd - searchLength;
    let at = -1;
    for (let i = blockAfter(offset); i < blocks.length && blocks[i].start <= lastStart; i++) {
      if (!blocks[i].candidate) continue;
      const scanFrom = Math.max(offset, blocks[i].start);
      const scanTo = Math.min(blocks[i].end - 1, lastStart);
      const insideTo = Math.min(scanTo, blocks[i].end - searchLength);
      if (scanFrom <= insideTo) at = await findInBlock(i, scanFrom, insideTo);
      if (at >= 0) break;
      const edgeFrom = Math.max(scanFrom, insideTo + 1);
      if (edgeFrom > scanTo) continue;
      await load(edgeFrom, scanTo + searchLength);
      const window = pgLowerText(text(edgeFrom, scanTo + searchLength));
      const found = window.indexOf(needle);
      if (found !== -1) {
        const point = edgeFrom + countCodePoints(window.slice(0, found));
        if (point <= scanTo) {
          at = point;
          break;
        }
      }
    }
    if (at >= 0) {
      const beforeFrom = Math.max(offset, at - 120);
      const afterTo = Math.min(at + searchLength + 120, chunkEnd);
      await load(beforeFrom, afterTo);
      matches.push({
        fileName: file.fileName,
        offset: at,
        before: text(beforeFrom, at),
        match: text(at, at + searchLength),
        after: text(at + searchLength, afterTo),
      });
      offset = at + searchLength;
    } else {
      if (offset + chunkSize >= file.charCount) break;
      const advance = chunkEnd - offset - overlap;
      if (advance <= 0) break;
      offset += advance;
    }
    for (const i of decoded.keys()) if (blocks[i].end <= offset - 120) decoded.delete(i);
  }
  return { incomplete: false, end };
}
