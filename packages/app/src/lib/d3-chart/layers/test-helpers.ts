/**
 * Shared test helpers for D3 chart layer tests.
 *
 * Since vitest runs in a node environment with no DOM, we provide a mock D3
 * selection that tracks attribute, style, and text calls. The mock supports
 * the full chaining API used by the layer modules: selectAll, data, join,
 * enter, append, exit, remove, merge, select, attr, style, text, each, datum,
 * empty, nodes, transition, duration.
 */

// ─── Mock Element ────────────────────────────────────────────────────

/** Attribute/style/text values recorded on a mock element. */
export interface MockElement {
  tag: string;
  attrs: Record<string, string | number>;
  styles: Record<string, string | number>;
  textContent: string;
  children: MockElement[];
  datum: unknown;
  removed: boolean;
}

function createMockElement(tag: string, datum?: unknown): MockElement {
  return { tag, attrs: {}, styles: {}, textContent: '', children: [], datum, removed: false };
}

// ─── Child store ─────────────────────────────────────────────────────

/** Persistent child store keyed by (parent, selector). Survives across calls. */
const childStores = new WeakMap<
  MockElement,
  Map<string, { elements: MockElement[]; data: unknown[] }>
>();

function getChildStore(parent: MockElement) {
  if (!childStores.has(parent)) childStores.set(parent, new Map());
  return childStores.get(parent)!;
}

// ─── Public interface ────────────────────────────────────────────────

export interface MockSelection<Datum = unknown> {
  elements: MockElement[];
  /** @internal */ _data: Datum[];
  /** @internal */ _parent?: MockElement;
  /** @internal */ _selector?: string;

  attr(
    name: string,
    value: string | number | ((d: Datum, i: number) => string | number),
  ): MockSelection<Datum>;
  style(
    name: string,
    value: string | number | ((d: Datum, i: number) => string | number),
  ): MockSelection<Datum>;
  text(value: string | ((d: Datum, i: number) => string)): MockSelection<Datum>;
  selectAll<D = Datum>(selector: string): MockSelection<D>;
  select(selector: string): MockSelection<Datum>;
  data<D>(data: D[], keyFn?: (d: D) => string): MockSelection<D>;
  join(tag: string): MockSelection<Datum>;
  enter(): MockSelection<Datum>;
  exit(): MockSelection<Datum>;
  append(tag: string): MockSelection<Datum>;
  remove(): MockSelection<Datum>;
  merge(other: MockSelection<Datum>): MockSelection<Datum>;
  each(fn: (this: unknown, d: Datum, i: number) => void): MockSelection<Datum>;
  datum<D>(d: D): MockSelection<D>;
  empty(): boolean;
  nodes(): MockElement[];
  node(): MockElement | null;
  size(): number;
  transition(): MockSelection<Datum>;
  duration(ms: number): MockSelection<Datum>;
}

// ─── Entry point ─────────────────────────────────────────────────────

/** Build a mock selection backed by a fresh root group element. */
export function createMockGroup(): MockSelection {
  const root = createMockElement('g');
  return makeSel([root], [undefined as any]);
}

/**
 * Mock `d3.select(this)` for use inside `.each()` callbacks.
 * Returns a single-element selection wrapping the given MockElement.
 */
export function mockD3Select(el: MockElement): MockSelection {
  return makeSel([el], [el.datum]);
}

// ─── Core builder ────────────────────────────────────────────────────

function makeSel<D>(
  elements: MockElement[],
  data: D[],
  parent?: MockElement,
  selector?: string,
): MockSelection<D> {
  const sel: MockSelection<D> = {
    elements,
    _data: data,
    _parent: parent,
    _selector: selector,

    // ── Attribute / style / text ──

    attr(name: string, value: any) {
      for (let i = 0; i < elements.length; i++) {
        const v = typeof value === 'function' ? value(data[i], i) : value;
        elements[i].attrs[name] = v;
      }
      return sel;
    },

    style(name: string, value: any) {
      for (let i = 0; i < elements.length; i++) {
        const v = typeof value === 'function' ? value(data[i], i) : value;
        elements[i].styles[name] = v;
      }
      return sel;
    },

    text(value: any) {
      for (let i = 0; i < elements.length; i++) {
        const v = typeof value === 'function' ? value(data[i], i) : value;
        elements[i].textContent = String(v);
      }
      return sel;
    },

    // ── selectAll ──
    // Returns children matching the selector from the first parent element.
    // Crucially, the returned selection remembers its `_parent` so that a
    // subsequent `.data().join()` can create new children under the right parent.

    selectAll<D2 = D>(childSelector: string): MockSelection<D2> {
      const parentEl = elements[0];
      if (!parentEl) return makeSel<D2>([], [], undefined, childSelector);

      const store = getChildStore(parentEl);
      const entry = store.get(childSelector);
      if (entry) {
        const live = entry.elements.filter((e) => !e.removed);
        const liveData = entry.data.filter((_, i) => !entry.elements[i].removed) as D2[];
        return makeSel<D2>(live, liveData, parentEl, childSelector);
      }
      // No existing children — return empty selection that knows its parent.
      return makeSel<D2>([], [], parentEl, childSelector);
    },

    // ── select ──
    // Finds first matching child for each element in the selection.
    // Used by patterns like `merged.select('.eb-stem').attr(...)`.

    select(childSelector: string): MockSelection<D> {
      const resultEls: MockElement[] = [];
      const resultData: D[] = [];

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const found = findChildBySelector(el, childSelector);
        if (found) {
          resultEls.push(found);
          resultData.push(data[i]);
        }
      }
      if (resultEls.length === 0) {
        return makeSel<D>([], [], undefined, childSelector);
      }
      return makeSel(resultEls, resultData, undefined, childSelector);
    },

    // ── data ──
    // Creates a data-bound selection. Uses the parent from `selectAll`.

    data<D2>(newData: D2[], _keyFn?: (d: D2) => string): MockSelection<D2> {
      const parentEl = sel._parent ?? elements[0];
      const selectorStr = sel._selector ?? '.item';
      if (!parentEl) return makeSel<D2>([], newData, undefined, selectorStr);

      const store = getChildStore(parentEl);
      const existing = store.get(selectorStr)?.elements.filter((e) => !e.removed) ?? [];

      const bound = makeSel(existing, newData, parentEl, selectorStr);

      // Override enter/exit/join on the data-bound selection.
      bound.enter = () => {
        const enterData = newData.slice(existing.length);
        return makeEnterSel(parentEl, enterData, selectorStr);
      };

      bound.exit = () => {
        const exitEls = existing.slice(newData.length);
        return makeSel(exitEls, [] as any, parentEl, selectorStr);
      };

      bound.join = (tag: string) => {
        const newEls: MockElement[] = [];
        for (let i = 0; i < newData.length; i++) {
          const el = i < existing.length ? existing[i] : createMockElement(tag, newData[i]);
          el.datum = newData[i];
          el.tag = tag;
          newEls.push(el);
        }
        store.set(selectorStr, { elements: newEls, data: newData as unknown[] });
        const otherChildren = parentEl.children.filter((c) => !existing.includes(c));
        parentEl.children = [...otherChildren, ...newEls];
        return makeSel(newEls, newData, parentEl, selectorStr);
      };

      return bound as any;
    },

    // ── join (fallback when not overridden by data) ──
    join(tag: string): MockSelection<D> {
      const parentEl = sel._parent ?? elements[0];
      if (!parentEl) return makeSel([], [] as D[], undefined, sel._selector);

      const selectorStr = sel._selector ?? '.item';
      const store = getChildStore(parentEl);
      const currentData = sel._data;

      const newEls: MockElement[] = [];
      for (let i = 0; i < currentData.length; i++) {
        const el = createMockElement(tag, currentData[i]);
        newEls.push(el);
      }
      store.set(selectorStr, { elements: newEls, data: currentData as unknown[] });
      parentEl.children = parentEl.children.concat(newEls);
      return makeSel(newEls, currentData, parentEl, selectorStr);
    },

    // ── enter ──
    enter(): MockSelection<D> {
      const parentEl = sel._parent ?? elements[0];
      if (!parentEl) return makeSel([], [] as D[]);
      const selectorStr = sel._selector ?? '.item';
      const store = getChildStore(parentEl);
      const existing = store.get(selectorStr)?.elements.filter((e) => !e.removed) ?? [];
      const enterData = (sel._data as D[]).slice(existing.length);
      return makeEnterSel(parentEl, enterData, selectorStr);
    },

    // ── exit ──
    exit(): MockSelection<D> {
      const parentEl = sel._parent ?? elements[0];
      if (!parentEl) return makeSel([], [] as D[]);
      const selectorStr = sel._selector ?? '.item';
      const store = getChildStore(parentEl);
      const existing = store.get(selectorStr)?.elements ?? [];
      const exitEls = existing.slice((sel._data as D[]).length);
      return makeSel(exitEls, [] as any, parentEl, selectorStr);
    },

    // ── append ──
    append(tag: string): MockSelection<D> {
      const newEls: MockElement[] = [];
      const allData = sel._data;
      for (let i = 0; i < elements.length; i++) {
        const child = createMockElement(tag, allData[i]);
        elements[i].children.push(child);
        newEls.push(child);
      }
      return makeSel(newEls, allData, sel._parent, sel._selector);
    },

    // ── remove ──
    remove(): MockSelection<D> {
      for (const el of elements) {
        el.removed = true;
      }
      return sel;
    },

    // ── merge ──
    merge(other: MockSelection<D>): MockSelection<D> {
      const mergedEls = [...other.elements, ...elements];
      const mergedData = [...other._data, ...sel._data] as D[];
      return makeSel(mergedEls, mergedData, sel._parent, sel._selector);
    },

    // ── each ──
    each(fn: (this: unknown, d: D, i: number) => void): MockSelection<D> {
      for (let i = 0; i < elements.length; i++) {
        fn.call(elements[i], data[i], i);
      }
      return sel;
    },

    // ── datum ──
    datum<D2>(d: D2): MockSelection<D2> {
      for (const el of elements) {
        el.datum = d;
      }
      return makeSel(
        elements,
        elements.map(() => d),
        sel._parent,
        sel._selector,
      );
    },

    // ── Utility ──
    empty: () => elements.length === 0,
    nodes: () => elements,
    node: () => elements[0] ?? null,
    size: () => elements.length,
    transition: () => sel,
    duration: (_ms: number) => sel,
  };

  return sel;
}

// ─── Enter selection ─────────────────────────────────────────────────

function makeEnterSel<D>(parent: MockElement, enterData: D[], selector: string): MockSelection<D> {
  const placeholders = enterData.map((d) => createMockElement('placeholder', d));
  const sel = makeSel(placeholders, enterData, parent, selector);

  // Override append: creates real elements and registers them in the child store.
  sel.append = (tag: string): MockSelection<D> => {
    const store = getChildStore(parent);
    const existing = store.get(selector) ?? { elements: [], data: [] };

    const created: MockElement[] = [];
    for (let i = 0; i < enterData.length; i++) {
      const el = createMockElement(tag, enterData[i]);
      created.push(el);
      existing.elements.push(el);
      existing.data.push(enterData[i] as unknown);
      parent.children.push(el);
    }
    store.set(selector, existing);
    return makeSel(created, enterData, parent, selector);
  };

  return sel;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Cast a d3.Selection (or any value) to MockSelection for test assertions.
 * Avoids TS2339 when accessing `.elements` on typed d3 return values.
 */
// biome-ignore lint: test-only utility
export function asMock<D = unknown>(sel: any): MockSelection<D> {
  return sel as MockSelection<D>;
}

/** Find first child (recursively in direct children) matching a class selector. */
function findChildBySelector(el: MockElement, selector: string): MockElement | undefined {
  const selectorClass = selector.startsWith('.') ? selector.slice(1) : selector;

  // Check child store entries first (they're keyed by selector)
  const store = getChildStore(el);
  for (const [key, entry] of store.entries()) {
    if (key === selector && entry.elements.length > 0) {
      const live = entry.elements.find((e) => !e.removed);
      if (live) return live;
    }
  }

  // Fall back to scanning children by class attribute
  for (const child of el.children) {
    if (child.removed) continue;
    const classes = String(child.attrs['class'] || '').split(/\s+/);
    if (classes.includes(selectorClass)) {
      return child;
    }
  }
  return undefined;
}
