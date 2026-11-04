import { describe, expect, it } from 'vitest';

import {
  countCodePoints,
  encodeServerLogBlocks,
  readServerLogBlocks,
  SERVER_LOG_BLOCK_CHARS,
} from './server-log-blocks';

const substring = (text: string, start: number, length: number) =>
  [...text].slice(start, start + length).join('');

function sampleLog(chars: number, astralAt: number[]): string {
  const parts: string[] = [];
  let n = 0;
  while (n < chars) {
    const line = `line ${n} INFO request done in ${n % 97} ms\n`;
    parts.push(line);
    n += line.length;
  }
  let text = parts.join('').slice(0, chars);
  for (const at of astralAt) text = `${text.slice(0, at)}é😀${text.slice(at + 2)}`;
  return text;
}

describe('server log blocks', () => {
  const B = SERVER_LOG_BLOCK_CHARS;

  it('reads any code-point range of a mixed log exactly, including across blocks', () => {
    const text = sampleLog(2 * B + 4321, [B - 1, B + 77, 2 * B + 10]);
    const blocks = encodeServerLogBlocks(text);

    expect(blocks.reduce((n, block) => n + block.charCount, 0)).toBe(countCodePoints(text));
    expect(blocks.map((block) => block.charOffset)).toEqual([0, B, 2 * B]);
    for (const [start, length] of [
      [0, 10],
      [B - 3, 6],
      [B - 1, 2],
      [B + 70, 20],
      [2 * B - 5, 30],
      [0, 3 * B],
      [2 * B + 4000, 1000],
      [5 * B, 10],
    ])
      expect(readServerLogBlocks(blocks, start, length)).toBe(substring(text, start, length));
  });

  it('marks pure-ASCII blocks so they slice by UTF-16 index', () => {
    const text = sampleLog(B + 10, [B + 2]);
    const [first, second] = encodeServerLogBlocks(text);

    expect(first.ascii).toBe(true);
    expect(second.ascii).toBe(false);
    expect(readServerLogBlocks([first, second], B - 2, 8)).toBe(substring(text, B - 2, 8));
  });

  it('stores an empty log as no blocks', () => {
    expect(encodeServerLogBlocks('')).toEqual([]);
    expect(readServerLogBlocks([], 0, 10)).toBe('');
  });
});
