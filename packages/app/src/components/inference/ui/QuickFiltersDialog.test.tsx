// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { afterEach, describe, expect, it, vi } from 'bun:test';

import type { QuickFilters } from '@/components/inference/types';
import { Scenario } from '@/lib/catalog/data-mappings';
import { useFakeTimers, useRealTimers } from '@/test/helpers';
import {
  $,
  $$,
  click,
  contains,
  dispatch,
  eventually,
  findContaining,
  focus,
  get,
  isVisible,
  press,
  render,
  tick,
} from '@/test/dom';
import { stubs, withProviders } from '@/test/mock-providers';

import { ActiveQuickFilters } from './ActiveQuickFilters';
import { QuickFiltersDialog } from './QuickFiltersDialog';

const availableQuickFilters: QuickFilters = {
  vendors: ['NVIDIA', 'AMD', 'Google'],
  frameworks: ['vllm', 'sglang'],
  deployment: ['single-node', 'multi-node', 'disagg'],
  spec: ['mtp', 'stp'],
  power: ['certified', 'legacy'],
};

const testId = (id: string) => get(`[data-testid="${id}"]`);
const pointer = (element: Element, type: 'pointerover' | 'pointerout') =>
  dispatch(element, new PointerEvent(type, { bubbles: true, pointerType: 'mouse' }));

afterEach(() => useRealTimers());

describe('QuickFiltersDialog', () => {
  it('keeps hovered help readable without stealing filter focus', () => {
    const changeOpen = vi.fn();
    render(
      withProviders(<QuickFiltersDialog open onOpenChange={changeOpen} />, {
        inference: { availableQuickFilters },
      }),
    );
    useFakeTimers();
    focus(testId('quick-filter-vendor-NVIDIA'));
    pointer(testId('option-help-quick-filter-vendor'), 'pointerover');
    expect(document.activeElement).toBe(testId('quick-filter-vendor-NVIDIA'));
    pointer(testId('option-help-quick-filter-vendor'), 'pointerout');
    pointer(testId('option-help-content-quick-filter-vendor'), 'pointerover');
    tick(250);
    expect(isVisible(testId('option-help-content-quick-filter-vendor'))).toBe(true);
    pointer(testId('option-help-content-quick-filter-vendor'), 'pointerout');
    tick(250);
    expect($('[data-testid="option-help-content-quick-filter-vendor"]')).toBeNull();
    expect(document.activeElement).toBe(testId('quick-filter-vendor-NVIDIA'));
    expect(changeOpen).not.toHaveBeenCalled();
  });

  it('supports keyboard help without dismissing the dialog or blocking filter selection', async () => {
    const changeOpen = vi.fn();
    render(
      withProviders(<QuickFiltersDialog open onOpenChange={changeOpen} />, {
        inference: { availableQuickFilters },
      }),
    );
    await eventually(() =>
      expect(document.activeElement).toBe(testId('option-help-quick-filter-vendor')),
    );
    focus(testId('option-help-quick-filter-framework'));
    expect(document.activeElement).toBe(testId('option-help-quick-filter-framework'));
    press(' ');
    await eventually(() =>
      expect(isVisible(testId('option-help-content-quick-filter-framework'))).toBe(true),
    );
    press('Escape');
    await eventually(() =>
      expect(document.activeElement).toBe(testId('option-help-quick-filter-framework')),
    );
    expect(changeOpen).not.toHaveBeenCalled();
    click(testId('quick-filter-framework-vllm'));
    expect(stubs.setQuickFilterFrameworks).toHaveBeenCalledWith(['vllm']);
  });

  it('removes only the chosen visible filter without resetting the benchmark scope', () => {
    render(
      withProviders(<ActiveQuickFilters />, {
        inference: {
          quickFilters: {
            vendors: ['AMD', 'NVIDIA'],
            frameworks: ['vllm'],
            deployment: [],
            spec: [],
            power: [],
          },
        },
      }),
    );
    click(testId('remove-filter-vendors-AMD'));
    expect(stubs.setQuickFilterVendors).toHaveBeenCalledExactlyOnceWith(['NVIDIA']);
    expect(stubs.setQuickFilterFrameworks).not.toHaveBeenCalled();
    expect(stubs.setSelectedModel).not.toHaveBeenCalled();
    expect(stubs.setSelectedPrecisions).not.toHaveBeenCalled();
  });

  it('localizes active filter values and leaves inapplicable AgentX spec filters untouched', () => {
    render(
      withProviders(
        <PathnameContext.Provider value="/zh/infx/agentx">
          <ActiveQuickFilters />
        </PathnameContext.Provider>,
        {
          inference: {
            selectedScenario: Scenario.AgenticTraces,
            quickFilters: {
              vendors: ['AMD'],
              frameworks: [],
              deployment: ['multi-node'],
              spec: ['mtp'],
              power: ['certified'],
            },
          },
        },
      ),
    );
    const active = testId('active-quick-filters').textContent;
    expect(active).toContain('多节点聚合');
    expect(active).toContain('已验证');
    expect(active).not.toContain('MTP');
    click(testId('clear-active-quick-filters'));
    expect(stubs.setQuickFilterVendors).toHaveBeenCalledExactlyOnceWith([]);
    expect(stubs.setQuickFilterDeployment).toHaveBeenCalledExactlyOnceWith([]);
    expect(stubs.setQuickFilterPower).toHaveBeenCalledExactlyOnceWith([]);
    expect(stubs.setQuickFilterSpec).not.toHaveBeenCalled();
  });

  it('toggles visible options with one keyboard press and lets Escape close the dialog', async () => {
    const changeOpen = vi.fn();
    render(
      withProviders(<QuickFiltersDialog open onOpenChange={changeOpen} />, {
        inference: {
          availableQuickFilters,
          quickFilters: { vendors: ['AMD'], frameworks: [], deployment: [], spec: [], power: [] },
        },
      }),
    );
    const options = testId('quick-filter-vendor-options');
    expect(options.getAttribute('role')).toBe('group');
    expect($$('button', options)).toHaveLength(3);
    expect(testId('quick-filter-vendor-AMD').getAttribute('aria-pressed')).toBe('true');
    const google = testId('quick-filter-vendor-Google') as HTMLButtonElement;
    expect(google.getAttribute('aria-pressed')).toBe('false');
    expect(google.disabled).toBe(false);
    const nvidia = testId('quick-filter-vendor-NVIDIA');
    expect(nvidia.getAttribute('aria-pressed')).toBe('false');
    focus(nvidia);
    expect(document.activeElement).toBe(nvidia);
    press(' ');
    expect(stubs.setQuickFilterVendors).toHaveBeenCalledExactlyOnceWith(['AMD', 'NVIDIA']);
    click(testId('quick-filter-vendor-AMD'));
    expect(stubs.setQuickFilterVendors).toHaveBeenCalledWith([]);
    expect(changeOpen).not.toHaveBeenCalled();
    expect(isVisible(testId('quick-filters-dialog'))).toBe(true);
    press('Escape');
    await eventually(() => expect(changeOpen).toHaveBeenCalledWith(false));
  });

  it('removes speculative decoding from agentic charts and toggles supported filters', () => {
    render(
      withProviders(<QuickFiltersDialog open onOpenChange={vi.fn()} />, {
        inference: { selectedScenario: Scenario.AgenticTraces, availableQuickFilters },
      }),
    );
    click(testId('quick-filter-vendor-NVIDIA'));
    expect(stubs.setQuickFilterVendors).toHaveBeenCalledWith(['NVIDIA']);
    expect(isVisible(testId('quick-filter-framework-vllm'))).toBe(true);
    expect(isVisible(testId('quick-filter-deployment-disagg'))).toBe(true);
    expect($('[data-testid^="quick-filter-spec-"]')).toBeNull();
    expect(findContaining('Spec Decoding')).toBeNull();
  });

  it('keeps stale selections removable and disables unavailable options', () => {
    render(
      withProviders(<QuickFiltersDialog open onOpenChange={vi.fn()} />, {
        inference: {
          quickFilters: {
            ...availableQuickFilters,
            vendors: ['AMD'],
            frameworks: [],
            deployment: [],
            spec: [],
            power: [],
          },
          availableQuickFilters: { ...availableQuickFilters, vendors: [] },
        },
      }),
    );
    const amd = testId('quick-filter-vendor-AMD') as HTMLButtonElement;
    expect(amd.getAttribute('aria-pressed')).toBe('true');
    expect(amd.disabled).toBe(false);
    for (const vendor of ['NVIDIA', 'Google']) {
      const option = testId(`quick-filter-vendor-${vendor}`) as HTMLButtonElement;
      expect(option.disabled).toBe(true);
      expect(option.getAttribute('title')).toBe('No data for the current selection');
    }
    click(amd);
    expect(stubs.setQuickFilterVendors).toHaveBeenCalledWith([]);
  });

  it('clears every filter category from one action', () => {
    render(
      withProviders(<QuickFiltersDialog open onOpenChange={vi.fn()} />, {
        inference: {
          quickFilters: {
            vendors: ['AMD'],
            frameworks: ['sglang'],
            deployment: ['disagg'],
            spec: ['mtp'],
            power: ['certified'],
          },
          availableQuickFilters,
        },
      }),
    );
    click(contains('button', 'Clear filters'));
    for (const action of ['Vendors', 'Frameworks', 'Deployment', 'Spec', 'Power'])
      expect(stubs[`setQuickFilter${action}`]).toHaveBeenCalledWith([]);
  });
});
