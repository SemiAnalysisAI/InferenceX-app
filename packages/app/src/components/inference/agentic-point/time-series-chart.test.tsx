// @test-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { TimeSeriesChart } from './time-series-chart';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Glyphs are as wide as the font size, so a 10px "60,000,000" is 100px.
class FakeOffscreenCanvas {
  getContext() {
    return {
      font: '',
      measureText(this: { font: string }, text: string) {
        const size = Number(/(?<size>\d+)px/u.exec(this.font)?.groups?.size ?? 10);
        return { width: text.length * size };
      },
    };
  }
}

const originalCanvas = globalThis.OffscreenCanvas;
beforeAll(() => {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
});
afterAll(() => {
  globalThis.OffscreenCanvas = originalCanvas;
});

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

function yTickLabels(): SVGTextElement[] {
  return [...container.querySelectorAll<SVGTextElement>('text[text-anchor="end"]')].filter((text) =>
    /^[\d,.]+$/u.test(text.textContent ?? ''),
  );
}

describe('TimeSeriesChart Y axis', () => {
  it.each([
    ['without a title', undefined, 0],
    ['beside the rotated axis title', 'Tokens / sec', 16],
  ])('keeps eight-digit tick labels inside the chart %s', (_, yAxisLabel, titleRight) => {
    act(() =>
      root.render(
        <TimeSeriesChart
          series={[
            {
              name: 'Unique Input Tokens',
              color: '#000',
              data: [
                { t: 0, value: 0 },
                { t: 60, value: 58_000_000 },
              ],
            },
          ]}
          durationS={60}
          yAxisLabel={yAxisLabel}
        />,
      ),
    );
    const labels = yTickLabels();
    expect(labels.map((label) => label.textContent)).toContain('60,000,000');
    for (const label of labels) {
      const left = Number(label.getAttribute('x')) - (label.textContent ?? '').length * 10;
      expect(left).toBeGreaterThanOrEqual(titleRight);
    }
  });
});
