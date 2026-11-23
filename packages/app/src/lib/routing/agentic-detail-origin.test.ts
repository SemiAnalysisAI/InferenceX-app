import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

import {
  noteAgenticSiblingStep,
  noteInferenceChartLeft,
  resolveAgenticDetailOrigin,
} from './agentic-detail-origin';

let now = 10_000;

beforeEach(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  // Start each case from a deep link: nothing left a chart, no sibling step pending.
  now += 60_000;
  resolveAgenticDetailOrigin();
});

afterEach(() => vi.restoreAllMocks());

describe('resolveAgenticDetailOrigin', () => {
  it('reports a deep link (no chart left this tab) as not opened from the chart', () => {
    expect(resolveAgenticDetailOrigin()).toBe(false);
  });

  it('reports a detail mounted in the same navigation that unmounted the chart', () => {
    noteInferenceChartLeft();
    now += 16;
    expect(resolveAgenticDetailOrigin()).toBe(true);
  });

  it('does not credit a chart left long before the detail page opened', () => {
    noteInferenceChartLeft();
    now += 5_000;
    expect(resolveAgenticDetailOrigin()).toBe(false);
  });

  it('carries the origin across sibling steps, which replace the detail entry', () => {
    noteInferenceChartLeft();
    expect(resolveAgenticDetailOrigin()).toBe(true);
    now += 30_000;
    noteAgenticSiblingStep();
    expect(resolveAgenticDetailOrigin()).toBe(true);
    noteAgenticSiblingStep();
    expect(resolveAgenticDetailOrigin()).toBe(true);
  });

  it('keeps a deep-linked origin across sibling steps too', () => {
    expect(resolveAgenticDetailOrigin()).toBe(false);
    noteAgenticSiblingStep();
    expect(resolveAgenticDetailOrigin()).toBe(false);
  });

  it('uses each chart exit once, so a later detail visit is judged on its own', () => {
    noteInferenceChartLeft();
    expect(resolveAgenticDetailOrigin()).toBe(true);
    expect(resolveAgenticDetailOrigin()).toBe(false);
  });
});
