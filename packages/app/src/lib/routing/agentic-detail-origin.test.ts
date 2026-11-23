import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

import {
  noteAgenticSiblingStep,
  noteInferenceChartLeft,
  noteInferenceChartShown,
  resolveAgenticDetailOrigin,
} from './agentic-detail-origin';

const POINT = 446060;
const SIBLING = 446061;
const OTHER_SIBLING = 446069;

let now = 10_000;

/** The chart unmounts and the detail page mounts in the same navigation. */
function openFromChart(pointId: number): boolean {
  noteInferenceChartLeft();
  now += 16;
  return resolveAgenticDetailOrigin(pointId);
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  // Each case starts with the chart on screen and no detail session.
  noteInferenceChartShown();
  now += 60_000;
});

afterEach(() => vi.restoreAllMocks());

describe('resolveAgenticDetailOrigin', () => {
  it('reports a deep link as not opened from the chart, however often it is asked', () => {
    expect(resolveAgenticDetailOrigin(POINT)).toBe(false);
    expect(resolveAgenticDetailOrigin(POINT)).toBe(false);
  });

  it('keeps the chart origin when the effect runs twice (React Strict Mode)', () => {
    expect(openFromChart(POINT)).toBe(true);
    expect(resolveAgenticDetailOrigin(POINT)).toBe(true);
    now += 30_000;
    expect(resolveAgenticDetailOrigin(POINT)).toBe(true);
  });

  it('keeps the chart origin across a sibling step that commits its id more than once', () => {
    expect(openFromChart(POINT)).toBe(true);
    now += 30_000;
    noteAgenticSiblingStep(SIBLING);
    expect(resolveAgenticDetailOrigin(SIBLING)).toBe(true);
    expect(resolveAgenticDetailOrigin(SIBLING)).toBe(true);
    noteAgenticSiblingStep(OTHER_SIBLING);
    expect(resolveAgenticDetailOrigin(OTHER_SIBLING)).toBe(true);
    // Stepping back to a point already visited in the session keeps it too.
    expect(resolveAgenticDetailOrigin(POINT)).toBe(true);
  });

  it('keeps a deep-linked origin across sibling steps', () => {
    expect(resolveAgenticDetailOrigin(POINT)).toBe(false);
    noteAgenticSiblingStep(SIBLING);
    expect(resolveAgenticDetailOrigin(SIBLING)).toBe(false);
  });

  it('treats a point outside the session (not a stepped sibling) as a new deep link', () => {
    expect(openFromChart(POINT)).toBe(true);
    now += 30_000;
    expect(resolveAgenticDetailOrigin(OTHER_SIBLING)).toBe(false);
  });

  it('does not credit a chart left long before the detail page opened', () => {
    noteInferenceChartLeft();
    now += 5_000;
    expect(resolveAgenticDetailOrigin(POINT)).toBe(false);
  });

  it('ends the detail session once the chart is shown again', () => {
    expect(openFromChart(POINT)).toBe(true);
    noteInferenceChartShown();
    now += 30_000;
    expect(resolveAgenticDetailOrigin(POINT)).toBe(false);
  });

  it('ignores a chart that mounts twice in Strict Mode before the reader leaves it', () => {
    noteInferenceChartShown();
    noteInferenceChartLeft();
    noteInferenceChartShown();
    now += 16;
    expect(resolveAgenticDetailOrigin(POINT)).toBe(false);
  });
});
