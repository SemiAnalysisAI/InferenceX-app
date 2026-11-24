// Preloaded only for files marked `// @test-environment jsdom`. `bun test --parallel` gives every
// file a fresh global object and re-runs preloads, so each file gets its own window.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
});
const window = dom.window as unknown as Window & typeof globalThis;

// The runtime keeps its own fetch, timers, URL, streams and encoders; jsdom supplies the DOM.
const keepRuntime: Record<string, true> = {
  undefined: true,
  globalThis: true,
  console: true,
  fetch: true,
  Request: true,
  Response: true,
  Headers: true,
  FormData: true,
  Blob: true,
  File: true,
  URL: true,
  URLSearchParams: true,
  AbortController: true,
  AbortSignal: true,
  TextEncoder: true,
  TextDecoder: true,
  ReadableStream: true,
  WritableStream: true,
  TransformStream: true,
  structuredClone: true,
  setTimeout: true,
  clearTimeout: true,
  setInterval: true,
  clearInterval: true,
  queueMicrotask: true,
  performance: true,
  crypto: true,
};
// Walk the prototype chain too: EventTarget methods (addEventListener, dispatchEvent) live on
// jsdom's Window prototypes, and Bun's own versions reject jsdom events.
const copied = new Set<string>();
for (
  let source: object | null = window;
  source && source !== Object.prototype;
  source = Object.getPrototypeOf(source)
) {
  for (const key of Object.getOwnPropertyNames(source)) {
    if (copied.has(key) || keepRuntime[key] || key.startsWith('_') || key === 'constructor')
      continue;
    copied.add(key);
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) continue;
    const existing = Object.getOwnPropertyDescriptor(globalThis, key);
    if (existing && !existing.configurable) continue;
    const value =
      typeof descriptor.value === 'function' && !/^[A-Z]/.test(key)
        ? descriptor.value.bind(window)
        : descriptor.value;
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: descriptor.enumerable,
      ...(descriptor.get || descriptor.set
        ? { get: descriptor.get?.bind(window), set: descriptor.set?.bind(window) }
        : { writable: true, value }),
    });
  }
}

// As in Vitest's jsdom environment, the global object is the window: window, self, top and parent
// all point at it, and document.defaultView returns it.
for (const key of ['window', 'self', 'top', 'parent'])
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: globalThis });
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  writable: true,
  value: window.document,
});
Object.defineProperty(window.document, 'defaultView', {
  configurable: true,
  get: () => globalThis,
});

// jsdom lacks these browser APIs. Radix calls the pointer-capture and scrolling methods while
// handling input, components construct observers on mount, and next/link checks for
// IntersectionObserver when its module loads, so they are stubbed here before any module loads.
const elementProto = Element.prototype as unknown as Record<string, unknown>;
elementProto.hasPointerCapture ??= () => false;
elementProto.setPointerCapture ??= () => {};
elementProto.releasePointerCapture ??= () => {};
elementProto.scrollIntoView ??= () => {};
class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const globals = globalThis as unknown as Record<string, unknown>;
globals.ResizeObserver ??= InertObserver;
globals.IntersectionObserver ??= InertObserver;
// jsdom defines the window scroll methods but only reports "Not implemented" when called.
for (const key of ['scroll', 'scrollBy', 'scrollTo']) globals[key] = () => {};

// Browsers start a media element muted when its markup carries the muted attribute. jsdom always
// starts it unmuted, so hydrating server-rendered <video muted> reported a mismatch. Until the
// property is set, read it from the attribute.
const mediaProto = HTMLMediaElement.prototype;
const nativeMuted = Object.getOwnPropertyDescriptor(mediaProto, 'muted')!;
const mutedAssigned = new WeakSet<HTMLMediaElement>();
Object.defineProperty(mediaProto, 'muted', {
  configurable: true,
  enumerable: nativeMuted.enumerable,
  get(this: HTMLMediaElement) {
    return mutedAssigned.has(this) ? nativeMuted.get!.call(this) : this.hasAttribute('muted');
  },
  set(this: HTMLMediaElement, value: boolean) {
    mutedAssigned.add(this);
    nativeMuted.set!.call(this, value);
  },
});
