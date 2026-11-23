// @test-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { act, Component, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { modelSystemPower } from './modeled-system-power';
import {
  createSystemPowerModelerStore,
  loadSystemPowerModeler,
  useSystemPowerModeler,
  type SystemPowerModeler,
} from './system-power-modeler';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ useModeler = useSystemPowerModeler }: { useModeler?: () => unknown }) {
  const modeler = useModeler();
  return createElement('span', null, modeler === modelSystemPower ? 'loaded' : 'loading');
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: undefined as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error === undefined
      ? this.props.children
      : createElement('span', null, `error: ${(this.state.error as Error).message}`);
  }
}

/** A loader whose latest call resolves or rejects when the test says so. */
function controlledLoader() {
  let latest = Promise.withResolvers<SystemPowerModeler>();
  const load = vi.fn(() => {
    latest = Promise.withResolvers<SystemPowerModeler>();
    return latest.promise;
  });
  return { load, settle: () => latest };
}

function mount(useModeler: () => unknown) {
  const container = document.createElement('div');
  const root = createRoot(container);
  // A new key remounts the boundary, as an error boundary's retry does.
  const render = (key: number) =>
    act(() =>
      root.render(createElement(Boundary, { key, children: createElement(Probe, { useModeler }) })),
    );
  return { container, root, render };
}

const flush = () => act(async () => {});
/** Settles the pending import inside `act`, so React commits what the store notifies. */
const settleInAct = (settle: () => void) =>
  act(async () => {
    settle();
    await Promise.resolve();
  });

describe('system power modeler', () => {
  it('resolves with the power model', async () => {
    expect(await loadSystemPowerModeler()).toBe(modelSystemPower);
    expect(await loadSystemPowerModeler()).toBe(modelSystemPower);
  });

  it('shares one import between loads that overlap', () => {
    const loader = controlledLoader();
    const store = createSystemPowerModelerStore(loader.load);
    expect(store.load()).toBe(store.load());
    expect(loader.load).toHaveBeenCalledTimes(1);
  });

  it('renders without the model on the server, so the chart stays loading there', () => {
    expect(renderToString(createElement(Probe))).toBe('<span>loading</span>');
  });

  it('hands the loaded model to the browser render', async () => {
    await loadSystemPowerModeler();
    const { container, root, render } = mount(useSystemPowerModeler);
    render(0);
    expect(container.textContent).toBe('loaded');
    act(() => root.unmount());
  });
});

describe('system power modeler failures', () => {
  // React logs every error a boundary catches.
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('throws a failed load to the error boundary while a chart waits on it', async () => {
    const loader = controlledLoader();
    const store = createSystemPowerModelerStore(loader.load);
    store.load().catch(() => {});
    // The chart is mounted and waiting, as it is when its rows are already cached.
    const { container, root, render } = mount(store.useModeler);
    render(0);
    expect(container.textContent).toBe('loading');

    await settleInAct(() => loader.settle().reject(new Error('ChunkLoadError')));
    expect(container.textContent).toBe('error: ChunkLoadError');
    act(() => root.unmount());
  });

  it("retries the import for the error boundary's retry", async () => {
    const loader = controlledLoader();
    const store = createSystemPowerModelerStore(loader.load);
    store.load().catch(() => {});
    const { container, root, render } = mount(store.useModeler);
    render(0);
    await settleInAct(() => loader.settle().reject(new Error('ChunkLoadError')));
    expect(container.textContent).toBe('error: ChunkLoadError');

    await flush();
    expect(loader.load).toHaveBeenCalledTimes(2);
    await settleInAct(() => loader.settle().resolve(modelSystemPower));
    render(1);
    expect(container.textContent).toBe('loaded');
    act(() => root.unmount());
  });

  it('retries a load that failed before any chart mounted', async () => {
    const loader = controlledLoader();
    const store = createSystemPowerModelerStore(loader.load);
    const failed = store.load();
    loader.settle().reject(new Error('offline'));
    await expect(failed).rejects.toThrow('offline');

    const { container, root, render } = mount(store.useModeler);
    render(0);
    expect(container.textContent).toBe('error: offline');
    await flush();
    expect(loader.load).toHaveBeenCalledTimes(2);

    render(1);
    expect(container.textContent).toBe('loading');
    await settleInAct(() => loader.settle().resolve(modelSystemPower));
    expect(container.textContent).toBe('loaded');
    act(() => root.unmount());
  });
});
