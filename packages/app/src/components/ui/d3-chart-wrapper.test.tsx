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

const touchMove = (fingers: number) =>
  Object.assign(new Event('touchmove', { bubbles: true }), {
    touches: Array.from({ length: fingers }),
  });

const nextFrame = () =>
  act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });

const IDENTITY = { k: 1, x: 0, y: 0 };
const zoomed = (svg: SVGSVGElement, transform = IDENTITY) => Reflect.set(svg, '__zoom', transform);
const drag = (svg: SVGSVGElement, from: EventTarget) => {
  fire(from, pointer('mousedown', 10));
  // d3-zoom stops a drag's mousemove at the window, so it never reaches the svg.
  fire(window, new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 40 }));
};

const axisDomain = (svg: SVGSVGElement, axis: 'x' | 'y', rect: Partial<DOMRect>) => {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', `${axis}-axis`);
  const domain = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  domain.setAttribute('class', 'domain');
  domain.getBoundingClientRect = () => ({ top: 0, right: 0, ...rect }) as DOMRect;
  group.append(domain);
  svg.append(group);
};

describe('D3ChartWrapper zoom hint placement', () => {
  const hint = () => container.querySelector<HTMLElement>('[data-testid="chart-instructions"]');

  it('puts the zoom hint in the top margin above the plot when the margin fits a line', async () => {
    const svg = renderWrapper().current!;
    svg.getBoundingClientRect = () => ({ top: 0, right: 640, height: 400 }) as DOMRect;
    await act(() => {
      axisDomain(svg, 'x', { right: 620, width: 560 });
      axisDomain(svg, 'y', { top: 24 });
      return Promise.resolve();
    });
    expect(hint()?.parentElement).toBe(svg.parentElement);
    expect(hint()?.classList.contains('absolute')).toBe(true);
    expect(hint()?.classList.contains('pointer-events-none')).toBe(true);
    expect(hint()?.classList.contains('no-export')).toBe(true);
    expect(hint()?.style.bottom).toBe(`${400 - 24 + 2}px`);
    expect(hint()?.style.right).toBe('20px');
  });

  it('puts the zoom hint under the plot when the top margin is too short for it', async () => {
    const svg = renderWrapper().current!;
    svg.getBoundingClientRect = () => ({ top: 0, right: 640, height: 400 }) as DOMRect;
    await act(() => {
      axisDomain(svg, 'y', { top: 8 });
      return Promise.resolve();
    });
    expect(hint()?.classList.contains('absolute')).toBe(false);
    expect(hint()?.style.bottom).toBe('');
  });

  it('puts the zoom hint under the plot when the plot is narrower than the hint', async () => {
    const svg = renderWrapper().current!;
    svg.getBoundingClientRect = () => ({ top: 0, right: 320, height: 400 }) as DOMRect;
    await act(() => {
      axisDomain(svg, 'x', { right: 300, width: 120 });
      axisDomain(svg, 'y', { top: 24 });
      return Promise.resolve();
    });
    expect(hint()?.classList.contains('absolute')).toBe(false);
    expect(hint()?.style.bottom).toBe('');
  });

  it('keeps the hint while input does not move the zoom transform', async () => {
    const svg = renderWrapper().current!;
    zoomed(svg);
    for (const event of [
      new WheelEvent('wheel', { bubbles: true, shiftKey: true }),
      touchMove(2),
      new MouseEvent('dblclick', { bubbles: true }),
    ]) {
      fire(svg, event);
      await nextFrame();
    }
    drag(svg, svg);
    fire(window, pointer('mouseup', 40));
    await nextFrame();
    expect(hint()?.dataset.dismissed).toBeUndefined();
    expect(hint()?.classList.contains('opacity-0')).toBe(false);
  });

  it.each([
    ['plain scrolling', () => new WheelEvent('wheel', { bubbles: true })],
    ['browser pinch-zoom', () => new WheelEvent('wheel', { bubbles: true, ctrlKey: true })],
    ['a one-finger swipe', () => touchMove(1)],
    ['hovering', () => pointer('mousemove', 80)],
  ] as const)('ignores a transform change during %s', async (_name, event) => {
    const svg = renderWrapper().current!;
    zoomed(svg);
    fire(svg, event());
    zoomed(svg, { k: 2, x: 0, y: 0 });
    await nextFrame();
    expect(hint()?.dataset.dismissed).toBeUndefined();
  });

  it('ignores zoom gestures and drags that start outside the chart', async () => {
    const svg = renderWrapper().current!;
    zoomed(svg);
    fire(document.body, new WheelEvent('wheel', { bubbles: true, shiftKey: true }));
    zoomed(svg, { k: 2, x: 0, y: 0 });
    await nextFrame();
    drag(svg, document.body);
    zoomed(svg, { k: 3, x: 0, y: 0 });
    await nextFrame();
    expect(hint()?.dataset.dismissed).toBeUndefined();
  });

  it('does not take the chart writing its first transform for a zoom', async () => {
    const svg = renderWrapper().current!;
    fire(svg, new WheelEvent('wheel', { bubbles: true, shiftKey: true }));
    zoomed(svg);
    await nextFrame();
    expect(hint()?.dataset.dismissed).toBeUndefined();
  });

  it('stops tracking a drag once the button is released', async () => {
    const svg = renderWrapper().current!;
    zoomed(svg);
    fire(svg, pointer('mousedown', 10));
    fire(window, pointer('mouseup', 10));
    fire(svg, new MouseEvent('mousemove', { bubbles: true, clientX: 200 }));
    zoomed(svg, { k: 2, x: 0, y: 0 });
    await nextFrame();
    expect(hint()?.dataset.dismissed).toBeUndefined();
  });

  it.each([
    [
      'Shift+Scroll',
      (svg: SVGSVGElement) => fire(svg, new WheelEvent('wheel', { bubbles: true, shiftKey: true })),
    ],
    ['a two-finger touch move', (svg: SVGSVGElement) => fire(svg, touchMove(2))],
    ['a drag', (svg: SVGSVGElement) => drag(svg, svg)],
  ] as const)('fades the hint out once %s moves the zoom transform', async (_name, gesture) => {
    const svg = renderWrapper().current!;
    zoomed(svg);
    gesture(svg);
    zoomed(svg, { k: 1, x: -30, y: 0 });
    await nextFrame();
    expect(hint()?.dataset.dismissed).toBe('');
    expect(hint()?.classList.contains('opacity-0')).toBe(true);
    expect(hint()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('fades the hint out after an animated double-click zoom settles', () => {
    vi.useFakeTimers();
    try {
      const svg = renderWrapper().current!;
      zoomed(svg);
      fire(svg, new MouseEvent('dblclick', { bubbles: true }));
      act(() => vi.advanceTimersByTime(50));
      expect(hint()?.dataset.dismissed).toBeUndefined();
      zoomed(svg, { k: 2, x: 0, y: 0 });
      act(() => vi.advanceTimersByTime(400));
      expect(hint()?.dataset.dismissed).toBe('');
    } finally {
      vi.useRealTimers();
    }
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
