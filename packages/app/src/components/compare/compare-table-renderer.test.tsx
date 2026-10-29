// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const locale = vi.hoisted(() => ({ current: 'en' as 'en' | 'zh' }));

vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => locale.current }));

import { CompareTableRenderer } from '@/components/compare/compare-table-renderer';
import type { CompareTableData } from '@/lib/compare/compare-table-view';

const SSR_TABLE: CompareTableData = {
  defaultTargets: [13, 15, 18],
  ssrRows: [13, 15, 18].map((target) => ({ target, a: null, b: null })),
  interactivityRange: { min: 10, max: 20 },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  locale.current = 'en';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderTable(overrides: Partial<React.ComponentProps<typeof CompareTableRenderer>>) {
  act(() =>
    root.render(
      <CompareTableRenderer
        aLabel="H100"
        bLabel="B200"
        ssrTableData={SSR_TABLE}
        ssrSequence="1k1k"
        ssrModel="dsr1"
        ssrPrecisions={['fp8']}
        selectedSequence="1k1k"
        effectiveSequence="1k1k"
        sequenceResolved
        selectedModel="dsr1"
        selectedPrecisions={['fp8']}
        effectivePrecisions={['fp8']}
        latestRun
        pointsA={[]}
        pointsB={[]}
        clientInteractivityRange={null}
        loading={false}
        error={null}
        emptyStateText="No data for the default model."
        {...overrides}
      />,
    ),
  );
}

const table = () => container.querySelector('[data-testid="compare-interpolated-table"]');
const status = () => container.querySelector<HTMLElement>('[data-testid="compare-table-status"]');

describe('CompareTableRenderer', () => {
  it('renders the server table for the server sequence', () => {
    renderTable({});
    expect(table()).not.toBeNull();
    expect(status()).toBeNull();
  });

  it('replaces the server table with a loading state for a shared sequence', () => {
    renderTable({ selectedSequence: '8k1k', effectiveSequence: '8k1k', loading: true });
    expect(table()).toBeNull();
    expect(status()?.dataset.status).toBe('loading');
    expect(status()?.textContent).toBe('Loading comparison data for the selected workload…');
  });

  it('reports a failed fetch for the selected sequence', () => {
    renderTable({ selectedSequence: '8k1k', effectiveSequence: '8k1k', error: 'HTTP 500' });
    expect(table()).toBeNull();
    expect(status()?.getAttribute('role')).toBe('alert');
    expect(status()?.textContent).toContain('failed to load');
  });

  it('uses the selection empty state, not the server text, for another sequence', () => {
    locale.current = 'zh';
    renderTable({ selectedSequence: '8k1k', effectiveSequence: '8k1k' });
    expect(status()?.textContent).toBe(
      '所选工作负载暂时没有可用于插值对比的数据。请在下方图表控件中选择其他序列。',
    );
  });

  it('keeps the page empty state for the server sequence', () => {
    renderTable({
      ssrTableData: { defaultTargets: [], ssrRows: [], interactivityRange: { min: 0, max: 100 } },
    });
    expect(status()?.dataset.status).toBe('ssr-empty');
    expect(status()?.textContent).toBe('No data for the default model.');
  });
});
