// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

import { FEATURE_GATE_KEY, relockFeatureGate } from '@/lib/runtime/use-feature-gate';

import { PowerXFeatureGate, powerXLockedRedirectPath } from './powerx-feature-gate';

let container: HTMLDivElement;
let root: Root;

function renderGate(locale: 'en' | 'zh'): void {
  act(() =>
    root.render(
      createElement(PowerXFeatureGate, {
        locale,
        children: createElement('p', { 'data-testid': 'powerx' }, 'PowerX'),
      }),
    ),
  );
}

const rendered = () => container.querySelector('[data-testid="powerx"]') !== null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  replace.mockClear();
});

describe('PowerXFeatureGate', () => {
  it('sends a locked visitor to the landing page without rendering PowerX', () => {
    renderGate('en');
    expect(replace).toHaveBeenCalledWith('/');
    expect(rendered()).toBe(false);
  });

  it('sends a locked Chinese visitor to the Chinese landing page', () => {
    renderGate('zh');
    expect(replace).toHaveBeenCalledWith('/zh');
    expect(rendered()).toBe(false);
  });

  it('renders PowerX once the gate is unlocked', () => {
    localStorage.setItem(FEATURE_GATE_KEY, '1');
    renderGate('en');
    expect(replace).not.toHaveBeenCalled();
    expect(rendered()).toBe(true);
  });

  it('leaves PowerX when the gate is relocked on the page', () => {
    localStorage.setItem(FEATURE_GATE_KEY, '1');
    renderGate('en');
    act(() => relockFeatureGate());
    expect(replace).toHaveBeenCalledWith('/');
    expect(rendered()).toBe(false);
  });

  it('maps each locale to its landing page', () => {
    expect(powerXLockedRedirectPath('en')).toBe('/');
    expect(powerXLockedRedirectPath('zh')).toBe('/zh');
  });
});
