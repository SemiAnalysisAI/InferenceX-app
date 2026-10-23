// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncidentSignalRail } from '@/components/agentic-workload-explorer/incident-signal-rail';
import { ModelImpactMatrix } from '@/components/agentic-workload-explorer/model-impact-matrix';
import type { ErrorData } from '@/lib/agentic-workload-explorer/api-types';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(element: React.ReactNode) {
  act(() => root.render(element));
}

function text(element: Element | null) {
  if (!element) throw new Error('Expected element to exist');
  return element.textContent?.replaceAll(/\s+/gu, ' ').trim() ?? '';
}
function descendantTexts(element: Element | null) {
  if (!element) throw new Error('Expected element to exist');
  return [...element.querySelectorAll('*')].map((descendant) => text(descendant));
}

function modelOrder() {
  return [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((row) => {
    const heading = row.querySelector<HTMLTableCellElement>('th[scope="row"]');
    if (!heading) throw new Error('Expected every model row to have a row heading');
    return text(heading);
  });
}

describe('IncidentSignalRail', () => {
  it('exposes the bounded timeline and moves the selected-hour details with arrow keys', () => {
    const timeline: ErrorData['timeline'] = [
      { hour: '2026-07-01T00:00:00.000Z', errorCount: 0, totalCount: 100 },
      { hour: '2026-07-01T01:00:00.000Z', errorCount: 0, totalCount: 100 },
      { hour: '2026-07-01T02:00:00.000Z', errorCount: 0, totalCount: 100 },
      { hour: '2026-07-01T03:00:00.000Z', errorCount: 10, totalCount: 100 },
      { hour: '2026-07-01T04:00:00.000Z', errorCount: 0, totalCount: 100 },
    ];

    render(<IncidentSignalRail data={timeline} />);

    const rail = container.querySelector<SVGSVGElement>('svg[role="group"]');
    expect(rail?.getAttribute('aria-label')).toContain('Use arrow keys to inspect hours');

    const hours = [...container.querySelectorAll<SVGGElement>('g[role="button"]')];
    expect(hours).toHaveLength(timeline.length);
    expect(hours.every((hour) => Boolean(hour.getAttribute('aria-label')))).toBe(true);
    expect(hours[3].getAttribute('aria-label')).toContain(
      'Critical, 10 errors across 100 requests, 10.0% error rate, 0.00% trailing baseline',
    );

    act(() => {
      hours[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(hours[2].getAttribute('aria-pressed')).toBe('true');

    act(() => {
      hours[2].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
    });

    expect(hours[3].getAttribute('aria-pressed')).toBe('true');
    expect(hours[2].getAttribute('aria-pressed')).toBe('false');
    const selectedDetails = container.querySelector('[aria-live="polite"]');
    expect(text(selectedDetails)).toContain('Critical');
    expect(text(selectedDetails)).toContain('Severely above the trailing baseline');
    const details = descendantTexts(selectedDetails);
    expect(details).toEqual(expect.arrayContaining(['Error rate', '10.0%', '10 errors']));
    expect(details).toEqual(expect.arrayContaining(['Volume', '100', 'requests']));
    expect(details).toEqual(expect.arrayContaining(['Trailing baseline', '0.00%', '+10.00 pp']));
    expect(text(container)).toContain('1 anomalous hour');
  });

  it('ignores sparse points older than 24 hours when establishing the trailing baseline', () => {
    const timeline: ErrorData['timeline'] = [
      { hour: '2026-07-01T21:00:00.000Z', errorCount: 1, totalCount: 100 },
      { hour: '2026-07-01T22:00:00.000Z', errorCount: 1, totalCount: 100 },
      { hour: '2026-07-01T23:00:00.000Z', errorCount: 1, totalCount: 100 },
      { hour: '2026-07-03T02:00:00.000Z', errorCount: 1, totalCount: 100 },
      { hour: '2026-07-03T23:00:00.000Z', errorCount: 1, totalCount: 100 },
      { hour: '2026-07-04T00:00:00.000Z', errorCount: 10, totalCount: 100 },
    ];

    render(<IncidentSignalRail data={timeline} />);

    const currentHour = [...container.querySelectorAll<SVGGElement>('g[role="button"]')].at(-1);
    expect(currentHour?.getAttribute('aria-label')).toContain(
      'Watch, 10 errors across 100 requests, 10.0% error rate, baseline learning',
    );

    const selectedDetails = container.querySelector('[aria-live="polite"]');
    expect(descendantTexts(selectedDetails)).toEqual(
      expect.arrayContaining(['Trailing baseline', 'Learning', 'needs 3 prior hours']),
    );
  });
});

describe('ModelImpactMatrix', () => {
  it('orders models by impact, exposes text severity, and updates order and aria-sort together', () => {
    const models: ErrorData['byModel'] = [
      { model: 'bursting-critical', errorCount: 5, totalCount: 20 },
      { model: 'bulk-stable', errorCount: 9, totalCount: 2_000 },
      { model: 'degraded-watch', errorCount: 2, totalCount: 100 },
      { model: 'elevated-errors', errorCount: 6, totalCount: 100 },
      { model: 'idle-model', errorCount: 0, totalCount: 0 },
    ];

    render(<ModelImpactMatrix data={models} />);

    expect(text(container)).toContain('5 models ranked by all-time error burden');

    expect(modelOrder()).toEqual([
      'bulk-stable',
      'elevated-errors',
      'bursting-critical',
      'degraded-watch',
      'idle-model',
    ]);

    const initialRows = [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(initialRows.map((row) => text(row.querySelector('td:last-child')))).toEqual([
      'Nominal',
      'Elevated',
      'Critical',
      'Watch',
      'No traffic',
    ]);
    expect(
      container.querySelector('th[aria-sort="descending"] button')?.getAttribute('aria-label'),
    ).toBe('Sort by Errors, currently descending');

    const severitySort = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sort by Severity"]',
    );
    if (!severitySort) throw new Error('Expected severity sort control');
    act(() => {
      severitySort.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(modelOrder()).toEqual([
      'bursting-critical',
      'elevated-errors',
      'degraded-watch',
      'bulk-stable',
      'idle-model',
    ]);
    expect(severitySort.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(
      container
        .querySelector('button[aria-label^="Sort by Errors"]')
        ?.closest('th')
        ?.getAttribute('aria-sort'),
    ).toBe('none');
  });
});
