import { describe, expect, it } from 'vitest';

import { DOWNSTREAM_ID_START, isPublicRowId } from './downstream-ids';

describe('isPublicRowId', () => {
  it('splits ids at the first downstream id', () => {
    expect(isPublicRowId(DOWNSTREAM_ID_START - 1)).toBe(true);
    expect(isPublicRowId(DOWNSTREAM_ID_START)).toBe(false);
  });
});
