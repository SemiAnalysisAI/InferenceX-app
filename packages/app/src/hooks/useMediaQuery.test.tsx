// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stubMatchMedia } from '@/test/match-media-stub';

import { MOBILE_VIEWPORT_QUERY, useIsMobileViewport, useMediaQuery } from './useMediaQuery';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

function Probe({ query }: { query?: string }) {
  const mobile = useIsMobileViewport();
  const custom = useMediaQuery(query ?? '(min-width: 1px)');
  return <output data-mobile={String(mobile)} data-custom={String(custom)} />;
}

const read = (attr: string) => container.querySelector('output')!.getAttribute(attr);

describe('useMediaQuery', () => {
  it('reads the current match and follows viewport changes', () => {
    const mq = stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: true });
    act(() => root.render(<Probe />));
    expect(read('data-mobile')).toBe('true');
    act(() => mq.set(MOBILE_VIEWPORT_QUERY, false));
    expect(read('data-mobile')).toBe('false');
  });

  it('unsubscribes when the component unmounts', () => {
    const mq = stubMatchMedia({ '(min-width: 1px)': true });
    act(() => root.render(<Probe />));
    expect(read('data-custom')).toBe('true');
    expect(mq.listenerCount('(min-width: 1px)')).toBe(1);
    act(() => root.render(<div />));
    expect(mq.listenerCount('(min-width: 1px)')).toBe(0);
  });
});
