// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';

let container: HTMLDivElement;
let root: Root;

function renderUi(ui: React.ReactNode) {
  act(() => root.render(ui));
}

function clickCard(anchor: Element) {
  act(() => {
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
}

/** Simulate the browser restoring this page from the back-forward cache. */
function restoreFromBfcache() {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  act(() => {
    window.dispatchEvent(event);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  // jsdom has neither view transitions nor matchMedia; the click handler
  // gates the shared-element tag on both.
  (document as unknown as { startViewTransition: () => void }).startViewTransition = () => {};
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({ matches: query === '(prefers-reduced-motion: no-preference)' }) as MediaQueryList,
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (document as unknown as { startViewTransition?: () => void }).startViewTransition;
  vi.unstubAllGlobals();
});

const cardProps = {
  // Hash hrefs keep jsdom from logging "navigation not implemented" when the
  // click handler assigns location.href.
  href: '#a-vs-b',
  slug: 'a-vs-b',
  label: 'A vs B',
  archLine: 'arch',
};

describe('ComparePairCardLink bfcache restore', () => {
  it('clears the pending dim when the page is restored from bfcache', () => {
    renderUi(<ComparePairCardLink {...cardProps} />);
    const anchor = container.querySelector('a')!;

    clickCard(anchor);
    expect(anchor.dataset.pending).toBe('true');
    expect(anchor.getAttribute('aria-busy')).toBe('true');

    restoreFromBfcache();
    expect(anchor.dataset.pending).toBeUndefined();
    expect(anchor.getAttribute('aria-busy')).toBeNull();
  });

  it('keeps view-transition-name unique when a restored page gets a second click', () => {
    renderUi(
      <>
        <ComparePairCardLink {...cardProps} />
        <ComparePairCardLink {...cardProps} href="#c-vs-d" slug="c-vs-d" label="C vs D" />
      </>,
    );
    const [firstCard, secondCard] = [...container.querySelectorAll('a')];

    clickCard(firstCard);
    expect(firstCard.querySelector('h3')!.style.viewTransitionName).toBe('compare-title');

    // Back → bfcache restore keeps the first card's inline name; the next
    // click must not leave two `compare-title` elements in one document
    // (duplicate names make the browser skip the transition entirely).
    restoreFromBfcache();
    clickCard(secondCard);

    expect(secondCard.querySelector('h3')!.style.viewTransitionName).toBe('compare-title');
    expect(firstCard.querySelector('h3')!.style.viewTransitionName).toBe('');
  });
});
