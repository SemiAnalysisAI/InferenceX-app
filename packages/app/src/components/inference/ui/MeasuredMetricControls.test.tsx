// @test-environment jsdom
import React, { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, mock, vi } from 'bun:test';
import { settle } from '@/test/helpers';

mock.module('next/navigation', () => ({ usePathname: () => '/infx/inference' }));
mock.module('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
// A native select stands in for Radix, which jsdom cannot open.
mock.module('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
}));

import { MeasuredMetricControls } from './MeasuredMetricControls';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Page() {
  const [metric, setMetric] = React.useState('y_measuredJPerTotalToken');
  return (
    <>
      <MeasuredMetricControls metric={metric} onChange={setMetric} />
      <p data-testid="metric">{metric}</p>
    </>
  );
}

const requested: string[] = [];
let commitMetric: (metric: string) => void = () => {};

/** Commits picks only when the test says so, the way separate transitions land one by one. */
function QueuedPage() {
  const [metric, setMetric] = React.useState('y_measuredJPerTotalToken');
  commitMetric = setMetric;
  return (
    <>
      <MeasuredMetricControls metric={metric} onChange={(next) => requested.push(next)} />
      <p data-testid="metric">{metric}</p>
    </>
  );
}

async function pickBasis(container: HTMLElement, basis: string) {
  act(() => container.querySelector<HTMLButtonElement>('#measured-energy-basis')!.click());
  await settle();
  act(() =>
    document.body
      .querySelector<HTMLElement>(`[data-select-option][data-value="${basis}"]`)!
      .click(),
  );
}

describe('MeasuredMetricControls', () => {
  it('keeps a basis pick when another control changes before that pick renders', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<Page />));
    const basis = container.querySelector<HTMLButtonElement>('#measured-energy-basis')!;
    act(() => basis.click());
    await settle();
    const modeled = document.body.querySelector<HTMLElement>(
      '[data-select-option][data-value="it-modeled"]',
    )!;
    const denominator = [...container.querySelectorAll('select')].find((select) =>
      select.querySelector('option[value="query"]'),
    )!;
    act(() => {
      modeled.click();
      denominator.value = 'output';
      denominator.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="metric"]')?.textContent).toBe(
      'y_itModeledJPerOutputToken',
    );
    act(() => root.unmount());
    container.remove();
  });

  it('keeps every pick when an earlier one commits while later ones are in flight', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<QueuedPage />));
    await pickBasis(container, 'it-modeled');
    const denominator = [...container.querySelectorAll('select')].find((select) =>
      select.querySelector('option[value="query"]'),
    )!;
    act(() => {
      denominator.value = 'output';
      denominator.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => commitMetric(requested[0]));
    await pickBasis(container, 'utility-modeled');
    act(() => commitMetric(requested[1]));
    act(() => commitMetric(requested[2]));
    expect(requested).toEqual([
      'y_itModeledJPerTotalToken',
      'y_itModeledJPerOutputToken',
      'y_utilityModeledJPerOutputToken',
    ]);
    expect(container.querySelector('[data-testid="metric"]')?.textContent).toBe(
      'y_utilityModeledJPerOutputToken',
    );
    act(() => root.unmount());
    container.remove();
  });
});
