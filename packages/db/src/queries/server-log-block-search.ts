import { brotliDecompressSync } from 'node:zlib';

import type { DbClient } from '../connection.js';
import {
  countCodePoints,
  foldCodePoint,
  SERVER_LOG_BLOOM_LOOKAHEAD,
  serverLogGramBit,
} from '../server-log-blocks';
import type { ServerLogSearchMatch } from './server-logs.js';

function termFolds(term: string): number[][] {
  return [...term].map((ch) => [
    ...new Set(
      [ch, ch.toLowerCase(), ch.toUpperCase()]
        .filter((v) => [...v].length === 1)
        .map((v) => foldCodePoint(v)),
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
}

interface DecodedBlock {
  text: string;
  units: Uint32Array | null;
}

export interface BlockSearchFile {
  logId: string;
  fileName: string;
  charCount: number;
  blocks: BlockMeta[];
}

export async function readBlockSearchIndexes(
  sql: DbClient,
  benchmarkResultId: number,
  fileNames: readonly string[],
  term: string,
): Promise<Map<string, BlockSearchFile>> {
  const { groups, bits } = termBloomGroups(term);
  const rows = (await sql`
    with selected_log as (
      select f.file_name, picked.server_log_id
      from unnest(${fileNames}::text[]) as f(file_name)
      cross join lateral (
        select sl.id as server_log_id, 0 as priority
        from benchmark_results br
        join server_logs sl on sl.id = br.server_log_id
        where br.id = ${benchmarkResultId} and sl.file_name = f.file_name
        union all
        select slf.server_log_id, 1 as priority
        from benchmark_results br
        join server_log_files slf on slf.server_log_id = br.server_log_id
        where br.id = ${benchmarkResultId} and slf.file_name = f.file_name
        order by priority
        limit 1
      ) as picked
    )
    select s.file_name, s.server_log_id::text as log_id, m.char_count as file_chars,
           b.block_index, b.char_offset, b.char_count, b.ascii,
           (cardinality(${groups}::int[]) = 0 or not exists (
             select 1 from unnest(${groups}::int[], ${bits}::int[]) as g(grp, bit)
             group by g.grp
             having not bool_or(get_bit(b.bloom, g.bit) = 1)
           )) as candidate
    from selected_log s
    join server_log_block_files m
      on m.server_log_id = s.server_log_id and m.file_name = s.file_name
    join server_log_blocks b
      on b.server_log_id = s.server_log_id and b.file_name = s.file_name
    order by s.file_name, b.block_index
  `) as {
    file_name: string;
    log_id: string;
    file_chars: number | string;
    block_index: number;
    char_offset: number | string;
    char_count: number;
    ascii: boolean;
    candidate: boolean;
  }[];
  const files = new Map<string, BlockSearchFile>();
  for (const row of rows) {
    let file = files.get(row.file_name);
    if (!file) {
      file = {
        logId: row.log_id,
        fileName: row.file_name,
        charCount: Number(row.file_chars),
        blocks: [],
      };
      files.set(row.file_name, file);
    }
    file.blocks.push({
      index: row.block_index,
      start: Number(row.char_offset),
      end: Number(row.char_offset) + row.char_count,
      ascii: row.ascii,
      candidate: row.candidate,
    });
  }
  return files;
}

export async function searchBlockFile(
  sql: DbClient,
  file: BlockSearchFile,
  pattern: RegExp,
  searchLength: number,
  chunkSize: number,
  overlap: number,
  matches: ServerLogSearchMatch[],
  limit: number,
): Promise<void> {
  const { blocks } = file;
  const decoded = new Map<number, DecodedBlock>();
  const finder = new RegExp(pattern.source, 'gu');
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
      if (!decoded.has(i)) missing.push(i);
    if (missing.length === 0) return;
    const rows = (await sql`
      select block_index, data from server_log_blocks
      where server_log_id = ${file.logId} and file_name = ${file.fileName}
        and block_index = any(${missing.map((i) => blocks[i].index)}::int[])
    `) as { block_index: number; data: Uint8Array }[];
    const position = new Map(missing.map((i) => [blocks[i].index, i]));
    for (const row of rows) {
      const i = position.get(row.block_index)!;
      const text = brotliDecompressSync(row.data).toString('utf8');
      let units: Uint32Array | null = null;
      if (!blocks[i].ascii) {
        units = new Uint32Array(blocks[i].end - blocks[i].start + 1);
        let point = 0;
        let unit = 0;
        for (const ch of text) {
          units[point++] = unit;
          unit += ch.length;
        }
        units[point] = unit;
      }
      decoded.set(i, { text, units });
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

  let offset = 0;
  while (matches.length <= limit) {
    const chunkEnd = Math.min(offset + chunkSize, file.charCount);
    const lastStart = chunkEnd - searchLength;
    let at = -1;
    for (let i = blockAfter(offset); i < blocks.length && blocks[i].start <= lastStart; i++) {
      if (!blocks[i].candidate) continue;
      const scanFrom = Math.max(offset, blocks[i].start);
      const scanTo = Math.min(blocks[i].end - 1, lastStart);
      await load(scanFrom, scanTo + searchLength);
      const window = text(scanFrom, scanTo + searchLength);
      finder.lastIndex = 0;
      const found = finder.exec(window);
      if (found) {
        const point = scanFrom + countCodePoints(window.slice(0, found.index));
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
}
