// @test-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { settle } from '@/test/helpers';

import { MultiSelect } from '@/components/ui/multi-select';

mock.module('next/navigation', () => ({ usePathname: () => '/infx/inference' }));
mock.module('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Chart({ precisions, pending }: { precisions: string[]; pending: Promise<void> }) {
  if (precisions.includes('fp4')) React.use(pending);
  return <p data-testid="chart">{precisions.join(',')}</p>;
}

function Page({ pending }: { pending: Promise<void> }) {
  const [precisions, setPrecisions] = React.useState(['fp8']);
  return (
    <>
      <MultiSelect
        options={[
          { value: 'fp4', label: 'FP4' },
          { value: 'fp8', label: 'FP8' },
        ]}
        value={precisions}
        onChange={setPrecisions}
        triggerTestId="precision"
      />
      <React.Suspense fallback={<p data-testid="fallback" />}>
        <Chart precisions={precisions} pending={pending} />
      </React.Suspense>
    </>
  );
}

describe('MultiSelect', () => {
  it('shows the pick at once and leaves what it re-renders to a transition', async () => {
    const { promise: pending, resolve: release } = Promise.withResolvers<void>();
    act(() => root.render(<Page pending={pending} />));
    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="precision"]')!;
    act(() => trigger.click());
    const option = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (item) => item.textContent === 'FP4',
    )!;
    await act(() => option.click());
    // A synchronous update would swap the chart for its fallback while the new data loads.
    const chips = [...container.querySelectorAll('[data-slot="select-chip"]')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['FP8', 'FP4']);
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();
    expect(container.querySelector('[data-testid="chart"]')?.textContent).toBe('fp8');
    release();
    await settle();
    expect(container.querySelector('[data-testid="chart"]')?.textContent).toBe('fp8,fp4');
  });
});
