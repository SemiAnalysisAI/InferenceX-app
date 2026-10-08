// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorData } from '@/lib/agentic-workload-explorer/api-types';

const mocks = vi.hoisted(() => ({
  reload: vi.fn(),
  useDashboardData: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'href'
  >) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/agentic-workload-explorer/use-trace-version', () => ({
  useTraceVersion: () => ({ apiParam: null }),
  appendTraceVersion: (url: string) => url,
}));

vi.mock('@/hooks/agentic-workload-explorer/use-dashboard-data', () => ({
  useDashboardData: mocks.useDashboardData,
}));

import ErrorsPage from '@/components/agentic-workload-explorer/views/errors-view';

const staleSnapshot: ErrorData = {
  summary: {
    totalErrors: 42,
    totalRequests: 1_000,
    errorsToday: 8,
    errorRate: 4.2,
  },
  timeline: [
    { hour: '2026-07-01T00:00:00.000Z', errorCount: 0, totalCount: 100 },
    { hour: '2026-07-01T01:00:00.000Z', errorCount: 0, totalCount: 100 },
    { hour: '2026-07-01T02:00:00.000Z', errorCount: 0, totalCount: 100 },
    { hour: '2026-07-01T03:00:00.000Z', errorCount: 10, totalCount: 100 },
  ],
  statusCodes: [{ statusCode: 500, count: 42 }],
  byModel: [{ model: 'stale-model-visible', errorCount: 42, totalCount: 100 }],
  recentErrors: [],
  errorReach: {
    windowDays: 30,
    overall: {
      client: '(all)',
      requestCount: 1000,
      errorCount: 42,
      requestErrorRate: 0.042,
      sessionCount: 100,
      affectedSessionCount: 12,
      affectedSessionRate: 0.12,
      repeatErrorSessionCount: 5,
      repeatErrorCount: 35,
      repeatErrorShare: 35 / 42,
      avgErrorsPerAffectedSession: 3.5,
      p50ErrorsPerAffectedSession: 2,
      p90ErrorsPerAffectedSession: 8,
      maxErrorsInSession: 12,
      topSessionErrorShare: 12 / 42,
      topTenErrorShare: 1,
    },
    byClient: [],
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.reload.mockClear();
  mocks.useDashboardData.mockReset();
  mocks.useDashboardData.mockReturnValue({
    data: staleSnapshot,
    loading: false,
    error: new Error('refresh gateway timeout'),
    reload: mocks.reload,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function normalizedText(element: Element | null) {
  if (!element) throw new Error('Expected element to exist');
  return element.textContent?.replaceAll(/\s+/gu, ' ').trim() ?? '';
}

describe('errors page refresh failure', () => {
  it('keeps previously loaded data and lets the operator retry', () => {
    act(() => root.render(<ErrorsPage />));

    const alert = container.querySelector('[role="alert"]');
    expect(normalizedText(alert)).toContain('Reload failed · showing previously loaded data');
    expect(normalizedText(alert)).toContain('refresh gateway timeout');

    const totalErrorsLabel = [...container.querySelectorAll('div')].find(
      (element) => normalizedText(element) === 'Total Errors',
    );
    expect(normalizedText(totalErrorsLabel?.parentElement ?? null)).toContain('42');
    expect(normalizedText(container)).toContain('stale-model-visible');

    const retry = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => normalizedText(button) === 'Retry',
    );
    if (!retry) throw new Error('Expected retry refresh control');
    act(() => {
      retry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});
