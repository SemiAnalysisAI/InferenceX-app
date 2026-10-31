// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    prefetch,
    href,
    ...props
  }: React.ComponentProps<'a'> & { prefetch?: boolean | null; href: string }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props} />
  ),
}));

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const link = () => container.querySelector('a')!;

describe('IntentPrefetchLink', () => {
  it('does not prefetch while the link is merely on screen', () => {
    act(() => root.render(<IntentPrefetchLink href="/overview">Overview</IntentPrefetchLink>));
    expect(link().dataset.prefetch).toBe('false');
  });

  it.each([
    ['hover', 'mouseover'],
    ['focus', 'focusin'],
  ] as const)('restores default prefetch after %s', (_intent, eventType) => {
    const onMouseEnter = vi.fn();
    const onFocus = vi.fn();
    act(() =>
      root.render(
        <IntentPrefetchLink href="/overview" onMouseEnter={onMouseEnter} onFocus={onFocus}>
          Overview
        </IntentPrefetchLink>,
      ),
    );
    act(() => {
      link().dispatchEvent(new Event(eventType, { bubbles: true }));
    });
    expect(link().dataset.prefetch).toBe('null');
    expect(onMouseEnter.mock.calls.length + onFocus.mock.calls.length).toBe(1);
  });

  it('keeps an explicitly disabled prefetch off after intent', () => {
    act(() =>
      root.render(
        <IntentPrefetchLink href="/overview" prefetch={false}>
          Overview
        </IntentPrefetchLink>,
      ),
    );
    act(() => {
      link().dispatchEvent(new Event('focusin', { bubbles: true }));
    });
    expect(link().dataset.prefetch).toBe('false');
  });
});
