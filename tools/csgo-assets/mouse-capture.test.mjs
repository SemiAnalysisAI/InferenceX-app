import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireMouse, releaseMouse, isMouseCaptured } from './mouse-capture.mjs';

test('menu release cancels a capture that the browser grants later', async () => {
  let resolve,
    exits = 0,
    fallback = 0;
  const canvas = {
    requestPointerLock: () =>
      new Promise((done) => {
        resolve = done;
      }),
  };
  const previous = globalThis.document;
  globalThis.document = {
    pointerLockElement: null,
    exitPointerLock() {
      this.pointerLockElement = null;
      exits++;
    },
  };
  try {
    acquireMouse(canvas, () => fallback++);
    releaseMouse();
    document.pointerLockElement = canvas;
    resolve();
    await Promise.resolve();
    assert.equal(isMouseCaptured(canvas), false);
    assert.equal(exits, 2);
    assert.equal(fallback, 0);
  } finally {
    globalThis.document = previous;
  }
});

test('cancelled capture failures do not restart fallback input', async () => {
  let reject,
    fallback = 0;
  const canvas = {
    requestPointerLock: () =>
      new Promise((_done, fail) => {
        reject = fail;
      }),
  };
  const previous = globalThis.document;
  globalThis.document = { exitPointerLock() {} };
  try {
    acquireMouse(canvas, () => fallback++);
    releaseMouse();
    reject(new Error('cancelled'));
    await Promise.resolve();
    assert.equal(fallback, 0);
    acquireMouse(
      {
        requestPointerLock() {
          throw new Error('unavailable');
        },
      },
      () => fallback++,
    );
    assert.equal(fallback, 1);
  } finally {
    releaseMouse();
    globalThis.document = previous;
  }
});
