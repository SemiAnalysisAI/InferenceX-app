import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';

import type { DbClient } from '../connection';
import type { Sql } from '../etl/db-utils';
import type { TransactionSql } from 'postgres';

type ProfileSql = DbClient | Sql | TransactionSql<Record<string, never>>;

export const PROFILE_INLINE_BYTES = 16 * 1024 * 1024;
export const PROFILE_CHUNK_BYTES = 4 * 1024 * 1024;

export async function writeTraceProfileChunks(
  sql: ProfileSql,
  traceReplayId: number,
  profile: Buffer,
): Promise<void> {
  const query = sql as DbClient;
  if (profile.length === 0) throw new Error('Cannot store an empty chunked profile');
  let count = 0;
  for (let offset = 0; offset < profile.length; offset += PROFILE_CHUNK_BYTES) {
    const data = profile.subarray(offset, offset + PROFILE_CHUNK_BYTES);
    await query`
      insert into agentic_trace_profile_chunks (trace_replay_id, part, data)
      values (${traceReplayId}, ${count}, ${data})
    `;
    count++;
  }
  const updated = await query`
    update agentic_trace_replay
    set profile_export_chunk_count = ${count},
        profile_export_compressed_size = ${profile.length},
        profile_export_sha256 = ${createHash('sha256').update(profile).digest('hex')}
    where id = ${traceReplayId} and profile_export_jsonl_gz is null
    returning id
  `;
  if (updated.length !== 1)
    throw new Error(`Cannot attach chunks to trace profile ${traceReplayId}`);
}

export async function* readTraceProfileChunks(
  sql: ProfileSql,
  traceReplayId: number,
): AsyncGenerator<Buffer> {
  const query = sql as DbClient;
  const [meta] = await query`
    select profile_export_chunk_count as parts,
      profile_export_compressed_size as compressed_size,
      profile_export_sha256 as sha256,
      octet_length(profile_export_jsonl_gz) as inline_size
    from agentic_trace_replay where id = ${traceReplayId}
  `;
  if (!meta) throw new Error(`Trace profile ${traceReplayId} does not exist`);
  const count = Number(meta.parts ?? 0);
  const size = Number(count > 0 ? meta.compressed_size : (meta.inline_size ?? 0));
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid profile size');
  if (count > 0 && (!meta.sha256 || count !== Math.ceil(size / PROFILE_CHUNK_BYTES))) {
    throw new Error(`Invalid chunk metadata for trace profile ${traceReplayId}`);
  }
  const hash = createHash('sha256');
  for (let offset = 0, part = 0; offset < size; offset += PROFILE_CHUNK_BYTES, part++) {
    const rows =
      count > 0
        ? await query`
          select data from agentic_trace_profile_chunks
          where trace_replay_id = ${traceReplayId} and part = ${part}
        `
        : await query`
          select substring(profile_export_jsonl_gz from ${offset + 1}::int for ${PROFILE_CHUNK_BYTES}::int) as data
          from agentic_trace_replay where id = ${traceReplayId}
        `;
    const data = rows[0]?.data;
    if (
      !(data instanceof Uint8Array) ||
      data.length !== Math.min(PROFILE_CHUNK_BYTES, size - offset)
    ) {
      throw new Error(`Missing or truncated trace profile ${traceReplayId} chunk ${part}`);
    }
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    hash.update(buffer);
    yield buffer;
  }
  if (count > 0 && hash.digest('hex') !== meta.sha256) {
    throw new Error(`Trace profile ${traceReplayId} checksum mismatch`);
  }
}

export async function readTraceProfileGz(sql: ProfileSql, id: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of readTraceProfileChunks(sql, id)) chunks.push(chunk);
  return chunks.length > 0 ? Buffer.concat(chunks) : null;
}

export async function* readTraceProfileLines(sql: ProfileSql, id: number): AsyncGenerator<string> {
  const source = Readable.from(readTraceProfileChunks(sql, id));
  const decoder = new StringDecoder('utf8');
  const gunzip = createGunzip();
  source.on('error', (error) => gunzip.destroy(error));
  const stream = source.pipe(gunzip);
  let pending = '';
  try {
    for await (const chunk of stream) {
      const text = pending + decoder.write(chunk as Buffer);
      let start = 0;
      let end = text.indexOf('\n');
      while (end !== -1) {
        yield text.slice(start, end);
        start = end + 1;
        end = text.indexOf('\n', start);
      }
      pending = text.slice(start);
    }
    pending += decoder.end();
    if (pending) yield pending;
  } finally {
    source.destroy();
    gunzip.destroy();
  }
}
