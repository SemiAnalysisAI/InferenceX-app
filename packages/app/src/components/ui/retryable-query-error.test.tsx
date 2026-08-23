// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: { value: '/zh/inference' },
  track: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname.value }));
vi.mock('@/lib/analytics', () => ({ track: mocks.track }));

import { RetryableQueryError } from './retryable-query-error';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.pathname.value = '/zh/inference';
  mocks.track.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('RetryableQueryError', () => {
  it('renders a localized retry action and records analytics before refetch', () => {
    const refetch = vi.fn();
    act(() =>
      root.render(
        <RetryableQueryError
          message="评估数据加载失败。"
          analyticsEvent="evaluation_data_retry_clicked"
          onRetry={refetch}
          testId="evaluation-query-error"
        />,
      ),
    );

    expect(container.textContent).toContain('评估数据加载失败。');
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('重试');
    act(() => button?.click());
    expect(mocks.track).toHaveBeenCalledWith('evaluation_data_retry_clicked');
    expect(refetch).toHaveBeenCalledOnce();
    expect(mocks.track.mock.invocationCallOrder[0]).toBeLessThan(
      refetch.mock.invocationCallOrder[0],
    );
  });
});
