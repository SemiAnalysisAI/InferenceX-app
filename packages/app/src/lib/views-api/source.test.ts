import { cachedJson } from '@/lib/api-cache';
import { describe, expect, it } from 'vitest';
import { readResponse } from './source';
import { ViewsUpstreamError } from './upstream-error';

describe('internal published GET response decoding', () => {
  it('decodes the actual compressed cachedJson response, not a JSON mock', async () => {
    const evidence = { benchmarks: [{ id: 123, value: null }], label: '基准测试' };
    const response = cachedJson(evidence);
    expect(response.headers.get('Content-Encoding')).toBe('gzip');
    expect(await readResponse(response)).toEqual(evidence);
  });

  it('also accepts uncompressed live evidence', async () => {
    expect(await readResponse(Response.json({ value: 1 }))).toEqual({ value: 1 });
  });

  it('rejects failed source responses without exposing their body', () => {
    expect(() => readResponse(Response.json({ secret: 'private' }, { status: 503 }))).toThrow(
      ViewsUpstreamError,
    );
  });
});
