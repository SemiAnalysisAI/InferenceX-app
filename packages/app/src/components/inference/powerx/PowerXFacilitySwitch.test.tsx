// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

import { PowerXSurfaceProvider, usePowerXIncludeFacility } from '../ui/powerx-surface';
import { PowerXFacilitySwitch } from './PowerXLayout';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  return <output data-testid="include-facility">{String(usePowerXIncludeFacility())}</output>;
}

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

const renderSwitch = (pues: readonly number[]) =>
  act(() =>
    root.render(
      <PowerXSurfaceProvider>
        <Probe />
        <PowerXFacilitySwitch pues={pues} />
      </PowerXSurfaceProvider>,
    ),
  );
const label = () =>
  container.querySelector('[data-testid="powerx-facility-switch"] label')?.textContent;
const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
const included = () => container.querySelector('[data-testid="include-facility"]')?.textContent;

describe('PowerX Include facility switch', () => {
  it('counts the facility overhead by default and turns it off on click', () => {
    renderSwitch([1.3]);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(included()).toBe('true');
    act(() => toggle().click());
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(included()).toBe('false');
  });

  it('labels the PUE range of the visible chips, not just the first one', () => {
    renderSwitch([1.3, 1.1, 1.3]);
    expect(label()).toBe('Include facility (PUE 1.1–1.3)');
    renderSwitch([1.1, 1.1]);
    expect(label()).toBe('Include facility (PUE 1.1)');
    renderSwitch([]);
    expect(label()).toBe('Include facility (PUE —)');
  });
});
