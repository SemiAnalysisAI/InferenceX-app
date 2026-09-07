import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { createHttpClient } from '../skills/inferencex-api/scripts/http-client.mjs';

const request = {
  operation: 'availability',
  url: 'https://inferencex.semianalysis.com/api/v1/availability',
  allowedStatuses: [200],
};

test('temporary status retries but malformed JSON does not', async () => {
  for (const bodies of [
    [new Response('', { status: 503 }), new Response('[]')],
    [new Response('{')],
  ]) {
    let calls = 0;
    const client = createHttpClient({
      timeoutMs: 1_000,
      maxAttempts: 3,
      responseBytes: 1_024,
      totalBytes: 2_048,
      fetchImpl: () => bodies[calls++],
      sleep: () => {},
      random: () => 0,
    });
    if (bodies.length === 2) {
      const saved = await client.get(request);
      assert.deepEqual(saved.body, []);
      assert.equal(calls, 2);
    } else {
      await assert.rejects(client.get(request), { code: 'INVALID_RESPONSE' });
      assert.equal(calls, 1);
    }
  }
});

test('saved responses and attempt records retain decoded evidence identity', async () => {
  const bytes = Buffer.from('{"available":true}');
  let options;
  const client = createHttpClient({
    timeoutMs: 1_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: (_url, value) => {
      options = value;
      return new Response(bytes);
    },
    now: () => Date.parse('2026-09-07T12:34:56.789Z'),
  });
  const saved = await client.get({ ...request, url: `${request.url}?b=2&a=1` });
  assert.deepEqual(saved, {
    id: createHash('sha256').update(bytes).digest('hex'),
    status: 200,
    retrievedAt: '2026-09-07T12:34:56.789Z',
    bytes,
    body: { available: true },
  });
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.accept, 'application/json');
  assert.equal(client.attempts.length, 1);
  assert.deepEqual(client.attempts[0], {
    operation: 'availability',
    url: `${request.url}?b=2&a=1`,
    ordinal: 1,
    startedAt: '2026-09-07T12:34:56.789Z',
    endedAt: '2026-09-07T12:34:56.789Z',
    status: 200,
    consumedBytes: bytes.length,
    retry: { decision: 'accepted', reason: 'allowed_status' },
  });
});

test('transport interruption retries with bounded backoff', async () => {
  let calls = 0;
  const waits = [];
  const client = createHttpClient({
    timeoutMs: 2_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: () => {
      if (calls++ === 0) throw Object.assign(new TypeError('socket reset'), { code: 'ECONNRESET' });
      return new Response('{}');
    },
    sleep: (milliseconds) => waits.push(milliseconds),
    random: () => 0,
  });
  const saved = await client.get(request);
  assert.deepEqual(saved.body, {});
  assert.deepEqual(waits, [500]);
  assert.equal(client.attempts[0].networkCode, 'ECONNRESET');
  assert.deepEqual(client.attempts[0].retry, {
    decision: 'retry',
    reason: 'transient_network_error',
    delayMs: 500,
  });
});

test('Retry-After controls 429 retry only when the full delay fits', async () => {
  let current = Date.parse('2026-09-07T00:00:00.000Z');
  const waits = [];
  let calls = 0;
  const client = createHttpClient({
    timeoutMs: 5_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: () =>
      calls++ === 0
        ? new Response('', { status: 429, headers: { 'retry-after': '2' } })
        : new Response('[]'),
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      current += milliseconds;
    },
    random: () => 0,
    now: () => current,
  });
  await client.get(request);
  assert.deepEqual(waits, [2_000]);
  assert.deepEqual(client.attempts[0].retry, {
    decision: 'retry',
    reason: 'retry_after',
    delayMs: 2_000,
  });

  const excessive = createHttpClient({
    timeoutMs: 1_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: () => new Response('', { status: 429, headers: { 'retry-after': '2' } }),
    sleep: () => assert.fail('an excessive server delay must not be shortened'),
    random: () => 0,
  });
  await assert.rejects(excessive.get(request), { code: 'HTTP_ERROR', httpStatus: 429 });
  assert.deepEqual(excessive.attempts[0].retry, {
    decision: 'stop',
    reason: 'deadline_exceeded',
  });
});

test('invalid Retry-After falls back to bounded delay', async () => {
  const waits = [];
  let calls = 0;
  const client = createHttpClient({
    timeoutMs: 2_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: () =>
      calls++ === 0
        ? new Response('', { status: 503, headers: { 'retry-after': 'later' } })
        : new Response('[]'),
    sleep: (milliseconds) => waits.push(milliseconds),
    random: () => 0,
  });
  await client.get(request);
  assert.deepEqual(waits, [500]);
  assert.equal(client.attempts[0].retry.reason, 'transient_http_status');
});

test('maxAttempts one disables retries and cancels transient error bodies', async () => {
  let calls = 0;
  let canceled = false;
  const client = createHttpClient({
    timeoutMs: 1_000,
    maxAttempts: 1,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: () => {
      calls++;
      return new Response(
        new ReadableStream({
          cancel() {
            canceled = true;
          },
        }),
        { status: 503 },
      );
    },
  });
  await assert.rejects(client.get(request), { code: 'HTTP_ERROR', httpStatus: 503 });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(canceled, true);
  assert.equal(client.attempts[0].consumedBytes, 0);
  assert.deepEqual(client.attempts[0].retry, {
    decision: 'stop',
    reason: 'attempts_exhausted',
  });
});

test('allowed 404 is decoded and retained as consumed evidence', async () => {
  const client = createHttpClient({
    timeoutMs: 1_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: () => new Response('{"found":false}', { status: 404 }),
  });
  const saved = await client.get({ ...request, allowedStatuses: [200, 404] });
  assert.equal(saved.status, 404);
  assert.deepEqual(saved.body, { found: false });
  assert.equal(client.attempts[0].retry.decision, 'accepted');
  assert.equal(client.attempts[0].consumedBytes, saved.bytes.length);
});

test('foreign origins, credentials, fragments and redirects are rejected', async () => {
  let calls = 0;
  const client = createHttpClient({
    timeoutMs: 1_000,
    maxAttempts: 1,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: () => {
      calls++;
      return new Response('', { status: 302, headers: { location: '/elsewhere' } });
    },
  });
  for (const url of [
    'http://inferencex.semianalysis.com/api/v1/availability',
    'https://inferencex.semianalysis.com.evil.example/api/v1/availability',
    'https://user:password@inferencex.semianalysis.com/api/v1/availability',
    'https://inferencex.semianalysis.com/api/v1/availability#fragment',
  ]) {
    await assert.rejects(client.get({ ...request, url }), { code: 'INVALID_ARGUMENT' });
  }
  assert.equal(calls, 0);
  await assert.rejects(client.get(request), { code: 'HTTP_ERROR', httpStatus: 302 });
  assert.equal(calls, 1);
  assert.deepEqual(client.attempts[0].retry, {
    decision: 'not_retryable',
    reason: 'http_status',
  });
});

test('strict UTF-8 decoding rejects invalid bytes without retrying', async () => {
  let calls = 0;
  const client = createHttpClient({
    timeoutMs: 1_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    fetchImpl: () => {
      calls++;
      return new Response(Uint8Array.from([195, 40]));
    },
  });
  await assert.rejects(client.get(request), { code: 'INVALID_RESPONSE' });
  assert.equal(calls, 1);
  assert.equal(client.attempts[0].consumedBytes, 2);
});

test('accepted-status transport interruption retries and charges partial bytes', async () => {
  let calls = 0;
  const waits = [];
  const client = createHttpClient({
    timeoutMs: 2_000,
    responseBytes: 8,
    totalBytes: 8,
    fetchImpl: () => {
      calls++;
      if (calls === 1) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
              setImmediate(() =>
                controller.error(
                  Object.assign(new TypeError('socket reset'), { code: 'ECONNRESET' }),
                ),
              );
            },
          }),
        );
      }
      return new Response('{}');
    },
    sleep: (milliseconds) => waits.push(milliseconds),
    random: () => 0,
  });
  const saved = await client.get(request);
  assert.deepEqual(saved.body, {});
  assert.equal(calls, 2);
  assert.deepEqual(waits, [500]);
  assert.equal(client.attempts[0].consumedBytes, 4);
  assert.equal(client.attempts[1].consumedBytes, 2);
  assert.equal(client.attempts[0].networkCode, 'ECONNRESET');
  assert.deepEqual(client.attempts[0].retry, {
    decision: 'retry',
    reason: 'transient_network_error',
    delayMs: 500,
  });
});

test('byte-limit failures do not retry', async () => {
  let calls = 0;
  const client = createHttpClient({
    timeoutMs: 1_000,
    responseBytes: 3,
    totalBytes: 10,
    fetchImpl: () => {
      calls++;
      return new Response('1234');
    },
  });
  await assert.rejects(client.get(request), { code: 'INVALID_RESPONSE' });
  assert.equal(calls, 1);
  assert.equal(client.attempts[0].consumedBytes, 4);
  assert.deepEqual(client.attempts[0].retry, {
    decision: 'not_retryable',
    reason: 'INVALID_RESPONSE',
  });
});

test('cancellation interrupts retry waits without starting another attempt', async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = createHttpClient({
    timeoutMs: 1_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    signal: controller.signal,
    fetchImpl: () => {
      calls++;
      return new Response('', { status: 503 });
    },
    sleep: () => controller.abort(),
    random: () => 0,
  });
  await assert.rejects(client.get(request), { code: 'CANCELLED' });
  assert.equal(calls, 1);
  assert.equal(client.attempts.length, 1);
});

test('cancellation before a request is classified without an attempt', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createHttpClient({
    timeoutMs: 1_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    signal: controller.signal,
    fetchImpl: () => assert.fail('cancelled clients must not fetch'),
  });
  await assert.rejects(client.get(request), { code: 'CANCELLED' });
  assert.deepEqual(client.attempts, []);
});

test('the total deadline is shared across logical requests', async () => {
  let current = 0;
  const client = createHttpClient({
    timeoutMs: 1_000,
    responseBytes: 1_024,
    totalBytes: 2_048,
    now: () => current,
    fetchImpl: () => new Response('{}'),
  });
  await client.get(request);
  current = 1_001;
  await assert.rejects(client.get(request), { code: 'TIMEOUT' });
  assert.equal(client.attempts.length, 1);
});

test('real fetch body reads are cancelled through the client signal', async (context) => {
  const controller = new AbortController();
  const server = createServer((_incoming, outgoing) => {
    outgoing.writeHead(200, { 'content-type': 'application/json' });
    outgoing.write('{"partial":');
    setImmediate(() => controller.abort());
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  const localUrl = `http://127.0.0.1:${address.port}/stalled`;
  const client = createHttpClient({
    timeoutMs: 1_000,
    maxAttempts: 1,
    responseBytes: 1_024,
    totalBytes: 2_048,
    signal: controller.signal,
    fetchImpl: (_url, options) => fetch(localUrl, options),
  });
  await assert.rejects(client.get(request), { code: 'CANCELLED' });
  assert.equal(client.attempts.length, 1);
  assert.ok(client.attempts[0].consumedBytes <= Buffer.byteLength('{"partial":'));
});
