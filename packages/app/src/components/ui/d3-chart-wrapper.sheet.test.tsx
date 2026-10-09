// @vitest-environment jsdom

import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COARSE_POINTER_QUERY, MOBILE_VIEWPORT_QUERY } from '@/hooks/useMediaQuery';
import { stubMatchMedia } from '@/test/match-media-stub';

vi.mock('@/lib/use-locale', () => ({ useLocale: () => 'en' }));

import { D3ChartWrapper } from './d3-chart-wrapper';

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

function renderWrapper(pinned: boolean) {
  const svgRef = createRef<SVGSVGElement>();
  const tooltipRef = createRef<HTMLDivElement>();
  const dismissTooltip = vi.fn();
  const hideTooltipElements = vi.fn();
  act(() =>
    root.render(
      <D3ChartWrapper
        chartId="sheet-chart"
        svgRef={svgRef}
        tooltipRef={tooltipRef}
        setContainerRef={() => {}}
        dimensions={{ width: 360, height: 400 }}
        pinnedPoint={pinned ? { id: 1 } : null}
        isPinned={() => pinned}
        dismissTooltip={dismissTooltip}
        hideTooltipElements={hideTooltipElements}
        legendElement={null}
      />,
    ),
  );
  return { tooltipRef, dismissTooltip, hideTooltipElements };
}

const tooltip = () => document.querySelector<HTMLElement>('[data-chart-tooltip="sheet-chart"]');
const backdrop = () => document.querySelector<HTMLElement>('[data-testid="chart-sheet-backdrop"]');

describe('D3ChartWrapper mobile detail sheet', () => {
  it('presents a pinned tooltip as a dismissible bottom sheet on phones', () => {
    stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: true, [COARSE_POINTER_QUERY]: true });
    const { dismissTooltip, hideTooltipElements } = renderWrapper(true);

    expect(tooltip()?.dataset.sheet).toBe('true');
    expect(tooltip()?.getAttribute('role')).toBe('dialog');
    expect(backdrop()).not.toBeNull();

    act(() => backdrop()!.click());
    expect(dismissTooltip).toHaveBeenCalledTimes(1);
    expect(hideTooltipElements).toHaveBeenCalledTimes(1);
  });

  it('closes the sheet on Escape', () => {
    stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: true, [COARSE_POINTER_QUERY]: true });
    const { dismissTooltip } = renderWrapper(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(dismissTooltip).toHaveBeenCalledTimes(1);
  });

  it('keeps the floating desktop tooltip unchanged', () => {
    stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: false });
    renderWrapper(true);
    expect(tooltip()?.dataset.sheet).toBeUndefined();
    expect(tooltip()?.getAttribute('role')).toBeNull();
    expect(backdrop()).toBeNull();
  });

  it('keeps the floating tooltip in a narrow window driven by a mouse', () => {
    stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: true, [COARSE_POINTER_QUERY]: false });
    renderWrapper(true);
    expect(tooltip()?.dataset.sheet).toBeUndefined();
    expect(backdrop()).toBeNull();
  });

  it('never shows a sheet for an unpinned hover tooltip', () => {
    stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: true, [COARSE_POINTER_QUERY]: true });
    renderWrapper(false);
    expect(tooltip()?.dataset.sheet).toBeUndefined();
    expect(backdrop()).toBeNull();
  });
});
