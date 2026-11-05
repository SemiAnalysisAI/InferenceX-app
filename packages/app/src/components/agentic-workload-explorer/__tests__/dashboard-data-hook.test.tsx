// @vitest-environment jsdom

import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface HarnessProps {
  fetcher: (signal?: AbortSignal) => Promise<string>;
  enabled?: boolean;
  requestKey?: string;
}

function DashboardDataHarness({ fetcher, enabled = true, requestKey }: HarnessProps) {
  const { data, loading, error, reload } = useDashboardData({
    fetcher,
    enabled,
    key: requestKey,
  });

  return (
    <>
      <output
        data-loading={String(loading)}
        data-error={error?.message ?? ''}
        data-value={data ?? ''}
      />
      <button type="button" onClick={reload}>
        Reload
      </button>
    </>
  );
}

let container: HTMLDivElement;
let root: Root;
let mounted: boolean;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});

afterEach(() => {
  if (mounted) act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function view() {
  const output = container.querySelector('output');
  if (!output) throw new Error('Dashboard data harness did not render');
  return {
    loading: output.dataset.loading === 'true',
    error: output.dataset.error,
    value: output.dataset.value,
  };
}

async function renderHarness(props: HarnessProps, strictMode = false) {
  const harness = <DashboardDataHarness {...props} />;
  await act(async () => {
    root.render(strictMode ? <StrictMode>{harness}</StrictMode> : harness);
    await Promise.resolve();
  });
}

async function flushRequestTimers() {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
}

async function clickReload() {
  const button = container.querySelector('button');
  if (!button) throw new Error('Dashboard data harness did not render reload');
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

async function settle(action: () => void) {
  await act(async () => {
    action();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useDashboardData', () => {
  it('starts one underlying fetch after StrictMode preflight timers flush', async () => {
    const request = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockReturnValue(request.promise);

    await renderHarness({ fetcher, requestKey: 'stable' }, true);

    expect(fetcher).not.toHaveBeenCalled();
    expect(view()).toEqual({ loading: true, error: '', value: '' });

    await flushRequestTimers();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(view()).toEqual({ loading: true, error: '', value: '' });

    await settle(() => request.resolve('initial'));
    expect(view()).toEqual({ loading: false, error: '', value: 'initial' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31 * 24 * 60 * 60 * 1_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reloads a stable key exactly once and resets loading until the new data arrives', async () => {
    const first = deferred<string>();
    const reloaded = deferred<string>();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(reloaded.promise);

    await renderHarness({ fetcher, requestKey: 'stable' });
    await flushRequestTimers();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await settle(() => first.resolve('initial result'));
    expect(view()).toEqual({ loading: false, error: '', value: 'initial result' });

    await clickReload();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(view()).toEqual({ loading: true, error: '', value: 'initial result' });

    await flushRequestTimers();
    expect(fetcher).toHaveBeenCalledTimes(2);

    await settle(() => reloaded.resolve('reloaded result'));
    expect(view()).toEqual({ loading: false, error: '', value: 'reloaded result' });
  });

  it('stays idle and does not fetch or reload while disabled', async () => {
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValue('unexpected');

    await renderHarness({ fetcher, enabled: false, requestKey: 'stable' }, true);
    await flushRequestTimers();

    expect(fetcher).not.toHaveBeenCalled();
    expect(view()).toEqual({ loading: false, error: '', value: '' });

    await clickReload();
    await flushRequestTimers();

    expect(fetcher).not.toHaveBeenCalled();
    expect(view()).toEqual({ loading: false, error: '', value: '' });
  });

  it('aborts a superseded request and keeps newer data when it completes late', async () => {
    const oldRequest = deferred<string>();
    const newRequest = deferred<string>();
    const fetcher = vi
      .fn<(signal?: AbortSignal) => Promise<string>>()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    await renderHarness({ fetcher, requestKey: 'old' });
    await flushRequestTimers();
    expect(fetcher).toHaveBeenCalledTimes(1);

    const oldSignal = fetcher.mock.calls[0]?.[0];
    expect(oldSignal).toBeDefined();
    expect(oldSignal?.aborted).toBe(false);

    await renderHarness({ fetcher, requestKey: 'new' });
    expect(oldSignal?.aborted).toBe(true);
    await flushRequestTimers();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const newSignal = fetcher.mock.calls[1]?.[0];
    expect(newSignal).toBeDefined();
    expect(newSignal).not.toBe(oldSignal);
    expect(newSignal?.aborted).toBe(false);
    expect(view()).toEqual({ loading: true, error: '', value: '' });

    await settle(() => newRequest.resolve('current result'));
    expect(view()).toEqual({ loading: false, error: '', value: 'current result' });

    await settle(() => oldRequest.resolve('stale result'));
    expect(view()).toEqual({ loading: false, error: '', value: 'current result' });
  });

  it('aborts the active request on unmount', async () => {
    const request = deferred<string>();
    const fetcher = vi
      .fn<(signal?: AbortSignal) => Promise<string>>()
      .mockReturnValue(request.promise);

    await renderHarness({ fetcher, requestKey: 'active' });
    await flushRequestTimers();

    const signal = fetcher.mock.calls[0]?.[0];
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    mounted = false;

    expect(signal?.aborted).toBe(true);
  });

  it('reports fetch errors, finishes loading, and recovers on a new key', async () => {
    const failed = deferred<string>();
    const recovered = deferred<string>();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(recovered.promise);

    await renderHarness({ fetcher, requestKey: 'failing' });
    await flushRequestTimers();
    expect(view()).toEqual({ loading: true, error: '', value: '' });

    await settle(() => failed.reject(new Error('request failed')));
    expect(view()).toEqual({ loading: false, error: 'request failed', value: '' });

    await renderHarness({ fetcher, requestKey: 'recovery' });
    expect(view()).toEqual({ loading: true, error: 'request failed', value: '' });
    await flushRequestTimers();
    expect(fetcher).toHaveBeenCalledTimes(2);

    await settle(() => recovered.resolve('recovered'));
    expect(view()).toEqual({ loading: false, error: '', value: 'recovered' });
  });
});
