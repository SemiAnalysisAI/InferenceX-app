// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';

import type { KnownIssueAnnotation } from '@/components/inference/utils/knownIssueAnnotations';
import { KNOWN_CONFIG_ISSUES } from '@/lib/benchmarks/known-issues';

import {
  DISMISSED_CHART_NOTICES_KEY,
  chartNoticeKey,
  useDismissedChartNotices,
} from './use-dismissed-chart-notices';

const preview: KnownIssueAnnotation = {
  preview: { id: 'tpu7x-official-preview', summary: 'InferenceX Official Preview', detail: '' },
  label: 'TPU7x (vLLM)',
  color: '#00f',
  points: [],
};

const issue: KnownIssueAnnotation = {
  issue: KNOWN_CONFIG_ISSUES[0],
  label: 'GB300',
  color: '#0f0',
  points: [],
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<T>(hook: () => T): { result: { current: T } } {
  const result = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(createElement(TestComponent));
  });
  return { result };
}

beforeEach(() => localStorage.clear());

describe('chartNoticeKey', () => {
  it('keys previews by id and known issues by issue and hardware', () => {
    expect(chartNoticeKey(preview)).toBe('preview:tpu7x-official-preview');
    expect(chartNoticeKey(issue)).toBe(
      `issue:${KNOWN_CONFIG_ISSUES[0].issueRef}:${KNOWN_CONFIG_ISSUES[0].hwKey}`,
    );
  });
});

describe('useDismissedChartNotices', () => {
  it('persists dismissals and shares them across hook instances', () => {
    const a = renderHook(() => useDismissedChartNotices());
    const b = renderHook(() => useDismissedChartNotices());
    expect(a.result.current.dismissed.size).toBe(0);

    act(() => a.result.current.dismiss(preview));

    expect(a.result.current.dismissed.has(chartNoticeKey(preview))).toBe(true);
    expect(b.result.current.dismissed.has(chartNoticeKey(preview))).toBe(true);
    expect(b.result.current.dismissed.has(chartNoticeKey(issue))).toBe(false);
    expect(JSON.parse(localStorage.getItem(DISMISSED_CHART_NOTICES_KEY)!)).toEqual([
      'preview:tpu7x-official-preview',
    ]);
  });

  it('ignores malformed storage', () => {
    localStorage.setItem(DISMISSED_CHART_NOTICES_KEY, '{bad');
    const { result } = renderHook(() => useDismissedChartNotices());
    expect(result.current.dismissed.size).toBe(0);
  });
});
