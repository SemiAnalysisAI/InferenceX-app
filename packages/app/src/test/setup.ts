// Preloaded for every unit test file, after setup-dom.ts in jsdom runs.
import 'next/dist/server/node-environment-baseline.js';
import './setup-local-storage';

import Module from 'node:module';

import { afterAll, beforeEach, expect, vi, type Mock } from 'bun:test';

import { leakedRequireHooks } from '../lib/testing/unit-test-runner';

// Vitest cleared every mock's call history before each test (clearMocks), ahead of the file's own
// beforeEach hooks; tests assume each one starts with zero calls. Implementations are kept.
beforeEach(() => {
  vi.clearAllMocks();
});

// Bun 1.4 keeps a require.extensions hook that a file installs (tsx/cjs installs several) and calls
// it for later files in the same worker, against the discarded global of the file that installed
// it. tsx's hook then blocks forever, so a file that leaves one installed has the extensions
// restored and fails. tsx also replaces Module._resolveFilename. Bun does not carry that into later
// files, and Next's require hook replaces it legitimately, so it is only restored.
const extensionHooks = Object.getOwnPropertyDescriptors(require.extensions);
const moduleWithResolver = Module as unknown as { _resolveFilename: unknown };
const resolveFilename = moduleWithResolver._resolveFilename;
afterAll(() => {
  moduleWithResolver._resolveFilename = resolveFilename;
  const leaked = leakedRequireHooks(
    extensionHooks,
    Object.getOwnPropertyDescriptors(require.extensions),
  );
  if (leaked.length === 0) return;
  for (const key of leaked) {
    const original = extensionHooks[key as string];
    if (original) Object.defineProperty(require.extensions, key, original);
    else Reflect.deleteProperty(require.extensions, key);
  }
  throw new Error(
    `This file left require hooks installed for ${leaked.map(String).join(', ')}, which would run ` +
      'in later test files. Mock the module that installs them, or restore require.extensions in ' +
      'afterAll.',
  );
});

// Bun 1.4's toMatchObject replaces every matched property of the received value with the
// asymmetric matcher that matched it, so a later assertion on the same object compares against
// matcher objects. Match a copy of the plain objects and arrays instead.
const nativeToMatchObject = Object.getPrototypeOf(expect(0)).toMatchObject as (
  this: unknown,
  expected: unknown,
) => void;

function copyContainers(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const item of value) out.push(copyContainers(item, seen));
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<PropertyKey, unknown> = Object.create(proto);
  seen.set(value, out);
  // Enumerable keys only, the ones toMatchObject compares. Reading every key would also fire
  // getters such as the one React DEV puts on element props for `key`, which logs a warning.
  for (const key of Reflect.ownKeys(value)) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) continue;
    out[key] = copyContainers((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return out;
}

expect.extend({
  toMatchObject(received: unknown, expected: unknown) {
    try {
      nativeToMatchObject.call(expect(copyContainers(received)), expected);
      return { pass: true, message: () => 'expected the value not to match the object' };
    } catch (error) {
      return { pass: false, message: () => (error as Error).message };
    }
  },
  // Vitest matcher the suite uses that bun:test does not ship.
  toHaveBeenCalledExactlyOnceWith(received: unknown, ...expected: unknown[]) {
    const calls = (received as Mock<(...args: unknown[]) => unknown>).mock.calls;
    const pass = calls.length === 1 && this.equals(calls[0], expected);
    return {
      pass,
      message: () =>
        `expected the mock ${pass ? 'not ' : ''}to be called exactly once with ${this.utils.printExpected(expected)}, ` +
        `but it was called ${calls.length} time(s): ${this.utils.printReceived(calls)}`,
    };
  },
});

declare module 'bun:test' {
  interface Matchers<T> {
    toHaveBeenCalledExactlyOnceWith: (...expected: unknown[]) => T;
  }
}
