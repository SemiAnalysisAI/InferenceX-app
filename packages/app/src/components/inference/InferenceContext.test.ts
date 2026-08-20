// @vitest-environment jsdom
import { act, createElement, memo, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InferenceContextsProvider,
  resolveE2eXAxisMetric,
  resolveEffectiveXAxisMode,
  useInferenceActions,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import { Sequence } from '@/lib/data-mappings';
import type {
  InferenceActionsContextType,
  InferenceDataContextType,
  InferenceDisplayContextType,
  InferenceFiltersContextType,
} from '@/components/inference/types';

describe('inference requested and effective axis selectors', () => {
  it('preserves URL mode while sequence availability is unresolved', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Sequence.EightK_OneK, false),
    ).toBe('e2e-normalized-interactivity');
  });

  it('falls back from an agentic-only mode for a resolved fixed sequence', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Sequence.EightK_OneK, true),
    ).toBe('interactivity');
  });

  it('restores the requested mode when the effective sequence supports it', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Sequence.AgenticTraces, true),
    ).toBe('e2e-normalized-interactivity');
  });

  it('derives TTFT metric from sequence kind and percentile', () => {
    expect(resolveE2eXAxisMetric('p90_ttft', 'ttft', Sequence.AgenticTraces, 'p75')).toBe(
      'p75_ttft',
    );
    expect(resolveE2eXAxisMetric('p90_ttft', 'ttft', Sequence.EightK_OneK, 'p75')).toBe(
      'median_ttft',
    );
  });

  it('uses natural E2E x-axis and preserves inactive requested metric', () => {
    expect(resolveE2eXAxisMetric('p90_ttft', 'e2e', Sequence.AgenticTraces, 'p75')).toBeNull();
    expect(resolveE2eXAxisMetric('p90_ttft', 'interactivity', Sequence.AgenticTraces, 'p75')).toBe(
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
