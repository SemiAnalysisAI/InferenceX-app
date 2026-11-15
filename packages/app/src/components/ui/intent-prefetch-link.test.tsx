// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
let queryClient: QueryClient;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  queryClient = new QueryClient();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

const renderWithClient = (ui: React.ReactNode) =>
  root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

const link = () => container.querySelector('a')!;

const move = (x: number, y: number, t: number, pointerType = 'mouse') => {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    timeStamp: { value: t },
  });
  act(() => {
    window.dispatchEvent(event);
  });
};
const renderAt = (left: number, top: number, width: number, height: number) => {
  act(() => renderWithClient(<IntentPrefetchLink href="/overview">Overview</IntentPrefetchLink>));
  const rect = { left, top, width, height, right: left + width, bottom: top + height };
  link().getBoundingClientRect = () => rect as DOMRect;
};
const setConnection = (connection: { saveData?: boolean; effectiveType?: string }) =>
  Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
const approach = () => {
  move(0, 12, 0);
  move(40, 12, 16);
  move(80, 12, 32);
};
const hover = () =>
  act(() => {
    link().dispatchEvent(new Event('mouseover', { bubbles: true }));
  });

describe('IntentPrefetchLink', () => {
  it('does not prefetch while the link is merely on screen', () => {
    act(() => renderWithClient(<IntentPrefetchLink href="/overview">Overview</IntentPrefetchLink>));
    expect(link().dataset.prefetch).toBe('false');
  });

  it.each([
    ['hover', 'mouseover'],
    ['focus', 'focusin'],
  ] as const)('restores default prefetch after %s', (_intent, eventType) => {
    const onMouseEnter = vi.fn();
    const onFocus = vi.fn();
    act(() =>
      renderWithClient(
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

  it('hands its anchor to a ref passed by a wrapper such as a tooltip trigger', () => {
    const objectRef = React.createRef<HTMLAnchorElement>();
    const callbackRef = vi.fn();
    act(() =>
      renderWithClient(
        <>
          <IntentPrefetchLink href="/overview" ref={objectRef}>
            Overview
          </IntentPrefetchLink>
          <IntentPrefetchLink href="/about" ref={callbackRef}>
            About
          </IntentPrefetchLink>
        </>,
      ),
    );
    const [first, second] = container.querySelectorAll('a');
    expect(objectRef.current).toBe(first);
    expect(callbackRef).toHaveBeenCalledWith(second);
  });

  it('keeps an explicitly disabled prefetch off after intent', () => {
    act(() =>
      renderWithClient(
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

  describe('route data', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise(() => {})),
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it('warms the target page queries on intent, not before', () => {
      act(() =>
        renderWithClient(
          <IntentPrefetchLink href="/infx/submissions">Submissions</IntentPrefetchLink>,
        ),
      );
      expect(queryClient.getQueryState(['submissions'])).toBeUndefined();
      act(() => {
        link().dispatchEvent(new Event('focusin', { bubbles: true }));
      });
      expect(queryClient.getQueryState(['submissions'])?.fetchStatus).toBe('fetching');
    });

    it('does not warm data when prefetch is disabled', () => {
      act(() =>
        renderWithClient(
          <IntentPrefetchLink href="/zh/infx/submissions" prefetch={false}>
            Submissions
          </IntentPrefetchLink>,
        ),
      );
      act(() => {
        link().dispatchEvent(new Event('focusin', { bubbles: true }));
      });
      expect(queryClient.getQueryState(['submissions'])).toBeUndefined();
    });
  });

  describe('pointer trajectory', () => {
    beforeEach(() => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('prefetches when the mouse is heading toward the link before reaching it', () => {
      renderAt(300, 0, 80, 24);
      move(0, 12, 0);
      move(40, 12, 16);
      move(80, 12, 32);
      expect(link().dataset.prefetch).toBe('null');
    });

    it('does not prefetch when the mouse moves away or too slowly to reach it', () => {
      renderAt(300, 0, 80, 24);
      move(200, 12, 0);
      move(160, 12, 16);
      move(120, 12, 32);
      move(120, 200, 48);
      move(121, 200, 200);
      expect(link().dataset.prefetch).toBe('false');
    });

    it('does not reach across the page on a fast flick that is braking', () => {
      renderAt(340, 0, 80, 24);
      move(0, 12, 0);
      move(50, 12, 16);
      move(80, 12, 32);
      move(95, 12, 48);
      expect(link().dataset.prefetch).toBe('false');
    });

    it('caps how far a fast steady movement projects', () => {
      renderAt(450, 0, 80, 24);
      move(0, 12, 0);
      move(60, 12, 16);
      move(120, 12, 32);
      expect(link().dataset.prefetch).toBe('false');
    });

    it('ignores touch and pen pointers', () => {
      renderAt(300, 0, 80, 24);
      move(0, 12, 0, 'touch');
      move(80, 12, 32, 'touch');
      expect(link().dataset.prefetch).toBe('false');
    });

    describe('network and visibility', () => {
      afterEach(() => {
        Reflect.deleteProperty(navigator, 'connection');
        Reflect.deleteProperty(document, 'visibilityState');
      });

      it('neither predicts nor counts hover as intent with Save-Data on, but keeps focus', () => {
        setConnection({ saveData: true, effectiveType: '4g' });
        renderAt(300, 0, 80, 24);
        approach();
        hover();
        expect(link().dataset.prefetch).toBe('false');
        act(() => {
          link().dispatchEvent(new Event('focusin', { bubbles: true }));
        });
        expect(link().dataset.prefetch).toBe('null');
      });

      it.each(['2g', 'slow-2g'])('skips prediction but still prefetches on hover on %s', (type) => {
        setConnection({ effectiveType: type });
        renderAt(300, 0, 80, 24);
        approach();
        expect(link().dataset.prefetch).toBe('false');
        hover();
        expect(link().dataset.prefetch).toBe('null');
      });

      it('skips prediction while the tab is hidden', () => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        renderAt(300, 0, 80, 24);
        approach();
        expect(link().dataset.prefetch).toBe('false');
      });
    });
  });
});
