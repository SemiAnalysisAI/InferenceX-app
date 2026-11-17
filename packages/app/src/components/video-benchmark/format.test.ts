import { describe, expect, it } from 'vitest';

import { compareLower, cost, dollarFigures, figures, kilojoules, reading, usd } from './format';

describe('figures', () => {
  it('keeps about three significant figures', () => {
    expect(figures(35.42)).toBe('35.4');
    expect(figures(2.0934)).toBe('2.09');
    expect(figures(0.013247)).toBe('0.0132');
    expect(figures(26.17)).toBe('26.2');
    expect(figures(4)).toBe('4');
  });

  it('never rounds a digit left of the point', () => {
    expect(figures(138.497)).toBe('138');
    expect(figures(1117.7)).toBe('1,118');
    expect(figures(206097)).toBe('206,097');
  });

  it('reads an unmeasured value as null', () => {
    expect(reading(null)).toBeNull();
    expect(reading(undefined)).toBeNull();
    expect(reading(Number.NaN)).toBeNull();
    expect(reading(74.16)).toBe('74.2');
  });
});

describe('usd', () => {
  it('writes a small cost with three decimals, never four', () => {
    expect(usd(0.06817)).toBe('$0.068');
    expect(usd(0.0964)).toBe('$0.096');
    expect(usd(0.1)).toBe('$0.100');
  });

  it('writes cents from one dollar', () => {
    expect(usd(1.234)).toBe('$1.23');
    expect(usd(13.84)).toBe('$13.84');
  });

  it('never rounds a cost below one cent to zero', () => {
    expect(usd(0.00456)).toBe('$0.0046');
    expect(usd(0)).toBe('$0.000');
  });

  it('drops the sign for a column that names it, and reads a missing cost as null', () => {
    expect(dollarFigures(0.0132)).toBe('0.013');
    expect(cost(null)).toBeNull();
    expect(cost(undefined)).toBeNull();
    expect(cost(0.0132)).toBe('$0.013');
  });
});

describe('kilojoules', () => {
  it('writes joules per clip in kJ', () => {
    expect(kilojoules(138497)).toBe('138 kJ');
    expect(kilojoules(9870)).toBe('9.87 kJ');
    expect(kilojoules(null)).toBeNull();
  });
});

describe('compareLower', () => {
  it('gives the saving as a share of the pair’s value when the subject is lower', () => {
    // $0.0682 against $0.0964, and 138,497 J against 206,097 J.
    expect(compareLower(0.0682, 0.0964)).toEqual({ direction: 'better', percent: '29' });
    expect(compareLower(138.497, 206.097)).toEqual({ direction: 'better', percent: '33' });
  });

  it('gives the excess as a share of the pair’s value when the subject is higher', () => {
    expect(compareLower(0.0964, 0.0682)).toEqual({ direction: 'worse', percent: '41' });
  });

  it('adds the ratio from twice apart, in either direction', () => {
    expect(compareLower(35.4, 74.2)).toEqual({ direction: 'better', percent: '52', times: '2.1' });
    expect(compareLower(74.2, 35.4)).toEqual({ direction: 'worse', percent: '110', times: '2.1' });
    expect(compareLower(1, 2)).toEqual({ direction: 'better', percent: '50', times: '2' });
    // Just under twice apart stays a percentage.
    expect(compareLower(1, 1.98)).toEqual({ direction: 'better', percent: '49' });
  });

  it('calls a difference that rounds to 0% the same', () => {
    expect(compareLower(100, 100)).toEqual({ direction: 'same' });
    expect(compareLower(100, 100.4)).toEqual({ direction: 'same' });
    expect(compareLower(100.6, 100)).toEqual({ direction: 'worse', percent: '1' });
  });

  it('says nothing without a measured, positive value on both sides', () => {
    expect(compareLower(0.07, null)).toBeNull();
    expect(compareLower(undefined, 0.07)).toBeNull();
    expect(compareLower(0.07, 0)).toBeNull();
    expect(compareLower(Number.NaN, 0.07)).toBeNull();
  });
});
