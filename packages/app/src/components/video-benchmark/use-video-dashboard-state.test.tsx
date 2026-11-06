// @vitest-environment jsdom
import React, { act, StrictMode, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVideoDashboardState } from './use-video-dashboard-state';

type Api = ReturnType<typeof useVideoDashboardState>;

function Harness({ expose }: { expose: (api: Api) => void }) {
  const api = useVideoDashboardState();
  expose(api);
  return <output>{`${api.state.x}|${api.state.y}`}</output>;
}

/**
 * Stands in for the Next.js app router, which patches history.replaceState
 * and sets its own state from inside the patch.
 */
function RouterLike() {
  const [, setSynced] = useState(0);
  useEffect(() => {
    const original = history.replaceState;
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      original.apply(history, args);
      setSynced((n) => n + 1);
    };
    return () => {
      history.replaceState = original;
    };
  }, []);
  return null;
}

let container: HTMLDivElement;
let root: Root;
let api: Api;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  history.replaceState(null, '', '/video');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function mount(children: React.ReactNode) {
  act(() => {
    root.render(<StrictMode>{children}</StrictMode>);
  });
}

describe('useVideoDashboardState', () => {
  it('reads the URL on load and writes each change back once', () => {
    history.replaceState(null, '', '/video?v_y=kjPerVideo');
    const replaceState = vi.spyOn(history, 'replaceState');
    mount(<Harness expose={(value) => (api = value)} />);
    expect(container.textContent).toBe('p90Latency|kjPerVideo');

    replaceState.mockClear();
    // Two patches in one event: React cannot compute the second one eagerly,
    // so it runs while rendering, where Strict Mode replays it.
    act(() => {
      api.update({ x: 'p50Latency' });
      api.update({ y: 'dollarsPerVideo' });
    });

    expect(container.textContent).toBe('p50Latency|dollarsPerVideo');
    expect(location.search).toBe('?v_y=dollarsPerVideo&v_x=p50Latency');
    expect(replaceState).toHaveBeenCalledTimes(2);
  });

  it('never updates the router while the dashboard renders', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(
      <>
        <RouterLike />
        <Harness expose={(value) => (api = value)} />
      </>,
    );

    act(() => {
      api.update({ tier: 'r' });
      api.update({ view: 'table' });
    });

    const renderPhaseUpdates = consoleError.mock.calls
      .map((call) => call.map(String).join(' '))
      .filter((text) => text.includes('while rendering a different component'));
    expect(renderPhaseUpdates).toEqual([]);
    expect(location.search).toBe('?v_tier=r&v_view=table');
  });
});
