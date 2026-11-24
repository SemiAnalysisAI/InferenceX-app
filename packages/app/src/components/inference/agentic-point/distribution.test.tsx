// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { $, $$, contains, isVisible, render } from '@/test/dom';

import { Distribution } from './distribution';

// jsdom has no 2D canvas, and the chart measures its Y tick labels to size the left pad.
class FakeOffscreenCanvas {
  getContext() {
    return { font: '', measureText: (text: string) => ({ width: text.length * 6 }) };
  }
}
const originalCanvas = globalThis.OffscreenCanvas;
beforeAll(() => {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
});
afterAll(() => {
  globalThis.OffscreenCanvas = originalCanvas;
});

function lognormalSample(count: number, mu: number, sigma: number): number[] {
  let seed = 987_654;
  const uniform = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed + 1) / 2147483649;
  };
  return Array.from({ length: count }, () => {
    const z = Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
    return Math.round(Math.exp(mu + sigma * z));
  });
}

const FIT_STROKE = '#a855f7';

function mountDistribution(values: number[], pathname = '/infx/inference/agentic/96255') {
  render(
    <PathnameContext.Provider value={pathname}>
      <div style={{ width: 900, padding: 16 }}>
        <Distribution values={values} unit="tokens" />
      </div>
    </PathnameContext.Provider>,
  );
}

const visibleText = (text: string) => expect(isVisible(contains(text))).toBe(true);

describe('Agentic ISL/OSL distribution', () => {
  it('bins on a log axis without a fitted overlay', () => {
    mountDistribution(lognormalSample(1500, 7.3, 0.9));
    visibleText('1,500 requests');
    visibleText('log scale');
    expect(document.body.textContent).not.toContain('lognormal fit');
    expect(document.body.textContent).not.toContain('μ=');
    expect($(`path[stroke="${FIT_STROKE}"]`)).toBeNull();
    expect($$('rect[opacity="0.55"]').length).toBeGreaterThan(10);
    expect(
      $$(
        'line[stroke="#3b82f6"], line[stroke="#22c55e"], line[stroke="#f59e0b"], line[stroke="#ef4444"]',
      ),
    ).toHaveLength(8);
  });

  it('spreads mass across the axis instead of piling it into the first bins', () => {
    mountDistribution(lognormalSample(1500, 7.3, 0.9));
    const heights = $$('rect[opacity="0.55"]').map((bar) => Number(bar.getAttribute('height')));
    const peakIndex = heights.indexOf(Math.max(...heights));
    expect(peakIndex).toBeGreaterThan(1);
    expect(peakIndex).toBeLessThan(heights.length - 2);
  });

  it('reports zero-token requests that a log axis cannot place', () => {
    mountDistribution([...lognormalSample(400, 6, 0.8), 0, 0, 0]);
    visibleText('400 requests');
    visibleText('3 requests with 0 tokens excluded from the log axis');
  });

  it('still draws the histogram when every request is the same length', () => {
    mountDistribution(Array.from({ length: 50 }, () => 512));
    visibleText('50 requests');
    expect($$('rect[opacity="0.55"]').length).toBeGreaterThan(0);
  });

  it('shows the empty placeholder when nothing can be plotted', () => {
    mountDistribution([]);
    visibleText('No data');
    expect($(`path[stroke="${FIT_STROKE}"]`)).toBeNull();
  });
});
