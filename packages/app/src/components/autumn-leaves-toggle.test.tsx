// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import { AutumnLeavesToggle } from './autumn-leaves-toggle';
import {
  AUTUMN_LEAVES_OFF_ATTRIBUTE,
  AUTUMN_LEAVES_STORAGE_KEY,
  autumnLeavesPrepaintScript,
} from '@/lib/autumn-leaves';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AutumnLeavesToggle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(AUTUMN_LEAVES_OFF_ATTRIBUTE);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const button = () =>
    container.querySelector<HTMLButtonElement>('[data-testid="autumn-leaves-toggle"]')!;

  it('hides the leaves, persists the choice, and turns them back on', () => {
    act(() => root.render(<AutumnLeavesToggle />));
    expect(button().getAttribute('aria-pressed')).toBe('true');

    act(() => button().click());
    expect(document.documentElement.hasAttribute(AUTUMN_LEAVES_OFF_ATTRIBUTE)).toBe(true);
    expect(localStorage.getItem(AUTUMN_LEAVES_STORAGE_KEY)).toBe('off');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().getAttribute('aria-label')).toBe('Show falling leaves');

    act(() => button().click());
    expect(document.documentElement.hasAttribute(AUTUMN_LEAVES_OFF_ATTRIBUTE)).toBe(false);
    expect(localStorage.getItem(AUTUMN_LEAVES_STORAGE_KEY)).toBeNull();
  });

  it('keeps every mounted instance in sync', async () => {
    act(() =>
      root.render(
        <>
          <AutumnLeavesToggle />
          <AutumnLeavesToggle />
        </>,
      ),
    );
    const [first, second] = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="autumn-leaves-toggle"]',
    );
    act(() => first.click());
    // MutationObserver callbacks run as microtasks.
    await act(async () => {
      await Promise.resolve();
    });
    expect(second.getAttribute('aria-pressed')).toBe('false');
    act(() => second.click());
    expect(document.documentElement.hasAttribute(AUTUMN_LEAVES_OFF_ATTRIBUTE)).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(first.getAttribute('aria-pressed')).toBe('true');
  });

  it('prepaint script keys off the saved opt-out', () => {
    expect(autumnLeavesPrepaintScript).toContain(JSON.stringify(AUTUMN_LEAVES_STORAGE_KEY));
    expect(autumnLeavesPrepaintScript).toContain(JSON.stringify(AUTUMN_LEAVES_OFF_ATTRIBUTE));
  });

  it('reads the opt-out the prepaint script applied before hydration', () => {
    document.documentElement.setAttribute(AUTUMN_LEAVES_OFF_ATTRIBUTE, '');

    act(() => root.render(<AutumnLeavesToggle isZh />));
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().getAttribute('aria-label')).toBe('显示飘落的树叶');
  });
});
