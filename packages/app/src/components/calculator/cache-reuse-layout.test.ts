import { describe, expect, it } from 'vitest';

import {
  HORIZONTAL_MARGIN,
  horizontalChartHeight,
  horizontalRowStep,
  labelFits,
  verticalLabelMode,
} from './cache-reuse-layout';

const FONT = 11;

describe('verticalLabelMode', () => {
  it('keeps labels upright when the widest one fits across a column', () => {
    expect(verticalLabelMode(60, ['5.0%', '35.1%', '100.0%'], FONT)).toBe('upright');
  });

  it('turns every label sideways once one percentage is wider than the column', () => {
    // A 20-bar sweep at desktop width leaves ~34px columns: "35.1%" spills over.
    expect(verticalLabelMode(34, ['5.0%', '35.1%'], FONT)).toBe('rotated');
  });

  it('decides from the widest label, so one long value flips the whole chart', () => {
    const narrowOnly = verticalLabelMode(36, ['5.0%', '9.9%'], FONT);
    const withWide = verticalLabelMode(36, ['5.0%', '9.9%', '100.0%'], FONT);
    expect(narrowOnly).toBe('upright');
    expect(withWide).toBe('rotated');
  });
});

describe('labelFits', () => {
  it('drops a label whose segment is shorter than the text', () => {
    expect(labelFits('12.0%', FONT, 20, 30)).toBe(false);
  });

  it('drops a label whose segment is thinner than one line', () => {
    expect(labelFits('12.0%', FONT, 120, 8)).toBe(false);
  });

  it('keeps a label that clears its segment on both axes', () => {
    expect(labelFits('12.0%', FONT, 60, 20)).toBe(true);
  });
});

describe('horizontal sizing', () => {
  it('gives every row at least one line of label height', () => {
    expect(horizontalRowStep(1) * (1 - 0.18)).toBeGreaterThanOrEqual(FONT + 4);
  });

  it('grows with concurrency count and series count instead of squeezing rows', () => {
    const rows = 20;
    expect(horizontalChartHeight(rows, 1)).toBe(
      rows * horizontalRowStep(1) + HORIZONTAL_MARGIN.top + HORIZONTAL_MARGIN.bottom,
    );
    expect(horizontalChartHeight(rows, 2)).toBeGreaterThan(horizontalChartHeight(rows, 1));
  });
});
