// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearPowerTraceFocus,
  peekPowerTraceFocus,
  requestPowerTraceFocus,
} from '@/components/inference/utils/powerTimeline';

import { useRequestedPowerTraceFocus } from './useRequestedPowerTraceFocus';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const KEY = '39373853347:kimik3_p1x16_d1x16_conc48_fp4_dynamo-vllm_conc48';

function Probe() {
  const requested = useRequestedPowerTraceFocus();
  return <span data-requested={requested.current ?? ''} />;
}

function mount(): { requested: string | null; unmount: () => void } {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  const requested = host.querySelector('span')?.dataset.requested || null;
  return { requested, unmount: () => act(() => root.unmount()) };
}

describe('useRequestedPowerTraceFocus', () => {
  afterEach(() => {
    const pending = peekPowerTraceFocus();
    if (pending) clearPowerTraceFocus(pending);
  });

  it('keeps the pinned point focus when React discards the first render', () => {
    requestPowerTraceFocus(KEY);
    // A render that never commits, like an interrupted or suspended mount.
    renderToString(<Probe />);
    const first = mount();
    expect(first.requested).toBe(KEY);
    first.unmount();
  });

  it('applies a request to one committed timeline only', () => {
    requestPowerTraceFocus(KEY);
    mount().unmount();
    const later = mount();
    expect(later.requested).toBeNull();
    later.unmount();
  });

  it('does not clear a newer request', () => {
    requestPowerTraceFocus('1:older');
    clearPowerTraceFocus('2:other');
    expect(peekPowerTraceFocus()).toBe('1:older');
  });
});
