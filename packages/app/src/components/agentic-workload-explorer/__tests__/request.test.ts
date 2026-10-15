import { describe, it, expect } from 'vitest';
import { parseModelFilter, parsePagination } from '@/lib/agentic-workload-explorer/request';

describe('parsePagination', () => {
  it('returns default limit 50 and offset 0 when no params', () => {
    const params = new URLSearchParams();
    expect(parsePagination(params)).toEqual({ limit: 50, offset: 0 });
  });

  it('parses custom limit and offset from params', () => {
    const params = new URLSearchParams({ limit: '25', offset: '100' });
    expect(parsePagination(params)).toEqual({ limit: 25, offset: 100 });
  });

  it('clamps limit to minimum of 1', () => {
    const params = new URLSearchParams({ limit: '0' });
    expect(parsePagination(params)).toEqual({ limit: 1, offset: 0 });

    const paramsNeg = new URLSearchParams({ limit: '-10' });
    expect(parsePagination(paramsNeg)).toEqual({ limit: 1, offset: 0 });
  });

  it('clamps limit to default maxLimit of 500', () => {
    const params = new URLSearchParams({ limit: '1000' });
    expect(parsePagination(params)).toEqual({ limit: 500, offset: 0 });
  });

  it('clamps negative offset to 0', () => {
    const params = new URLSearchParams({ offset: '-5' });
    expect(parsePagination(params)).toEqual({ limit: 50, offset: 0 });
  });

  it('falls back to default limit when limit is NaN', () => {
    const params = new URLSearchParams({ limit: 'abc' });
    expect(parsePagination(params)).toEqual({ limit: 50, offset: 0 });
  });

  it('falls back to 0 when offset is NaN', () => {
    const params = new URLSearchParams({ offset: 'xyz' });
    expect(parsePagination(params)).toEqual({ limit: 50, offset: 0 });
  });

  it('accepts custom defaults object', () => {
    const params = new URLSearchParams();
    expect(parsePagination(params, { limit: 20 })).toEqual({ limit: 20, offset: 0 });
  });

  it('respects custom maxLimit', () => {
    const params = new URLSearchParams({ limit: '200' });
    expect(parsePagination(params, { limit: 50, maxLimit: 100 })).toEqual({
      limit: 100,
      offset: 0,
    });
  });
});

describe('parseModelFilter', () => {
  it('accepts listed models and rejects unlisted ones with an uncached 400', () => {
    expect(parseModelFilter(new URLSearchParams())).toEqual({ model: null });
    expect(parseModelFilter(new URLSearchParams('model=claude-opus-5-5'))).toEqual({
      model: 'claude-opus-5-5',
    });
    const rejected = parseModelFilter(new URLSearchParams('model=secret-model-x'));
    expect(rejected).toBeInstanceOf(Response);
    expect((rejected as Response).status).toBe(400);
    expect((rejected as Response).headers.get('cache-control')).toBe('private, no-store');
  });
});
