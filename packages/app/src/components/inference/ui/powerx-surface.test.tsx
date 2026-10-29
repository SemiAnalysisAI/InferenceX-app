// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

const mocks = vi.hoisted(() => ({ coarse: false }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobileViewport: () => false,
  useIsCoarsePointer: () => mocks.coarse,
  useMediaQuery: () => false,
}));

import { PowerXReadout } from '../powerx/PowerXLayout';
import {
  PowerXSurfaceProvider,
  usePowerXActivePoint,
  useSetPowerXActivePoint,
  type PowerXActivePointUpdate,
} from './powerx-surface';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const metric = (y: number) => ({ y, roof: false });
const point = (conc: number, x: number): InferenceData =>
  ({
    id: conc,
    hwKey: 'b200_sglang',
    hw: 'B200',
    framework: 'sglang',
    model: 'dsv4pro',
    precision: 'fp8',
    conc,
    x,
    y: 10,
    date: '2026-10-23',
    measuredAvgPower: metric(700),
    itModeledWatts: metric(1000),
    utilityModeledWatts: metric(1300),
    modeledSystemPower: { status: 'supported', pue: 1.3 },
  }) as unknown as InferenceData;

const hovered = point(16, 60);
const scrubbed = point(32, 40);
const pinned = point(8, 100);

let setter: ((update: PowerXActivePointUpdate) => void) | null = null;
function Probe() {
  const set = useSetPowerXActivePoint();
  const active = usePowerXActivePoint();
  useEffect(() => {
    setter = set;
  }, [set]);
  return (
    <output data-testid="active">{active ? `${active.source}:${active.point.conc}` : ''}</output>
  );
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.coarse = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <PowerXSurfaceProvider>
        <Probe />
        <PowerXReadout points={[hovered, scrubbed, pinned]} />
      </PowerXSurfaceProvider>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setter = null;
});

const update = (next: PowerXActivePointUpdate) => act(() => setter!(next));
const active = () => container.querySelector('[data-testid="active"]')?.textContent;
const source = () => container.querySelector('[data-testid="powerx-readout-source"]')?.textContent;

describe('PowerX active point: hover, scrub and pin', () => {
  it('lets a scrub replace anything and survive a hover end, unlike a hover', () => {
    update({ point: hovered, source: 'hover' });
    expect(active()).toBe('hover:16');
    expect(source()).toBe('Hovered point');
    update(null);
    expect(active()).toBe('');
    update({ point: scrubbed, source: 'scrub' });
    expect(active()).toBe('scrub:32');
    expect(source()).toBe('Point under your finger · tap it for details');
    expect(
      container.querySelector<HTMLElement>('[data-testid="powerx-readout"]')?.dataset.source,
    ).toBe('scrub');
    // The compat mouse events a tap synthesises end a hover; the scrub stays.
    update(null);
    expect(active()).toBe('scrub:32');
    // A hover never replaces a pin; a scrub does (the sheet is closed by then).
    update({ point: pinned, source: 'pinned' });
    expect(active()).toBe('pinned:8');
    update({ point: hovered, source: 'hover' });
    expect(active()).toBe('pinned:8');
    update({ point: scrubbed, source: 'scrub' });
    expect(active()).toBe('scrub:32');
    update('clear');
    expect(active()).toBe('');
  });
});
