import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'bun:test';

import { fetchDashboardAvailability } from '@/lib/api/api';
import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import { type EarlyFetchRegistry } from '@/lib/api/early-response';
import { Model } from '@/lib/catalog/data-mappings';
import { PUBLIC_INFERENCE_MODEL_SLUGS } from '@/lib/routing/inference-model-slug';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

import { inferenceEarlyFetch } from './inference-early-fetch';

const AVAILABILITY = '/api/v1/availability/compact';
const latest = (model: string) => `/api/v1/benchmarks?${new URLSearchParams({ model })}`;

afterEach(() => {
  unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs the document script as a browser would, returning what it requested and registered. */
function runScript(routeModel: Model | null, search = '', fetchImpl?: (url: string) => unknown) {
  const requested: string[] = [];
  const window: { __infxEarlyFetch?: EarlyFetchRegistry } = {};
  const fetch = (url: string) => {
    requested.push(url);
    return fetchImpl ? fetchImpl(url) : Promise.resolve(new Response('[]'));
  };
  runInNewContext(inferenceEarlyFetch(routeModel).script, {
    window,
    fetch,
    location: { search },
    performance: { now: () => 5 },
    URLSearchParams,
  });
  return { requested, registry: window.__infxEarlyFetch ?? {} };
}

describe('inferenceEarlyFetch preloads', () => {
  it('preloads availability and the route model latest rows', () => {
    expect(inferenceEarlyFetch(Model.DeepSeek_R1).preloads).toEqual([
      AVAILABILITY,
      latest('DeepSeek-R1-0528'),
    ]);
  });

  it('preloads only availability on the bare route', () => {
    expect(inferenceEarlyFetch(null).preloads).toEqual([AVAILABILITY]);
  });

  it('escapes markup in the inline config', () => {
    expect(inferenceEarlyFetch(Model.DeepSeek_R1).script).not.toContain('<');
  });
});

describe('inference early fetch script', () => {
  it('claims the preloaded URLs with their start time', () => {
    const { requested, registry } = runScript(Model.DeepSeek_R1);
    expect(requested).toEqual([AVAILABILITY, latest('DeepSeek-R1-0528')]);
    expect(Object.keys(registry)).toEqual(requested);
    expect(registry[AVAILABILITY]?.startedAt).toBe(5);
  });

  it('adds the latest rows of an explicit g_model on the bare route', () => {
    expect(runScript(null, '?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k').requested).toEqual([
      AVAILABILITY,
      latest('DeepSeek-R1-0528'),
    ]);
  });

  it('adds the explicit g_model latest rows when it differs from the route model', () => {
    expect(runScript(Model.Kimi_K3_1_Pro, '?g_model=DeepSeek-R1-0528').requested).toEqual([
      AVAILABILITY,
      latest('Kimi-K3.1-Pro'),
      latest('DeepSeek-R1-0528'),
    ]);
  });

  it('does not request the route model twice when g_model repeats it', () => {
    expect(runScript(Model.DeepSeek_R1, '?g_model=DeepSeek-R1-0528').requested).toEqual([
      AVAILABILITY,
      latest('DeepSeek-R1-0528'),
    ]);
  });

  it.each([
    ['a pinned run date', '?g_model=DeepSeek-R1-0528&g_rundate=2026-05-20'],
    ['a favorite preset', '?g_model=DeepSeek-R1-0528&preset=gb200-vs-b200'],
    ['an unknown model', '?g_model=Not-A-Model'],
    ['an inherited property name', '?g_model=constructor'],
    ['no model', '?i_seq=8k%2F1k'],
  ])('requests only availability on the bare route for %s', (_case, search) => {
    expect(runScript(null, search).requested).toEqual([AVAILABILITY]);
  });

  it('keeps its preload claims when other URL state is present', () => {
    expect(runScript(Model.DeepSeek_R1, '?g_rundate=2026-05-20&preset=x').requested).toEqual([
      AVAILABILITY,
      latest('DeepSeek-R1-0528'),
    ]);
  });

  it('swallows a rejected request so it never surfaces as unhandled', async () => {
    const rejected = Promise.reject(new TypeError('Failed to fetch'));
    const catchSpy = vi.spyOn(rejected, 'catch');
    runScript(null, '', () => rejected);
    expect(catchSpy).toHaveBeenCalled();
    await expect(rejected).rejects.toThrow('Failed to fetch');
  });

  it('never throws when fetch is unavailable', () => {
    expect(() =>
      runScript(null, '', () => {
        throw new TypeError('fetch is not a function');
      }),
    ).not.toThrow();
  });
});

describe('early fetch keys', () => {
  it('equal the URLs the chart queries fetch, for every public model', async () => {
    for (const { model } of PUBLIC_INFERENCE_MODEL_SLUGS) {
      const { registry } = runScript(model, '', (url) => Promise.resolve(Response.json({ url })));
      stubGlobal('__infxEarlyFetch', registry);
      const fetchMock = vi.fn(() => Promise.reject(new Error('fetched instead of reusing')));
      stubGlobal('fetch', fetchMock);
      const signal = new AbortController().signal;
      const claimedLatest = Object.hasOwn(registry, latest(model));
      // The chart's first benchmarks query: the route model's latest rows.
      const rows = await benchmarkQueryOptions(model, '').queryFn({ signal });
      // A model without DB keys resolves to no rows without a request, so nothing is preloaded.
      expect(rows).toEqual(claimedLatest ? ({ url: latest(model) } as never) : []);
      expect(await fetchDashboardAvailability(signal)).toEqual({ url: AVAILABILITY } as never);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(registry).toEqual({});
    }
  });
});
