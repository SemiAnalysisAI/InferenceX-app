// @test-environment jsdom
import { act, createElement, memo, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

import {
  InferenceContextsProvider,
  matchRequestedHw,
  openedUrlNamesParam,
  requestedHwConflict,
  resolveE2eXAxisMetric,
  resolveEffectiveXAxisMode,
  useInferenceActions,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import { comparisonExclusion } from '@/components/inference/utils/comparison-exclusion';
import { resolveExclusionGroups } from '@/lib/benchmarks/exclusion';
import { Model, Scenario } from '@/lib/catalog/data-mappings';
import { refreshUrlParams } from '@/lib/routing/url-state';
import type {
  InferenceActionsContextType,
  InferenceDataContextType,
  InferenceDisplayContextType,
  InferenceFiltersContextType,
} from '@/components/inference/types';

describe('inference requested and effective axis selectors', () => {
  it('preserves URL mode while sequence availability is unresolved', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Scenario.EightK_OneK, false),
    ).toBe('e2e-normalized-interactivity');
  });

  it('falls back from an agentic-only mode for a resolved fixed sequence', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Scenario.EightK_OneK, true),
    ).toBe('interactivity');
  });

  it('restores the requested mode when the effective sequence supports it', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Scenario.AgenticTraces, true),
    ).toBe('e2e-normalized-interactivity');
  });

  it('derives TTFT metric from sequence kind and percentile', () => {
    expect(resolveE2eXAxisMetric('p90_ttft', 'ttft', Scenario.AgenticTraces, 'p75')).toBe(
      'p75_ttft',
    );
    expect(resolveE2eXAxisMetric('p90_ttft', 'ttft', Scenario.EightK_OneK, 'p75')).toBe(
      'median_ttft',
    );
  });

  it('uses natural E2E x-axis and preserves inactive requested metric', () => {
    expect(resolveE2eXAxisMetric('p90_ttft', 'e2e', Scenario.AgenticTraces, 'p75')).toBeNull();
    expect(resolveE2eXAxisMetric('p90_ttft', 'interactivity', Scenario.AgenticTraces, 'p75')).toBe(
      'p90_ttft',
    );
  });
});

describe('inference domain providers', () => {
  let container: HTMLDivElement;
  let root: Root;

  const data = {} as InferenceDataContextType;
  const filters = {} as InferenceFiltersContextType;
  const display = { highContrast: false } as InferenceDisplayContextType;
  const actions = { setHighContrast: vi.fn() } as unknown as InferenceActionsContextType;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not rerender filter-only consumers for a display toggle', () => {
    const filterRender = vi.fn();
    let toggleHighContrast!: () => void;

    const FilterConsumer = memo(() => {
      useInferenceFilters();
      filterRender();
      return null;
    });

    function DisplayToggleHarness() {
      const [highContrast, setHighContrast] = useState(false);
      toggleHighContrast = () => setHighContrast((current) => !current);
      const nextDisplay = useMemo(() => ({ ...display, highContrast }), [highContrast]);
      return createElement(InferenceContextsProvider, {
        data,
        filters,
        display: nextDisplay,
        actions,
        children: createElement(FilterConsumer),
      });
    }

    act(() => root.render(createElement(DisplayToggleHarness)));
    expect(filterRender).toHaveBeenCalledTimes(1);

    act(() => toggleHighContrast());
    expect(filterRender).toHaveBeenCalledTimes(1);
  });

  it('keeps the action context and setter identities stable when data arrives', () => {
    const seenContexts: InferenceActionsContextType[] = [];
    const seenSetters: InferenceActionsContextType['setHighContrast'][] = [];
    const invokedRevisions: number[] = [];
    let publishData!: () => void;

    function ActionConsumer({ revision }: { revision: number }) {
      const currentActions = useInferenceActions();
      seenContexts.push(currentActions);
      seenSetters.push(currentActions.setHighContrast);
      return createElement('output', null, revision);
    }

    function DataArrivalHarness() {
      const [revision, setRevision] = useState(0);
      publishData = () => setRevision((current) => current + 1);
      const nextData = useMemo(() => ({ ...data, loading: revision === 0 }), [revision]);
      const nextActions = {
        ...actions,
        setHighContrast: () => invokedRevisions.push(revision),
      };
      return createElement(InferenceContextsProvider, {
        data: nextData,
        filters,
        display,
        actions: nextActions,
        children: createElement(ActionConsumer, { revision }),
      });
    }

    act(() => root.render(createElement(DataArrivalHarness)));
    act(() => publishData());

    expect(seenContexts).toHaveLength(2);
    expect(seenContexts[1]).toBe(seenContexts[0]);
    expect(seenSetters[1]).toBe(seenSetters[0]);

    seenSetters[0](true);
    expect(invokedRevisions).toEqual([1]);
  });
});

describe('requested hardware engine conflicts', () => {
  const exclusion = comparisonExclusion(Model.Kimi_K3_1_Pro, Scenario.AgenticTraces, false)!;
  const selectable = new Set(['b300_vllm', 'b300_sglang', 'gb300_vllm', 'gb300_dynamo-sglang']);
  const resolve = (request: Set<string>) => {
    const proposed = matchRequestedHw(request, selectable);
    const { result } = resolveExclusionGroups(
      proposed,
      new Set(),
      exclusion,
      'keep-sticky',
      'vllm',
    );
    return { result, conflict: requestedHwConflict(request, proposed, result, exclusion) };
  };

  it('opens a compare page on one engine family per SKU without a notice', () => {
    const { result, conflict } = resolve(new Set(['b300', 'gb300']));
    expect([...result].toSorted()).toEqual(['b300_vllm', 'gb300_vllm']);
    expect(conflict).toBeNull();
  });

  it('explains the drop when a shared URL names both engines on one SKU', () => {
    expect(resolve(new Set(['b300_vllm', 'b300_sglang'])).conflict).toEqual({
      kept: ['vllm'],
      dropped: ['sglang'],
      partial: [],
    });
  });
});

describe('openedUrlNamesParam', () => {
  it('ignores the previous page URL while a client navigation renders the next page', () => {
    window.history.replaceState(null, '', '/infx/inference?i_active=b200_sglang,b200_vllm');
    refreshUrlParams();
    expect(openedUrlNamesParam('i_active', '/infx/inference')).toBe(true);
    expect(openedUrlNamesParam('i_active', '/compare/b200-vs-b300')).toBe(false);
    window.history.replaceState(null, '', '/');
    refreshUrlParams();
  });
});
