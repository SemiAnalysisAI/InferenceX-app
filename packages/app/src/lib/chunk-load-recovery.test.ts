// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { installChunkLoadRecovery } from './chunk-load-recovery';

const KEY = 'chunk_reload';

// JSDOM forbids spying on `window.location.reload`, but the implementation
// always sets the sessionStorage gate immediately BEFORE calling reload(),
// so the gate's `'1'` state is a 1:1 proxy for "reload was attempted." We
// also stub `reload` to a no-op via Object.defineProperty so the bare
// `window.location.reload()` call doesn't blow up the JSDOM test environment.

function chunkErr(): Error {
  const e = new Error('Loading chunk 123 failed');
  e.name = 'ChunkLoadError';
  return e;
}

describe('installChunkLoadRecovery', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, reload: vi.fn() },
    });
    installChunkLoadRecovery();
  });

  beforeEach(() => {
    sessionStorage.removeItem(KEY);
  });

  afterAll(() => {
    // best-effort cleanup; subsequent suites get a fresh JSDOM anyway
  });

  it('sets the reload gate on ChunkLoadError from an error event', () => {
    window.dispatchEvent(new ErrorEvent('error', { error: chunkErr() }));
    expect(sessionStorage.getItem(KEY)).toBe('1');
  });

  it('does not set the gate on a regular Error', () => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom') }));
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('matches by message regex when the error has no ChunkLoadError name', () => {
    const err = new Error('Failed to fetch dynamically imported module: foo.js');
    window.dispatchEvent(new ErrorEvent('error', { error: err }));
    expect(sessionStorage.getItem(KEY)).toBe('1');
  });

  it('only sets the gate once across multiple chunk errors in one session', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    setItemSpy.mockClear();
    window.dispatchEvent(new ErrorEvent('error', { error: chunkErr() }));
    window.dispatchEvent(new ErrorEvent('error', { error: chunkErr() }));
    const writes = setItemSpy.mock.calls.filter((c) => c[0] === KEY);
    expect(writes).toHaveLength(1);
    setItemSpy.mockRestore();
  });

  it('sets the gate on an unhandled rejection with a chunk-error reason', () => {
    const ev = new Event('unhandledrejection') as Event & { reason: unknown };
    Object.defineProperty(ev, 'reason', { value: chunkErr() });
    window.dispatchEvent(ev);
    expect(sessionStorage.getItem(KEY)).toBe('1');
  });

  it('is idempotent: repeated installs do not duplicate the gate write', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    setItemSpy.mockClear();
    installChunkLoadRecovery();
    installChunkLoadRecovery();
    window.dispatchEvent(new ErrorEvent('error', { error: chunkErr() }));
    const writes = setItemSpy.mock.calls.filter((c) => c[0] === KEY);
    expect(writes).toHaveLength(1);
    setItemSpy.mockRestore();
  });
});
