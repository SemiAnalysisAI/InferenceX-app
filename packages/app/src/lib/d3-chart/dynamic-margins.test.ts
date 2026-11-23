import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { computeLeftMargin, measureTextWidth } from './dynamic-margins';

// A canvas whose glyphs are 10 px wide at 10px and 20 px wide at 20px, recording what it measured.
const measured: { font: string; text: string }[] = [];
class FakeOffscreenCanvas {
  getContext() {
    return {
      font: '',
      measureText(this: { font: string }, text: string) {
        measured.push({ font: this.font, text });
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

describe('measureTextWidth', () => {
  it('measures the text in the requested font', () => {
    expect(measureTextWidth('H100', '600 20px Inter')).toBe(80);
    expect(measured.at(-1)).toEqual({ font: '600 20px Inter', text: 'H100' });
  });

  it('collapses white space and trims the line edges by default, as SVG text does', () => {
    expect(measureTextWidth(' \tMI355X \n  FP8  ', '10px a')).toBe(10 * 'MI355X FP8'.length);
    expect(measured.at(-1)?.text).toBe('MI355X FP8');
  });

  it('keeps no-break spaces, which white space collapsing leaves alone', () => {
    measureTextWidth('\u00A0x\u00A0', '10px b');
    expect(measured.at(-1)?.text).toBe('\u00A0x\u00A0');
  });

  it('keeps every space under pre-wrap, as the former pretext measurement did', () => {
    expect(measureTextWidth('  (vLLM)  ', '10px c', { whiteSpace: 'pre-wrap' })).toBe(100);
    expect(measured.at(-1)?.text).toBe('  (vLLM)  ');
  });

  it('returns the last line under pre-wrap', () => {
    measureTextWidth('first line\r\nsecond  line\n', '10px d', { whiteSpace: 'pre-wrap' });
    expect(measured.at(-1)?.text).toBe('second  line');
  });

  it('caches widths per text, font and white space mode', () => {
    const before = measured.length;
    measureTextWidth('cached', '10px e');
    measureTextWidth('cached', '10px e');
    expect(measured.length).toBe(before + 1);
    measureTextWidth('cached', '10px e', { whiteSpace: 'pre-wrap' });
    measureTextWidth('cached', '12px e');
    expect(measured.length).toBe(before + 3);
  });
});

describe('computeLeftMargin', () => {
  it('fits the widest label line plus padding, never below the minimum', () => {
    expect(
      computeLeftMargin(['GB200 NVL72', 'H100'], {
        primaryFont: '10px f',
        secondaryFont: '10px f',
        padding: 4,
        minMargin: 10,
      }),
    ).toBe(10 * 'NVL72'.length + 4);
    expect(computeLeftMargin(['x'], { primaryFont: '10px g', minMargin: 60 })).toBe(60);
  });
});
