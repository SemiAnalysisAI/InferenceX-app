// Mounting and user-input helpers for jsdom component tests, the bun side of what Cypress
// component specs did with cy.mount, cy.get, .click() and .type(). Importing this module registers
// an afterEach that unmounts every tree it rendered.
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach } from 'bun:test';

import { advanceTimersByTime } from './helpers';

// jsdom lacks these browser APIs. Radix calls the pointer-capture and scrolling methods while
// handling input, and components construct observers on mount.
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

// jsdom keeps the inert attribute but still focuses inside it. Browsers refuse: an inert subtree
// cannot take focus, which shells rendered while data streams rely on.
const nativeFocus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
  if (this.closest('[inert]')) return;
  nativeFocus.call(this, options);
};

// d3 interpolates SVG transforms through transform.baseVal.consolidate(), which jsdom lacks.
// Parse the attribute into the same 2D matrix a browser would consolidate it to.
type Matrix = [number, number, number, number, number, number];
const multiply = ([a, b, c, d, e, f]: Matrix, [g, h, i, j, k, l]: Matrix): Matrix => [
  a * g + c * h,
  b * g + d * h,
  a * i + c * j,
  b * i + d * j,
  a * k + c * l + e,
  b * k + d * l + f,
];
function transformMatrix(value: string | null): Matrix | null {
  let matrix: Matrix | null = null;
  for (const match of (value ?? '').matchAll(/(?<name>\w+)\s*\((?<args>[^)]*)\)/gu)) {
    const { name, args } = match.groups!;
    const n = args
      .split(/[\s,]+/u)
      .filter(Boolean)
      .map(Number);
    let step: Matrix = [1, 0, 0, 1, 0, 0];
    if (name === 'translate') step = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (name === 'scale') step = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (name === 'matrix') step = n as Matrix;
    else if (name === 'rotate') {
      const angle = ((n[0] ?? 0) * Math.PI) / 180;
      const [cx = 0, cy = 0] = n.slice(1);
      step = multiply(
        multiply(
          [1, 0, 0, 1, cx, cy],
          [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0],
        ),
        [1, 0, 0, 1, -cx, -cy],
      );
    }
    matrix = matrix ? multiply(matrix, step) : step;
  }
  return matrix;
}
if (!('transform' in SVGElement.prototype)) {
  Object.defineProperty(SVGElement.prototype, 'transform', {
    configurable: true,
    get(this: SVGElement) {
      return {
        baseVal: {
          consolidate: () => {
            const matrix = transformMatrix(this.getAttribute('transform'));
            if (!matrix) return null;
            const [a, b, c, d, e, f] = matrix;
            return { matrix: { a, b, c, d, e, f } };
          },
        },
      };
    },
  });
}

// SVG text measurement, which line-label placement calls. Sized from the text so labels still get
// distinct boxes; tests that assert geometry stay in Cypress.
const svgProto = SVGElement.prototype as unknown as Record<string, unknown>;
svgProto.getBBox ??= function (this: SVGElement) {
  return DOMRect.fromRect({ width: (this.textContent?.length ?? 0) * 7, height: 14 });
};
svgProto.getComputedTextLength ??= function (this: SVGElement) {
  return (this.textContent?.length ?? 0) * 7;
};

// matchMedia answers like the desktop Electron window Cypress component specs ran in: a fine
// hovering pointer, light scheme, no reduced motion, and a viewport setViewport can resize.
const viewport = { width: 1280, height: 720 };
const mediaLists = new Set<{
  query: string;
  listeners: Set<(event: MediaQueryListEvent) => void>;
}>();

function lengthPx(value: string) {
  const amount = Number.parseFloat(value);
  return /r?em$/u.test(value.trim()) ? amount * 16 : amount;
}

function featureMatches(feature: string): boolean {
  const range = /^\(\s*(?<axis>width|height)\s*(?<op><=|>=|<|>|=)\s*(?<limit>[^)]+)\)$/u.exec(
    feature,
  );
  if (range) {
    const actual = viewport[range.groups!.axis as 'width' | 'height'];
    const limit = lengthPx(range.groups!.limit);
    const op = range.groups!.op;
    if (op === '<=') return actual <= limit;
    if (op === '>=') return actual >= limit;
    if (op === '<') return actual < limit;
    if (op === '>') return actual > limit;
    return actual === limit;
  }
  const pair = /^\(\s*(?<name>[a-z-]+)\s*(?::\s*(?<value>[^)]+))?\)$/u.exec(feature);
  if (!pair) return /^(?:all|screen)$/u.test(feature);
  const { name, value: rawValue = '' } = pair.groups!;
  const value = rawValue.trim();
  switch (name) {
    case 'min-width': {
      return viewport.width >= lengthPx(value);
    }
    case 'max-width': {
      return viewport.width <= lengthPx(value);
    }
    case 'min-height': {
      return viewport.height >= lengthPx(value);
    }
    case 'max-height': {
      return viewport.height <= lengthPx(value);
    }
    case 'hover':
    case 'any-hover': {
      return value === 'hover' || value === '';
    }
    case 'pointer':
    case 'any-pointer': {
      return value === 'fine' || value === '';
    }
    case 'prefers-reduced-motion': {
      return value === 'no-preference';
    }
    case 'prefers-color-scheme': {
      return value === 'light';
    }
    case 'orientation': {
      return value === (viewport.width >= viewport.height ? 'landscape' : 'portrait');
    }
    default: {
      return false;
    }
  }
}

function mediaMatches(query: string): boolean {
  return query.split(',').some((part) => {
    let text = part.trim().toLowerCase();
    const negate = text.startsWith('not ');
    text = text.replace(/^(?:not|only)\s+/u, '');
    const matches = text.split(/\s+and\s+/u).every((feature) => featureMatches(feature.trim()));
    return negate ? !matches : matches;
  });
}

globals.matchMedia = (query: string): MediaQueryList => {
  const entry = { query, listeners: new Set<(event: MediaQueryListEvent) => void>() };
  mediaLists.add(entry);
  return {
    get matches() {
      return mediaMatches(query);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      entry.listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      entry.listeners.delete(listener),
    addListener: (listener: (event: MediaQueryListEvent) => void) => entry.listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) =>
      entry.listeners.delete(listener),
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
};

/**
 * Resizes the viewport media queries and window.innerWidth/innerHeight see, like cy.viewport,
 * and notifies resize and media-query listeners. Elements still have no layout.
 */
export function setViewport(width: number, height = viewport.height) {
  const before = new Map([...mediaLists].map((entry) => [entry, mediaMatches(entry.query)]));
  viewport.width = width;
  viewport.height = height;
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    for (const [entry, matched] of before) {
      const matches = mediaMatches(entry.query);
      if (matches === matched) continue;
      for (const listener of entry.listeners)
        listener({ matches, media: entry.query } as MediaQueryListEvent);
    }
    window.dispatchEvent(new Event('resize'));
  });
}
setViewport(1280, 720);

const mounted: { root: Root; container: HTMLElement }[] = [];
const realGetBoundingClientRect = Element.prototype.getBoundingClientRect;

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  document.body.innerHTML = '';
  Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
  setViewport(1280, 720);
  mediaLists.clear();
});

/**
 * Gives every element a `width` x `height` box, so charts that size themselves from their
 * container draw in jsdom, where nothing has layout. Restored after each test.
 */
export function fakeLayout(width: number, height = 600) {
  Element.prototype.getBoundingClientRect = () => DOMRect.fromRect({ width, height });
}

export interface Rendered {
  container: HTMLElement;
  rerender: (element: ReactElement) => void;
  unmount: () => void;
}

/** Mounts `element` into a fresh container on document.body, replacing any earlier mount. */
export function render(element: ReactElement): Rendered {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  const container = document.createElement('div');
  container.dataset.cyRoot = '';
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(element));
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  };
}

// Captured before any test fakes timers, so settling waits in real time.
const realSetTimeout = globalThis.setTimeout;
const realNow = performance.now.bind(performance);

/** Lets pending promises, effects and timers due within `ms` settle inside act. */
export async function settle(ms = 0): Promise<void> {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    realSetTimeout(resolve, ms);
    await promise;
  });
}

/**
 * Retries `assertion` until it passes, like a Cypress `should`. Waiting happens inside act, so
 * responses and timers that land between attempts update React without act warnings.
 */
export async function eventually<T>(assertion: () => T, timeout = 4000): Promise<T> {
  const deadline = realNow() + timeout;
  for (;;) {
    try {
      return assertion();
    } catch (error) {
      if (realNow() >= deadline) throw error;
      await settle(10);
    }
  }
}

export function $<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): E | null {
  return root.querySelector<E>(selector);
}

export function $$<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): E[] {
  return [...root.querySelectorAll<E>(selector)];
}

/** The first match of `selector`, throwing when nothing matches. */
export function get<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): E {
  const element = root.querySelector<E>(selector);
  if (!element) throw new Error(`Expected to find ${selector}`);
  return element;
}

const matchesText = (element: Element, text: string | RegExp) =>
  typeof text === 'string'
    ? element.textContent?.includes(text)
    : text.test(element.textContent ?? '');

/**
 * Like cy.contains: the deepest element containing `text`, or with a selector the first element
 * matching it that contains `text`. Returns null when nothing matches.
 */
export function findContaining<E extends Element = HTMLElement>(
  selectorOrText: string | RegExp,
  text?: string | RegExp,
  root: ParentNode = document,
): E | null {
  const [selector, needle] =
    text === undefined
      ? ['*:not(script):not(style)', selectorOrText]
      : [selectorOrText as string, text];
  const candidates = $$<E>(selector, root).filter((element) => matchesText(element, needle));
  return (
    candidates.find(
      (element) => !candidates.some((other) => other !== element && element.contains(other)),
    ) ?? null
  );
}

export function contains<E extends Element = HTMLElement>(
  selectorOrText: string | RegExp,
  text?: string | RegExp,
  root: ParentNode = document,
): E {
  const element = findContaining<E>(selectorOrText, text, root);
  if (!element)
    throw new Error(
      `Expected to find ${text === undefined ? '' : `${String(selectorOrText)} containing `}${String(text ?? selectorOrText)}`,
    );
  return element;
}

// Tailwind's default breakpoints, which the app keeps.
const BREAKPOINTS: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };
const DISPLAY_UTILITIES: Record<string, 'shown' | 'none'> = {
  hidden: 'none',
  block: 'shown',
  'inline-block': 'shown',
  inline: 'shown',
  flex: 'shown',
  'inline-flex': 'shown',
  grid: 'shown',
  'inline-grid': 'shown',
  contents: 'shown',
  table: 'shown',
  'table-row': 'shown',
  'table-cell': 'shown',
  'flow-root': 'shown',
  'list-item': 'shown',
};
const VISIBILITY_UTILITIES: Record<string, boolean> = { visible: true, invisible: false };

/**
 * Resolves one element's Tailwind display and visibility classes at the current viewport, in
 * Tailwind's cascade order: unprefixed, then max-* variants, then min-width variants by size.
 * Returns false when the classes hide the element.
 */
function classesShow(classList: DOMTokenList): boolean {
  let display: { rank: number; shown: boolean } | null = null;
  let visibility: { rank: number; shown: boolean } | null = null;
  for (const name of classList) {
    const variant = /^(?:(?<max>max-)?(?<breakpoint>sm|md|lg|xl|2xl):)?(?<utility>[a-z-]+)$/u.exec(
      name,
    );
    if (!variant) continue;
    const { max, breakpoint, utility } = variant.groups!;
    let rank = 0;
    if (breakpoint) {
      const limit = BREAKPOINTS[breakpoint];
      if (max ? viewport.width >= limit : viewport.width < limit) continue;
      rank = max ? 1 + (2000 - limit) / 10000 : 2 + limit / 10000;
    }
    if (utility in DISPLAY_UTILITIES && (!display || rank >= display.rank))
      display = { rank, shown: DISPLAY_UTILITIES[utility] === 'shown' };
    if (utility in VISIBILITY_UTILITIES && (!visibility || rank >= visibility.rank))
      visibility = { rank, shown: VISIBILITY_UTILITIES[utility] };
  }
  return (display?.shown ?? true) && (visibility?.shown ?? true);
}

/**
 * Whether the element would render, judged without layout: attached, and neither it nor an
 * ancestor is `hidden`, styled `display: none` / `visibility: hidden` inline, or hidden by its
 * Tailwind display or visibility classes at the current viewport (see setViewport).
 */
export function isVisible(element: Element | null): boolean {
  if (!element?.isConnected) return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return false;
    const style = (node as HTMLElement).style;
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    if (!classesShow(node.classList)) return false;
  }
  return true;
}

const MOUSE = { bubbles: true, cancelable: true, composed: true } as const;
const POINTER = { ...MOUSE, pointerId: 1, pointerType: 'mouse', isPrimary: true } as const;

// jsdom only accepts its own Window as a UIEvent's `view`, and the test global is not that object.
// d3 reads event.view.document while handling drags and zooms, so point it at the test window.
function withView<E extends Event>(event: E): E {
  if (event instanceof UIEvent && !event.view)
    Object.defineProperty(event, 'view', { configurable: true, value: window });
  return event;
}

function fire(target: Element, event: Event) {
  let result = true;
  act(() => {
    result = target.dispatchEvent(withView(event));
  });
  return result;
}

/** Pointer and mouse events of a mouse moving onto `element`, as Cypress fires before acting. */
export function hover(element: Element, init: MouseEventInit = {}) {
  fire(element, new PointerEvent('pointerover', { ...POINTER, ...init }));
  fire(element, new PointerEvent('pointerenter', { ...POINTER, ...init, bubbles: false }));
  fire(element, new MouseEvent('mouseover', { ...MOUSE, ...init }));
  fire(element, new MouseEvent('mouseenter', { ...MOUSE, ...init, bubbles: false }));
  fire(element, new PointerEvent('pointermove', { ...POINTER, ...init }));
  fire(element, new MouseEvent('mousemove', { ...MOUSE, ...init }));
}

/** Pointer and mouse events of a mouse leaving `element`. */
export function unhover(element: Element, init: MouseEventInit = {}) {
  fire(element, new PointerEvent('pointerout', { ...POINTER, ...init }));
  fire(element, new PointerEvent('pointerleave', { ...POINTER, ...init, bubbles: false }));
  fire(element, new MouseEvent('mouseout', { ...MOUSE, ...init }));
  fire(element, new MouseEvent('mouseleave', { ...MOUSE, ...init, bubbles: false }));
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

/** A full mouse click as Cypress performs it: hover, press, focus, release, click. */
export function click(element: Element, init: MouseEventInit = {}) {
  if ((element as HTMLButtonElement).disabled)
    throw new Error(`Cannot click a disabled ${element.tagName.toLowerCase()}`);
  hover(element, init);
  const pressed = fire(
    element,
    new PointerEvent('pointerdown', { ...POINTER, button: 0, buttons: 1, ...init }),
  );
  const mousedown =
    pressed &&
    fire(
      element,
      new MouseEvent('mousedown', { ...MOUSE, button: 0, buttons: 1, detail: 1, ...init }),
    );
  if (mousedown) {
    const focusable = element.closest<HTMLElement>(FOCUSABLE);
    act(() => {
      if (focusable && !(focusable as HTMLButtonElement).disabled) focusable.focus();
      else (document.activeElement as HTMLElement | null)?.blur?.();
    });
  }
  fire(element, new PointerEvent('pointerup', { ...POINTER, button: 0, ...init }));
  fire(element, new MouseEvent('mouseup', { ...MOUSE, button: 0, detail: 1, ...init }));
  fire(element, new MouseEvent('click', { ...MOUSE, button: 0, detail: 1, ...init }));
}

export function doubleClick(element: Element, init: MouseEventInit = {}) {
  click(element, init);
  click(element, { ...init, detail: 2 });
  fire(element, new MouseEvent('dblclick', { ...MOUSE, detail: 2, ...init }));
}

/** Advances the fake clock inside act, like cy.tick, so timer-driven renders flush. */
export function tick(ms: number) {
  act(() => advanceTimersByTime(ms));
}

export function focus(element: Element) {
  act(() => (element as HTMLElement).focus());
}

export function blur(element: Element) {
  act(() => (element as HTMLElement).blur());
}

/** Dispatches a bubbling event of `type` built by `Event`, inside act. */
export function dispatch(element: Element | Window | Document, event: Event) {
  act(() => {
    element.dispatchEvent(withView(event));
  });
}

const KEYS: Record<string, { key: string; code: string }> = {
  esc: { key: 'Escape', code: 'Escape' },
  enter: { key: 'Enter', code: 'Enter' },
  space: { key: ' ', code: 'Space' },
  tab: { key: 'Tab', code: 'Tab' },
  backspace: { key: 'Backspace', code: 'Backspace' },
  downarrow: { key: 'ArrowDown', code: 'ArrowDown' },
  uparrow: { key: 'ArrowUp', code: 'ArrowUp' },
  leftarrow: { key: 'ArrowLeft', code: 'ArrowLeft' },
  rightarrow: { key: 'ArrowRight', code: 'ArrowRight' },
  home: { key: 'Home', code: 'Home' },
  end: { key: 'End', code: 'End' },
};

/** keydown then keyup of a named key (`Escape`, `Enter`, `ArrowDown`, ...) on the target. */
export function press(
  key: string,
  target: Element = document.activeElement ?? document.body,
  init: KeyboardEventInit = {},
) {
  const named = KEYS[key.toLowerCase()] ?? { key, code: key };
  const element = target as HTMLElement;
  const down = fire(target, new KeyboardEvent('keydown', { ...MOUSE, ...named, ...init }));
  // Browsers activate a button on Enter keydown, and on Space keyup; checkboxes toggle on Space.
  if (down && named.key === 'Enter' && element.matches?.('button, a[href]'))
    fire(target, new MouseEvent('click', { ...MOUSE, detail: 0 }));
  const up = fire(target, new KeyboardEvent('keyup', { ...MOUSE, ...named, ...init }));
  if (
    down &&
    up &&
    named.key === ' ' &&
    element.matches?.('button, summary, input[type="checkbox"], input[type="radio"]')
  )
    fire(target, new MouseEvent('click', { ...MOUSE, detail: 0 }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(element) as object;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
}

/**
 * Types like cy.type: focuses the field (clicking it when unfocused), then sends each character
 * as keydown, input and keyup. `{esc}`, `{enter}`, `{backspace}`, `{selectall}` and the arrow keys
 * are recognised; `{selectall}` makes the next character replace the whole value.
 */
export function type(element: Element, text: string) {
  if (document.activeElement !== element) click(element);
  let replace = false;
  for (const token of text.match(/\{[^}]+\}|[^{]/gu) ?? []) {
    const target = document.activeElement ?? element;
    const field = target as HTMLInputElement;
    if (token.startsWith('{')) {
      const name = token.slice(1, -1).toLowerCase();
      if (name === 'selectall') {
        replace = true;
        continue;
      }
      if (name === 'backspace' && 'value' in field) {
        fire(
          target,
          new KeyboardEvent('keydown', { ...MOUSE, key: 'Backspace', code: 'Backspace' }),
        );
        const cleared = replace ? '' : field.value.slice(0, -1);
        act(() => setNativeValue(field, cleared));
        replace = false;
        fire(
          target,
          new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }),
        );
        fire(target, new KeyboardEvent('keyup', { ...MOUSE, key: 'Backspace', code: 'Backspace' }));
        continue;
      }
      press(name, target);
      continue;
    }
    const proceed = fire(target, new KeyboardEvent('keydown', { ...MOUSE, key: token }));
    if (proceed && 'value' in field && typeof field.value === 'string') {
      const next = replace ? token : field.value + token;
      act(() => setNativeValue(field, next));
      replace = false;
      fire(
        target,
        new InputEvent('input', { bubbles: true, data: token, inputType: 'insertText' }),
      );
    }
    fire(target, new KeyboardEvent('keyup', { ...MOUSE, key: token }));
  }
}

/** Clears a text field the way cy.clear does. */
export function clear(element: HTMLInputElement | HTMLTextAreaElement) {
  if (document.activeElement !== element) click(element);
  act(() => setNativeValue(element, ''));
  fire(element, new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
}

/** Sets a checkbox the way cy.check / cy.uncheck do, clicking only when the state differs. */
export function setChecked(element: HTMLInputElement, checked: boolean) {
  if (element.checked !== checked) click(element);
}

/** Chooses an option of a native <select> by value or label, like cy.select. */
export function select(element: HTMLSelectElement, valueOrLabel: string) {
  const option = [...element.options].find(
    (item) => item.value === valueOrLabel || item.textContent?.trim() === valueOrLabel,
  );
  if (!option) throw new Error(`No option ${valueOrLabel}`);
  act(() => {
    element.value = option.value;
  });
  fire(element, new Event('input', { bubbles: true }));
  fire(element, new Event('change', { bubbles: true }));
}

/** The search string of the current URL as parsed parameters. */
export const searchParam = (key: string) => new URLSearchParams(window.location.search).get(key);

export interface InterceptedRequest {
  url: URL;
  method: string;
  body: unknown;
}

export interface FetchReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Milliseconds before the response resolves. */
  delay?: number;
}

export interface FetchRoute {
  /** Every request this route answered, oldest first, like cy.get('@alias.all'). */
  calls: InterceptedRequest[];
}

type RouteMatcher = string | RegExp | ((url: URL, method: string) => boolean);
type RouteReply = FetchReply | ((request: InterceptedRequest) => FetchReply | Promise<FetchReply>);

const realFetch = globalThis.fetch;
let routes: { method: string; match: RouteMatcher; reply: RouteReply; route: FetchRoute }[] = [];
let observers: ((request: InterceptedRequest) => void)[] = [];

afterEach(() => {
  routes = [];
  observers = [];
  globalThis.fetch = realFetch;
});

/** Sees every intercepted request before it is routed, like a cy.intercept middleware. */
export function observeRequests(observer: (request: InterceptedRequest) => void) {
  observers.push(observer);
}

function globToRegExp(glob: string) {
  const source = glob
    .split('*')
    .map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join('.*');
  return new RegExp(`^${source}$`, 'u');
}

function routeMatches(match: RouteMatcher, url: URL, method: string) {
  if (typeof match === 'function') return match(url, method);
  const target = url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.href;
  if (match instanceof RegExp) return match.test(target);
  return match.includes('*') ? globToRegExp(match).test(target) : target === match;
}

/**
 * Answers fetch calls the way cy.intercept stubbed them. The latest matching route wins, as in
 * Cypress. Strings match the path and query of same-origin URLs (with `*` globs), or the full URL
 * otherwise. Unmatched requests get a 404, as the component dev server gave them.
 */
export function intercept(method: string, match: RouteMatcher, reply: RouteReply): FetchRoute {
  const route: FetchRoute = { calls: [] };
  routes.push({ method: method.toUpperCase(), match, reply, route });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    const verb = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let body: unknown = init?.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // Not JSON, keep the text.
      }
    }
    const request = { url, method: verb, body };
    for (const observer of observers) observer(request);
    const found = routes.findLast(
      (candidate) =>
        (candidate.method === '*' || candidate.method === verb) &&
        routeMatches(candidate.match, url, verb),
    );
    if (!found) return new Response(null, { status: 404 });
    found.route.calls.push(request);
    const answer = typeof found.reply === 'function' ? await found.reply(request) : found.reply;
    if (answer.delay) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, answer.delay);
      await promise;
    }
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    const status = answer.status ?? 200;
    const payload =
      answer.body === undefined || status === 204 || status === 304
        ? null
        : typeof answer.body === 'string'
          ? answer.body
          : answer.body instanceof Uint8Array
            ? new Blob([answer.body as Uint8Array<ArrayBuffer>])
            : JSON.stringify(answer.body);
    return new Response(payload, {
      status,
      headers: { 'Content-Type': 'application/json', ...answer.headers },
    });
  }) as typeof fetch;
  return route;
}
