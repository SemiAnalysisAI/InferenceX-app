import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';

export const SERVER_LOG_BLOCK_CHARS = 1024 * 1024;

export const SERVER_LOG_BLOOM_BITS = 128 * 1024;
export const SERVER_LOG_BLOOM_LOOKAHEAD = 255;

export interface ServerLogBlock {
  blockIndex: number;
  charOffset: number;
  charCount: number;
  ascii: boolean;
  data: Uint8Array;
  bloom: Uint8Array;
}

const isAscii = (text: string) => Buffer.byteLength(text, 'utf8') === text.length;

export function countCodePoints(text: string): number {
  if (isAscii(text)) return text.length;
  let count = 0;
  for (const _ of text) count++;
  return count;
}

const foldedNonAscii = new Map<string, number>();

export function foldCodePoint(ch: string): number {
  const code = ch.codePointAt(0)!;
  if (code < 128) return code >= 65 && code <= 90 ? code + 32 : code;
  let folded = foldedNonAscii.get(ch);
  if (folded === undefined) {
    const lower = ch.toLowerCase();
    folded = lower.length === ch.length && [...lower].length === 1 ? lower.codePointAt(0)! : 0;
    if (folded === 0) {
      folded = 1_114_112;
      for (const unit of lower) folded = Math.imul(folded ^ unit.codePointAt(0)!, 16_777_619) >>> 0;
      folded = 1_114_112 + (folded % 8_323_072);
    }
    foldedNonAscii.set(ch, folded);
  }
  return folded;
}

export function serverLogGramBit(a: number, b: number, c: number): number {
  let h = Math.imul(a + 1, 2_654_435_761);
  h = Math.imul(h ^ (b + 1) ^ (h >>> 15), 2_246_822_507);
  h = Math.imul(h ^ (c + 1) ^ (h >>> 13), 3_266_489_909);
  h ^= h >>> 16;
  return (h >>> 0) & (SERVER_LOG_BLOOM_BITS - 1);
}

function buildBloom(folded: Int32Array): Uint8Array {
  const bloom = new Uint8Array(SERVER_LOG_BLOOM_BITS / 8);
  const set = (bit: number) => {
    bloom[bit >>> 3] |= 1 << (bit & 7);
  };
  for (let i = 0; i < folded.length; i++) {
    const a = folded[i];
    set(serverLogGramBit(a, -1, -1));
    if (i + 1 < folded.length) set(serverLogGramBit(a, folded[i + 1], -1));
    if (i + 2 < folded.length) set(serverLogGramBit(a, folded[i + 1], folded[i + 2]));
  }
  return bloom;
}

function foldText(text: string, ascii: boolean, limit: number): Int32Array {
  if (ascii) {
    const length = Math.min(text.length, limit);
    const out = new Int32Array(length);
    for (let i = 0; i < length; i++) {
      const code = text.codePointAt(i)!;
      out[i] = code >= 65 && code <= 90 ? code + 32 : code;
    }
    return out;
  }
  const values: number[] = [];
  for (const ch of text) {
    if (values.length === limit) break;
    values.push(foldCodePoint(ch));
  }
  return Int32Array.from(values);
}

export function encodeServerLogBlocks(text: string, following = ''): ServerLogBlock[] {
  const blocks: ServerLogBlock[] = [];
  let unit = 0;
  let charOffset = 0;
  while (unit < text.length) {
    let end = Math.min(unit + SERVER_LOG_BLOCK_CHARS, text.length);
    let piece = text.slice(unit, end);
    let charCount = piece.length;
    if (!isAscii(piece)) {
      let units = 0;
      charCount = 0;
      for (const ch of text.slice(unit, unit + 2 * SERVER_LOG_BLOCK_CHARS)) {
        if (charCount === SERVER_LOG_BLOCK_CHARS) break;
        units += ch.length;
        charCount++;
      }
      end = unit + units;
      piece = text.slice(unit, end);
    }
    const look = text.slice(end, end + 2 * SERVER_LOG_BLOOM_LOOKAHEAD) + following;
    const gramText = piece + look.slice(0, 2 * SERVER_LOG_BLOOM_LOOKAHEAD);
    const folded = foldText(gramText, isAscii(gramText), charCount + SERVER_LOG_BLOOM_LOOKAHEAD);
    const bytes = Buffer.from(piece, 'utf8');
    blocks.push({
      blockIndex: blocks.length,
      charOffset,
      charCount,
      ascii: bytes.length === piece.length,
      data: brotliCompressSync(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 9,
          [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
        },
      }),
      bloom: buildBloom(folded),
    });
    unit = end;
    charOffset += charCount;
  }
  return blocks;
}

export function sliceCodePoints(text: string, ascii: boolean, start: number, length: number) {
  if (ascii) return text.slice(start, start + length);
  let out = '';
  let index = 0;
  for (const ch of text) {
    if (index >= start + length) break;
    if (index >= start) out += ch;
    index++;
  }
  return out;
}

export function readServerLogBlocks(
  blocks: readonly Pick<ServerLogBlock, 'charOffset' | 'charCount' | 'ascii' | 'data'>[],
  offset: number,
  length: number,
): string {
  let out = '';
  for (const block of blocks) {
    const end = block.charOffset + block.charCount;
    if (end <= offset || block.charOffset >= offset + length) continue;
    const text = brotliDecompressSync(block.data).toString('utf8');
    const from = Math.max(0, offset - block.charOffset);
    out += sliceCodePoints(
      text,
      block.ascii,
      from,
      Math.min(end, offset + length) - block.charOffset - from,
    );
  }
  return out;
}
