// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from './analytics';
import { useDialogCloseTracking } from './use-dialog-close-tracking';
import { SEARCH_TRACK_DELAY_MS, useSearchTracking } from './use-search-tracking';

vi.mock('./analytics', () => ({ track: vi.fn() }));

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true });

let root: Root;

function DialogProbe({ open }: { open: boolean }) {
  useDialogCloseTracking(open, 'share_popover_closed', { chart: 'chart-0' });
  return null;
}

function SearchProbe({ query }: { query: string }) {
  useSearchTracking('glossary_searched', query, { results: query.length });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.mocked(track).mockClear();
});

describe('useDialogCloseTracking', () => {
  it('tracks only the open to closed transition, with duration', () => {
    act(() => root.render(<DialogProbe open={false} />));
    expect(track).not.toHaveBeenCalled();
    act(() => root.render(<DialogProbe open />));
    vi.advanceTimersByTime(1500);
    act(() => root.render(<DialogProbe open={false} />));
    act(() => root.render(<DialogProbe open={false} />));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('share_popover_closed', {
      chart: 'chart-0',
      duration_ms: 1500,
    });
  });
});

describe('useSearchTracking', () => {
  it('sends query_length after typing pauses, never the text, and skips repeats', () => {
    act(() => root.render(<SearchProbe query="h" />));
    act(() => root.render(<SearchProbe query="h100 " />));
    act(() => vi.advanceTimersByTime(SEARCH_TRACK_DELAY_MS));
    expect(vi.mocked(track).mock.calls).toEqual([
      ['glossary_searched', { results: 5, query_length: 4 }],
    ]);

    act(() => root.render(<SearchProbe query="h100" />));
    act(() => vi.advanceTimersByTime(SEARCH_TRACK_DELAY_MS));
    expect(track).toHaveBeenCalledTimes(1);

    act(() => root.render(<SearchProbe query="" />));
    act(() => root.render(<SearchProbe query="h100" />));
    act(() => vi.advanceTimersByTime(SEARCH_TRACK_DELAY_MS));
    expect(track).toHaveBeenCalledTimes(2);
  });
});
