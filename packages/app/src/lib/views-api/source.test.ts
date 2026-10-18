import { cachedJson } from '@/lib/cache/api-cache';
import { describe, expect, it } from 'vitest';
import { readResponse, selection } from './source';
import { Model, Sequence } from '@/lib/catalog/data-mappings';
import { ViewsUpstreamError } from './upstream-error';

describe('Kimi K3 TCO selection', () => {
  it.each(['8k/1k', 'agentic'])('preserves both pricing bases for %s', (sequence) => {
    const search = new URLSearchParams({ model: 'kimik3', sequence });
    const defaults = selection(search);
    expect(defaults.model).toBe(Model.Kimi_K3);
    expect(defaults.sequence).toBe(
      sequence === 'agentic' ? Sequence.AgenticTraces : Sequence.EightK_OneK,
    );
    expect(defaults.tcoBasis).toBe('internal');
    for (const basis of ['external', 'internal']) {
      search.set('tcoBasis', basis);
      expect(selection(search)).toEqual({ ...defaults, tcoBasis: basis });
    }
  });
});

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
