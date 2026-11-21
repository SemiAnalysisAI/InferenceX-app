import { describe, expect, it } from 'bun:test';

import { bearerMatches } from './bearer-auth';

describe('bearerMatches', () => {
  it('matches only the complete Bearer header', () => {
    expect(bearerMatches('Bearer secret', 'secret')).toBe(true);
    expect(bearerMatches('secret', 'secret')).toBe(false);
    expect(bearerMatches('Bearer other', 'secret')).toBe(false);
  });

  it('returns false instead of throwing for equal-length strings with different byte lengths', () => {
    expect(bearerMatches('Bearer é', 'xx')).toBe(false);
  });
});
