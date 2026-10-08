// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToolAnalyticsPage from '@/components/agentic-workload-explorer/views/tool-analytics-view';

const READY_ANALYTICS = {
  toolCounts: [],
  transitions: [],
  sessionToolStats: [],
  toolErrorRates: [],
  toolErrorRatesByOs: [],
  verificationSummary: {
    sessionsAnalyzed: 0,
    editedSessions: 0,
    noEditSessions: 0,
    verifiedEditedSessions: 0,
    unverifiedEditedSessions: 0,
    verifiedPassSessions: 0,
    failRecoveredSessions: 0,
    failUnrecoveredSessions: 0,
    ambiguousSessions: 0,
    verificationAttempts: 0,
    verificationAttemptsAfterEdit: 0,
    verificationPasses: 0,
    verificationFailures: 0,
    verificationUnknown: 0,
  },
  verificationByKind: [],
  sessionOutcomeCounts: [],
  toolTimings: {
    coverage: { toolTurns: 0, singleToolTurns: 0, batchTurns: 0 },
    perTool: [],
    histogram: [],
    bashByKind: [],
    bashKindCounts: [],
    bashByBinary: [],
    bashBinaryCounts: [],
    bashBinaryTotal: 0,
  },
  cachedAt: '2026-07-07T12:00:00.000Z',
} as const;

const WARMING_WORKFLOWS = {
  warming: true,
  totalSessions: 0,
  totalCalls: 0,
  collapsedSteps: 0,
  repeatShare: 0,
  longestStreak: null,
  motifs: [],
  streaks: [],
  loops: [],
} as const;

const EMPTY_WORKFLOWS = { ...WARMING_WORKFLOWS, warming: false } as const;

const fetchMock = vi.fn<typeof fetch>();
let container: HTMLDivElement;
let root: Root;
let analyticsRequestNumber: number;
let workflowRequestNumber: number;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-07T12:05:00.000Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  analyticsRequestNumber = 0;
  workflowRequestNumber = 0;

  fetchMock.mockImplementation((input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (url === '/api/v1/agentic-workload-explorer/tool-analytics') {
      analyticsRequestNumber += 1;
      return Promise.resolve(
        Response.json(analyticsRequestNumber === 1 ? { warming: true } : READY_ANALYTICS),
      );
    }
    if (url === '/api/v1/agentic-workload-explorer/tool-analytics/sequences') {
      workflowRequestNumber += 1;
      return Promise.resolve(
        Response.json(workflowRequestNumber === 1 ? WARMING_WORKFLOWS : EMPTY_WORKFLOWS),
      );
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function requestCount(url: string) {
  return fetchMock.mock.calls.filter(([input]) => input === url).length;
}

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  );
  if (!match) throw new Error(`Expected button labeled “${label}”`);
  return match;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(label: string) {
  await act(async () => {
    button(label).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('tool analytics without a cached snapshot', () => {
  it('only re-reads the analytics and workflow caches on explicit reload', async () => {
    act(() => root.render(<ToolAnalyticsPage />));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await flushMicrotasks();

    expect(container.textContent).toContain('Tool analytics are not available in this snapshot');
    expect(container.textContent).not.toContain('automatically');
    button('Reload tool analytics');
    expect(requestCount('/api/v1/agentic-workload-explorer/tool-analytics')).toBe(1);
    expect(requestCount('/api/v1/agentic-workload-explorer/tool-analytics/sequences')).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    });
    expect(requestCount('/api/v1/agentic-workload-explorer/tool-analytics')).toBe(1);

    await click('Reload tool analytics');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushMicrotasks();

    expect(requestCount('/api/v1/agentic-workload-explorer/tool-analytics')).toBe(2);
    expect(container.textContent).toContain('Total Tool Calls');
    expect(container.textContent).toContain('Workflow patterns are not available in this snapshot');
    button('Reload workflow patterns');
    expect(requestCount('/api/v1/agentic-workload-explorer/tool-analytics/sequences')).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    });
    expect(requestCount('/api/v1/agentic-workload-explorer/tool-analytics')).toBe(2);
    expect(requestCount('/api/v1/agentic-workload-explorer/tool-analytics/sequences')).toBe(1);

    await click('Reload workflow patterns');

    expect(requestCount('/api/v1/agentic-workload-explorer/tool-analytics/sequences')).toBe(2);
    expect(container.textContent).toContain(
      'Not enough data to mine workflow patterns (need sessions with 3+ tool calls)',
    );
  });
});
