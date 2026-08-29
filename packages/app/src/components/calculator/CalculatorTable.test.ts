import { describe, expect, it } from 'vitest';

import { formatCalculatorTableNumber } from './CalculatorTable';

describe('formatCalculatorTableNumber', () => {
  it('preserves the existing ungrouped English number formatting', () => {
    expect(formatCalculatorTableNumber(1234.56, 1, 'en')).toBe('1234.6');
    expect(formatCalculatorTableNumber(1234.56, 0, 'en')).toBe('1235');
  });

  it('uses locale-aware grouping for Chinese table values', () => {
    expect(formatCalculatorTableNumber(1234.56, 1, 'zh')).toBe('1,234.6');
    expect(formatCalculatorTableNumber(1234.56, 0, 'zh')).toBe('1,235');
  });
});
