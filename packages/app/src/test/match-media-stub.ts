import { vi } from 'vitest';

type Listener = () => void;

/**
 * Controllable `window.matchMedia` for jsdom tests. `set()` flips a query and
 * notifies its `change` listeners, like a viewport resize would.
 */
export function stubMatchMedia(initial: Record<string, boolean> = {}) {
  const state: Record<string, boolean> = { ...initial };
  const listeners = new Map<string, Set<Listener>>();
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return Boolean(state[query]);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: 'change', cb: Listener) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_type: 'change', cb: Listener) => {
      listeners.get(query)?.delete(cb);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  return {
    set(query: string, value: boolean) {
      state[query] = value;
      for (const cb of listeners.get(query) ?? []) cb();
    },
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
  };
}
