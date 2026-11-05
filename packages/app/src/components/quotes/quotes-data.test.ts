import { describe, expect, it } from 'vitest';

import { orgAnchorId } from './quotes-data';

describe('orgAnchorId', () => {
  it.each([
    ['Google', 'quote-google'],
    ['Meta Superintelligence Labs', 'quote-meta-superintelligence-labs'],
    ['  Example & Company! ', 'quote-example-company'],
  ])('turns %s into a stable quote anchor', (org, expected) => {
    expect(orgAnchorId(org)).toBe(expected);
  });
});
