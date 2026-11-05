import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
  gunzipSync,
  gzipSync,
} from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: (...args: any[]) => any, _keys: string[], _opts: unknown) => fn),
}));

const afterTasks = vi.hoisted(() => ({ pending: [] as (() => Promise<unknown>)[] }));
vi.mock('next/server', () => ({
  after: (task: () => Promise<unknown>) => {
    afterTasks.pending.push(task);
  },
}));

const workStore = vi.hoisted(() => ({
  current: undefined as { isStaticGeneration: boolean } | undefined,
}));
vi.mock('next/dist/server/app-render/work-async-storage.external', () => ({
  workAsyncStorage: { getStore: () => workStore.current },
}));

const fixtures = vi.hoisted(() => ({ mode: false }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  get FIXTURES_MODE() {
    return fixtures.mode;
  },
}));

vi.mock('./blob-cache', () => ({
  CONTENT_BLOB_KEY_PREFIX: 'content/',
  blobEnabled: vi.fn(() => true),
  blobGet: vi.fn(),
  blobSet: vi.fn(),
  blobGetBytes: vi.fn(),
  blobSetBytes: vi.fn(),
  blobPurge: vi.fn(),
}));

const generation = vi.hoisted(() => ({ value: 'g1' }));

import {
  cachedQuery,
  purgeAll,
  purgeCollectiveX,
  cachedJson,
  cachedJsonResponse,
  cachedGzipJson,
  negotiateEncoding,
  notModifiedJson,
} from './api-cache';
import { revalidateTag, unstable_cache } from 'next/cache';
import { blobEnabled, blobGet, blobGetBytes, blobSet, blobSetBytes, blobPurge } from './blob-cache';

const mockRevalidateTag = vi.mocked(revalidateTag);
const mockUnstableCache = vi.mocked(unstable_cache);
const mockBlobEnabled = vi.mocked(blobEnabled);
const mockBlobGet = vi.mocked(blobGet);
const mockBlobSet = vi.mocked(blobSet);
const mockBlobGetBytes = vi.mocked(blobGetBytes);
const mockBlobSetBytes = vi.mocked(blobSetBytes);
const mockBlobPurge = vi.mocked(blobPurge);
const originalCacheNamespace = process.env.CACHE_NAMESPACE;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CACHE_NAMESPACE;
  afterTasks.pending = [];
  generation.value = 'g1';
  mockUnstableCache.mockImplementation(((fn: unknown, keys: string[]) =>
    keys[0] === 'blob-generation'
      ? () => Promise.resolve({ value: generation.value })
      : fn) as unknown as typeof unstable_cache);
});

afterAll(() => {
  if (originalCacheNamespace === undefined) {
    delete process.env.CACHE_NAMESPACE;
  } else {
    process.env.CACHE_NAMESPACE = originalCacheNamespace;
  }
});

describe('cachedQuery', () => {
  describe('default mode (unstable_cache)', () => {
    it('wraps the function with unstable_cache', () => {
      const fn = vi.fn((x: number) => Promise.resolve(x * 2));
      cachedQuery(fn, 'test-key');

      expect(mockUnstableCache).toHaveBeenCalledWith(
        expect.any(Function),
        ['test-key', fn.toString()],
        { tags: ['db'] },
      );
    });

    it('isolates the key and tag when CACHE_NAMESPACE is set', () => {
      process.env.CACHE_NAMESPACE = 'staging';
      const fn = vi.fn(() => Promise.resolve('data'));

      cachedQuery(fn, 'test-key');

      expect(mockUnstableCache).toHaveBeenCalledWith(
        expect.any(Function),
        ['staging:test-key', fn.toString()],
        { tags: ['db:staging'] },
      );
    });

    it('calls through to the original function and returns its result', async () => {
      const fn = vi.fn((x: number) => Promise.resolve(x * 2));
      const wrapped = cachedQuery(fn, 'multiply');

      const result = await wrapped(5);
      expect(result).toBe(10);
      expect(fn).toHaveBeenCalledWith(5);
    });

    it('passes arguments through to the cached function', async () => {
      const fn = vi.fn((a: string, b: string) => Promise.resolve(`${a}-${b}`));
      const wrapped = cachedQuery(fn, 'concat');

      const result = await wrapped('hello', 'world');
      expect(result).toBe('hello-world');
      expect(fn).toHaveBeenCalledWith('hello', 'world');
    });

    it('does not call blob functions in default mode', async () => {
      const fn = vi.fn(() => Promise.resolve('data'));
      const wrapped = cachedQuery(fn, 'no-blob');

      await wrapped();
      expect(mockBlobGet).not.toHaveBeenCalled();
      expect(mockBlobSet).not.toHaveBeenCalled();
    });

    it('reads a separate page-tagged entry while an ISR page regenerates', async () => {
      const routeFn = vi.fn(() => Promise.resolve({ value: 'route' }));
      const pageFn = vi.fn(() => Promise.resolve({ value: 'page' }));
      // The mock returns plain stand-ins for unstable_cache's wrapped function.
      mockUnstableCache.mockImplementation(((_fn: unknown, keys: string[]) =>
        keys[0].startsWith('page:') ? pageFn : routeFn) as unknown as typeof unstable_cache);
      const fn = vi.fn(() => Promise.resolve('data'));
      const wrapped = cachedQuery(fn, 'split');

      expect(mockUnstableCache).toHaveBeenCalledWith(
        expect.any(Function),
        ['split', fn.toString()],
        { tags: ['db'] },
      );
      expect(mockUnstableCache).toHaveBeenCalledWith(
        expect.any(Function),
        ['page:split', fn.toString()],
        { tags: ['db-page'] },
      );
      await expect(wrapped()).resolves.toBe('route');
      workStore.current = { isStaticGeneration: true };
      await expect(wrapped()).resolves.toBe('page');
      workStore.current = { isStaticGeneration: false };
      await expect(wrapped()).resolves.toBe('route');
    });

    it('uses only the custom tag when one is passed', () => {
      const fn = vi.fn(() => Promise.resolve('data'));
      cachedQuery(fn, 'custom', { tag: 'collectivex' });

      expect(mockUnstableCache).toHaveBeenCalledExactlyOnceWith(
        expect.any(Function),
        ['custom', fn.toString()],
        { tags: ['collectivex'] },
      );
    });

    it('caches results whose entry would exceed the 2 MB data cache limit', async () => {
      const store = new Map<string, string>();
      mockUnstableCache.mockImplementation(((
        cb: (...args: unknown[]) => Promise<unknown>,
        keys: string[],
      ) =>
        async (...args: unknown[]) => {
          const key = `${keys.join(',')}-${JSON.stringify(args)}`;
          const body = store.get(key);
          if (body !== undefined) return JSON.parse(body);
          const result = await cb(...args);
          const entry = JSON.stringify({ data: { body: JSON.stringify(result) } });
          if (entry.length <= 2 * 1024 * 1024) store.set(key, JSON.stringify(result));
          return result;
        }) as unknown as typeof unstable_cache);
      const rows = Array.from({ length: 15_000 }, (_, id) => ({
        id: String(id),
        model: 'dsr1',
        metrics: { score: id / 7, em_strict: null },
        run_url: `https://github.com/org/repo/actions/runs/${id}`,
        note: 'quote " and \\ backslash',
      }));
      const fn = vi.fn((model: string) => Promise.resolve(model === 'big' ? rows : null));
      const wrapped = cachedQuery(fn, 'large');

      expect(JSON.stringify(rows).length).toBeGreaterThan(2 * 1024 * 1024);
      const miss = await wrapped('big');
      const hit = await wrapped('big');
      expect(fn).toHaveBeenCalledOnce();
      expect(JSON.stringify(hit)).toBe(JSON.stringify(rows));
      expect(JSON.stringify(miss)).toBe(JSON.stringify(rows));

      await expect(wrapped('small')).resolves.toBeNull();
      await expect(wrapped('small')).resolves.toBeNull();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('blobOnly mode', () => {
    it('returns cached value from blob on hit', async () => {
      mockBlobGet.mockResolvedValue('{"answer":42}');
      const fn = vi.fn(() => Promise.resolve({ answer: 99 }));
      const wrapped = cachedQuery(fn, 'blob-key', { blobOnly: true });

      const result = await wrapped();
      expect(result).toEqual({ answer: 42 });
      expect(mockBlobGet).toHaveBeenCalledWith(
        expect.stringMatching(/^generation\/g1\/blob-key:v2:/u),
      );
      expect(fn).not.toHaveBeenCalled();
      expect(mockBlobSet).not.toHaveBeenCalled();
    });

    it('calls fn and stores its JSON on blob miss', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn(() => Promise.resolve({ big: 'payload' }));
      const wrapped = cachedQuery(fn, 'miss-key', { blobOnly: true });

      const result = await wrapped();
      expect(result).toEqual({ big: 'payload' });
      expect(fn).toHaveBeenCalled();
      expect(mockBlobSet).toHaveBeenCalledWith(
        expect.stringMatching(/^generation\/g1\/miss-key:v2:/u),
        '{"big":"payload"}',
      );
    });

    it('moves to new paths when a purge rolls the generation', async () => {
      mockBlobGet.mockResolvedValue('1');
      const wrapped = cachedQuery(() => Promise.resolve(2), 'rolled', { blobOnly: true });

      await wrapped();
      generation.value = 'g2';
      await wrapped();

      const [first, second] = mockBlobGet.mock.calls.map(([path]) => path);
      expect(first).toMatch(/^generation\/g1\/rolled:v2:/u);
      expect(second).toBe(first!.replace('generation/g1/', 'generation/g2/'));
    });

    it('keeps revisioned keys outside the purge generation', async () => {
      mockBlobGet.mockResolvedValue('1');
      const wrapped = cachedQuery((_revision: string) => Promise.resolve(2), 'operatorx/ns/cmp', {
        blobOnly: true,
        revisioned: true,
      });

      await wrapped('rev');
      expect(mockBlobGet).toHaveBeenCalledWith(expect.stringMatching(/^operatorx\/ns\/cmp:v2:/u));
    });

    it('runs one read and one query for concurrent misses, each caller getting its own copy', async () => {
      const { promise: rows, resolve } = Promise.withResolvers<{ rows: number[] }>();
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn(() => rows);
      const wrapped = cachedQuery(fn, 'stampede', { blobOnly: true });

      const calls = [wrapped(), wrapped(), wrapped()];
      await vi.waitFor(() => expect(fn).toHaveBeenCalledOnce());
      resolve({ rows: [1, 2] });
      const [first, second, third] = await Promise.all(calls);

      expect(fn).toHaveBeenCalledOnce();
      expect(mockBlobGet).toHaveBeenCalledOnce();
      expect(mockBlobSet).toHaveBeenCalledOnce();
      expect(second).toEqual(first);
      expect(third).toEqual(first);
      expect(second).not.toBe(first);
      expect(third).not.toBe(second);
    });

    it('shares one blob read between concurrent hits', async () => {
      mockBlobGet.mockResolvedValue('{"rows":[1]}');
      const wrapped = cachedQuery(() => Promise.resolve({ rows: [] }), 'hits', { blobOnly: true });

      const [first, second] = await Promise.all([wrapped(), wrapped()]);

      expect(mockBlobGet).toHaveBeenCalledOnce();
      expect(second).toEqual({ rows: [1] });
      expect(second).not.toBe(first);
    });

    it('forgets a settled flight, so a failed query is retried by the next call', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi
        .fn<() => Promise<{ ok: boolean }>>()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce({ ok: true });
      const wrapped = cachedQuery(fn, 'retry', { blobOnly: true });

      const failed = [wrapped(), wrapped()];
      await expect(failed[0]).rejects.toThrow('db down');
      await expect(failed[1]).rejects.toThrow('db down');
      await expect(wrapped()).resolves.toEqual({ ok: true });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('re-queries instead of serving a stored empty result such as null', async () => {
      mockBlobGet.mockResolvedValue('null');
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn(() => Promise.resolve({ found: true }));
      const wrapped = cachedQuery(fn, 'server-log', { blobOnly: true });

      await expect(wrapped()).resolves.toEqual({ found: true });
      expect(fn).toHaveBeenCalledOnce();
    });

    it('queries directly when Blob is not configured', async () => {
      mockBlobEnabled.mockReturnValueOnce(false);
      const fn = vi.fn(() => Promise.resolve('fresh'));
      const wrapped = cachedQuery(fn, 'off', { blobOnly: true });

      await expect(wrapped()).resolves.toBe('fresh');
      expect(mockBlobGet).not.toHaveBeenCalled();
    });

    it('builds blob key from prefix and args', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn((model: string, date: string) => Promise.resolve([model, date]));
      const wrapped = cachedQuery(fn, 'bench', { blobOnly: true });

      await wrapped('llama', '2025-01-01');
      const key = mockBlobGet.mock.calls[0]![0];
      expect(key).toMatch(/^generation\/g1\/bench:v2:[A-Za-z0-9_-]+$/u);
      expect(mockBlobSet).toHaveBeenCalledWith(key, '["llama","2025-01-01"]');
    });

    it('hashes oversized argument lists into a bounded deterministic key', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn((ids: number[]) => Promise.resolve(ids.length));
      const wrapped = cachedQuery(fn, 'derived-agentic-metrics-v7', { blobOnly: true });
      const ids = Array.from({ length: 200 }, (_, index) => 434_388 + index);

      await wrapped(ids);
      await wrapped(ids);

      const firstKey = mockBlobGet.mock.calls[0]![0];
      const secondKey = mockBlobGet.mock.calls[1]![0];
      expect(firstKey).toBe(secondKey);
      expect(firstKey).toMatch(
        /^generation\/g1\/derived-agentic-metrics-v7:v2:sha256:[a-f0-9]{64}$/u,
      );
      expect(firstKey.length).toBeLessThan(128);
      expect(mockBlobSet).toHaveBeenCalledWith(firstKey, '200');
    });

    it('cannot collide arrays, objects, null, and undefined that stringify similarly', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const wrapped = cachedQuery((value: unknown) => Promise.resolve(value), 'structured', {
        blobOnly: true,
      });

      await wrapped(['a:b']);
      await wrapped(['a', 'b']);
      await wrapped({ value: null });
      await wrapped({ value: undefined });

      expect(new Set(mockBlobGet.mock.calls.map(([key]) => key)).size).toBe(4);
    });

    it('serializes object properties deterministically', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const wrapped = cachedQuery((value: unknown) => Promise.resolve(value), 'structured', {
        blobOnly: true,
      });

      await wrapped({ b: 2, a: 1 });
      await wrapped({ a: 1, b: 2 });

      expect(mockBlobGet.mock.calls[0]![0]).toBe(mockBlobGet.mock.calls[1]![0]);
    });

    it('rejects non-plain structured arguments instead of assigning a colliding key', async () => {
      const wrapped = cachedQuery((value: unknown) => Promise.resolve(value), 'structured', {
        blobOnly: true,
      });

      await expect(wrapped(new Date('2026-08-20T00:00:00Z'))).rejects.toThrow(
        'Blob cache arguments must contain only arrays and plain objects',
      );
      expect(mockBlobGet).not.toHaveBeenCalled();
    });

    it('serves a successful query result when the blob write fails', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockRejectedValue(new Error('pathname is too long'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fn = vi.fn((_ids: number[]) => Promise.resolve({ answer: 42 }));
      const wrapped = cachedQuery(fn, 'derived-agentic-metrics-v7', { blobOnly: true });

      await expect(wrapped([1, 2, 3])).resolves.toEqual({ answer: 42 });
      expect(warn).toHaveBeenCalledWith(
        '[blob cache] could not persist derived-agentic-metrics-v7; serving uncached result. pathname is too long',
      );

      warn.mockRestore();
    });

    it('versions keys even when no arguments are passed', async () => {
      mockBlobGet.mockResolvedValue('"cached"');
      const fn = vi.fn(() => Promise.resolve('fresh'));
      const wrapped = cachedQuery(fn, 'no-args', { blobOnly: true });

      await expect(wrapped()).resolves.toBe('cached');
      expect(mockBlobGet).toHaveBeenCalledWith(
        expect.stringMatching(/^generation\/g1\/no-args:v2:/u),
      );
    });
  });
});

describe('purgeAll', () => {
  const runAfterTasks = () => Promise.all(afterTasks.pending.map((task) => task()));

  it('expires route data now but only marks page data and CDN responses stale', () => {
    purgeAll();

    // The CDN's background refresh must read fresh data, never a stale server entry.
    expect(mockRevalidateTag).toHaveBeenCalledWith('db', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-page', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-cdn', 'max');
    expect(mockRevalidateTag).not.toHaveBeenCalledWith('db-cdn', { expire: 0 });
    // Stored log text never changes on ingest, so its year-long CDN entries survive.
    expect(mockRevalidateTag).not.toHaveBeenCalledWith('db-log', expect.anything());
  });

  it('drops every layer outright when asked to purge immediately', () => {
    purgeAll({ immediate: true });

    expect(mockRevalidateTag).toHaveBeenCalledWith('db', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-page', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-cdn', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('collectivex', { expire: 0 });
    // Retractions must drop cached server logs too.
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-log', { expire: 0 });
    expect(mockRevalidateTag).not.toHaveBeenCalledWith(expect.anything(), 'max');
  });

  it('marks the CollectiveX tag stale too', () => {
    purgeAll();

    expect(mockRevalidateTag).toHaveBeenCalledWith('collectivex', 'max');
  });

  it('expires tags before the blob purge runs, even if it never settles', () => {
    mockBlobPurge.mockReturnValue(new Promise(() => {}));

    purgeAll();

    expect(mockBlobPurge).not.toHaveBeenCalled();
    expect(mockRevalidateTag).toHaveBeenCalledWith('db', { expire: 0 });
    expect(afterTasks.pending).toHaveLength(1);
    void runAfterTasks();
    expect(mockBlobPurge).toHaveBeenCalledOnce();
  });

  it('logs a failed blob purge instead of throwing', async () => {
    const error = new Error('rate limited');
    mockBlobPurge.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    purgeAll({ immediate: true });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db', { expire: 0 });
    await expect(runAfterTasks()).resolves.toBeDefined();

    expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
    consoleError.mockRestore();
  });

  it('keeps the OperatorX CDN tag and Blob subtree, since results ingests do not change OperatorX', async () => {
    mockBlobPurge.mockResolvedValue(0);

    purgeAll();
    await runAfterTasks();

    expect(mockBlobPurge).toHaveBeenCalledExactlyOnceWith('', ['operatorx/', 'content/']);
    expect(mockRevalidateTag).not.toHaveBeenCalledWith('operatorx', expect.anything());
  });

  it('keeps content-addressed blobs except when purging immediately', async () => {
    mockBlobPurge.mockResolvedValue(0);

    purgeAll({ immediate: true });
    await runAfterTasks();

    expect(mockBlobPurge).toHaveBeenCalledExactlyOnceWith('', ['operatorx/']);
  });

  it('invalidates only the configured cache namespace', () => {
    process.env.CACHE_NAMESPACE = 'staging';

    purgeAll();

    expect(mockRevalidateTag).toHaveBeenCalledWith('db:staging', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-page:staging', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-cdn:staging', 'max');
  });
});

describe('purgeCollectiveX', () => {
  it('marks only the collectivex tag stale — no blobs belong to that scope', () => {
    purgeCollectiveX();

    expect(mockBlobPurge).not.toHaveBeenCalled();
    expect(mockRevalidateTag).toHaveBeenCalledExactlyOnceWith('collectivex', 'max');
  });

  it('drops the CDN entries outright when asked to purge immediately', () => {
    purgeCollectiveX({ immediate: true });

    expect(mockRevalidateTag).toHaveBeenCalledExactlyOnceWith('collectivex', { expire: 0 });
  });
});

function apiRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/v1/benchmarks', { headers });
}

function numberedRows(count: number) {
  return { rows: Array.from({ length: count }, (_, id) => ({ id, value: id / 7 })) };
}

async function bodyText(response: Response): Promise<string> {
  const bytes = Buffer.from(await response.arrayBuffer());
  const encoding = response.headers.get('Content-Encoding');
  if (encoding === 'br') return brotliDecompressSync(bytes).toString();
  if (encoding === 'gzip') return gunzipSync(bytes).toString();
  return bytes.toString();
}

describe('negotiateEncoding', () => {
  it.each([
    [null, 'identity'],
    ['', 'identity'],
    ['identity', 'identity'],
    ['gzip', 'gzip'],
    ['x-gzip', 'gzip'],
    ['gzip, deflate, br, zstd', 'br'],
    ['GZIP, BR', 'br'],
    ['br;q=0.5, gzip', 'gzip'],
    ['br;q=0, gzip;q=0', 'identity'],
    ['deflate', 'identity'],
    ['*', 'br'],
    ['gzip;q=0.4, *;q=0.5', 'br'],
    ['*;q=0, gzip', 'gzip'],
  ] as const)('Accept-Encoding %j selects %s', (header, expected) => {
    expect(negotiateEncoding(header)).toBe(expected);
  });

  it('falls back to identity when no offered coding is acceptable', () => {
    expect(negotiateEncoding('br', ['gzip', 'identity'])).toBe('identity');
    expect(negotiateEncoding('br, gzip;q=0.1', ['gzip', 'identity'])).toBe('gzip');
  });
});

describe('cachedJson', () => {
  it('lets browsers reuse responses for a minute and the CDN for a day', () => {
    const res = cachedJson(apiRequest(), { ok: true });
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400',
    );
  });

  it('tags responses with the CDN-only tag that ingests mark stale', () => {
    const res = cachedJson(apiRequest(), { ok: true });
    expect(res.headers.get('Vercel-Cache-Tag')).toBe('db-cdn');
  });

  it('carries a custom cache tag when one is passed', () => {
    const res = cachedJson(apiRequest(), { ok: true }, { tag: 'collectivex' });
    expect(res.headers.get('Vercel-Cache-Tag')).toBe('collectivex');
  });

  it('honors a custom Cache-Control for lazily-refreshed routes', () => {
    const res = cachedJson(
      apiRequest(),
      { ok: true },
      { tag: 'collectivex', cacheControl: 'public, max-age=0, s-maxage=60' },
    );
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60');
  });

  it('keeps fixture responses out of the browser cache so E2E intercepts see every request', () => {
    fixtures.mode = true;
    try {
      const res = cachedJson(apiRequest(), { ok: true }, { cacheControl: 'public, max-age=5' });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    } finally {
      fixtures.mode = false;
    }
  });

  it('sets an environment-scoped Vercel-Cache-Tag', () => {
    process.env.CACHE_NAMESPACE = 'staging';

    const res = cachedJson(apiRequest(), { ok: true });

    expect(res.headers.get('Vercel-Cache-Tag')).toBe('db-cdn:staging');
  });

  it.each([
    ['gzip, deflate, br, zstd', 'br'],
    ['gzip', 'gzip'],
    ['identity', null],
    [undefined, null],
  ] as const)('encodes for Accept-Encoding %j as %s', async (acceptEncoding, encoding) => {
    const data = { branch: 'feat/\u{1F680}-rocket', label: '基准测试', rows: [1, 2, 3] };
    const res = cachedJson(
      apiRequest(acceptEncoding === undefined ? {} : { 'Accept-Encoding': acceptEncoding }),
      data,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Content-Encoding')).toBe(encoding);
    expect(res.headers.get('Vary')).toBe('Accept-Encoding');
    expect(JSON.parse(await bodyText(res))).toEqual(data);
  });

  it.each(['gzip, deflate, br, zstd', 'deflate, gzip', 'br', undefined])(
    'leaves compression to the CDN with one variant for Accept-Encoding %j',
    async (acceptEncoding) => {
      const data = { label: '基准测试', rows: [1, 2, 3] };
      const res = cachedJson(
        apiRequest(acceptEncoding === undefined ? {} : { 'Accept-Encoding': acceptEncoding }),
        data,
        { compression: 'cdn' },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Encoding')).toBeNull();
      expect(res.headers.get('Vary')).toBeNull();
      expect(res.headers.get('ETag')).toBe(
        cachedJson(apiRequest(), data, { compression: 'cdn' }).headers.get('ETag'),
      );
      expect(res.headers.get('Cache-Control')).toBe(
        'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400',
      );
      expect(JSON.parse(await bodyText(res))).toEqual(data);
    },
  );

  it('answers If-None-Match without Vary when the CDN compresses', () => {
    const data = { rows: [1] };
    const etag = cachedJson(apiRequest(), data, { compression: 'cdn' }).headers.get('ETag')!;
    const res = cachedJson(apiRequest({ 'Accept-Encoding': 'br', 'If-None-Match': etag }), data, {
      compression: 'cdn',
    });
    expect(res.status).toBe(304);
    expect(res.headers.get('Vary')).toBeNull();
  });

  it('streams large payloads across multiple chunks', async () => {
    const res = cachedJson(apiRequest(), { big: 'x'.repeat(200_000) });
    const reader = res.body!.getReader();
    let chunks = 0;
    let readResult = await reader.read();
    while (!readResult.done) {
      chunks++;
      readResult = await reader.read();
    }
    expect(chunks).toBeGreaterThan(1);
  });

  it('compresses a large payload completely', async () => {
    const data = { rows: Array.from({ length: 20_000 }, (_, id) => ({ id, value: id / 7 })) };
    const res = cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), data);
    expect(JSON.parse(await bodyText(res))).toEqual(data);
  });

  it('derives a strong ETag from the payload and the chosen encoding', () => {
    const etag = (data: unknown, acceptEncoding: string) =>
      cachedJson(apiRequest({ 'Accept-Encoding': acceptEncoding }), data).headers.get('ETag');

    expect(etag({ a: 1 }, 'br')).toMatch(/^"[\w-]+"$/u);
    expect(etag({ a: 1 }, 'br')).toBe(etag({ a: 1 }, 'br'));
    expect(etag({ a: 2 }, 'br')).not.toBe(etag({ a: 1 }, 'br'));
    expect(
      new Set([etag({ a: 1 }, 'br'), etag({ a: 1 }, 'gzip'), etag({ a: 1 }, 'identity')]).size,
    ).toBe(3);
  });

  it('compresses large bodies at a lower brotli quality and names it in the ETag', async () => {
    const brotli = (data: unknown, headers: Record<string, string> = {}, version?: string) =>
      cachedJson(apiRequest({ 'Accept-Encoding': 'br', ...headers }), data, { version });

    expect(brotli(numberedRows(10)).headers.get('ETag')).toMatch(/^"[\w-]{32}-br"$/u);
    const versionTag = brotli(numberedRows(10), {}, 'rev').headers.get('ETag')!;
    for (const [count, quality, minBytes] of [
      [50_000, 8, 1024 * 1024],
      [120_000, 7, 4 * 1024 * 1024],
    ] as const) {
      const data = numberedRows(count);
      const bytes = Buffer.from(JSON.stringify(data));
      expect(bytes.byteLength).toBeGreaterThan(minBytes);
      const res = brotli(data);
      const body = Buffer.from(await res.arrayBuffer());
      expect(res.headers.get('ETag')).toMatch(new RegExp(`^"[\\w-]{32}-br${quality}"$`, 'u'));
      const expected = brotliCompressSync(bytes, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: quality,
          [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
          [zlibConstants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
        },
      });
      expect(body.equals(expected)).toBe(true);
      expect(brotli(data, { 'If-None-Match': versionTag }, 'rev').status).toBe(304);
    }
  }, 30_000);

  it('answers a matching If-None-Match with a bodiless 304 and the cache headers', async () => {
    const data = { rows: [1, 2, 3] };
    const first = cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), data);
    const etag = first.headers.get('ETag')!;

    for (const ifNoneMatch of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
      const res = cachedJson(
        apiRequest({ 'Accept-Encoding': 'br', 'If-None-Match': ifNoneMatch }),
        data,
      );
      expect(res.status).toBe(304);
      expect(await res.text()).toBe('');
      expect(res.headers.get('ETag')).toBe(etag);
      expect(res.headers.get('Vary')).toBe('Accept-Encoding');
      expect(res.headers.get('Cache-Control')).toBe(first.headers.get('Cache-Control'));
      expect(res.headers.get('Content-Encoding')).toBeNull();
    }
  });

  it('sends the full body when the payload or the negotiated encoding changed', async () => {
    const etag = cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), { v: 1 }).headers.get('ETag')!;

    const changed = cachedJson(apiRequest({ 'Accept-Encoding': 'br', 'If-None-Match': etag }), {
      v: 2,
    });
    expect(changed.status).toBe(200);
    expect(JSON.parse(await bodyText(changed))).toEqual({ v: 2 });

    const otherEncoding = cachedJson(
      apiRequest({ 'Accept-Encoding': 'gzip', 'If-None-Match': etag }),
      { v: 1 },
    );
    expect(otherEncoding.status).toBe(200);
    expect(otherEncoding.headers.get('Content-Encoding')).toBe('gzip');
  });

  it('derives the ETag from a supplied version instead of the payload', () => {
    const etag = (data: unknown, version: string) =>
      cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), data, { version }).headers.get('ETag');

    expect(etag({ v: 1 }, 'rev-1')).toBe(etag({ v: 2 }, 'rev-1'));
    expect(etag({ v: 1 }, 'rev-2')).not.toBe(etag({ v: 1 }, 'rev-1'));
  });
});

describe('cachedJsonResponse', () => {
  const sameResponse = async (actual: Response, expected: Response) => {
    expect(actual.status).toBe(expected.status);
    expect([...actual.headers]).toEqual([...expected.headers]);
    expect(await bodyText(actual)).toBe(await bodyText(expected));
  };
  const storedBytes = () => mockBlobSetBytes.mock.calls.at(-1)![1];

  it.each([
    ['br', numberedRows(10)],
    ['gzip', numberedRows(10)],
    ['identity', numberedRows(10)],
    ['br', numberedRows(50_000)],
    ['gzip', numberedRows(50_000)],
  ] as const)(
    'stores and then streams the %s response cachedJson sends',
    async (acceptEncoding, data) => {
      mockBlobGetBytes.mockResolvedValueOnce(null);
      const load = vi.fn((_model: string) => Promise.resolve(data));
      const respond = cachedJsonResponse(load, 'stored');
      const request = () => apiRequest({ 'Accept-Encoding': acceptEncoding });

      await sameResponse(await respond(request(), 'dsr1'), cachedJson(request(), data));
      expect(mockBlobSetBytes).toHaveBeenCalledWith(
        expect.stringMatching(/^generation\/g1\/stored:v2:.+\.response\.br$/u),
        expect.any(Uint8Array),
      );

      mockBlobGetBytes.mockResolvedValueOnce(storedBytes());
      await sameResponse(await respond(request(), 'dsr1'), cachedJson(request(), data));
      expect(load).toHaveBeenCalledOnce();
      expect(mockBlobGetBytes.mock.calls[1][0]).toBe(mockBlobGetBytes.mock.calls[0][0]);
    },
    30_000,
  );

  it('streams the stored brotli bytes unchanged', async () => {
    mockBlobGetBytes.mockResolvedValueOnce(null);
    const respond = cachedJsonResponse(() => Promise.resolve({ v: 1 }), 'raw');
    await respond(apiRequest({ 'Accept-Encoding': 'br' }));
    const stored = storedBytes();
    mockBlobGetBytes.mockResolvedValueOnce(stored);

    const res = await respond(apiRequest({ 'Accept-Encoding': 'br' }));

    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(stored.subarray(33)))).toBe(
      true,
    );
  });

  it('stores the plain JSON body and serves it unchanged when the CDN compresses', async () => {
    const data = { label: '基准测试', rows: [1, 2, 3] };
    const options = { compression: 'cdn' } as const;
    mockBlobGetBytes.mockResolvedValueOnce(null);
    const respond = cachedJsonResponse(() => Promise.resolve(data), 'cdn', options);
    const request = () => apiRequest({ 'Accept-Encoding': 'gzip, deflate, br, zstd' });
    await sameResponse(await respond(request()), cachedJson(request(), data, options));
    expect(mockBlobSetBytes).toHaveBeenCalledWith(
      expect.stringMatching(/^generation\/g1\/cdn:v2:.+\.response\.json$/u),
      expect.any(Uint8Array),
    );
    const stored = storedBytes();
    expect(Buffer.from(stored.subarray(33)).toString('utf8')).toBe(JSON.stringify(data));
    mockBlobGetBytes.mockResolvedValueOnce(stored);

    await sameResponse(await respond(request()), cachedJson(request(), data, options));
  });

  it('answers a held ETag from the stored digest with a 304', async () => {
    const data = { rows: [1, 2, 3] };
    const etag = cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), data).headers.get('ETag')!;
    mockBlobGetBytes.mockResolvedValueOnce(null);
    const respond = cachedJsonResponse(() => Promise.resolve(data), 'etag');
    await respond(apiRequest());
    mockBlobGetBytes.mockResolvedValueOnce(storedBytes());

    const res = await respond(apiRequest({ 'Accept-Encoding': 'br', 'If-None-Match': etag }));

    expect(res.status).toBe(304);
    expect(res.headers.get('ETag')).toBe(etag);
  });

  it('keys entries by arguments and moves to new paths when a purge rolls the generation', async () => {
    mockBlobGetBytes.mockResolvedValue(null);
    const respond = cachedJsonResponse((model: string) => Promise.resolve([model]), 'keyed');

    await respond(apiRequest(), 'a');
    await respond(apiRequest(), 'b');
    generation.value = 'g2';
    await respond(apiRequest(), 'a');

    const [a, b, rolled] = mockBlobGetBytes.mock.calls.map(([path]) => path);
    expect(b).not.toBe(a);
    expect(rolled).toBe(a.replace('generation/g1/', 'generation/g2/'));
  });

  it('runs one read and one load for concurrent misses', async () => {
    const { promise: rows, resolve } = Promise.withResolvers<number[]>();
    mockBlobGetBytes.mockResolvedValue(null);
    const load = vi.fn(() => rows);
    const respond = cachedJsonResponse(load, 'stampede');

    const calls = [respond(apiRequest()), respond(apiRequest())];
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    resolve([1, 2]);
    const responses = await Promise.all(calls);

    expect(mockBlobGetBytes).toHaveBeenCalledOnce();
    expect(mockBlobSetBytes).toHaveBeenCalledOnce();
    for (const res of responses) expect(JSON.parse(await bodyText(res))).toEqual([1, 2]);
  });

  it('forgets a failed load so the next request retries it', async () => {
    mockBlobGetBytes.mockResolvedValue(null);
    const load = vi
      .fn<() => Promise<number[]>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([1]);
    const respond = cachedJsonResponse(load, 'retry');

    await expect(respond(apiRequest())).rejects.toThrow('db down');
    expect(JSON.parse(await bodyText(await respond(apiRequest())))).toEqual([1]);
  });

  it('serves the response when the blob write fails', async () => {
    mockBlobGetBytes.mockResolvedValue(null);
    mockBlobSetBytes.mockRejectedValueOnce(new Error('blob down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const respond = cachedJsonResponse(() => Promise.resolve({ ok: true }), 'write-fails');

    const res = await respond(apiRequest({ 'Accept-Encoding': 'br' }));

    expect(JSON.parse(await bodyText(res))).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('loads and encodes directly when Blob is not configured', async () => {
    mockBlobEnabled.mockReturnValueOnce(false);
    const respond = cachedJsonResponse(() => Promise.resolve({ v: 1 }), 'no-blob');

    await sameResponse(
      await respond(apiRequest({ 'Accept-Encoding': 'br' })),
      cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), { v: 1 }),
    );
    expect(mockBlobGetBytes).not.toHaveBeenCalled();
    expect(mockBlobSetBytes).not.toHaveBeenCalled();
  });
});

describe('notModifiedJson', () => {
  it('returns the 304 cachedJson would send for a held version, without the payload', async () => {
    const options = { version: 'rev-1', cacheControl: 'private, no-cache' };
    const full = cachedJson(apiRequest({ 'Accept-Encoding': 'gzip' }), { v: 1 }, options);
    const etag = full.headers.get('ETag')!;

    const res = notModifiedJson(
      apiRequest({ 'Accept-Encoding': 'gzip', 'If-None-Match': etag }),
      options,
    );

    expect(res?.status).toBe(304);
    expect(await res?.text()).toBe('');
    expect(Object.fromEntries(res!.headers)).toEqual(
      Object.fromEntries([...full.headers].filter(([name]) => !name.startsWith('content-'))),
    );
  });

  it('returns null when the request holds no version or another one', () => {
    const options = { version: 'rev-2' };
    const stale = cachedJson(apiRequest(), { v: 1 }, { version: 'rev-1' }).headers.get('ETag')!;
    expect(notModifiedJson(apiRequest(), options)).toBeNull();
    expect(notModifiedJson(apiRequest({ 'If-None-Match': stale }), options)).toBeNull();
  });
});

describe('cachedGzipJson', () => {
  const data = { requests: [{ cid: 'trace-é', cancelled: false, ttftMs: null }] };
  const gzip = gzipSync(JSON.stringify(data));
  async function* chunks() {
    yield gzip.subarray(0, 13);
    yield gzip.subarray(13);
  }

  it('preserves complete gzip bytes for gzip clients with the CDN headers', async () => {
    const response = cachedGzipJson(apiRequest({ 'Accept-Encoding': 'gzip, br' }), chunks());
    expect(response.headers.get('Content-Encoding')).toBe('gzip');
    expect(response.headers.get('Vary')).toBe('Accept-Encoding');
    expect(response.headers.get('Vercel-Cache-Tag')).toBe('db-cdn');
    expect(response.headers.get('Cache-Control')).toBe(
      cachedJson(apiRequest(), data).headers.get('Cache-Control'),
    );
    const received = Buffer.from(await response.arrayBuffer());
    expect(received.equals(gzip)).toBe(true);
    expect(mockBlobGet).not.toHaveBeenCalled();
    expect(mockBlobSet).not.toHaveBeenCalled();
  });

  it('decompresses for clients that do not accept gzip', async () => {
    const response = cachedGzipJson(apiRequest(), chunks());
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(await response.json()).toEqual(data);
  });

  it('does not fetch ahead and stops fetching after cancellation', async () => {
    const next = vi.fn().mockResolvedValue({ done: false, value: new Uint8Array([1]) });
    const cleanup = vi.fn().mockResolvedValue({ done: true });
    const response = cachedGzipJson(apiRequest({ 'Accept-Encoding': 'gzip' }), {
      [Symbol.asyncIterator]: () => ({ next, return: cleanup }),
    });
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
    const reader = response.body!.getReader();
    await reader.read();
    expect(next).toHaveBeenCalledTimes(1);
    await reader.cancel();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails the response stream rather than silently truncating on read errors', async () => {
    const cleanup = vi.fn().mockResolvedValue({ done: true });
    const response = cachedGzipJson(apiRequest({ 'Accept-Encoding': 'gzip' }), {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('chunk failed')),
        return: cleanup,
      }),
    });
    await expect(response.arrayBuffer()).rejects.toThrow('chunk failed');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
