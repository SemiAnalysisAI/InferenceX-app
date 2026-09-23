// @vitest-environment jsdom

import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));

vi.mock('@/lib/use-locale', () => ({ useLocale: () => mocks.locale }));

import { D3ChartWrapper } from './d3-chart-wrapper';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let coarsePointer: boolean;
let pointerChanged: () => void;
const removeListener = vi.fn();

function renderWrapper(instructions?: string) {
  const svgRef = createRef<SVGSVGElement>();
  const tooltipRef = createRef<HTMLDivElement>();

  act(() =>
    root.render(
      <D3ChartWrapper
        instructions={instructions}
        chartId="localized-chart"
        svgRef={svgRef}
        tooltipRef={tooltipRef}
        setContainerRef={() => {}}
        dimensions={{ width: 640, height: 400 }}
        pinnedPoint={null}
        isPinned={() => false}
        dismissTooltip={() => {}}
        hideTooltipElements={() => {}}
        legendElement={null}
      />,
    ),
  );
}

beforeEach(() => {
  mocks.locale = 'en';
  coarsePointer = false;
  removeListener.mockClear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      expect(query).toBe('(pointer: coarse)');
      return {
        get matches() {
          return coarsePointer;
        },
        addEventListener: (_event: string, listener: () => void) => {
          pointerChanged = listener;
        },
        removeEventListener: removeListener,
      };
    }),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('D3ChartWrapper default interaction guidance', () => {
  it('preserves the exact English instructions', () => {
    renderWrapper();
    expect(container.textContent).toContain(
      'Shift+Scroll to zoom • Drag to pan • Double-click to reset • Click a point to pin tooltip',
    );
  });

  it('uses natural Chinese instructions on Chinese routes', () => {
    mocks.locale = 'zh';
    renderWrapper();
    expect(container.textContent).toContain(
      '按住 Shift 滚动以缩放 · 拖动以平移 · 双击以重置 · 点击数据点固定提示框',
    );
    expect(container.textContent).not.toContain('Double-click to reset');
  });
});

describe('touch interaction guidance', () => {
  it('shows two-finger instructions on a touch device', () => {
    coarsePointer = true;
    renderWrapper();
    expect(container.textContent).toContain('Use one finger to scroll the page');
    expect(container.textContent).toContain('Pinch with two fingers to zoom');
    expect(container.textContent).toContain('Drag with two fingers to pan');
    expect(container.textContent).not.toContain('Double-click');
    expect(container.textContent).not.toContain('Shift');
  });

  it('localizes touch instructions', () => {
    coarsePointer = true;
    mocks.locale = 'zh';
    renderWrapper();
    expect(container.textContent).toContain('单指滑动页面 · 双指捏合缩放图表 · 双指拖动平移图表');
    expect(container.textContent).not.toContain('双击');
  });

  it('responds when the primary pointer changes', () => {
    renderWrapper();
    act(() => {
      coarsePointer = true;
      pointerChanged();
    });
    expect(container.textContent).toContain('Pinch with two fingers');
    act(() => {
      coarsePointer = false;
      pointerChanged();
    });
    expect(container.textContent).toContain('Shift+Scroll');
  });

  it('preserves custom instructions and deliberately hidden hints on touch', () => {
    coarsePointer = true;
    renderWrapper('Custom chart instructions');
    expect(container.textContent).toBe('Custom chart instructions');
    renderWrapper('');
    expect(container.querySelector('p')).toBeNull();
  });

  it('removes the media query listener on unmount', () => {
    renderWrapper();
    act(() => root.render(null));
    expect(removeListener).toHaveBeenCalledWith('change', pointerChanged);
  });
});
