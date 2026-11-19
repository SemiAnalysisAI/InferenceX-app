import { describe, expect, it } from 'vitest';

import { dataLastModified } from './sitemap-lastmod';

describe('dataLastModified', () => {
  const dates = dataLastModified([
    { model: 'qwen3.5', hardware: 'b200', date: '2026-10-01' },
    { model: 'qwen3.5', hardware: 'mi355x', date: '2026-10-20' },
    { model: 'qwen3.5', hardware: 'b200', date: '2026-09-15' },
    { model: 'llama70b', hardware: 'h100', date: '2026-10-24' },
    { model: 'unmapped', hardware: 'h100', date: '2026-10-25' },
  ]);

  it('tracks the newest date overall, including models without a page slug', () => {
    expect(dates.latest).toBe('2026-10-25T00:00:00.000Z');
  });

  it('tracks the newest date per model slug across db keys and chips', () => {
    expect(dates.forModel('qwen-3-5')).toBe('2026-10-20T00:00:00.000Z');
    expect(dates.forModel('llama-3-3-70b')).toBe('2026-10-24T00:00:00.000Z');
    expect(dates.forModel('kimi-k26')).toBeUndefined();
  });

  it('uses the newest date among the requested chips only', () => {
    expect(dates.forModelChips('qwen-3-5', ['b200'])).toBe('2026-10-01T00:00:00.000Z');
    expect(dates.forModelChips('qwen-3-5', ['b200', 'mi355x'])).toBe('2026-10-20T00:00:00.000Z');
    expect(dates.forModelChips('qwen-3-5', ['h100'])).toBeUndefined();
  });

  it('returns no dates for empty availability', () => {
    expect(dataLastModified([]).latest).toBeUndefined();
  });
});
