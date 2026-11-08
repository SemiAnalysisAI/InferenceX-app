// @vitest-environment jsdom

import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));

import { D3ChartWrapper, TOUCH_PRIMARY_QUERY, resolveChartInstructions } from './d3-chart-wrapper';

vi.mock('@/lib/d3-chart/dynamic-margins', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  measureTextWidth: (text: string, font: string) =>
    text.length * Number.parseFloat(font.split(' ')[1]) * 0.58,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const EN_MOUSE = 'Shift+Scroll to zoom · Drag to pan · Double-click to reset';
const EN_TOUCH = 'Pinch to zoom · Two-finger drag to pan · Double-tap to reset';
const ZH_MOUSE = '按住 Shift 滚动以缩放 · 拖动以平移 · 双击以重置';
const ZH_TOUCH = '双指捏合以缩放 · 双指拖动以平移 · 双击以重置';

function stubTouchPrimary(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: matches && query === TOUCH_PRIMARY_QUERY,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function renderWrapper(instructions?: string, zoomEnabled = true) {
  const svgRef = createRef<SVGSVGElement>();
  const tooltipRef = createRef<HTMLDivElement>();

  act(() =>
    root.render(
      <D3ChartWrapper
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
        instructions={instructions}
        zoomEnabled={zoomEnabled}
      />,
    ),
  );
  return svgRef;
}

beforeEach(() => {
  mocks.locale = 'en';
  stubTouchPrimary(false);
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
  it('uses natural Chinese instructions on Chinese routes', () => {
    mocks.locale = 'zh';
    renderWrapper();
    expect(container.textContent).toContain('按住 Shift 滚动以缩放 · 拖动以平移 · 双击以重置');
    expect(container.textContent).not.toContain('Double-click to reset');
  });

  it('lets one-finger vertical swipes scroll the page over the svg', () => {
    const svgRef = renderWrapper();
    expect(svgRef.current?.style.touchAction).toBe('pan-y');
  });
});

describe('D3ChartWrapper touch-primary guidance', () => {
  it('swaps in the touch instructions on touch-primary devices', () => {
    stubTouchPrimary(true);
    renderWrapper();
    expect(container.textContent).toContain(EN_TOUCH);
    expect(container.textContent).not.toContain('Shift+Scroll');
  });

  it('swaps in Chinese touch instructions on Chinese routes', () => {
    mocks.locale = 'zh';
    stubTouchPrimary(true);
    renderWrapper();
    expect(container.textContent).toContain(ZH_TOUCH);
    expect(container.textContent).not.toContain('Shift');
  });

  it('still renders nothing for an explicit empty instructions prop (embeds)', () => {
    stubTouchPrimary(true);
    renderWrapper('');
    expect(container.querySelector('p.no-export')).toBeNull();
  });

  it('keeps the hint of a chart without zoom on touch devices', () => {
    stubTouchPrimary(true);
    renderWrapper('Hover over a bar for details', false);
    expect(container.textContent).toContain('Hover over a bar for details');
    expect(container.textContent).not.toContain('Pinch');
  });

  it('shows no default zoom hint on a chart without zoom', () => {
    renderWrapper(undefined, false);
    expect(container.querySelector('[data-testid="chart-instructions"]')).toBeNull();
    stubTouchPrimary(true);
    renderWrapper(undefined, false);
    expect(container.querySelector('[data-testid="chart-instructions"]')).toBeNull();
  });
});

describe('resolveChartInstructions', () => {
  it('replaces custom Shift+Scroll copy wholesale when the touch hint applies', () => {
    expect(
      resolveChartInstructions('Shift+Scroll to zoom horizontally · Drag to pan', 'en', true, true),
    ).toBe(EN_TOUCH);
    expect(
      resolveChartInstructions('Shift+滚轮横向缩放 · 拖动平移 · 双击重置', 'zh', true, true),
    ).toBe(ZH_TOUCH);
  });

  it('falls back to the default copy per locale and pointer type', () => {
    expect(resolveChartInstructions(undefined, 'en', true, false)).toBe(EN_MOUSE);
    expect(resolveChartInstructions(undefined, 'zh', true, false)).toBe(ZH_MOUSE);
    expect(resolveChartInstructions(undefined, 'en', true, true)).toBe(EN_TOUCH);
    expect(resolveChartInstructions(undefined, 'zh', true, true)).toBe(ZH_TOUCH);
  });

  it('never invents a hint for an explicit empty string', () => {
    expect(resolveChartInstructions('', 'en', true, true)).toBe('');
  });

  it('drops the default zoom hint when the chart cannot zoom', () => {
    expect(resolveChartInstructions(undefined, 'en', false, false)).toBe('');
    expect(resolveChartInstructions(undefined, 'zh', false, true)).toBe('');
    expect(resolveChartInstructions('Hover over a bar for details', 'en', false, true)).toBe(
      'Hover over a bar for details',
    );
  });
});

const fire = (target: EventTarget, event: Event) => act(() => void target.dispatchEvent(event));
const pointer = (type: string, clientX: number) =>
  new MouseEvent(type, { bubbles: true, clientX, clientY: 10 });

describe('D3ChartWrapper zoom hint placement', () => {
  const hint = () => container.querySelector<HTMLElement>('[data-testid="chart-instructions"]');
  it('overlays the zoom hint on the plot instead of taking a line under it', () => {
    const svgRef = renderWrapper();
    expect(hint()?.parentElement).toBe(svgRef.current?.parentElement);
    expect(hint()?.classList.contains('absolute')).toBe(true);
    expect(hint()?.classList.contains('pointer-events-none')).toBe(true);
    expect(hint()?.classList.contains('no-export')).toBe(true);
    expect(hint()?.style.top).not.toBe('');
    expect(hint()?.style.right).not.toBe('');
  });

  it('keeps the hint through hovering, clicking and plain scrolling', () => {
    const svg = renderWrapper().current!;
    fire(svg, new WheelEvent('wheel', { bubbles: true }));
    fire(svg, pointer('pointermove', 80));
    fire(svg, pointer('pointerdown', 10));
    fire(svg, pointer('pointermove', 12));
    fire(window, pointer('pointerup', 12));
    fire(svg, pointer('pointermove', 200));
    expect(hint()?.dataset.dismissed).toBeUndefined();
    expect(hint()?.classList.contains('opacity-0')).toBe(false);
  });

  it.each([
    ['Shift+Scroll', () => [new WheelEvent('wheel', { shiftKey: true })]],
    ['a pinch-to-zoom wheel', () => [new WheelEvent('wheel', { ctrlKey: true })]],
    ['a drag', () => [pointer('pointerdown', 10), pointer('pointermove', 40)]],
    ['a double-click', () => [new MouseEvent('dblclick')]],
  ] as const)('fades the hint out after %s', (_name, events) => {
    const svg = renderWrapper().current!;
    for (const event of events()) fire(svg, event);
    expect(hint()?.dataset.dismissed).toBe('');
    expect(hint()?.classList.contains('opacity-0')).toBe(true);
    expect(hint()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves the hint of a chart without zoom under the plot', () => {
    const svgRef = renderWrapper('Hover over a bar for details', false);
    expect(hint()?.textContent).toBe('Hover over a bar for details');
    expect(hint()?.classList.contains('absolute')).toBe(false);
    expect(hint()?.parentElement).toBe(svgRef.current?.parentElement?.parentElement);
    fire(svgRef.current!, new MouseEvent('dblclick'));
    expect(hint()?.classList.contains('opacity-0')).toBe(false);
  });
});
