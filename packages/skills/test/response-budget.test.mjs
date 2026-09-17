import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { createResponseBudget } from '../skills/inferencex-api/scripts/response-budget.mjs';

test('response limits count streamed bytes, not Content-Length, and cancel overflow', async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      canceled = true;
    },
  });
  const budget = createResponseBudget({ responseBytes: 8, totalBytes: 12, timeoutMs: 1000 });
  await assert.rejects(
    budget.read(new Response(body, { headers: { 'content-length': '1' } })),
    /byte budget/,
  );
  assert.equal(canceled, true);
});

test('aggregate limit rejects many individually valid responses', async () => {
  const budget = createResponseBudget({ responseBytes: 8, totalBytes: 12, timeoutMs: 1000 });
  const first = await budget.read(new Response('12345678'));
  const second = await budget.read(new Response('1234'));
  assert.equal(first.length, 8);
  assert.equal(second.length, 4);
  await assert.rejects(budget.read(new Response('5')), /total.*byte budget/);
});

test('a stalled response read is bounded by the operation deadline', async () => {
  let canceled = false;
  const budget = createResponseBudget({ responseBytes: 8, totalBytes: 12, timeoutMs: 20 });
  const stalled = new Response(
    new ReadableStream({
      cancel() {
        canceled = true;
      },
    }),
  );
  // An unref'ed AbortSignal timer must not be the only handle in the unit test.
  await Promise.all([assert.rejects(budget.read(stalled), /timed out|timeout/i), setTimeout(40)]);
  assert.equal(canceled, true);
  assert.equal(budget.signal.aborted, true);
});
