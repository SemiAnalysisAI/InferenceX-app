// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/url-state', () => ({
  buildShareUrl: () => 'https://inferencex.semianalysis.com/?g_model=dsr1#inference',
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

const localeState = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => localeState.pathname }));

import { ShareButton } from '@/components/ui/share-button';

let container: HTMLDivElement;
let root: Root;

function renderUi(ui: React.ReactNode) {
  act(() => root.render(ui));
}

beforeEach(() => {
  localeState.pathname = '/';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ShareButton', () => {
  it('renders Chinese trigger, dialog chrome, and accessible input name on a Chinese route', () => {
    localeState.pathname = '/zh/inference';
    renderUi(<ShareButton />);

    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="share-button"]');
    expect(trigger?.textContent).toContain('分享');
    expect(trigger?.title).toBe('分享当前视图');
    act(() => trigger?.click());

    expect(document.querySelector('[data-testid="share-popover"]')?.textContent).toContain(
      '复制链接',
    );
    expect(
      document.querySelector('[data-testid="share-url-input"]')?.getAttribute('aria-label'),
    ).toBe('当前视图的分享链接');
    expect(document.body.textContent).not.toContain('Share this view');
  });

  it('renders a closed popover trigger by default', () => {
    renderUi(<ShareButton />);

    const trigger = container.querySelector('[data-testid="share-button"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('Share');
    // Popover content lives in a portal and is not in the DOM until opened.
    expect(document.querySelector('[data-testid="share-popover"]')).toBeNull();
  });

  it('opens the popover with the share URL pre-filled when the trigger is clicked', () => {
    renderUi(<ShareButton />);

    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="share-button"]');
    expect(trigger).not.toBeNull();

    act(() => trigger?.click());

    const input = document.querySelector<HTMLInputElement>('[data-testid="share-url-input"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('https://inferencex.semianalysis.com/?g_model=dsr1#inference');

    // Copy + social buttons live inside the popover content.
    expect(document.querySelector('[data-testid="share-copy-button"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="share-twitter"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="share-linkedin"]')).not.toBeNull();
  });
});
