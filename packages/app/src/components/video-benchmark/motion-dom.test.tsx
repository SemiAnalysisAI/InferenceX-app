// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION } from './motion';
import { DISCLOSURE, useChanges, useDisclosureMotion, useHeightEase } from './motion-dom';

interface Run {
  node: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
  cancelled: boolean;
}

let runs: Run[] = [];
let root: Root | undefined;
let container: HTMLDivElement | undefined;
/** What the reader asked for; each test sets it before it mounts. */
let reduced = false;

beforeEach(() => {
  runs = [];
  reduced = false;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion: reduce'),
  }));
  Element.prototype.animate = function animate(
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const listeners: Record<string, (() => void)[]> = {};
    const run: Run = {
      node: this,
      frames,
      options,
      cancelled: false,
      finish: () => listeners.finish?.forEach((f) => f()),
    };
    runs.push(run);
    return {
      addEventListener: (type: string, listener: () => void) =>
        (listeners[type] ??= []).push(listener),
      cancel: () => {
        run.cancelled = true;
        listeners.cancel?.forEach((f) => f());
      },
    } as unknown as Animation;
  } as typeof Element.prototype.animate;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  container?.remove();
  Reflect.deleteProperty(Element.prototype, 'animate');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

/** Heights the layout would give: a closed disclosure is its summary, an open one has its content. */
function layoutHeights() {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function height(
    this: HTMLElement,
  ) {
    // Part of the way shut while it closes, as the running animation would have it.
    if (this instanceof HTMLDetailsElement)
      return 'closing' in this.dataset ? 130 : this.open ? 240 : 40;
    return this.querySelector('[data-open]') ? 120 : 30;
  });
}

function Page({ onToggle }: { onToggle?: (open: boolean) => void }) {
  const page = useDisclosureMotion<HTMLDivElement>();
  return (
    <div ref={page}>
      <details {...DISCLOSURE} onToggle={(event) => onToggle?.(event.currentTarget.open)}>
        <summary>How to read</summary>
        <p>Notes</p>
      </details>
      <details data-plain="">
        <summary>Shared control</summary>
      </details>
    </div>
  );
}

const details = () => container!.querySelector<HTMLDetailsElement>('details[data-disclosure]')!;
const click = (element: Element) =>
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

describe('useDisclosureMotion', () => {
  it('opens at the click and grows from the closed height to the open one', () => {
    layoutHeights();
    mount(<Page />);
    click(details().querySelector('summary')!);
    expect(details().open).toBe(true);
    expect(runs).toHaveLength(1);
    expect(runs[0].frames).toEqual([{ height: '40px' }, { height: '240px' }]);
    expect(runs[0].options.duration).toBe(MOTION.base);
    expect(details().style.overflow).toBe('clip');
    runs[0].finish();
    expect(details().style.overflow).toBe('');
  });

  it('closes when the height has run back, with the chevron told at the click', () => {
    layoutHeights();
    mount(<Page />);
    const summary = details().querySelector('summary')!;
    click(summary);
    runs[0].finish();
    click(summary);
    // Still open while it closes, and marked so the chevron turns now.
    expect(details().open).toBe(true);
    expect(details().dataset.closing).toBe('');
    expect(runs[1].frames).toEqual([{ height: '240px' }, { height: '40px' }]);
    expect(runs[1].options.duration).toBe(MOTION.fast);
    runs[1].finish();
    expect(details().open).toBe(false);
    expect('closing' in details().dataset).toBe(false);
  });

  it('ends open when it is clicked again while it closes', () => {
    layoutHeights();
    mount(<Page />);
    const summary = details().querySelector('summary')!;
    click(summary);
    runs[0].finish();
    click(summary);
    click(summary);
    expect(runs[1].cancelled).toBe(true);
    expect('closing' in details().dataset).toBe(false);
    // The close that was cut short must not shut it when its animation is torn down.
    runs[1].finish();
    expect(details().open).toBe(true);
    // It opens again from where the close had got to.
    expect(runs[2].frames).toEqual([{ height: '130px' }, { height: '240px' }]);
    runs[2].finish();
    expect(details().open).toBe(true);
  });

  it('leaves the click alone under reduced motion', () => {
    reduced = true;
    layoutHeights();
    mount(<Page />);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      details().querySelector('summary')!.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(runs).toHaveLength(0);
  });

  it('leaves other disclosures on the page alone', () => {
    layoutHeights();
    mount(<Page />);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      container!.querySelector('details[data-plain] summary')!.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(runs).toHaveLength(0);
  });
});

function Drawer() {
  const [open, setOpen] = useState(false);
  const { ref, before } = useHeightEase<HTMLDivElement>(open);
  return (
    <div ref={ref}>
      {before}
      <button type="button" onClick={() => setOpen(!open)}>
        Inspect
      </button>
      {open && <div data-open="">controls</div>}
    </div>
  );
}

describe('useHeightEase', () => {
  it('eases the element from the height it had to the height it has', () => {
    layoutHeights();
    mount(<Drawer />);
    expect(runs).toHaveLength(0);
    click(container!.querySelector('button')!);
    expect(runs[0].frames).toEqual([{ height: '30px' }, { height: '120px' }]);
    click(container!.querySelector('button')!);
    expect(runs[1].frames).toEqual([{ height: '120px' }, { height: '30px' }]);
    expect(runs[1].options.duration).toBe(MOTION.fast);
  });

  it('changes at once under reduced motion', () => {
    reduced = true;
    layoutHeights();
    mount(<Drawer />);
    click(container!.querySelector('button')!);
    expect(container!.querySelector('[data-open]')).not.toBeNull();
    expect(runs).toHaveLength(0);
  });
});

function Counter({ token }: { token: string }) {
  return <output>{useChanges(token)}</output>;
}

describe('useChanges', () => {
  it('counts changes after the first render, so what is there at the start does not ease in', () => {
    mount(<Counter token="b200|reference" />);
    expect(container!.textContent).toBe('0');
    act(() => root!.render(<Counter token="b200|reference" />));
    expect(container!.textContent).toBe('0');
    act(() => root!.render(<Counter token="b200|h100" />));
    expect(container!.textContent).toBe('1');
    act(() => root!.render(<Counter token="b200|reference" />));
    expect(container!.textContent).toBe('2');
  });
});
