import { readFileSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import type { AvailabilityRow } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { getAllChipPages } from '@/lib/catalog/chip-pages';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { DEFAULT_INFERENCE_MODEL_SLUG } from '@/lib/routing/inference-model-redirects';

import {
  cacheControlProblems,
  decodeBody,
  derivedChecks,
  ERROR_BOUNDARY_TITLES,
  escapeAnnotation,
  escapeHtmlText,
  evaluateResponse,
  jsonShapeProblems,
  latestRunDate,
  pageErrorMarkers,
  PNG_SIGNATURE,
  runCheck,
  staticChecks,
  type HttpResponse,
  type JsonCheck,
  type PageCheck,
} from './smoke-check';

const JSON_BODY = Buffer.from(JSON.stringify([{ model: 'm', date: '2026-01-01' }]));
const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' };
const jsonCheck = (encoding: JsonCheck['encoding'], checkPath = '/api'): JsonCheck => ({
  kind: 'json',
  path: checkPath,
  encoding,
  shape: { type: 'array', nonEmpty: true, keys: ['model', 'date'] },
});
const PAGE_HTML =
  '<html><header data-testid="header"></header><main><h1>Title</h1><div data-testid="marker"></div>' +
  '<!--$!--><template data-dgst=""></template><!--/$--></main><footer data-testid="footer"></footer></html>';
const pageCheck = (checkPath = '/page', finalPath?: string): PageCheck => ({
  kind: 'page',
  path: checkPath,
  finalPath,
  contains: ['data-testid="marker"'],
});

function response(
  body: Buffer,
  headers: Record<string, string> = JSON_HEADERS,
  status = 200,
  url = 'http://smoke.test/api',
): HttpResponse {
  return { url, status, headers, body };
}

describe('decodeBody', () => {
  it('passes an identity body that is not compressed', () => {
    expect(decodeBody(response(JSON_BODY), ['identity'])).toEqual({
      body: JSON_BODY,
      problems: [],
    });
  });

  it('fails a gzip body that lost its Content-Encoding header', () => {
    const { body, problems } = decodeBody(response(zlib.gzipSync(JSON_BODY)), ['gzip']);
    expect(body).toBeUndefined();
    expect(problems).toEqual([
      'the body is gzip-compressed but the response has no Content-Encoding header (asked for gzip), so clients cannot decode it',
    ]);
  });

  it('fails a brotli body that lost its Content-Encoding header', () => {
    const { problems } = decodeBody(response(zlib.brotliCompressSync(JSON_BODY)), ['br']);
    expect(problems[0]).toContain(
      'the body is br-compressed but the response has no Content-Encoding',
    );
  });

  it('decodes each coding it asked for', () => {
    for (const [coding, compressed] of [
      ['br', zlib.brotliCompressSync(JSON_BODY)],
      ['gzip', zlib.gzipSync(JSON_BODY)],
    ] as const) {
      const decoded = decodeBody(response(compressed, { 'content-encoding': coding }), [coding]);
      expect(decoded).toEqual({ body: JSON_BODY, problems: [] });
    }
  });

  it('fails when the header names a different coding than the bytes', () => {
    const decoded = decodeBody(
      response(zlib.brotliCompressSync(JSON_BODY), { 'content-encoding': 'gzip' }),
      ['gzip'],
    );
    expect(decoded.problems).toEqual(['Content-Encoding is gzip but the body is br-compressed']);
    const plain = decodeBody(response(JSON_BODY, { 'content-encoding': 'br' }), ['br']);
    expect(plain.problems).toEqual(['Content-Encoding is br but the body is uncompressed']);
  });

  it('fails a coding the request did not accept', () => {
    const decoded = decodeBody(
      response(zlib.brotliCompressSync(JSON_BODY), { 'content-encoding': 'br' }),
      ['identity'],
    );
    expect(decoded.problems).toEqual([
      'Content-Encoding is br, which the request did not accept (identity)',
    ]);
  });

  it('does not mistake a PNG for a compressed body', () => {
    const png = Buffer.concat([PNG_SIGNATURE, Buffer.from([0, 0, 0, 13])]);
    expect(decodeBody(response(png), ['br', 'gzip']).problems).toEqual([]);
  });
});

describe('jsonShapeProblems', () => {
  it('accepts the expected shape', () => {
    expect(jsonShapeProblems([{ a: 1, b: 2 }], { type: 'array', keys: ['a', 'b'] })).toEqual([]);
    expect(jsonShapeProblems({ a: 1 }, { type: 'object', keys: ['a'] })).toEqual([]);
    expect(jsonShapeProblems([], { type: 'array', keys: ['a'] })).toEqual([]);
  });

  it('rejects the wrong top-level type, missing keys and an empty required array', () => {
    expect(jsonShapeProblems({ a: 1 }, { type: 'array' })).toEqual([
      'expected a JSON array, got a object',
    ]);
    expect(jsonShapeProblems([1], { type: 'object' })).toEqual([
      'expected a JSON object, got an array',
    ]);
    expect(jsonShapeProblems(null, { type: 'object' })).toEqual([
      'expected a JSON object, got null',
    ]);
    expect(jsonShapeProblems({ a: 1 }, { type: 'object', keys: ['a', 'b', 'c'] })).toEqual([
      'the object is missing b, c',
    ]);
    expect(jsonShapeProblems([], { type: 'array', nonEmpty: true })).toEqual([
      'expected a non-empty JSON array',
    ]);
    expect(jsonShapeProblems(['x'], { type: 'array', keys: ['a'] })).toEqual([
      'the first item is a string, expected an object with a',
    ]);
  });
});

describe('pageErrorMarkers', () => {
  it('ignores client rendering bailouts', () => {
    expect(pageErrorMarkers(PAGE_HTML)).toEqual([]);
    expect(
      pageErrorMarkers('<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>'),
    ).toEqual([]);
  });

  it('flags render error digests, the Next error document and the error boundary', () => {
    const html =
      '<html id="__next_error__"><template data-dgst="2817345"></template>' +
      '<template data-dgst="2817345"></template><h2>Something Went Wrong</h2>';
    expect(pageErrorMarkers(html)).toEqual([
      'the Next.js error document',
      'the error boundary title "Something Went Wrong"',
      'a server render error (digest 2817345)',
    ]);
  });

  it('knows every title src/app/error.tsx renders', () => {
    const source = readFileSync(path.join(import.meta.dirname, '../../app/error.tsx'), 'utf8');
    const titles = [...source.matchAll(/title: '(?<title>[^']+)'/g)].map((m) => m.groups!.title);
    expect(titles).toEqual([...ERROR_BOUNDARY_TITLES]);
  });
});

describe('cacheControlProblems', () => {
  it('requires public caching for APIs and images', () => {
    expect(cacheControlProblems('public, max-age=60', 'json')).toEqual([]);
    expect(cacheControlProblems('max-age=60', 'png')).toEqual([
      'Cache-Control is "max-age=60", expected public caching',
    ]);
    expect(cacheControlProblems('', 'json')).toEqual(['no Cache-Control header']);
  });

  it('rejects private or uncacheable pages', () => {
    expect(cacheControlProblems('public, max-age=0, must-revalidate', 'page')).toEqual([]);
    expect(cacheControlProblems('private, no-cache, no-store, max-age=0', 'page')).toEqual([
      'Cache-Control is "private, no-cache, no-store, max-age=0", which contains private',
      'Cache-Control is "private, no-cache, no-store, max-age=0", which contains no-store',
    ]);
  });
});

describe('evaluateResponse', () => {
  it('passes identity JSON of the expected shape and returns it', () => {
    const result = evaluateResponse(jsonCheck('identity'), response(JSON_BODY));
    expect(result).toEqual({
      problems: [],
      bytes: JSON_BODY.length,
      json: JSON.parse(String(JSON_BODY)),
    });
  });

  it('fails JSON of the wrong shape and keeps the value out of the result', () => {
    const body = Buffer.from('{"model":"m"}');
    expect(evaluateResponse(jsonCheck('identity'), response(body))).toEqual({
      problems: ['expected a JSON array, got a object'],
      bytes: body.length,
      json: undefined,
    });
  });

  it('fails a non-200 status with a snippet of the body', () => {
    const body = Buffer.from('{"error":"Internal error"}');
    expect(
      evaluateResponse(jsonCheck('identity'), response(body, JSON_HEADERS, 500)).problems,
    ).toEqual(['HTTP 500, expected 200 ({"error":"Internal error"})']);
  });

  it('checks the Content-Type', () => {
    const problems = evaluateResponse(
      jsonCheck('identity'),
      response(JSON_BODY, { ...JSON_HEADERS, 'content-type': 'text/html' }),
    ).problems;
    expect(problems).toEqual(['Content-Type is "text/html", expected application/json']);
  });

  it('checks a page for its markers, error signs and final path', () => {
    const pageHeaders = {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0',
    };
    const ok = response(Buffer.from(PAGE_HTML), pageHeaders, 200, 'http://smoke.test/page');
    expect(evaluateResponse(pageCheck(), ok).problems).toEqual([]);
    expect(evaluateResponse(pageCheck('/start', '/elsewhere'), ok).problems).toEqual([
      'ended on /page, expected /elsewhere',
    ]);
    const broken = Buffer.from(
      PAGE_HTML.replace('data-testid="marker"', '').replace('data-dgst=""', 'data-dgst="99"'),
    );
    expect(evaluateResponse(pageCheck(), { ...ok, body: broken }).problems).toEqual([
      'the page contains a server render error (digest 99)',
      'the page is missing data-testid="marker"',
    ]);
  });

  it('checks a share image for the PNG signature', () => {
    const headers = { 'content-type': 'image/png', 'cache-control': 'public, max-age=60' };
    const png = Buffer.concat([PNG_SIGNATURE, Buffer.from('rest')]);
    expect(
      evaluateResponse({ kind: 'png', path: '/a.png' }, response(png, headers)).problems,
    ).toEqual([]);
    expect(
      evaluateResponse({ kind: 'png', path: '/a.png' }, response(Buffer.from('<html>'), headers))
        .problems,
    ).toEqual(['the body does not start with the PNG signature']);
    const gzipped = { ...headers, 'content-encoding': 'gzip' };
    expect(
      evaluateResponse({ kind: 'png', path: '/a.png' }, response(zlib.gzipSync(png), gzipped))
        .problems,
    ).toEqual([]);
  });
});

describe('runCheck against a local server', () => {
  let server: http.Server;
  let origin: string;
  const hits = new Map<string, number>();
  const seenHeaders: http.IncomingHttpHeaders[] = [];

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {
    // Negotiates like the app: br, then gzip, then identity.
    '/api/ok': (req, res) => {
      const accept = req.headers['accept-encoding'] ?? '';
      if (accept.includes('br')) {
        res.writeHead(200, { ...JSON_HEADERS, 'content-encoding': 'br' });
        res.end(zlib.brotliCompressSync(JSON_BODY));
      } else if (accept.includes('gzip')) {
        res.writeHead(200, { ...JSON_HEADERS, 'content-encoding': 'gzip' });
        res.end(zlib.gzipSync(JSON_BODY));
      } else {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON_BODY);
      }
    },
    // The Next 16.4.5 bug: compressed bytes, Content-Encoding stripped.
    '/api/stripped': (_req, res) => {
      res.writeHead(200, JSON_HEADERS);
      res.end(zlib.gzipSync(JSON_BODY));
    },
    '/api/error': (_req, res) => {
      res.writeHead(500, JSON_HEADERS);
      res.end('{"error":"Internal error"}');
    },
    '/api/flaky': (req, res) => {
      if (hits.get(req.url!) === 1) {
        req.socket.destroy();
        return;
      }
      routes['/api/ok']!(req, res);
    },
    '/api/slow': () => {},
    '/start': (_req, res) => {
      res.writeHead(307, { location: '/page' });
      res.end();
    },
    '/away': (_req, res) => {
      res.writeHead(308, { location: 'https://example.com/page' });
      res.end();
    },
    '/page': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'public, max-age=0' });
      res.end(PAGE_HTML);
    },
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.set(req.url!, (hits.get(req.url!) ?? 0) + 1);
      seenHeaders.push(req.headers);
      routes[req.url!]!(req, res);
    });
    const { promise, resolve } = Promise.withResolvers<void>();
    server.listen(0, '127.0.0.1', resolve);
    await promise;
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  const fast = { retryDelayMs: 1, timeoutMs: 2000 };

  it('passes every coding of a correctly negotiated API and sends the bypass header', async () => {
    for (const encoding of ['br', 'gzip', 'identity'] as const) {
      const result = await runCheck(origin, jsonCheck(encoding, '/api/ok'), {
        ...fast,
        headers: { 'x-vercel-protection-bypass': 'secret' },
      });
      expect(result).toMatchObject({ label: `/api/ok [${encoding}]`, status: 200, problems: [] });
      expect(seenHeaders.at(-1)).toMatchObject({
        'accept-encoding': encoding,
        'x-vercel-protection-bypass': 'secret',
        'user-agent': 'inferencex-smoke-check/1',
      });
    }
  });

  it('fails compressed bytes served without Content-Encoding', async () => {
    const result = await runCheck(origin, jsonCheck('gzip', '/api/stripped'), fast);
    expect(result.problems).toEqual([
      'the body is gzip-compressed but the response has no Content-Encoding header (asked for gzip), so clients cannot decode it',
    ]);
  });

  it('retries a dropped connection once', async () => {
    const result = await runCheck(origin, jsonCheck('identity', '/api/flaky'), fast);
    expect(result.problems).toEqual([]);
    expect(hits.get('/api/flaky')).toBe(2);
  });

  it('does not retry a wrong answer', async () => {
    const result = await runCheck(origin, jsonCheck('identity', '/api/error'), fast);
    expect(result.problems).toEqual(['HTTP 500, expected 200 ({"error":"Internal error"})']);
    expect(hits.get('/api/error')).toBe(1);
  });

  it('gives up on a request that never answers', async () => {
    const result = await runCheck(origin, jsonCheck('identity', '/api/slow'), {
      ...fast,
      timeoutMs: 50,
      retries: 0,
    });
    expect(result.problems).toEqual(['no complete response within 50 ms']);
  });

  it('follows same-origin redirects for pages and refuses to leave the deployment', async () => {
    expect(await runCheck(origin, pageCheck('/start', '/page'), fast)).toMatchObject({
      label: '/start -> /page',
      status: 200,
      problems: [],
    });
    const away = await runCheck(origin, pageCheck('/away'), fast);
    expect(away.problems).toEqual(['redirected off the deployment to https://example.com/page']);
  });
});

describe('check targets', () => {
  const defaultModel = COMPARE_MODEL_SLUGS.find(
    (entry) => entry.slug === DEFAULT_INFERENCE_MODEL_SLUG,
  )!;
  const [chipA, chipB] = getAllChipPages()
    .map((chip) => chip.hwKey)
    .toSorted();
  const row = (overrides: Partial<AvailabilityRow>): AvailabilityRow => ({
    model: defaultModel.dbKeys[0]!,
    isl: 1024,
    osl: 1024,
    precision: 'fp4',
    hardware: chipA!,
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: '2026-11-01',
    ...overrides,
  });

  it('requests the default model and its pages', () => {
    const paths = staticChecks().map((check) => check.path);
    const query = new URLSearchParams({ model: defaultModel.displayName });
    expect(paths).toContain(`/api/v1/benchmarks?${query}`);
    expect(staticChecks()).toContainEqual(
      expect.objectContaining({
        path: '/infx/inference',
        finalPath: `/infx/inference/${DEFAULT_INFERENCE_MODEL_SLUG}`,
      }),
    );
    expect(paths).toContain(`/zh/infx/inference/${DEFAULT_INFERENCE_MODEL_SLUG}`);
  });

  it('picks the newest date of the default model, else of any model', () => {
    expect(
      latestRunDate([row({ date: '2026-11-02' }), row({ model: 'other', date: '2026-11-09' })]),
    ).toBe('2026-11-02');
    expect(latestRunDate([row({ model: 'other', date: '2026-11-09' })])).toBe('2026-11-09');
    expect(latestRunDate([])).toBeNull();
  });

  it('derives compare, run, ranking and share image targets from availability', async () => {
    const rows = [
      row({}),
      row({ hardware: chipB! }),
      row({ precision: 'fp8' }),
      row({ spec_method: 'mtp' }),
    ];
    const checks = await derivedChecks(rows);
    const paths = checks.map((check) => check.path);
    const compare = `${DEFAULT_INFERENCE_MODEL_SLUG}-${chipA}-vs-${chipB}`;
    expect(paths).toEqual([
      '/api/v1/workflow-info?date=2026-11-01',
      '/api/v1/workflow-info?date=2026-11-01',
      '/api/v1/workflow-info?date=2026-11-01',
      `/compare/${compare}`,
      `/compare-per-dollar/${compare}/performance-per-dollar.png`,
      expect.stringMatching(new RegExp(`^/run/${DEFAULT_INFERENCE_MODEL_SLUG}-on-`)),
      `/rankings/fastest-gpu-for-${DEFAULT_INFERENCE_MODEL_SLUG}`,
      `/compare-precision/${DEFAULT_INFERENCE_MODEL_SLUG}-${chipA}-fp4-vs-fp8/precision-comparison.png`,
      `/compare-spec-decode/${DEFAULT_INFERENCE_MODEL_SLUG}-${chipA}-fp4-mtp-vs-none/spec-decode-comparison.png`,
    ]);
  });

  it('derives nothing to compare from rows without chip pages', async () => {
    const checks = await derivedChecks([row({ hardware: 'not-a-chip' })]);
    expect(checks.map((check) => check.kind)).toEqual(['json', 'json', 'json']);
  });
});

describe('text escaping', () => {
  it('escapes headings the way React writes them', () => {
    expect(escapeHtmlText(`A & B <C> "D" 'E'`)).toBe(
      'A &amp; B &lt;C&gt; &quot;D&quot; &#x27;E&#x27;',
    );
  });

  it('escapes annotation messages', () => {
    expect(escapeAnnotation('50%\nnext\r')).toBe('50%25%0Anext%0D');
  });
});
