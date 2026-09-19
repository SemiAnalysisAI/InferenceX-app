import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packedSkillSuite } from './packed-skill.mjs';

const suite = packedSkillSuite();
let helper;
before(() => {
  helper = join(suite.install('codex'), 'scripts/capture-response.mjs');
});

async function setup(t, fetchImpl, options) {
  assert.ok(existsSync(helper), 'the installed artifact must contain the capture helper');
  const { createResponseCapture } = await import(pathToFileURL(helper).href);
  const previous = process.cwd();
  process.chdir(suite.project('capture-'));
  t.after(() => process.chdir(previous));
  t.mock.method(globalThis, 'fetch', fetchImpl);
  return createResponseCapture(options);
}

function record(capture, ordinal = 1) {
  return JSON.parse(readFileSync(join(capture.captureDir, `${ordinal}.json`), 'utf8'));
}

function assertBody(capture, body, status, ordinal = 1) {
  const saved = record(capture, ordinal);
  assert.equal(saved.query_url, 'https://inferencex.semianalysis.com/api/example');
  assert.equal(saved.status, status);
  assert.ok(Number.isFinite(Date.parse(saved.retrieved_at)));
  assert.deepEqual(readFileSync(saved.body_path), Buffer.from(body));
  assert.equal(saved.decoded_bytes, Buffer.byteLength(body));
  assert.equal(saved.sha256, createHash('sha256').update(body).digest('hex'));
  assert.deepEqual(capture.requests.at(-1), saved);
  return saved;
}

test('installed capture saves complete decoded bytes and metadata before returning JSON', async (t) => {
  const body = ' {"text":"测量", "extra":[null,0,false]}\n';
  const capture = await setup(t, () => new Response(body));
  assert.deepEqual(await capture.read('/api/example'), { text: '测量', extra: [null, 0, false] });
  assertBody(capture, body, 200);
});

test('malformed JSON, invalid UTF-8 and HTTP errors retain complete captures before rejection', async (t) => {
  const values = [
    { body: '{broken', status: 200, code: 'INVALID_RESPONSE' },
    { body: Buffer.from([255]), status: 200, code: 'INVALID_RESPONSE' },
    { body: '{"error":"暂不可用"}', status: 503, code: 'HTTP_ERROR' },
    { body: 'not JSON', status: 404, code: 'HTTP_ERROR' },
  ];
  let current;
  const capture = await setup(t, () => new Response(current.body, { status: current.status }));
  for (const [index, value] of values.entries()) {
    current = value;
    await assert.rejects(capture.read('/api/example'), { code: value.code });
    assertBody(capture, value.body, value.status, index + 1);
  }
});

test('new captures and failed reads use unique paths without overwriting existing files', async (t) => {
  const capture = await setup(t, () => new Response('{}'));
  writeFileSync(join(capture.captureDir, '1.body'), 'keep body');
  await assert.rejects(capture.read('/api/example'), { code: 'OUTPUT_ERROR' });
  assert.equal(readFileSync(join(capture.captureDir, '1.body'), 'utf8'), 'keep body');
  writeFileSync(join(capture.captureDir, '2.json'), 'keep record');
  await assert.rejects(capture.read('/api/example'), { code: 'OUTPUT_ERROR' });
  assert.equal(readFileSync(join(capture.captureDir, '2.json'), 'utf8'), 'keep record');
  assert.deepEqual(await capture.read('/api/example'), {});
  assertBody(capture, '{}', 200, 3);
  const { createResponseCapture } = await import(pathToFileURL(helper).href);
  const second = createResponseCapture();
  assert.notEqual(second.captureDir, capture.captureDir);
});

test('streamed byte caps reject incomplete bodies and preserve earlier complete captures', async (t) => {
  let canceled = false;
  let overflow = false;
  const capture = await setup(
    t,
    () =>
      overflow
        ? new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(9));
              },
              cancel() {
                canceled = true;
              },
            }),
            { headers: { 'content-length': '1' } },
          )
        : new Response('{}'),
    { responseBytes: 8 },
  );
  assert.deepEqual(await capture.read('/api/example'), {});
  overflow = true;
  await assert.rejects(capture.read('/api/example'), /8-byte budget/u);
  assert.equal(canceled, true);
  assertBody({ ...capture, requests: capture.requests.slice(0, 1) }, '{}', 200);
  const failed = record(capture, 2);
  assert.equal(failed.status, 200);
  assert.ok(Number.isFinite(Date.parse(failed.failed_at)));
  assert.equal(failed.body_path, undefined);
  assert.equal(failed.sha256, undefined);
  assert.equal(existsSync(join(capture.captureDir, '2.body')), false);
});

test('total byte budget counts reads across HTTP failures and stops subsequent requests', async (t) => {
  const capture = await setup(t, () => new Response('{}', { status: 503 }), {
    responseBytes: 8,
    totalBytes: 3,
  });
  await assert.rejects(capture.read('/api/example'), { code: 'HTTP_ERROR' });
  await assert.rejects(capture.read('/api/example'), /total 3-byte budget/u);
  await assert.rejects(capture.read('/api/example'), /total 3-byte budget/u);
  assert.equal(globalThis.fetch.mock.callCount(), 2);
  assert.equal(record(capture, 2).body_path, undefined);
  assert.equal(record(capture, 3).body_path, undefined);
});

test('stalled reads time out and retain failure metadata without a complete-body claim', async (t) => {
  let canceled = false;
  const capture = await setup(
    t,
    () =>
      new Response(
        new ReadableStream({
          cancel() {
            canceled = true;
          },
        }),
      ),
    { timeoutMs: 20 },
  );
  await Promise.all([assert.rejects(capture.read('/api/example'), { code: 'TIMEOUT' }), wait(40)]);
  assert.equal(canceled, true);
  assert.equal(record(capture).status, 200);
  assert.equal(record(capture).body_path, undefined);
  assert.match(record(capture).error, /timed out|timeout/iu);
});

test('unsafe origins and invalid budgets fail before fetching', async (t) => {
  const capture = await setup(t, () => new Response('{}'));
  for (const path of [
    'https://example.org/api',
    '//example.org/api',
    'http://inferencex.semianalysis.com/api',
    'https://a:b@inferencex.semianalysis.com/api',
    '/api#fragment',
  ]) {
    await assert.rejects(capture.read(path), { code: 'INVALID_ARGUMENT' });
  }
  const { createResponseCapture } = await import(pathToFileURL(helper).href);
  for (const options of [
    { timeoutMs: 0 },
    { timeoutMs: 30_001 },
    { responseBytes: NaN },
    { responseBytes: 32 * 1024 * 1024 + 1 },
    { totalBytes: -1 },
    { totalBytes: 128 * 1024 * 1024 + 1 },
  ]) {
    assert.throws(() => createResponseCapture(options), { code: 'INVALID_ARGUMENT' });
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
  assert.deepEqual(readdirSync(capture.captureDir), []);
});

test('native fetch rejects redirects without contacting their destination', async (t) => {
  const nativeFetch = globalThis.fetch;
  let destinationHits = 0;
  const server = createServer((request, response) => {
    if (request.url === '/api/example') {
      response.writeHead(302, { location: '/destination' }).end('redirect');
    } else {
      destinationHits++;
      response.end('{}');
    }
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });
  const capture = await setup(t, (url, options) =>
    nativeFetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options),
  );
  await assert.rejects(capture.read('/api/example'), { code: 'NETWORK_ERROR' });
  assert.equal(destinationHits, 0);
  const failed = record(capture);
  assert.equal(failed.status, null);
  assert.ok(Number.isFinite(Date.parse(failed.failed_at)));
  assert.equal(failed.body_path, undefined);
});
