// @vitest-environment jsdom

import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COARSE_POINTER_QUERY, MOBILE_VIEWPORT_QUERY } from '@/hooks/useMediaQuery';
import { stubMatchMedia } from '@/test/match-media-stub';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

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

describe('D3ChartWrapper pinned tooltip dismissal', () => {
  beforeEach(() => {
    stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: false, [COARSE_POINTER_QUERY]: false });
  });

  it('dismisses on outside clicks even when the target stops propagation', () => {
    const { dismissTooltip, hideTooltipElements } = renderWrapper(true);
    const outside = document.createElement('button');
    container.append(outside);
    outside.addEventListener('click', (event) => event.stopPropagation());

    act(() => outside.click());

    expect(dismissTooltip).toHaveBeenCalledTimes(1);
    expect(hideTooltipElements).toHaveBeenCalledTimes(1);
  });

  it('dismisses desktop details with Escape, but not other keys', () => {
    const { dismissTooltip } = renderWrapper(true);
    act(() =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(dismissTooltip).not.toHaveBeenCalled();
    act(() =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(dismissTooltip).toHaveBeenCalledTimes(1);
  });

  it('preserves clicks and action handlers inside the portaled card', () => {
    const { dismissTooltip } = renderWrapper(true);
    const action = document.createElement('button');
    const onAction = vi.fn();
    action.addEventListener('click', onAction);
    tooltip()!.append(action);

    act(() => action.click());

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(dismissTooltip).not.toHaveBeenCalled();
  });

  it('does not dismiss the click that opens a card', () => {
    renderWrapper(false);
    const opener = document.createElement('button');
    container.append(opener);
    let dismissTooltip: ReturnType<typeof vi.fn> | undefined;
    opener.addEventListener('click', () => {
      dismissTooltip = renderWrapper(true).dismissTooltip;
    });

    act(() => opener.click());

    expect(dismissTooltip).toBeDefined();
    expect(dismissTooltip).not.toHaveBeenCalled();
  });

  it('removes dismissal handlers when unpinned or unmounted', () => {
    const first = renderWrapper(true);
    const unpinned = renderWrapper(false);
    act(() => {
      document.body.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(first.dismissTooltip).not.toHaveBeenCalled();
    expect(unpinned.dismissTooltip).not.toHaveBeenCalled();

    const last = renderWrapper(true);
    act(() => root.render(null));
    act(() => {
      document.body.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(last.dismissTooltip).not.toHaveBeenCalled();
  });
});
