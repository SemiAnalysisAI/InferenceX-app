import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const reference = readFileSync(
  new URL('../skills/inferencex-api/references/dashboard-views.md', import.meta.url),
  'utf8',
);
const code = reference.match(/```js\n(?<code>[\s\S]*?)\n```/u)?.groups.code;
assert.ok(code, 'VideoGenX public GET example must remain executable');
const AsyncFunction = Object.getPrototypeOf(async () => {
  await Promise.resolve();
}).constructor;
const example = new AsyncFunction('fetch', 'console', code);

test('VideoGenX skill example uses documented selectors and preserves partial coverage and missing evidence', async () => {
  const requests = [];
  const output = [];
  const data = {
    params: { view: 'compare', x: 'p50Latency', hidden: ['mi355x'], caseIndex: 3 },
    coverage: { pagesRead: 5, maxPages: 5, nextPage: 6, truncated: true },
    rows: [{ point: { id: 'source:c1' }, metrics: { kjPerVideo: null } }],
    comparison: { cases: { status: 'not-published', selected: null } },
    provenance: [{ runId: '123', artifactId: 456, publishedAt: '2026-09-20T00:00:00Z' }],
  };
  await example(
    (url) => {
      requests.push(new URL(url));
      return Promise.resolve(Response.json(data));
    },
    { log: (text) => output.push(JSON.parse(text)) },
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].origin, 'https://inferencex.semianalysis.com');
  assert.equal(requests[0].pathname, '/api/v1/views/video');
  assert.deepEqual(Object.fromEntries(requests[0].searchParams), {
    view: 'compare',
    v_x: 'p50Latency',
    v_y: 'videosPerGpuHour',
    v_tier: 'r',
    v_optimal: '0',
    v_api: '0.08',
    v_hidden: 'mi355x',
    v_base: 'h200',
    v_cand: 'b200',
    v_case: '3',
  });
  assert.deepEqual(output, [data]);
});

test('VideoGenX skill example fails on an HTTP error instead of printing empty successful evidence', async () => {
  const output = [];
  await assert.rejects(
    example(() => Promise.resolve(Response.json({ secret: 'private detail' }, { status: 503 })), {
      log: (text) => output.push(text),
    }),
    /Video view HTTP 503/u,
  );
  assert.deepEqual(output, []);
});
