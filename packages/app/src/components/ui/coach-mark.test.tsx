// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/inference',
}));

import { CoachMark } from '@/components/ui/coach-mark';
import type { NudgeAnchor } from '@/lib/nudges/types';

const ACTION_SELECTOR = '.dot-group';

function stubRect(element: Element, left: number, top: number, size = 12): void {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      width: size,
      height: size,
      right: left + size,
      bottom: top + size,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** A point the resolver can find, mid-viewport so it passes the on-screen check. */
function addPoint(parent: ParentNode = document.body): HTMLElement {
  const point = document.createElement('div');
  point.className = 'dot-group';
  parent.append(point);
  stubRect(point, 500, 300);
  return point;
}

let container: HTMLDivElement;
let root: Root;
let onDismiss: Mock<() => void>;
let onAction: Mock<() => void>;

function renderCoachMark(anchor: NudgeAnchor) {
  act(() =>
    root.render(
      <CoachMark
        anchor={anchor}
        icon={<span />}
        title="Every point has a story"
        description="Click any point to view server metrics and logs."
        onDismiss={onDismiss}
        onAction={onAction}
        testId="coach-mark"
      />,
    ),
  );
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
}

const isVisible = () => container.querySelector('[data-testid="coach-mark-target"]') !== null;

/**
 * Let the component notice a DOM change on its own: the MutationObserver
 * callback is a microtask, and the reposition it schedules runs on the next
 * animation frame.
 */
async function flushReposition() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(null));
    });
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  onDismiss = vi.fn<() => void>();
  onAction = vi.fn<() => void>();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('CoachMark input handling', () => {
  describe('when an anchor is on screen', () => {
    let point: HTMLElement;

    beforeEach(() => {
      point = addPoint();
      renderCoachMark({ resolve: () => point, actionSelector: ACTION_SELECTOR });
    });

    it('renders the callout', () => {
      expect(isVisible()).toBe(true);
      expect(container.querySelector('[data-testid="coach-mark"]')?.textContent).toContain(
        'Every point has a story',
      );
    });

    it('dismisses on Escape', () => {
      pressEscape();
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('treats a click on the anchored element as taking the action', () => {
      act(() => {
        point.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('when no anchor resolves (scrolled away, or every point filtered out)', () => {
    beforeEach(() => {
      // The card stays mounted so it can be measured and can re-appear, but
      // nothing is drawn — the user has never seen this tip.
      renderCoachMark({ resolve: () => null, actionSelector: ACTION_SELECTOR });
    });

    it('renders nothing visible', () => {
      expect(isVisible()).toBe(false);
      expect(
        container.querySelector<HTMLElement>('[data-testid="coach-mark"]')?.style.visibility,
      ).toBe('hidden');
    });

    it('ignores Escape rather than burning the permanent dismissal', () => {
      // Escape is a global key: the user is closing some other UI entirely.
      // Acting on it here would permanently dismiss a tip never shown, and it
      // would not come back on scroll.
      pressEscape();
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('ignores a click on a point rather than recording phantom engagement', () => {
      const point = addPoint();
      act(() => {
        point.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onAction).not.toHaveBeenCalled();
    });
  });

  it('starts responding to Escape once its point comes into view', async () => {
    let point: HTMLElement | null = null;
    renderCoachMark({ resolve: () => point, actionSelector: ACTION_SELECTOR });
    expect(isVisible()).toBe(false);

    pressEscape();
    expect(onDismiss).not.toHaveBeenCalled();

    // The point appears — as it does when the chart is scrolled into view.
    // No re-render: the component's own MutationObserver has to notice.
    point = addPoint();
    await flushReposition();
    expect(isVisible()).toBe(true);

    pressEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('CoachMark anchor reuse', () => {
  it('reuses one resolved anchor across scoped transform mutations', async () => {
    const chart = document.createElement('div');
    document.body.append(chart);
    const point = addPoint(chart);
    const resolve = vi.fn(() => point);
    const getRect = vi.fn((element: Element) => element.getBoundingClientRect());

    renderCoachMark({
      resolve,
      getRect,
      getMutationRoot: () => chart,
      actionSelector: ACTION_SELECTOR,
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(getRect).toHaveBeenCalledTimes(1);

    const outside = document.createElement('div');
    document.body.append(outside);
    outside.setAttribute('transform', 'translate(1,1)');
    await flushReposition();
    expect(getRect, 'outside mutation ignored').toHaveBeenCalledTimes(1);

    for (let index = 0; index < 20; index++) {
      point.setAttribute('transform', `translate(${index},${index})`);
    }
    await flushReposition();

    expect(resolve, 'full resolver stays cached').toHaveBeenCalledTimes(1);
    expect(getRect, 'one cached measurement for the frame').toHaveBeenCalledTimes(2);
  });

  it('resolves a replacement when the cached anchor becomes unusable', async () => {
    const chart = document.createElement('div');
    document.body.append(chart);
    const first = addPoint(chart);
    const second = addPoint(chart);
    stubRect(second, 700, 400);
    let current = first;
    let firstUsable = true;
    const resolve = vi.fn(() => current);
    const getRect = vi.fn((element: Element) =>
      element === first && !firstUsable ? null : element.getBoundingClientRect(),
    );

    renderCoachMark({
      resolve,
      getRect,
      getMutationRoot: () => chart,
      actionSelector: ACTION_SELECTOR,
    });
    expect(resolve).toHaveBeenCalledTimes(1);

    current = second;
    firstUsable = false;
    first.setAttribute('transform', 'translate(1,1)');
    await flushReposition();

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="coach-mark-target"]')?.getAttribute('cx')).toBe(
      '706',
    );
  });

  it('stays hidden when a resolved anchor fails validation', () => {
    const point = addPoint();

    renderCoachMark({
      resolve: () => point,
      getRect: () => null,
      actionSelector: ACTION_SELECTOR,
    });

    expect(isVisible()).toBe(false);
  });
});
