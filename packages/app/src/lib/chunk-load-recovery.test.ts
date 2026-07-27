// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { installChunkLoadRecovery } from './chunk-load-recovery';

const KEY = 'chunk_reload';

// JSDOM's native `window.location.reload` cannot be spied on. Replace it with
// a `vi.fn()` before installing the handler so reload behavior is asserted
// directly without triggering JSDOM navigation.

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

  it('reloads only once across multiple chunk errors in one session', () => {
    const reload = vi.mocked(window.location.reload);
    reload.mockClear();
    window.dispatchEvent(new ErrorEvent('error', { error: chunkErr() }));
    window.dispatchEvent(new ErrorEvent('error', { error: chunkErr() }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sets the gate on an unhandled rejection with a chunk-error reason', () => {
    const ev = new Event('unhandledrejection') as Event & { reason: unknown };
    Object.defineProperty(ev, 'reason', { value: chunkErr() });
    window.dispatchEvent(ev);
    expect(sessionStorage.getItem(KEY)).toBe('1');
  });

  it('installs each error listener only once', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    vi.resetModules();
    // Import after resetting module state so the listener spy captures initial installation.
    const { installChunkLoadRecovery: install } = await import('./chunk-load-recovery');

    install();
    install();

    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(addEventListener).toHaveBeenNthCalledWith(1, 'error', expect.any(Function));
    expect(addEventListener).toHaveBeenNthCalledWith(2, 'unhandledrejection', expect.any(Function));
    addEventListener.mockRestore();
  });
});
