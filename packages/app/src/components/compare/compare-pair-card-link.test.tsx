// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics/analytics', () => ({
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
  href: '#a-vs-b',
  slug: 'a-vs-b',
  label: 'A vs B',
  archLine: 'arch',
};

describe('ComparePairCardLink bfcache restore', () => {
  it('keeps the comparison card focusable with its original destination', () => {
    renderUi(<ComparePairCardLink {...cardProps} />);
    const anchor = container.querySelector('a')!;

    anchor.focus();
    expect(document.activeElement).toBe(anchor);
    expect(anchor.getAttribute('href')).toBe(cardProps.href);
  });

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

    restoreFromBfcache();
    clickCard(secondCard);

    expect(secondCard.querySelector('h3')!.style.viewTransitionName).toBe('compare-title');
    expect(firstCard.querySelector('h3')!.style.viewTransitionName).toBe('');
  });
});
